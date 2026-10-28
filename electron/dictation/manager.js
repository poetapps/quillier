// Main-process side of dictation: speech model files, downloads and the speech worker (an Electron
// utilityProcess running worker.mjs). ipc.js exposes this to the renderer; selftest.js drives it
// directly. Downloads reuse the smart features' verified, resumable downloader.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { MODELS, VAD_FILE, getModel, recommendedFor } = require('./catalog.js');
const { downloadModel, partPath, finalPath } = require('../smart/download.js');

const IDLE_UNLOAD_MS = 5 * 60 * 1000;
const MAX_PCM_BYTES = 16000 * 2 * 30; // Whisper hears 30 seconds at a time

// @fugood/whisper.node ships prebuilt binaries as @fugood/node-whisper-<platform>-<arch>[-variant];
// dictation is available when the plain one for this machine was installed/packaged.
function detectSupport() {
  try {
    return fs.existsSync(path.join(__dirname, '..', '..', 'node_modules', '@fugood', `node-whisper-${process.platform}-${process.arch}`, 'index.node'));
  } catch {
    return false;
  }
}

// Native code can't read inside app.asar; the VAD model is unpacked next to it (package.json asarUnpack).
function unpacked(p) {
  return p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

class DictationManager extends EventEmitter {
  constructor({ userData, modelsDir, fetch, utilityProcess, workerPath, vadPath, idleMs = IDLE_UNLOAD_MS, log = () => {} }) {
    super();
    this.modelsDir = modelsDir || path.join(userData, 'models');
    this.fetch = fetch;
    this.utilityProcess = utilityProcess;
    this.workerPath = workerPath || path.join(__dirname, 'worker.mjs');
    this.vadPath = vadPath || unpacked(path.join(__dirname, VAD_FILE));
    this.idleMs = idleMs;
    this.log = log;
    this.supported = detectSupport();

    this.child = null; // utilityProcess
    this.childReady = null; // Promise resolved on the worker's 'ready'
    this.stopping = false; // we are killing the worker on purpose
    this.pending = new Map(); // request id -> { resolve, model }
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
      recommended: recommendedFor(),
      models: MODELS.map((m) => ({ id: m.id, label: m.label, sub: m.sub, bytes: m.bytes, installed: this.isInstalled(m) })),
      download: this.download ? { ...this.download } : null,
      loaded: this.loaded,
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
    if (this.loaded === id || [...this.pending.values()].some((p) => p.model === id)) await this.unload();
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
    const child = this.utilityProcess.fork(this.workerPath, [`--vad=${this.vadPath}`], { serviceName: 'Quillier Dictation', stdio: 'inherit' });
    this.child = child;
    this.stopping = false;
    this.childReady = new Promise((resolve, reject) => {
      child.once('exit', (code) => reject(new Error(`The dictation process exited before starting (code ${code}).`)));
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
      if (!expected) this.error = `The dictation process stopped unexpectedly (code ${code}).`;
      const message = expected ? 'The speech model was unloaded.' : this.error;
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
    const was = this.loaded;
    this.loaded = msg.loaded || null;
    req.resolve(msg);
    this._armIdle();
    if (was !== this.loaded) this._changed();
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
      if (!this.child) { resolve({ ok: false, error: 'The dictation process is not running.' }); return; }
      this.pending.set(id, { resolve, model: msg.model });
      this.child.postMessage({ ...msg, id });
    });
  }

  _check(modelId) {
    const model = getModel(modelId);
    if (!model) return { error: `Unknown model: ${modelId}` };
    if (!this.supported) return { error: 'Dictation is not available on this computer.' };
    if (!this.isInstalled(model)) return { error: 'not-installed' };
    return { model };
  }

  // Loads the model ahead of the first words, so they don't wait for it.
  async warm(modelId) {
    const { model, error } = this._check(modelId);
    if (error) return { ok: false, error };
    try {
      const reply = await this._request({ type: 'load', model: model.id, path: finalPath(this.modelsDir, model) });
      if (reply.ok) this.error = null;
      return reply.ok ? { ok: true } : { ok: false, error: reply.error };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  // pcm: 16 kHz mono signed 16-bit PCM (ArrayBuffer or typed array), at most 30 seconds.
  async transcribe(modelId, pcm, { prompt, language } = {}) {
    const { model, error } = this._check(modelId);
    if (error) return { ok: false, error };
    if (!pcm || typeof pcm.byteLength !== 'number' || pcm.byteLength % 2) return { ok: false, error: 'pcm must be 16-bit audio' };
    if (pcm.byteLength > MAX_PCM_BYTES) return { ok: false, error: 'At most 30 seconds of audio at a time.' };
    try {
      const reply = await this._request({
        type: 'transcribe',
        model: model.id,
        path: finalPath(this.modelsDir, model),
        pcm,
        prompt: typeof prompt === 'string' ? prompt.slice(-1000) : undefined,
        language: model.id.endsWith('-en') ? 'en' : language || 'en',
      });
      if (!reply.ok) return { ok: false, error: reply.error };
      this.error = null;
      return { ok: true, text: reply.text, speechMs: reply.speechMs, ms: reply.ms };
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

module.exports = { DictationManager, detectSupport };
