const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { zip } = require('./zip.js');
const updates = require('./updater.js');
const registerSmartIpc = require('./smart/ipc.js');

const isMac = process.platform === 'darwin';
const EXT = 'quill';
const LEGACY_EXTS = ['ldraft']; // projects made before the rename (LibreDraft) still open and save in place
const SERIES_EXT = 'quillseries';
const PROJECT_FILE = /\.(quill|ldraft)$/i;
const SERIES_FILE = /\.quillseries$/i;
const ANY_FILE = /\.(quill|ldraft|quillseries)$/i;
const SAVE_FILTERS = [{ name: 'Quillier Project', extensions: [EXT] }];
const SERIES_FILTERS = [{ name: 'Quillier Series', extensions: [SERIES_EXT] }];
const OPEN_FILTERS = [{ name: 'Quillier Project or Series', extensions: [EXT, SERIES_EXT, ...LEGACY_EXTS] }];
const WEBSITE = 'https://quillier.com';
const DOWNLOAD_PAGE = `${WEBSITE}/#download`;
const MAX_RECENT = 12;
const BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const BACKUPS_PER_PROJECT = 30;

let win = null;
let pendingOpenPath = null;
const lastMtime = new Map(); // project path -> mtimeMs we last read or wrote
const lastBackup = new Map(); // project path -> timestamp of last backup
const saveQueues = new Map(); // project path -> promise chain, so writes never interleave

// ---------- prefs ----------

// For development: run against a throwaway settings folder instead of the real one.
if (process.env.QUILLIER_USER_DATA) app.setPath('userData', process.env.QUILLIER_USER_DATA);
const userData = app.getPath('userData');
const prefsPath = path.join(userData, 'prefs.json');
const backupDir = path.join(userData, 'backups');

// The app used to be called LibreDraft. Carry its settings, recent projects and backups over once.
(function migrateFromLibreDraft() {
  const legacy = path.join(app.getPath('appData'), 'LibreDraft');
  if (fs.existsSync(prefsPath) || !fs.existsSync(path.join(legacy, 'prefs.json'))) return;
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.copyFileSync(path.join(legacy, 'prefs.json'), prefsPath);
    if (fs.existsSync(path.join(legacy, 'backups'))) fs.cpSync(path.join(legacy, 'backups'), backupDir, { recursive: true });
  } catch (err) {
    console.error('Could not migrate LibreDraft data', err);
  }
})();

const DEFAULT_PREFS = {
  theme: 'system',
  font: 'sans',
  fontSize: 18,
  lineHeight: 1.9,
  width: 'medium',
  smartTypography: true,
  symbolHints: true,
  nameHints: true,
  smartEnabled: false,
  smartModel: null,
  smartHintDismissed: false,
  pureBlack: false,
  spellcheck: true,
  dailyGoal: 0,
  autoUpdate: true,
  recent: [],
  recentSeries: [],
  lastProject: null,
  bounds: null,
};

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(prefsPath, 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let prefs = loadPrefs();

function savePrefs() {
  try {
    fs.mkdirSync(userData, { recursive: true });
    const tmp = prefsPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2));
    fs.renameSync(tmp, prefsPath);
  } catch (err) {
    console.error('Could not save prefs', err);
  }
}

function publicPrefs() {
  const { bounds, ...rest } = prefs;
  return rest;
}

function addRecent(filePath, title) {
  prefs.recent = [
    { path: filePath, title: title || path.basename(filePath, path.extname(filePath)), openedAt: Date.now() },
    ...prefs.recent.filter((r) => r.path !== filePath),
  ].slice(0, MAX_RECENT);
  prefs.lastProject = filePath;
  savePrefs();
  buildMenu();
}

function addRecentSeries(filePath, title) {
  prefs.recentSeries = [
    { path: filePath, title: title || path.basename(filePath, path.extname(filePath)), openedAt: Date.now() },
    ...(prefs.recentSeries || []).filter((r) => r.path !== filePath),
  ].slice(0, MAX_RECENT);
  savePrefs();
}

