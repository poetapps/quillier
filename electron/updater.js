// Updates come from the project's GitHub Releases (see RELEASING.md). Nothing ever pops up:
// with "Check automatically" on, a quiet check runs shortly after launch and twice a day,
// downloads in the background, and installs the next time the app quits. Everything else
// (status, "Check now", "Restart now") lives in Settings → Updates and the app menu.
const { app, shell } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const FIRST_CHECK_DELAY_MS = 20 * 1000;
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

// idle | checking | none | available | downloading | ready | error | dev
let status = { state: app.isPackaged ? 'idle' : 'dev' };
let canInstall = null; // resolved lazily, see installable()
let onChange = () => {};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false; // turned on once we know this build can install updates
autoUpdater.logger = null;

autoUpdater.on('download-progress', (p) => {
  if (status.state === 'downloading') set({ ...status, percent: Math.round(p.percent) }, { quiet: true });
});

function set(next, { quiet = false } = {}) {
  status = next;
  onChange(publicStatus(), { quiet });
}

function publicStatus() {
  return { ...status, current: app.getVersion(), canInstall: !!canInstall };
}

// macOS only installs updates into apps signed with an Apple Developer ID, and Linux only into
// AppImages. Builds that can't install still find new versions; they link to the download page.
async function installable() {
  if (canInstall !== null) return canInstall;
  if (process.platform === 'darwin') {
    const bundle = path.resolve(app.getPath('exe'), '../../..');
    canInstall = await new Promise((resolve) =>
      execFile('/usr/bin/codesign', ['--verify', '-R=anchor apple generic', bundle], (err) => resolve(!err))
    );
  } else if (process.platform === 'linux') {
    canInstall = !!process.env.APPIMAGE;
  } else {
    canInstall = true;
  }
  autoUpdater.autoInstallOnAppQuit = canInstall;
  return canInstall;
}

function describe(err) {
  const msg = String((err && err.message) || err);
  if (/ENOTFOUND|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
    return 'You seem to be offline.';
  }
  if (/\b404\b|No published versions/i.test(msg)) return 'No releases have been published yet.';
  return 'Something went wrong. Try again in a bit.';
}

async function check({ manual = false } = {}) {
  if (!app.isPackaged) return publicStatus();
  if (['checking', 'downloading', 'ready'].includes(status.state)) return publicStatus();
  const before = status;
  set({ state: 'checking' });
  try {
    await installable();
    const result = await autoUpdater.checkForUpdates();
    if (!result || !result.isUpdateAvailable) {
      set({ state: 'none' });
      return publicStatus();
    }
    const version = result.updateInfo.version;
    if (!canInstall) {
      set({ state: 'available', version });
      return publicStatus();
    }
    set({ state: 'downloading', version, percent: 0 });
    await autoUpdater.downloadUpdate();
    set({ state: 'ready', version });
  } catch (err) {
    console.error('Update check failed', err);
    // A background check that fails (offline, say) leaves things as they were; only say so when asked.
    if (manual) set({ state: 'error', message: describe(err) });
    else set(before);
  }
  return publicStatus();
}

function install() {
  if (status.state === 'ready') autoUpdater.quitAndInstall(true, true);
}

function openDownloadPage(url) {
  shell.openExternal(url);
}

// isEnabled: () => boolean, read on every tick so the Settings toggle applies right away.
function start({ isEnabled, onStatus }) {
  onChange = onStatus;
  if (!app.isPackaged) return;
  installable().then(() => onChange(publicStatus(), { quiet: true }));
  const tick = () => {
    if (isEnabled()) check();
  };
  setTimeout(tick, FIRST_CHECK_DELAY_MS);
  setInterval(tick, CHECK_EVERY_MS);
}

module.exports = { start, check, install, openDownloadPage, getStatus: publicStatus };
