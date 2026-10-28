// Can Whisper put dialogue in quotation marks by itself, if its prompt shows it how?
//
// Speaks every case in cases.json with macOS `say` (three voices), transcribes each clip with
// each prompt below, and scores the result against the case's ideal text. The question that
// matters most: does the dialogue prompt ever change the *words* Whisper hears?
//
//   DICTATION_MODELS_DIR=/path/to/ggml/models node research/dictation-eval/run.mjs [whisper-turbo|whisper-small-en ...]
//
// Writes results-<model>.json next to this file and prints a summary.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initWhisper } from '@fugood/whisper.node';
import { cleanTranscript } from '../../electron/dictation/engine.mjs';
import { DIALOGUE_EXAMPLE } from '../../src/lib/dictationText.js';

const require = (await import('node:module')).createRequire(import.meta.url);
const { MODELS } = require('../../electron/dictation/catalog.js');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const AUDIO = path.join(os.tmpdir(), 'quillier-dictation-eval');
const MODELS_DIR = process.env.DICTATION_MODELS_DIR || path.join(os.homedir(), 'Library/Application Support/Quillier/models');
const CASES = JSON.parse(fs.readFileSync(path.join(HERE, 'cases.json'), 'utf8'));
const VOICES = ['', 'Daniel', 'Flo (English (US))']; // '' = the system voice
const NAMES = 'Aelwyn, Brannoc, Mara.';

export const PROMPTS = {
  plain: NAMES,
  dialogue: `${NAMES} "I'm tired," Sam said. "Me too," she replied. He said, "Let's rest."`,
  // No names in the example: they can leak into what Whisper hears ("Tom said" → "Sam said").
  pronouns: `${NAMES} ${DIALOGUE_EXAMPLE}`, // what the app sends
};

const DIALOGUE_KINDS = new Set(['tag after', 'tag before', 'interrupted', 'several sentences', 'question', 'exclamation', 'mixed']);
const PLAIN_KINDS = new Set(['narration', 'reported speech', 'first person']);

// ---------- scoring ----------

const norm = (s) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
export const words = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/(^|\s)'|'(?=\s|$)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
// The words inside each pair of quotation marks, in order: what the text says is spoken aloud.
const spans = (s) => [...norm(s).matchAll(/"([^"]*)"/g)].map((m) => words(m[1])).join(' | ');
const hasQuotes = (s) => /"/.test(norm(s));

// ---------- audio ----------

function clip(text, voice) {
  fs.mkdirSync(AUDIO, { recursive: true });
  const key = Buffer.from(`${voice}:${text}`).toString('base64url').slice(0, 80);
  const wav = path.join(AUDIO, `${key}.wav`);
  if (!fs.existsSync(wav)) execFileSync('say', [...(voice ? ['-v', voice] : []), '-o', wav, '--data-format=LEI16@16000', text]);
  const buf = fs.readFileSync(wav);
  const at = buf.indexOf('data') + 8;
  return buf.buffer.slice(buf.byteOffset + at, buf.byteOffset + buf.length);
}

// ---------- run ----------

async function runModel(model) {
  const ctx = await initWhisper({ filePath: path.join(MODELS_DIR, model.file), useGpu: true, useFlashAttn: true });
  const rows = [];
  const t0 = Date.now();
  for (const c of CASES) {
    for (const voice of VOICES) {
      const pcm = clip(c.said, voice);
      const out = {};
      for (const [name, prompt] of Object.entries(PROMPTS)) {
        const r = await ctx.transcribeData(pcm, { language: 'en', temperature: 0, prompt }).promise;
        out[name] = cleanTranscript(r.result);
      }
      rows.push({ kind: c.kind, said: c.said, want: c.want, voice: voice || 'system', out });
    }
    process.stdout.write('.');
  }
  await ctx.release();
  console.log(` ${model.id}: ${rows.length} clips × ${Object.keys(PROMPTS).length} prompts in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return rows;
}

function summarize(model, rows) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  console.log(`\n${model.label} (${model.id})`);
  console.log('prompt      exact  dialogue: right  misheard  left plain  misquoted   no dialogue: quoted   words ≠ plain  words ≠ script');
  for (const name of Object.keys(PROMPTS)) {
    const dlg = rows.filter((r) => DIALOGUE_KINDS.has(r.kind));
    const none = rows.filter((r) => PLAIN_KINDS.has(r.kind));
    const exact = rows.filter((r) => !r.kind.includes('ambiguous') && norm(r.out[name]) === norm(r.want)).length;
    const scored = rows.filter((r) => !r.kind.includes('ambiguous')).length;
    // Each dialogue clip is one of: quoted right; misheard (wrong words, so the quotes can't be
    // judged); left plain (no quotes: safe, just not helpful); or misquoted (right words, quotes
    // in the wrong place: the failure that matters).
    const misheard = dlg.filter((r) => hasQuotes(r.out[name]) && words(r.out[name]) !== words(r.want)).length;
    const plain = dlg.filter((r) => !hasQuotes(r.out[name])).length;
    const right = dlg.filter((r) => hasQuotes(r.out[name]) && words(r.out[name]) === words(r.want) && spans(r.out[name]) === spans(r.want)).length;
    const wrong = dlg.length - right - misheard - plain;
    const fp = none.filter((r) => hasQuotes(r.out[name])).length;
    const vsPlain = rows.filter((r) => words(r.out[name]) !== words(r.out.plain)).length;
    const vsScript = rows.filter((r) => words(r.out[name]) !== words(r.said)).length;
    const cell = (n, w) => String(n).padStart(w);
    console.log(
      `${name.padEnd(10)} ${pct(exact, scored).padStart(6)}  ${`${right}/${dlg.length}`.padStart(15)}  ${cell(misheard, 8)}  ${cell(plain, 10)}  ${cell(wrong, 9)}  ${`${fp}/${none.length}`.padStart(19)}  ${`${vsPlain}/${rows.length}`.padStart(13)}  ${`${vsScript}/${rows.length}`.padStart(14)}`,
    );
  }
}

const wanted = process.argv.slice(2);
for (const model of MODELS.filter((m) => !wanted.length || wanted.includes(m.id))) {
  const rows = await runModel(model);
  fs.writeFileSync(path.join(HERE, `results-${model.id}.json`), JSON.stringify(rows, null, 2) + '\n');
  summarize(model, rows);
}
