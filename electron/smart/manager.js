// Main-process side of the smart features: model files, downloads, the inference worker
// (an Electron utilityProcess running worker.mjs) and the per-book answer cache.
// ipc.js exposes this to the renderer; selftest.js drives it directly.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const { MODELS, getModel, recommendedFor } = require('./catalog.js');
const { downloadModel, partPath, finalPath } = require('./download.js');
const { RELATIONS, RELATION_KEYS } = require('./prompts.js');

const IDLE_UNLOAD_MS = 3 * 60 * 1000;
const MAX_ITEMS_PER_ASK = 5000;

// node-llama-cpp ships prebuilt binaries as @node-llama-cpp/<platform>-<arch>[-gpu] packages; smart
// features are available when one for this machine was installed/packaged.
function detectSupport() {
  const plat = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
  if (!plat) return false;
  const dirs = [path.join(__dirname, '..', '..', 'node_modules', '@node-llama-cpp')];
  for (const dir of dirs) {
    try {
      if (fs.readdirSync(dir).some((name) => name === `${plat}-${process.arch}` || name.startsWith(`${plat}-${process.arch}-`))) return true;
    } catch { /* not there */ }
  }
  return false;
}

function safeCacheName(key) {
  const k = String(key);
  const slug = k.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 80) || 'cache';
  const hash = crypto.createHash('sha256').update(k).digest('hex').slice(0, 12);
  return `${slug}-${hash}.json`;
}

class SmartManager extends EventEmitter {
  constructor({ userData, modelsDir, cacheDir, fetch, utilityProcess, workerPath, idleMs = IDLE_UNLOAD_MS, log = () => {} }) {
    super();
    this.modelsDir = modelsDir || path.join(userData, 'models');
    this.cacheDir = cacheDir || path.join(userData, 'smart-cache');
    this.fetch = fetch;
    this.utilityProcess = utilityProcess;
    this.workerPath = workerPath || path.join(__dirname, 'worker.mjs');
    this.idleMs = idleMs;
    this.log = log;
    this.supported = detectSupport();
    this.totalMemGB = Math.round((os.totalmem() / 2 ** 30) * 10) / 10;

    this.child = null; // utilityProcess
    this.childReady = null; // Promise resolved on the worker's 'ready'
    this.stopping = false; // we are killing the worker on purpose
    this.pending = new Map(); // request id -> { resolve }
    this.nextId = 1;
    this.idleTimer = null;
    this.loaded = null;
    this.error = null;

    this.dl = null; // { handle, id }
    this.download = null; // public download state
  }

  // ------------------------------------------------------------------ status

  isInstalled(model) {
    try { return fs.statSync(finalPath(this.modelsDir, model)).size === model.bytes; } catch { return false; }
  }

  status() {
    return {
      supported: this.supported,
      totalMemGB: this.totalMemGB,
      recommended: recommendedFor(this.totalMemGB, { cpuOnly: process.platform === 'darwin' && process.arch === 'x64' }),
      relations: RELATION_KEYS.map((key) => ({ key, description: RELATIONS[key] })),
      models: MODELS.map((m) => ({ id: m.id, label: m.label, quant: m.quant, bytes: m.bytes, ramGB: m.ramGB, installed: this.isInstalled(m) })),
      download: this.download ? { ...this.download } : null,
      loaded: this.loaded,
      busy: this.pending.size > 0,
      error: this.error,
    };
  }

  _changed() {
    this.emit('status', this.status());
  }

  // ------------------------------------------------------------------ downloads

  startDownload(id) {
    const model = getModel(id);
    if (!model) { this.error = `Unknown model: ${id}`; this._changed(); return this.status(); }
    if (this.dl) return this.status(); // one download at a time
    if (this.isInstalled(model)) return this.status();
    if (typeof this.fetch !== 'function') { this.error = 'Downloads are not available.'; this._changed(); return this.status(); }
    this.error = null;
    let resumeFrom = 0;
    try { resumeFrom = Math.min(fs.statSync(partPath(this.modelsDir, model)).size, model.bytes); } catch { /* fresh download */ }
    this.download = { id, received: resumeFrom, total: model.bytes, state: 'downloading' };
    const handle = downloadModel({
      model,
      dir: this.modelsDir,
      fetch: this.fetch,
      onProgress: (p) => {
        if (!this.dl || this.dl.handle !== handle) return;
        this.download = { id, received: p.received, total: p.total, state: p.state };
        this._changed();
      },
    });
    this.dl = { handle, id };
    handle.promise.then(
      () => { this.download = null; },
      (e) => {
        this.download = e && e.name === 'AbortError'
          ? null
          : { id, received: handle.progress.received, total: model.bytes, state: 'error', error: String((e && e.message) || e) };
      },
    ).finally(() => {
      if (this.dl && this.dl.handle === handle) this.dl = null;
      this._changed();
    });
    this._changed();
    return this.status();
  }

