// Resumable, verified model download.
//
// Streams into <dir>/<file>.part (HTTP Range resume if a .part is already there), hashes while it
// writes, and renames to <dir>/<file> only when the size and sha256 match. A mismatch deletes the
// .part. Cancel keeps the .part so the next download resumes. Works with any WHATWG fetch: Electron's
// net.fetch in the app (system proxy and certificates), globalThis.fetch under plain Node. Both
// follow Hugging Face's redirect to its CDN.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PROGRESS_INTERVAL_MS = 250; // at most ~4 progress reports a second

const partPath = (dir, model) => path.join(dir, model.file + '.part');
const finalPath = (dir, model) => path.join(dir, model.file);

function abortError() {
  const e = new Error('cancelled');
  e.name = 'AbortError';
  return e;
}

function freeBytes(dir) {
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return Infinity;
  }
}

// Downloads one model. Returns { promise, cancel(), progress }.
// onProgress({ received, total, state }) is throttled; state is 'downloading' | 'verifying'.
// The promise resolves with the final path, or rejects (error.name === 'AbortError' on cancel).
function downloadModel({ model, dir, fetch = globalThis.fetch, onProgress = () => {} }) {
  const controller = new AbortController();
  const { signal } = controller;
  const progress = { received: 0, total: model.bytes, state: 'downloading' };
  let lastReport = 0;
  const report = (force) => {
    const now = Date.now();
    if (!force && now - lastReport < PROGRESS_INTERVAL_MS) return;
    lastReport = now;
    try { onProgress({ ...progress }); } catch { /* listener errors are not ours */ }
  };

  const run = async () => {
    await fsp.mkdir(dir, { recursive: true });
    const part = partPath(dir, model);
    const dest = finalPath(dir, model);

    let have = 0;
    try { have = (await fsp.stat(part)).size; } catch { have = 0; }
    if (have > model.bytes) { await fsp.rm(part, { force: true }); have = 0; }
    if (freeBytes(dir) < model.bytes - have + 200 * 1024 * 1024) throw new Error('Not enough free disk space for this model.');

    // Hash what we already have, so the final digest covers the whole file.
    let hash = crypto.createHash('sha256');
    if (have > 0) {
      progress.received = have;
      report(true);
      const stream = fs.createReadStream(part, { start: 0, end: have - 1, highWaterMark: 4 << 20 });
      for await (const chunk of stream) {
        if (signal.aborted) { stream.destroy(); throw abortError(); }
        hash.update(chunk);
      }
    }

    if (have < model.bytes) {
      const res = await fetch(model.url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, signal, redirect: 'follow' });
      if (have > 0 && res.status === 200) {
        // The server ignored the Range request: start over from byte 0.
        hash = crypto.createHash('sha256');
        have = 0;
        progress.received = 0;
      } else if (have > 0 && res.status === 206) {
        const m = /bytes (\d+)-/.exec(res.headers.get('content-range') || '');
        if (!m || Number(m[1]) !== have) {
          try { await res.body?.cancel(); } catch { /* ignore */ }
          await fsp.rm(part, { force: true });
          throw new Error('Download could not resume. Please try again.');
        }
      } else if (!res.ok) {
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (res.status === 416) await fsp.rm(part, { force: true });
        throw new Error(`Download failed (HTTP ${res.status}).`);
      }
      if (!res.body) throw new Error('Download failed (empty response).');

      const out = fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' });
      const closed = new Promise((resolve, reject) => { out.on('close', resolve); out.on('error', reject); });
      let failed = null;
      try {
        for await (const chunk of res.body) {
          if (signal.aborted) throw abortError();
          const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
          progress.received += buf.length;
          if (progress.received > model.bytes) throw new Error('Download is larger than expected.');
          hash.update(buf);
          if (!out.write(buf)) await new Promise((resolve) => out.once('drain', resolve));
          report(false);
        }
      } catch (e) {
        failed = signal.aborted ? abortError() : e;
      }
      out.end();
      await closed.catch((e) => { failed = failed || e; });
      if (failed) throw failed;
    }

    progress.state = 'verifying';
    report(true);
    const size = (await fsp.stat(part)).size;
    if (size !== model.bytes) {
      if (size > model.bytes) await fsp.rm(part, { force: true });
      throw new Error(size < model.bytes ? 'The download stopped early. Try again to resume it.' : 'The downloaded file is the wrong size.');
    }
    if (hash.digest('hex') !== model.sha256) {
      await fsp.rm(part, { force: true });
      throw new Error('The downloaded file failed its checksum and was deleted. Please try again.');
    }
    await fsp.rename(part, dest);
    return dest;
  };

  const promise = run();
  promise.catch(() => {}); // callers handle it; avoid unhandled-rejection noise on cancel
  return { promise, progress, cancel: () => controller.abort() };
}

module.exports = { downloadModel, partPath, finalPath };
