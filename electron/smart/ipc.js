// IPC for the optional smart features (local LLM). Wire up from electron/main.js:
//
//   const registerSmartIpc = require('./smart/ipc');
//   registerSmartIpc({ ipcMain, app, send: (channel, payload) => win?.webContents.send(channel, payload) });
//   app.on('before-quit', () => registerSmartIpc.shutdown());
//
// Channels (all ipcMain.handle):
//   smart:status            -> Status
//   smart:download (id)     -> Status   (progress is pushed as send('smart-status', Status))
//   smart:cancel            -> Status
//   smart:remove (id)       -> Status   (refused while that model is loaded; unload first)
//   smart:ask ({model, items}) -> { ok: true, results } | { ok: false, error }
//   smart:unload            -> void
//   smart:cache-load (key)  -> object | null
//   smart:cache-save (key, obj) -> void
'use strict';

const path = require('node:path');
const { SmartManager } = require('./manager.js');

let manager = null;

function registerSmartIpc({ ipcMain, app, send }) {
  const { utilityProcess, net } = require('electron');
  if (manager) manager.shutdown();
  manager = new SmartManager({
    userData: app.getPath('userData'),
    fetch: (url, init) => net.fetch(url, init),
    utilityProcess,
    workerPath: path.join(__dirname, 'worker.mjs'),
    log: process.env.QUILLIER_SMART_DEBUG ? (m) => console.log('[smart]', m) : () => {},
  });
  manager.on('status', (status) => {
    try { send('smart-status', status); } catch { /* window gone */ }
  });

  ipcMain.handle('smart:status', () => manager.status());
  ipcMain.handle('smart:download', (_e, id) => manager.startDownload(String(id)));
  ipcMain.handle('smart:cancel', () => manager.cancelDownload());
  ipcMain.handle('smart:remove', (_e, id) => manager.remove(String(id)));
  ipcMain.handle('smart:ask', async (_e, req) => {
    const { model, items } = req || {};
    return manager.ask(String(model), items);
  });
  ipcMain.handle('smart:unload', async () => { await manager.unload(); });
  ipcMain.handle('smart:cache-load', (_e, key) => manager.cacheLoad(key));
  ipcMain.handle('smart:cache-save', async (_e, key, obj) => { await manager.cacheSave(key, obj); });

  return { shutdown, manager };
}

function shutdown() {
  if (manager) manager.shutdown();
}

module.exports = registerSmartIpc;
module.exports.shutdown = shutdown;