  // Stops the running download (its .part stays, so the next download resumes) or clears a
  // download error.
  async cancelDownload() {
    if (this.dl) {
      const { handle } = this.dl;
      handle.cancel();
      await handle.promise.catch(() => {});
    } else if (this.download) {
      this.download = null;
      this._changed();
    }
    return this.status();
  }

  async remove(id) {
    const model = getModel(id);
    if (!model) return this.status();
    const inUse = this.loaded === id || [...this.pending.values()].some((p) => p.model === id);
    if (inUse) {
      this.error = 'Unload the model before removing it.';
      this._changed();
      return this.status();
    }
    if (this.dl && this.dl.id === id) await this.cancelDownload();
    if (this.download && this.download.id === id) this.download = null;
    try {
      await fsp.rm(finalPath(this.modelsDir, model), { force: true });
      await fsp.rm(partPath(this.modelsDir, model), { force: true });
      this.error = null;
    } catch (e) {
      this.error = `Could not remove the model: ${(e && e.message) || e}`;
    }
    this._changed();
    return this.status();
  }

  // ------------------------------------------------------------------ worker

  _ensureWorker() {
    if (this.child) return this.childReady;
    if (!this.utilityProcess) throw new Error('No utilityProcess available');
    const child = this.utilityProcess.fork(this.workerPath, [], { serviceName: 'Quillier Smart Features', stdio: 'inherit' });
    this.child = child;
    this.stopping = false;
    this.childReady = new Promise((resolve, reject) => {
      child.once('exit', (code) => reject(new Error(`The smart features process exited before starting (code ${code}).`)));
      child.on('message', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ready') resolve();
        else if (msg.type === 'log') this.log(msg.message);
        else if (msg.type === 'reply') this._onReply(msg);
      });
    });
    this.childReady.catch(() => {});
    child.on('exit', (code) => {
      if (this.child !== child) return;
      const expected = this.stopping;
      this.child = null;
      this.childReady = null;
      this.loaded = null;
      if (!expected) this.error = `The smart features process stopped unexpectedly (code ${code}).`;
      const message = expected ? 'The model was unloaded.' : this.error;
      for (const { resolve } of this.pending.values()) resolve({ ok: false, error: message });
      this.pending.clear();
      this._changed();
    });
    return this.childReady;
  }

  _onReply(msg) {
    const req = this.pending.get(msg.id);
    if (!req) return;
    this.pending.delete(msg.id);
    this.loaded = msg.loaded || null;
    req.resolve(msg);
    this._armIdle();
    this._changed();
  }

  _armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.child && this.pending.size === 0) {
      this.idleTimer = setTimeout(() => this.unload(), this.idleMs);
      if (this.idleTimer.unref) this.idleTimer.unref();
    }
  }

  async _request(msg) {
    await this._ensureWorker();
    const id = this.nextId++;
    clearTimeout(this.idleTimer);
    return new Promise((resolve) => {
      if (!this.child) { resolve({ ok: false, error: 'The smart features process is not running.' }); return; }
      this.pending.set(id, { resolve, model: msg.model });
      this._changed();
      this.child.postMessage({ ...msg, id });
    });
  }

  async ask(modelId, items) {
    const model = getModel(modelId);
    if (!model) return { ok: false, error: `Unknown model: ${modelId}` };
    if (!this.supported) return { ok: false, error: 'Smart features are not available on this computer.' };
    if (!this.isInstalled(model)) return { ok: false, error: 'not-installed' };
    if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' };
    if (items.length === 0) return { ok: true, results: [] };
    if (items.length > MAX_ITEMS_PER_ASK) return { ok: false, error: `At most ${MAX_ITEMS_PER_ASK} items per request.` };
    try {
      const reply = await this._request({ type: 'ask', model: model.id, path: finalPath(this.modelsDir, model), items });
      if (!reply.ok) return { ok: false, error: reply.error };
      this.error = null;
      return { ok: true, results: reply.results };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  // Ends the worker process, which frees the model's memory completely.
  async unload() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 3000))]);
  }

  // ------------------------------------------------------------------ cache

  async cacheLoad(key) {
    try {
      return JSON.parse(await fsp.readFile(path.join(this.cacheDir, safeCacheName(key)), 'utf8'));
    } catch {
      return null;
    }
  }

  async cacheSave(key, obj) {
    await fsp.mkdir(this.cacheDir, { recursive: true });
    const file = path.join(this.cacheDir, safeCacheName(key));
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(obj === undefined ? null : obj));
    await fsp.rename(tmp, file);
  }

  // ------------------------------------------------------------------ quit

  shutdown() {
    if (this.dl) this.dl.handle.cancel();
    clearTimeout(this.idleTimer);
    if (this.child) {
      this.stopping = true;
      try { this.child.kill(); } catch { /* already gone */ }
    }
  }
}

module.exports = { SmartManager, safeCacheName, detectSupport };
