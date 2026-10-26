// Summarise results-<model>.json: accuracy per task (same rules as research/julia-1/score.py),
// side by side with the Ollama runs from research/julia-1, plus latency and memory. Also writes
// src/lib/smartAccuracy.json for the app's settings screen.
//
//   node research/smart-eval/score.mjs            # print tables, write smartAccuracy.json
//   node research/smart-eval/score.mjs --no-write # print only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildRows, ollamaCorrectness, argmax } from './items.mjs';

const require = createRequire(import.meta.url);
const { MODELS } = require('../../electron/smart/catalog.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const pct = (n, d) => `${Math.round((100 * n) / d)}%`;

const GROUPS = [
  ['names', 'Names: is it the character?'],
  ['resolve', 'Who does the mention refer to? (codex with aliases)'],
  ['same', 'Same person?'],
  ['relation', 'Relationship type (11 options)'],
  ['relation_reversed', 'Same, options reversed'],
  ['direction', 'Who is the parent / boss?'],
  ['speaker', 'Who speaks this line?'],
  ['presence', 'Present vs only mentioned'],
];

const rows = buildRows();

// Probability the model gave the right answer (for a less noisy comparison than accuracy).
function goldProb(row, r) {
  const it = row.item;
  switch (row.group) {
    case 'names': return row.gold === 'entity' ? r.probs[0] : 1 - r.probs[0];
    case 'resolve': return r.probs[r.options.indexOf(row.gold)];
    case 'same': case 'presence': return row.gold ? r.p : 1 - r.p;
    case 'relation': case 'relation_reversed': return r.probs[r.keys.indexOf(row.gold)];
    default: return r.probs[it.names.indexOf(row.gold)];
  }
}

function summarize(res) {
  const out = {};
  for (const [g] of GROUPS) {
    const cs = res.perCase.map((c, i) => ({ c, row: rows[i] })).filter(({ c }) => c.group === g);
    out[g] = { n: cs.length, correct: cs.filter(({ c }) => c.correct).length,
      logLoss: cs.reduce((s, { c, row }) => s - Math.log(Math.max(1e-6, goldProb(row, c.result))), 0) / cs.length };
  }
  const all = res.perCase.map((c, i) => -Math.log(Math.max(1e-6, goldProb(rows[i], c.result))));
  out.all = { logLoss: all.reduce((a, b) => a + b, 0) / all.length };
  return out;
}

const ours = MODELS.map((m) => ({ m, res: load(path.join(here, `results-${m.id}.json`)) })).filter((x) => x.res);
const control = MODELS.map((m) => ({ m, res: load(path.join(here, `results-${m.id}-ollama-gguf.json`)) })).filter((x) => x.res);
const ollama = MODELS.map((m) => ({ m, res: load(path.join(here, `../julia-1/results-${m.id}-fewshot.json`)) })).filter((x) => x.res);

// ---------------------------------------------------------------- accuracy table
const cols = [];
for (const { m, res } of ours) cols.push({ head: `${m.label} ${m.quant} (app)`, kind: 'ours', m, s: summarize(res) });
for (const { m, res } of ollama) {
  const ok = ollamaCorrectness(res);
  const s = {};
  for (const [g] of GROUPS) s[g] = { n: ok[g].length, correct: ok[g].filter(Boolean).length };
  cols.push({ head: `${m.label} Ollama`, kind: 'ollama', m, s });
}
for (const { m, res } of control) cols.push({ head: `${m.label} Ollama GGUF, app runtime`, kind: 'control', m, s: summarize(res) });

const order = MODELS.flatMap((m) => cols.filter((c) => c.m.id === m.id));
console.log('### Accuracy\n');
console.log(`| Task | Cases | ${order.map((c) => c.head).join(' | ')} |`);
console.log(`|---|---:|${order.map(() => '---:').join('|')}|`);
for (const [g, label] of GROUPS) {
  const n = order[0].s[g].n;
  console.log(`| ${label} | ${n} | ${order.map((c) => pct(c.s[g].correct, c.s[g].n)).join(' | ')} |`);
}

// Flag drops of more than 5 points against the Ollama run of the same model.
console.log('\n### Drops of more than 5 points vs the Ollama run\n');
for (const m of MODELS) {
  const a = cols.find((c) => c.kind === 'ours' && c.m.id === m.id);
  const b = cols.find((c) => c.kind === 'ollama' && c.m.id === m.id);
  if (!a || !b) continue;
  for (const [g, label] of GROUPS) {
    const d = (100 * a.s[g].correct) / a.s[g].n - (100 * b.s[g].correct) / b.s[g].n;
    if (d < -5) console.log(`- ${m.label}: ${label}: ${pct(b.s[g].correct, b.s[g].n)} -> ${pct(a.s[g].correct, a.s[g].n)} (${a.s[g].correct - b.s[g].correct} cases)`);
  }
}

console.log('\n### Mean log-loss on the right answer (lower is better; all 191 questions)\n');
for (const c of order.filter((x) => x.kind !== 'ollama')) console.log(`- ${c.head}: ${c.s.all.logLoss.toFixed(3)}`);

// ---------------------------------------------------------------- latency / memory
console.log('\n### Latency and memory (this machine)\n');
console.log('| Model | File | Load (warm) | Median ms/question, batched by task | Mean, batched | Median, each prompt from scratch | Batched speed-up (wall) | Peak RSS |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const { m, res } of ours) {
  const L = res.latency;
  console.log(`| ${m.label} ${m.quant} | ${(m.bytes / 1e9).toFixed(2)} GB | ${(res.loadMs / 1000).toFixed(1)} s | ${L.batched.medianMs} | ${L.batched.meanMs.toFixed(0)} | ${L.unbatched.medianMs} | ${L.speedup.toFixed(1)}x | ${(res.memory.maxRssMB / 1000).toFixed(1)} GB |`);
}
for (const { m, res } of ours) {
  console.log(`- ${m.label}: first token is an option letter in ${res.firstToken.isLetter}/${res.firstToken.of}; probability on option letters median ${res.firstToken.medianLetterMass.toFixed(3)}, min ${res.firstToken.minLetterMass.toFixed(3)}; batched vs scratch max prob diff ${res.latency.maxProbDiffBatchedVsUnbatched}; tokenization mismatches ${res.tokenMismatch}`);
}

// ---------------------------------------------------------------- smartAccuracy.json
if (!process.argv.includes('--no-write') && ours.length === MODELS.length) {
  const APP_ROWS = [
    ['names', "Tells a character's name from an ordinary word (May, Will, Hope)"],
    ['presence', 'Tells whether a character is in the scene or only mentioned'],
    ['relation', 'Names the relationship between two characters (11 kinds)'],
    ['speaker', 'Says who speaks a line of dialogue'],
    ['resolve', 'Works out who a nickname, title or "he"/"she" refers to'],
    ['same', 'Tells whether two names belong to the same person'],
  ];
  const first = ours[0].res;
  const d = new Date(first.measuredAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sums = Object.fromEntries(ours.map(({ m, res }) => [m.id, summarize(res)]));
  const json = {
    measuredOn: date,
    machine: 'M1 Max',
    caseCount: APP_ROWS.reduce((s, [g]) => s + sums[ours[0].m.id][g].n, 0),
    note: 'Measured with the exact model files the app downloads, on short hand-written test passages (real manuscripts are longer and messier). Times are per question when questions are batched by task, on an M1 Max; expect slower on older or smaller machines.',
    models: ours.map(({ m, res }) => ({ id: m.id, label: m.label, quant: m.quant, sizeGB: Math.round(m.bytes / 1e7) / 100, msPerQuestion: Math.round(res.latency.batched.medianMs) })),
    rows: APP_ROWS.map(([g, label]) => ({
      task: g,
      label,
      cases: sums[ours[0].m.id][g].n,
      results: Object.fromEntries(ours.map(({ m }) => [m.id, Math.round((100 * sums[m.id][g].correct) / sums[m.id][g].n) / 100])),
    })),
  };
  const out = path.join(here, '../../src/lib/smartAccuracy.json');
  fs.writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(process.cwd(), out)}`);
}
void argmax;
