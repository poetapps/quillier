// Run every research test case through the app's own prompt builders and inference engine
// (electron/smart/prompts.js + engine.mjs, the code the utilityProcess worker runs).
//
//   node research/smart-eval/run_eval.mjs            # all three models, one child process each
//   node research/smart-eval/run_eval.mjs qwen3.5-2b # one model
//   SMART_MODELS_DIR=… SMART_RESULTS_TAG=… to run other GGUF files under the catalog names.
//
// Writes results-<model>.json next to this file. Each model runs in its own process so peak memory
// (maxRSS) is per model. Questions are sent one task at a time, as the app is meant to batch them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildRows, C } from './items.mjs';

const require = createRequire(import.meta.url);
const prompts = require('../../electron/smart/prompts.js');
const { MODELS } = require('../../electron/smart/catalog.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = process.env.SMART_MODELS_DIR || path.join(here, '../../models/smart');

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// 1. Every prompt must be byte-identical to one the research harness sent to Ollama.
function checkPrompts(rows) {
  const refFile = path.join(here, 'reference_prompts.json');
  if (!fs.existsSync(refFile)) { console.log('(reference_prompts.json missing: run dump_reference_prompts.py to check prompts)'); return null; }
  const ref = new Set(JSON.parse(fs.readFileSync(refFile, 'utf8')).map((m) => JSON.stringify(m)));
  const castText = prompts.renderCast(C.CAST_STRUCTURED);
  if (castText !== C.CODEX_ALIASES) throw new Error('rendered cast differs from CODEX_ALIASES');
  let missing = 0;
  for (const row of rows) {
    const msgs = prompts.buildPrompt(row.item).messages;
    if (!ref.has(JSON.stringify(msgs))) {
      missing++;
      if (missing <= 3) console.log('NOT IN REFERENCE:', row.group, JSON.stringify(msgs[msgs.length - 1]).slice(0, 300));
    }
  }
  console.log(`prompt check: ${rows.length - missing}/${rows.length} prompts identical to the research harness`);
  if (missing) throw new Error('prompt mismatch');
  return rows.length;
}

async function runModel(model) {
  const { SmartEngine } = await import('../../electron/smart/engine.mjs');
  const rows = buildRows();
  const modelPath = path.join(modelsDir, model.file);
  const engine = new SmartEngine({});
  let t = performance.now();
  await engine.load(model.id, modelPath);
  const loadMs = performance.now() - t;
  const rssAfterLoad = process.memoryUsage().rss;

  // Check the tokens we evaluate (cached prefix + tail) equal one full-string tokenization of the
  // prompt, and count how often the extended (cast-list) prefix could be used.
  let tokenMismatch = 0;
  let extendedPrefix = 0;
  for (const row of rows) {
    const b = prompts.buildPrompt(row.item);
    const { key, prefix, suffix } = engine._split(b);
    const a = [...prefix, ...suffix];
    const f = engine.model.tokenize(prompts.piecesToString(b.pieces), true);
    if (a.length !== f.length || a.some((x, i) => x !== f[i])) tokenMismatch++;
    if (key !== b.basePrefixKey) extendedPrefix++;
  }

  // Warm up Metal (first evaluation compiles kernels), then forget the prefix.
  await engine.ask(model.id, modelPath, [rows[0].item]);
  await engine.ask(model.id, modelPath, [{ task: 'direction', passage: 'x', question: 'y', names: ['a', 'b'] }]);

  const groups = [...new Set(rows.map((r) => r.group))];
  const run = async (reusePrefix) => {
    const out = new Array(rows.length);
    const groupMs = {};
    for (const g of groups) {
      const idx = rows.map((r, i) => (r.group === g ? i : -1)).filter((i) => i >= 0);
      const t0 = performance.now();
      const res = await engine.ask(model.id, modelPath, idx.map((i) => rows[i].item), { reusePrefix, debug: true });
      groupMs[g] = performance.now() - t0;
      idx.forEach((i, k) => { out[i] = res[k]; });
    }
    return { out, groupMs };
  };

  t = performance.now();
  const batched = await run(true);
  const batchedWall = performance.now() - t;
  t = performance.now();
  const single = await run(false);
  const singleWall = performance.now() - t;

  let maxDiff = 0;
  let pickChanges = 0;
  batched.out.forEach((r, i) => {
    const a = r.probs || [1 - r.p, r.p];
    const b = single.out[i].probs || [1 - single.out[i].p, single.out[i].p];
    a.forEach((x, k) => { maxDiff = Math.max(maxDiff, Math.abs(x - b[k])); });
    if (rows[i].score(r) !== rows[i].score(single.out[i])) pickChanges++;
  });

  const perCase = rows.map((row, i) => {
    const r = batched.out[i];
    if (r.error) throw new Error(`${row.group} #${i}: ${r.error}`);
    return { group: row.group, gold: row.gold, correct: row.score(r), result: r };
  });
  const byGroup = {};
  for (const g of groups) {
    const cs = perCase.filter((c) => c.group === g);
    byGroup[g] = { n: cs.length, correct: cs.filter((c) => c.correct).length };
  }
  const ms = batched.out.map((r) => r.ms);
  const msSingle = single.out.map((r) => r.ms);
  const firstTokenIsLetter = perCase.filter((c) => /^[A-Z]$/.test((c.result.debug?.top || '').trim())).length;
  const letterMass = perCase.map((c) => c.result.debug?.letterMass ?? 0);

  return {
    measuredAt: new Date().toISOString(),
    machine: `${os.cpus()[0]?.model || process.arch}, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
    model: { id: model.id, label: model.label, quant: model.quant, file: model.file, bytes: model.bytes },
    engine: engine.info(),
    caseCount: rows.length,
    tokenMismatch,
    extendedPrefix,
    loadMs: Math.round(loadMs),
    memory: {
      rssAfterLoadMB: Math.round(rssAfterLoad / 1e6),
      maxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
      checkpointMB: Math.round(engine.sequence.checkpointsMemoryUsage / 1e6),
      vramUsedMB: Math.round((await engine.llama.getVramState()).used / 1e6),
    },
    latency: {
      batched: { medianMs: median(ms), p90Ms: pct(ms, 0.9), meanMs: batchedWall / rows.length, wallMs: Math.round(batchedWall), groupMs: batched.groupMs },
      unbatched: { medianMs: median(msSingle), p90Ms: pct(msSingle, 0.9), meanMs: singleWall / rows.length, wallMs: Math.round(singleWall), groupMs: single.groupMs },
      speedup: singleWall / batchedWall,
      maxProbDiffBatchedVsUnbatched: maxDiff,
      verdictChangesBatchedVsUnbatched: pickChanges,
    },
    firstToken: { isLetter: firstTokenIsLetter, of: rows.length, minLetterMass: Math.min(...letterMass), medianLetterMass: median(letterMass) },
    byGroup,
    perCase,
  };
}

if (process.argv[2] === '--child') {
  const model = MODELS.find((m) => m.id === process.argv[3]);
  runModel(model).then((r) => {
    const tag = process.env.SMART_RESULTS_TAG ? `-${process.env.SMART_RESULTS_TAG}` : '';
    fs.writeFileSync(path.join(here, `results-${model.id}${tag}.json`), JSON.stringify(r, null, 1));
    const g = Object.entries(r.byGroup).map(([k, v]) => `${k} ${v.correct}/${v.n}`).join(', ');
    console.log(`${model.id}: ${g}`);
    console.log(`  load ${r.loadMs} ms, maxRSS ${r.memory.maxRssMB} MB, median ${r.latency.batched.medianMs} ms batched / ${r.latency.unbatched.medianMs} ms unbatched (x${r.latency.speedup.toFixed(2)} wall), first token is a letter ${r.firstToken.isLetter}/${r.firstToken.of}, token mismatches ${r.tokenMismatch}`);
    process.exit(0);
  }).catch((e) => { console.error(e); process.exit(1); });
} else {
  checkPrompts(buildRows());
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : MODELS.map((m) => m.id);
  for (const id of ids) {
    await new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ['--child', id], { stdio: 'inherit' });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${id} exited ${code}`))));
    });
  }
}
