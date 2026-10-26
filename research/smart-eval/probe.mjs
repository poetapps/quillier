// Quick probe: load a model, show the exact prompt for one question, check tokenization, answer it.
// Run: node research/smart-eval/probe.mjs [model-file]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartEngine } from '../../electron/smart/engine.mjs';
import prompts from '../../electron/smart/prompts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || 'Qwen3.5-4B-Q4_K_M.gguf';
const modelPath = path.join(here, '../../models/smart', file);
const engine = new SmartEngine({ log: (m) => console.log(m) });
const item = { task: 'names', passage: 'May pushed the door open and stepped into the rain.', word: 'May',
  senses: ['May, a character in the story (a person)', 'the month of May', 'the ordinary word "may" (might, or is allowed to)'] };
const b = prompts.buildPrompt(item);
console.log('----- prompt -----');
console.log(JSON.stringify(prompts.piecesToString(b.pieces)));
let t = Date.now();
await engine.load(file, modelPath);
console.log('load ms', Date.now() - t);
const letters = Object.fromEntries(Object.entries(engine.letterTokens).slice(0, 11).map(([l, ids]) => [l, ids.map((id) => JSON.stringify(engine.model.detokenize([id])))]));
console.log('letter tokens', letters);
const toks = engine.tokenizePieces(b.pieces);
const full = engine.model.tokenize(prompts.piecesToString(b.pieces), true);
console.log('tokens', toks.length, 'same as full-string tokenization:', toks.length === full.length && toks.every((x, i) => x === full[i]));
console.log('bos?', engine.model.tokens.bos, 'first tokens', toks.slice(0, 5), JSON.stringify(engine.model.detokenize(toks.slice(0, 5), true)));
console.log('tail', JSON.stringify(engine.model.detokenize(toks.slice(-12), true)));
for (let k = 0; k < 3; k++) {
  t = Date.now();
  const r = await engine.ask(file, modelPath, [item, { ...item, passage: 'We married in May, just before the floods.' }, { ...item, passage: 'She may not come back tonight.', word: 'may' }], { debug: true });
  console.log(Date.now() - t, 'ms', JSON.stringify(r));
}
console.log(engine.info());
console.log('rss MB', Math.round(process.memoryUsage().rss / 1e6));
const vram = await engine.llama.getVramState();
console.log('vram used MB', Math.round(vram.used / 1e6), 'total', Math.round(vram.total / 1e6));
await engine.unload();