// ---------- file helpers ----------

// Every write gets a generation number. If a newer write (e.g. the synchronous save on
// window close) lands while an older async write is still in flight, the older one is dropped.
const writeGen = new Map();

async function atomicWrite(file, data) {
  const gen = (writeGen.get(file) || 0) + 1;
  writeGen.set(file, gen);
  const tmp = `${file}.${gen}.tmp`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(data, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  if (writeGen.get(file) !== gen) {
    await fsp.unlink(tmp).catch(() => {});
    return false;
  }
  await fsp.rename(tmp, file);
  return true;
}

function atomicWriteSync(file, data) {
  const gen = (writeGen.get(file) || 0) + 1;
  writeGen.set(file, gen);
  const tmp = `${file}.${gen}.sync.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function safeName(name) {
  return String(name || 'Untitled').replace(/[\/\\:*?"<>|]+/g, '-').trim() || 'Untitled';
}

async function backupProject(file, reason = 'auto') {
  try {
    if (!fs.existsSync(file)) return;
    const ext = path.extname(file);
    const dir = path.join(backupDir, safeName(path.basename(file, ext)));
    await fsp.mkdir(dir, { recursive: true });
    await fsp.copyFile(file, path.join(dir, `${stamp()}-${reason}${ext}`));
    lastBackup.set(file, Date.now());
    const entries = (await fsp.readdir(dir)).filter((f) => ANY_FILE.test(f)).sort();
    for (const old of entries.slice(0, Math.max(0, entries.length - BACKUPS_PER_PROJECT))) {
      await fsp.unlink(path.join(dir, old)).catch(() => {});
    }
  } catch (err) {
    console.error('Backup failed', err);
  }
}

async function writeProject(file, json) {
  // If something else changed the file since we last touched it (sync tool, another copy),
  // keep that version in backups before overwriting.
  try {
    const st = await fsp.stat(file);
    const known = lastMtime.get(file);
    if (known && Math.abs(st.mtimeMs - known) > 1) await backupProject(file, 'external-change');
  } catch {}
  if (Date.now() - (lastBackup.get(file) || 0) > BACKUP_INTERVAL_MS) await backupProject(file);
  await atomicWrite(file, json);
  const st = await fsp.stat(file);
  lastMtime.set(file, st.mtimeMs);
  return { ok: true, savedAt: Date.now() };
}

function queueSave(file, json) {
  const prev = saveQueues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeProject(file, json));
  saveQueues.set(file, next);
  return next;
}

// ---------- window ----------

function windowBackground() {
  if (!nativeTheme.shouldUseDarkColors) return '#ffffff';
  return prefs.pureBlack ? '#000000' : '#171717';
}

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// Optional smart features: a local model in its own process (see electron/smart).
registerSmartIpc({ ipcMain, app, send: sendToRenderer });

function openPath(filePath) {
  if (!filePath) return;
  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isLoading()) {
    sendToRenderer('open-path', filePath);
    if (win.isMinimized()) win.restore();
    win.focus();
  } else {
    pendingOpenPath = filePath;
  }
}

function projectFromArgv(argv) {
  return argv.slice(1).find((a) => ANY_FILE.test(a) && fs.existsSync(a)) || null;
}

function createWindow() {
  nativeTheme.themeSource = prefs.theme;
  const b = prefs.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440,
    height: b.height || 920,
    x: b.x,
    y: b.y,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'Quillier',
    backgroundColor: windowBackground(),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win.isMaximized() && !win.isFullScreen()) {
      prefs.bounds = win.getBounds();
      savePrefs();
    }
  };
  win.on('resized', saveBounds);
  win.on('moved', saveBounds);
  win.on('closed', () => (win = null));

  // Keep the app self-contained: never navigate away, open web links in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 6)) {
        items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
      }
      if (!params.dictionarySuggestions.length) items.push({ label: 'No suggestions', enabled: false });
      items.push({
        label: 'Add to Dictionary',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      items.push({ type: 'separator' });
    }
    if (params.isEditable) {
      items.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' });
    } else if (params.selectionText) {
      items.push({ role: 'copy' });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- menu ----------

function updateMenuItem() {
  const u = updates.getStatus();
  if (u.state === 'ready') return { label: `Restart to Update to ${u.version}`, click: () => updates.install() };
  if (u.state === 'available') return { label: `Download Quillier ${u.version}…`, click: () => updates.openDownloadPage(DOWNLOAD_PAGE) };
  return { label: 'Check for Updates…', click: cmd('check-updates') };
}

function cmd(command) {
  return () => {
    if (!win) createWindow();
    sendToRenderer('menu', command);
  };
}

function buildMenu() {
  const recent = prefs.recent.filter((r) => fs.existsSync(r.path));
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              updateMenuItem(),
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: cmd('settings') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chapter', accelerator: 'CmdOrCtrl+N', click: cmd('new-chapter') },
        { label: 'New Outline Section', accelerator: 'CmdOrCtrl+Alt+N', click: cmd('new-section') },
        { type: 'separator' },
        { label: 'New Project…', accelerator: 'CmdOrCtrl+Shift+N', click: cmd('new-project') },
        { label: 'New Series…', click: cmd('new-series') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: cmd('open-project') },
        {
          label: 'Open Recent',
          submenu: recent.length
            ? [
                ...recent.map((r) => ({ label: r.title, click: () => openPath(r.path) })),
                { type: 'separator' },
                {
                  label: 'Clear Menu',
                  click: () => {
                    prefs.recent = [];
                    savePrefs();
                    buildMenu();
                    sendToRenderer('prefs-changed', publicPrefs());
                  },
                },
              ]
            : [{ label: 'No recent projects', enabled: false }],
        },
        { type: 'separator' },
        { label: 'Import Manuscript…', click: cmd('import') },
        { label: 'Export Manuscript…', accelerator: 'CmdOrCtrl+E', click: cmd('export') },
        { label: 'Save a Copy…', accelerator: 'CmdOrCtrl+Shift+S', click: cmd('save-copy') },
        { label: 'Show Project in ' + (isMac ? 'Finder' : 'Folder'), click: cmd('reveal') },
        { type: 'separator' },
        { label: 'Close Project', accelerator: 'CmdOrCtrl+Shift+W', click: cmd('close-project') },
        ...(isMac ? [] : [{ label: 'Settings…', accelerator: 'Ctrl+,', click: cmd('settings') }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: cmd('format-bold'), registerAccelerator: false },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: cmd('format-italic'), registerAccelerator: false },
        { type: 'separator' },
        { label: 'Scene Break', accelerator: 'CmdOrCtrl+Enter', click: cmd('scene-break'), registerAccelerator: false },
        { type: 'separator' },
        { label: 'Add Note to Selection', accelerator: 'CmdOrCtrl+Alt+M', click: cmd('add-note'), registerAccelerator: false },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: cmd('toggle-sidebar') },
        { label: 'Toggle Notes Panel', accelerator: 'CmdOrCtrl+Shift+\\', click: cmd('toggle-panel') },
        { label: 'Focus Mode', accelerator: 'CmdOrCtrl+Shift+F', click: cmd('toggle-focus') },
        { type: 'separator' },
        { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+L', click: cmd('toggle-theme') },
        { label: 'Larger Text', accelerator: 'CmdOrCtrl+=', click: cmd('font-bigger') },
        { label: 'Smaller Text', accelerator: 'CmdOrCtrl+-', click: cmd('font-smaller') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Quillier Website', click: () => shell.openExternal(WEBSITE) },
        ...(isMac ? [] : [{ type: 'separator' }, updateMenuItem()]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------

ipcMain.handle('prefs:get', () => publicPrefs());

ipcMain.handle('prefs:set', (_e, patch) => {
  const { recent, lastProject, bounds, ...allowed } = patch || {};
  prefs = { ...prefs, ...allowed };
  if (allowed.theme) nativeTheme.themeSource = allowed.theme;
  if (win && ('theme' in allowed || 'pureBlack' in allowed)) win.setBackgroundColor(windowBackground());
  savePrefs();
  return publicPrefs();
});

ipcMain.handle('theme:is-dark', () => nativeTheme.shouldUseDarkColors);

ipcMain.handle('app:initial-path', () => {
  const p = pendingOpenPath || projectFromArgv(process.argv) || prefs.lastProject;
  pendingOpenPath = null;
  return p && fs.existsSync(p) ? p : null;
});

ipcMain.handle('project:choose-new', async (_e, suggested, folder) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'New Project',
    buttonLabel: 'Create',
    defaultPath: path.join(folder && fs.existsSync(folder) ? folder : app.getPath('documents'), `${safeName(suggested || 'Untitled')}.${EXT}`),
    filters: SAVE_FILTERS,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (canceled || !filePath) return null;
  return filePath.toLowerCase().endsWith('.' + EXT) ? filePath : `${filePath}.${EXT}`;
});

ipcMain.handle('project:choose-open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open Project or Series',
    filters: OPEN_FILTERS,
    properties: ['openFile'],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('project:read', async (_e, filePath) => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const st = await fsp.stat(filePath);
    lastMtime.set(filePath, st.mtimeMs);
    await backupProject(filePath, 'open');
    addRecent(filePath, data.title);
    return { ok: true, path: filePath, data };
  } catch (err) {
    if (err.code === 'ENOENT') {
      prefs.recent = prefs.recent.filter((r) => r.path !== filePath);
      if (prefs.lastProject === filePath) prefs.lastProject = null;
      savePrefs();
      buildMenu();
    }
    return { ok: false, error: err.code === 'ENOENT' ? 'That project file no longer exists.' : String(err.message || err) };
  }
});

ipcMain.handle('project:save', async (_e, filePath, json) => {
  try {
    return await queueSave(filePath, json);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// Synchronous save, used when the window is closing so nothing typed is lost.
ipcMain.on('project:save-sync', (e, filePath, json) => {
  try {
    atomicWriteSync(filePath, json);
    lastMtime.set(filePath, fs.statSync(filePath).mtimeMs);
    e.returnValue = { ok: true };
  } catch (err) {
    e.returnValue = { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('project:save-copy', async (_e, suggested, json) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save a Copy',
    defaultPath: path.join(app.getPath('documents'), `${safeName(suggested)}.${EXT}`),
    filters: SAVE_FILTERS,
  });
  if (canceled || !filePath) return null;
  await atomicWrite(filePath, json);
  return filePath;
});

ipcMain.handle('project:closed', () => {
  prefs.lastProject = null;
  savePrefs();
});

ipcMain.handle('project:renamed', (_e, filePath, title) => {
  const r = prefs.recent.find((x) => x.path === filePath);
  if (r) {
    r.title = title;
    savePrefs();
    buildMenu();
  }
});

// ---------- series ----------

ipcMain.handle('series:choose-new', async (_e, suggested, folder) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'New Series',
    buttonLabel: 'Create',
    message: 'The series file keeps the shared story bible. Each book stays in its own file.',
    defaultPath: path.join(folder || app.getPath('documents'), `${safeName(suggested || 'Untitled series')}.${SERIES_EXT}`),
    filters: SERIES_FILTERS,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (canceled || !filePath) return null;
  return SERIES_FILE.test(filePath) ? filePath : `${filePath}.${SERIES_EXT}`;
});

ipcMain.handle('series:read', async (_e, filePath) => {
  try {
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    const st = await fsp.stat(filePath);
    lastMtime.set(filePath, st.mtimeMs);
    await backupProject(filePath, 'open');
    addRecentSeries(filePath, data.title);
    return { ok: true, path: filePath, data };
  } catch (err) {
    if (err.code === 'ENOENT') {
      prefs.recentSeries = (prefs.recentSeries || []).filter((r) => r.path !== filePath);
      savePrefs();
    }
    return { ok: false, error: err.code === 'ENOENT' ? 'That series file no longer exists.' : String(err.message || err) };
  }
});

ipcMain.handle('series:save', async (_e, filePath, json) => {
  try {
    const res = await queueSave(filePath, json);
    const r = (prefs.recentSeries || []).find((x) => x.path === filePath);
    const title = JSON.parse(json).title;
    if (r && title && r.title !== title) {
      r.title = title;
      savePrefs();
    }
    return res;
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// The books of a series, read-only (no backups, no recent list): the open book needs its siblings'
// text to count who appears where across the series. links: [{ uuid, candidates: [path, …] }]
ipcMain.handle('series:load-books', async (_e, links) => {
  const out = [];
  for (const link of links) {
    const found = (link.candidates || []).find((p) => p && fs.existsSync(p));
    if (!found) {
      out.push({ uuid: link.uuid, exists: false });
      continue;
    }
    try {
      out.push({ uuid: link.uuid, exists: true, path: found, data: JSON.parse(await fsp.readFile(found, 'utf8')) });
    } catch (err) {
      out.push({ uuid: link.uuid, exists: false, path: found, error: String(err.message || err) });
    }
  }
  return out;
});

// Read a project without opening it (no backup, no recent list).
ipcMain.handle('project:peek', async (_e, filePath) => {
  try {
    return { ok: true, path: filePath, data: JSON.parse(await fsp.readFile(filePath, 'utf8')) };
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? 'That file no longer exists.' : String(err.message || err) };
  }
});

// Write several files that change together (a book joining a series). Each is backed up first.
ipcMain.handle('files:write-together', async (_e, files, reason) => {
  try {
    for (const f of files) await backupProject(f.path, reason || 'before-change');
    for (const f of files) {
      const res = await queueSave(f.path, f.json);
      if (!res.ok) return res;
    }
    for (const f of files) {
      const data = JSON.parse(f.json);
      if (SERIES_FILE.test(f.path)) addRecentSeries(f.path, data.title);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

// ---------- library (home screen) ----------

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const STATUS_ORDER = ['idea', 'progress', 'drafted', 'revised', 'done'];
const summaryCache = new Map(); // path -> { mtimeMs, summary }

function countWords(md) {
  if (!md) return 0;
  return (md.replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ').match(WORD) || []).length;
}

async function bookSummary(filePath) {
  try {
    const st = await fsp.stat(filePath);
    const hit = summaryCache.get(filePath);
    if (hit && hit.mtimeMs === st.mtimeMs) return hit.summary;
    const data = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    const drafts = Array.isArray(data.drafts) ? data.drafts : [];
    const draft = drafts.find((d) => d.id === data.activeDraftId) || drafts[0] || { chapters: [] };
    const chapters = draft.chapters || [];
    const status = chapters.length
      ? chapters.reduce((low, c) => (STATUS_ORDER.indexOf(c.status || 'idea') < STATUS_ORDER.indexOf(low) ? c.status || 'idea' : low), 'done')
      : 'idea';
    const bible = data.bible || {};
    const summary = {
      path: filePath,
      exists: true,
      uuid: data.meta?.uuid || null,
      title: data.title || path.basename(filePath, path.extname(filePath)),
      words: chapters.reduce((n, c) => n + countWords(c.content), 0),
      chapters: chapters.length,
      status,
      characters: (bible.entries || []).filter((e) => e.type !== 'place').length,
      places: (bible.entries || []).filter((e) => e.type === 'place').length,
      series: data.series && data.series.uuid ? data.series : null,
    };
    summaryCache.set(filePath, { mtimeMs: st.mtimeMs, summary });
    return summary;
  } catch {
    return { path: filePath, exists: false };
  }
}

const resolveLink = (fromFile, link) =>
  [link.path && !path.isAbsolute(link.path) ? path.resolve(path.dirname(fromFile), link.path) : link.path, link.abs].find(
    (p) => p && fs.existsSync(p)
  ) || null;

ipcMain.handle('library:list', async () => {
  const recent = (prefs.recent || []).filter((r) => fs.existsSync(r.path));
  const books = await Promise.all(recent.map(async (r) => ({ ...(await bookSummary(r.path)), openedAt: r.openedAt })));
  // A book that belongs to a series we haven't listed yet brings its series along.
  for (const b of books) {
    if (!b.series) continue;
    const sp = resolveLink(b.path, b.series);
    if (sp && !(prefs.recentSeries || []).some((r) => r.path === sp)) {
      try {
        addRecentSeries(sp, JSON.parse(await fsp.readFile(sp, 'utf8')).title);
      } catch {}
    }
  }
  const series = [];
  for (const r of prefs.recentSeries || []) {
    if (!fs.existsSync(r.path)) continue;
    try {
      const data = JSON.parse(await fsp.readFile(r.path, 'utf8'));
      const members = await Promise.all(
        (data.books || []).map(async (link) => {
          const p = resolveLink(r.path, link);
          const s = p ? await bookSummary(p) : { exists: false };
          return { ...s, link, uuid: link.uuid, title: s.title || link.title, kind: link.kind || 'book', openedAt: recent.find((x) => x.path === p)?.openedAt || 0 };
        })
      );
      const entries = data.bible?.entries || [];
      series.push({
        path: r.path,
        uuid: data.uuid,
        title: data.title || 'Untitled series',
        openedAt: r.openedAt,
        books: members,
        characters: entries.filter((e) => e.type !== 'place').length,
        places: entries.filter((e) => e.type === 'place').length,
        relationships: (data.bible?.relationships || []).length,
      });
    } catch {}
  }
  const inSeries = new Set(series.flatMap((s) => s.books.map((b) => b.uuid)));
  return {
    series,
    standalone: books.filter((b) => b.exists && !(b.uuid && inSeries.has(b.uuid))),
  };
});

ipcMain.handle('library:remove', (_e, filePath) => {
  prefs.recent = prefs.recent.filter((r) => r.path !== filePath);
  prefs.recentSeries = (prefs.recentSeries || []).filter((r) => r.path !== filePath);
  if (prefs.lastProject === filePath) prefs.lastProject = null;
  savePrefs();
  buildMenu();
});

ipcMain.handle('recent:list', () =>
  prefs.recent.map((r) => ({ ...r, exists: fs.existsSync(r.path) }))
);

ipcMain.handle('recent:remove', (_e, filePath) => {
  prefs.recent = prefs.recent.filter((r) => r.path !== filePath);
  savePrefs();
  buildMenu();
  return prefs.recent;
});

ipcMain.handle('update:status', () => updates.getStatus());
ipcMain.handle('update:check', () => updates.check({ manual: true }));
ipcMain.handle('update:install', () => updates.install());
ipcMain.handle('update:open-page', () => updates.openDownloadPage(DOWNLOAD_PAGE));

ipcMain.handle('shell:reveal', (_e, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('shell:open-backups', async () => {
  await fsp.mkdir(backupDir, { recursive: true });
  return shell.openPath(backupDir);
});

ipcMain.handle('window:set-title', (_e, title, filePath, edited) => {
  if (!win) return;
  win.setTitle(title || 'Quillier');
  if (isMac) {
    win.setRepresentedFilename(filePath || '');
    win.setDocumentEdited(!!edited);
  }
});

ipcMain.handle('dialog:confirm', async (_e, opts) => {
  const { response } = await dialog.showMessageBox(win, {
    type: opts.type || 'question',
    message: opts.message,
    detail: opts.detail,
    buttons: opts.buttons || ['OK', 'Cancel'],
    defaultId: 0,
    cancelId: (opts.buttons || ['OK', 'Cancel']).length - 1,
  });
  return response;
});

ipcMain.handle('import:choose', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import Manuscript',
    filters: [{ name: 'Markdown or text', extensions: ['md', 'markdown', 'txt', 'text'] }],
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled) return [];
  const out = [];
  for (const p of filePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    out.push({
      name: path.basename(p).replace(/\.[^.]+$/, ''),
      ext: path.extname(p).slice(1).toLowerCase(),
      content: await fsp.readFile(p, 'utf8'),
    });
  }
  return out;
});

ipcMain.handle('export:file', async (_e, { suggested, ext, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export Manuscript',
    defaultPath: path.join(app.getPath('documents'), `${safeName(suggested)}.${ext}`),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (canceled || !filePath) return null;
  await fsp.writeFile(filePath, content, 'utf8');
  shell.showItemInFolder(filePath);
  return filePath;
});

ipcMain.handle('export:folder', async (_e, { suggested, files }) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose where to export',
    buttonLabel: 'Export Here',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return null;
  let dir = path.join(filePaths[0], safeName(suggested));
  for (let i = 2; fs.existsSync(dir); i++) dir = path.join(filePaths[0], `${safeName(suggested)} ${i}`);
  await fsp.mkdir(dir, { recursive: true });
  for (const f of files) await fsp.writeFile(path.join(dir, safeName(f.name)), f.content, 'utf8');
  shell.openPath(dir);
  return dir;
});

// `cssPage`: the HTML sets its own page size, margins and running headers with @page rules
// (used for standard manuscript format). Otherwise a Letter page with book margins.
ipcMain.handle('export:pdf', async (_e, { suggested, html, cssPage }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export PDF',
    defaultPath: path.join(app.getPath('documents'), `${safeName(suggested)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return null;
  const tmpHtml = path.join(app.getPath('temp'), `quillier-export-${Date.now()}.html`);
  await fsp.writeFile(tmpHtml, html, 'utf8');
  // The exported HTML carries a CSP that blocks its own scripts; JS is only on so we can wait for fonts.
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pdfWin.loadFile(tmpHtml);
    await pdfWin.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const pdf = await pdfWin.webContents.printToPDF(
      cssPage
        ? { preferCSSPageSize: true, printBackground: true }
        : {
            pageSize: 'Letter',
            printBackground: true,
            margins: { marginType: 'custom', top: 0.9, bottom: 0.9, left: 1, right: 1 },
          }
    );
    await fsp.writeFile(filePath, pdf);
  } finally {
    pdfWin.destroy();
    fsp.unlink(tmpHtml).catch(() => {});
  }
  shell.showItemInFolder(filePath);
  return filePath;
});

