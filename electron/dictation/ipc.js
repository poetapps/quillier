// IPC for dictation (local speech-to-text). Wire up from electron/main.js:
//
//   const registerDictationIpc = require('./dictation/ipc');
//   registerDictationIpc({ ipcMain, app, send: (channel, payload) => win?.webContents.send(channel, payload) });
//   app.on('before-quit', () => registerDictationIpc.shutdown());
//
// Channels (all ipcMain.handle):
//   dictation:status             -> Status
//   dictation:download (id)      -> Status   (progress is pushed as send('dictation-status', Status))
//   dictation:cancel             -> Status
//   dictation:remove (id)        -> Status
//   dictation:warm (id)          -> { ok } | { ok: false, error }
//   dictation:transcribe ({model, pcm, prompt}) -> { ok: true, text, speechMs, ms } | { ok: false, error }
//   dictation:unload             -> void
//   dictation:mic                -> 'granted' | 'denied' | 'restricted'   (asks macOS the first time)
//   dictation:mic-settings       -> void     (opens the system's microphone privacy settings)
'use strict';

const path = require('node:path');
const { DictationManager } = require('./manager.js');

let manager = null;

function registerDictationIpc({ ipcMain, app, send }) {
  const { utilityProcess, net, systemPreferences, shell } = require('electron');
  if (manager) manager.shutdown();
  manager = new DictationManager({
    userData: app.getPath('userData'),
    fetch: (url, init) => net.fetch(url, init),
    utilityProcess,
    workerPath: path.join(__dirname, 'worker.mjs'),
    log: process.env.QUILLIER_DICTATION_DEBUG ? (m) => console.log('[dictation]', m) : () => {},
  });
  manager.on('status', (status) => {
    try { send('dictation-status', status); } catch { /* window gone */ }
  });

  ipcMain.handle('dictation:status', () => manager.status());
  ipcMain.handle('dictation:download', (_e, id) => manager.startDownload(String(id)));
  ipcMain.handle('dictation:cancel', () => manager.cancelDownload());
  ipcMain.handle('dictation:remove', (_e, id) => manager.remove(String(id)));
  ipcMain.handle('dictation:warm', (_e, id) => manager.warm(String(id)));
  ipcMain.handle('dictation:transcribe', (_e, req) => {
    const { model, pcm, prompt } = req || {};
    return manager.transcribe(String(model), pcm, { prompt });
  });
  ipcMain.handle('dictation:unload', async () => { await manager.unload(); });
  ipcMain.handle('dictation:mic', async () => {
    // A fake capture device (Chromium's --use-fake-device-for-media-stream, for testing) never
    // touches the real microphone, so there's nothing to ask macOS for.
    if (process.platform !== 'darwin' || app.commandLine.hasSwitch('use-fake-device-for-media-stream')) return 'granted';
    const now = systemPreferences.getMediaAccessStatus('microphone');
    if (now === 'granted' || now === 'denied' || now === 'restricted') return now;
    return (await systemPreferences.askForMediaAccess('microphone')) ? 'granted' : 'denied';
  });
  ipcMain.handle('dictation:mic-settings', () => {
    if (process.platform === 'darwin') shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    else if (process.platform === 'win32') shell.openExternal('ms-settings:privacy-microphone');
  });

  return { shutdown, manager };
}

function shutdown() {
  if (manager) manager.shutdown();
}

module.exports = registerDictationIpc;
module.exports.shutdown = shutdown;
