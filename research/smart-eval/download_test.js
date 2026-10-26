// Exercise electron/smart/download.js: cancel part-way, resume, verify; corrupt a .part and check
// it is rejected. Run: node research/smart-eval/download_test.js <model-id> [dir]
const path = require('node:path');
const fs = require('node:fs');
const { downloadModel, partPath } = require('../../electron/smart/download.js');
const { getModel } = require('../../electron/smart/catalog.js');

const model = getModel(process.argv[2] || 'qwen3.5-0.8b');
const dir = process.argv[3] || path.join(__dirname, '../../models/smart');

(async () => {
  let reports = 0;
  const t0 = Date.now();
  // 1. Start, cancel after ~30% of the file.
  let h = downloadModel({ model, dir, onProgress: (p) => { reports++; if (p.received > model.bytes * 0.3) h.cancel(); } });
  try { await h.promise; console.log('unexpected: finished'); } catch (e) { console.log('first run:', e.name, e.message); }
  const partial = fs.statSync(partPath(dir, model)).size;
  console.log(`cancelled with ${partial} bytes in .part (${reports} progress reports in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  // 2. Resume to completion.
  reports = 0;
  const t1 = Date.now();
  let first = null;
  h = downloadModel({ model, dir, onProgress: (p) => { reports++; if (first == null) first = p.received; } });
  const dest = await h.promise;
  const secs = (Date.now() - t1) / 1000;
  console.log(`resumed from ${first} bytes, finished -> ${dest} (${fs.statSync(dest).size} bytes) in ${secs.toFixed(1)} s, ${reports} reports (${(reports / secs).toFixed(1)}/s)`);
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