ipcMain.handle('export:choose-cover', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Choose Cover Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  const p = filePaths[0];
  return { name: path.basename(p), ext: path.extname(p).slice(1).toLowerCase(), data: new Uint8Array(await fsp.readFile(p)) };
});

// files: [{ name, data: string | Uint8Array }]. The mimetype entry is added here, first and uncompressed.
ipcMain.handle('export:epub', async (_e, { suggested, files }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export EPUB',
    defaultPath: path.join(app.getPath('documents'), `${safeName(suggested)}.epub`),
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
  });
  if (canceled || !filePath) return null;
  const entries = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    ...files.map((f) => ({ name: f.name, data: Buffer.from(f.data), store: /\.(jpe?g|png)$/i.test(f.name) })),
  ];
  await fsp.writeFile(filePath, zip(entries));
  shell.showItemInFolder(filePath);
  return filePath;
});

// ---------- app lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const p = projectFromArgv(argv);
    if (p) openPath(p);
    else if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    if (app.isReady() && !win) {
      pendingOpenPath = filePath;
      createWindow();
    } else {
      openPath(filePath);
    }
  });

  app.whenReady().then(() => {
    app.setName('Quillier');
    app.setAboutPanelOptions({ applicationName: 'Quillier', applicationVersion: app.getVersion(), website: WEBSITE });
    buildMenu();
    createWindow();
    updates.start({
      isEnabled: () => prefs.autoUpdate !== false,
      onStatus: (status, { quiet }) => {
        sendToRenderer('update-status', status);
        if (!quiet) buildMenu();
      },
    });
    nativeTheme.on('updated', () => {
      if (win) win.setBackgroundColor(windowBackground());
      sendToRenderer('theme-changed', nativeTheme.shouldUseDarkColors);
    });
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on('before-quit', () => registerSmartIpc.shutdown());

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
