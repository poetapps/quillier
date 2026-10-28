const { contextBridge, ipcRenderer } = require('electron');

function on(channel, fn) {
  const handler = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  isDark: () => ipcRenderer.invoke('theme:is-dark'),
  initialPath: () => ipcRenderer.invoke('app:initial-path'),

  chooseNewProject: (suggested, folder) => ipcRenderer.invoke('project:choose-new', suggested, folder),
  chooseOpenProject: () => ipcRenderer.invoke('project:choose-open'),
  readProject: (path) => ipcRenderer.invoke('project:read', path),
  saveProject: (path, json) => ipcRenderer.invoke('project:save', path, json),
  saveProjectSync: (path, json) => ipcRenderer.sendSync('project:save-sync', path, json),
  saveCopy: (suggested, json) => ipcRenderer.invoke('project:save-copy', suggested, json),
  projectClosed: () => ipcRenderer.invoke('project:closed'),
  projectRenamed: (path, title) => ipcRenderer.invoke('project:renamed', path, title),

  peekProject: (path) => ipcRenderer.invoke('project:peek', path),
  writeTogether: (files, reason) => ipcRenderer.invoke('files:write-together', files, reason),

  chooseNewSeries: (suggested, folder) => ipcRenderer.invoke('series:choose-new', suggested, folder),
  readSeries: (path) => ipcRenderer.invoke('series:read', path),
  saveSeries: (path, json) => ipcRenderer.invoke('series:save', path, json),
  saveSeriesSync: (path, json) => ipcRenderer.sendSync('project:save-sync', path, json),
  loadSeriesBooks: (links) => ipcRenderer.invoke('series:load-books', links),

  library: () => ipcRenderer.invoke('library:list'),
  removeFromLibrary: (path) => ipcRenderer.invoke('library:remove', path),

  smartStatus: () => ipcRenderer.invoke('smart:status'),
  smartDownload: (id) => ipcRenderer.invoke('smart:download', id),
  smartCancel: () => ipcRenderer.invoke('smart:cancel'),
  smartRemove: (id) => ipcRenderer.invoke('smart:remove', id),
  smartAsk: (req) => ipcRenderer.invoke('smart:ask', req),
  smartUnload: () => ipcRenderer.invoke('smart:unload'),
  smartCacheLoad: (key) => ipcRenderer.invoke('smart:cache-load', key),
  smartCacheSave: (key, obj) => ipcRenderer.invoke('smart:cache-save', key, obj),
  onSmartStatus: (fn) => on('smart-status', fn),

  dictationStatus: () => ipcRenderer.invoke('dictation:status'),
  dictationDownload: (id) => ipcRenderer.invoke('dictation:download', id),
  dictationCancel: () => ipcRenderer.invoke('dictation:cancel'),
  dictationRemove: (id) => ipcRenderer.invoke('dictation:remove', id),
  dictationWarm: (id) => ipcRenderer.invoke('dictation:warm', id),
  dictationTranscribe: (req) => ipcRenderer.invoke('dictation:transcribe', req),
  dictationUnload: () => ipcRenderer.invoke('dictation:unload'),
  dictationMic: () => ipcRenderer.invoke('dictation:mic'),
  dictationMicSettings: () => ipcRenderer.invoke('dictation:mic-settings'),
  onDictationStatus: (fn) => on('dictation-status', fn),

  recent: () => ipcRenderer.invoke('recent:list'),
  removeRecent: (path) => ipcRenderer.invoke('recent:remove', path),

  reveal: (path) => ipcRenderer.invoke('shell:reveal', path),
  openBackups: () => ipcRenderer.invoke('shell:open-backups'),
  setTitle: (title, path, edited) => ipcRenderer.invoke('window:set-title', title, path, edited),
  setKind: (kind) => ipcRenderer.invoke('window:set-kind', kind),
  confirm: (opts) => ipcRenderer.invoke('dialog:confirm', opts),

  chooseImport: () => ipcRenderer.invoke('import:choose'),
  exportFile: (opts) => ipcRenderer.invoke('export:file', opts),
  exportFolder: (opts) => ipcRenderer.invoke('export:folder', opts),
  exportPdf: (opts) => ipcRenderer.invoke('export:pdf', opts),
  pdfPageWidths: (opts) => ipcRenderer.invoke('export:pdf-page-widths', opts),
  exportEpub: (opts) => ipcRenderer.invoke('export:epub', opts),
  chooseCover: () => ipcRenderer.invoke('export:choose-cover'),

  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openDownloadPage: () => ipcRenderer.invoke('update:open-page'),

  onMenu: (fn) => on('menu', fn),
  onOpenPath: (fn) => on('open-path', fn),
  onThemeChanged: (fn) => on('theme-changed', fn),
  onPrefsChanged: (fn) => on('prefs-changed', fn),
  onUpdateStatus: (fn) => on('update-status', fn),
});
