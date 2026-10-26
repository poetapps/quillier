// Case-by-case comparison of a results-<model>.json with the matching research Ollama run.
//   node compare_cases.mjs qwen3.5-4b [results-file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ollamaCorrectness } from './items.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
const ours = JSON.parse(fs.readFileSync(process.argv[3] || path.join(here, `results-${id}.json`), 'utf8'));
const ref = JSON.parse(fs.readFileSync(path.join(here, `../julia-1/results-${id.replace('qwen3.5-', 'qwen3.5-')}-fewshot.json`), 'utf8'));
const ok = ollamaCorrectness(ref);
const refRows = { names: ref.disambiguation, resolve: ref.alias_resolve, same: ref.alias_same, relation: ref.relationships, relation_reversed: ref.relationships, direction: ref.direction, speaker: ref.speakers, presence: ref.presence };
for (const g of Object.keys(ok)) {
  const cs = ours.perCase.filter((c) => c.group === g);
  cs.forEach((c, i) => {
    if (c.correct === ok[g][i]) return;
    const r = c.result;
    const x = refRows[g][i];
    const refInfo = g === 'same' || g === 'presence' ? `p=${x.p.toFixed(3)}` : g === 'names' ? `pick=${x.plain.pick} ${x.plain.conf.toFixed(3)}` : g === 'resolve' ? `pick=${x.codex_aliases.pick} ${x.codex_aliases.conf.toFixed(3)}` : g === 'relation_reversed' ? `pick=${x.reversed.pick} ${x.reversed.conf.toFixed(3)}` : `pick=${x.pick} ${x.conf.toFixed(3)}`;
    const oursInfo = r.p != null ? `p=${r.p.toFixed(3)}` : `probs=${JSON.stringify(r.probs.map((p) => +p.toFixed(3)))}`;
    console.log(`${g} #${i} ${c.correct ? 'WE GOT RIGHT' : 'WE MISSED   '} gold=${JSON.stringify(c.gold)} ours ${oursInfo} | ollama ${refInfo} | ${(x.passage || x.line || x.question || '').slice(0, 90)}`);
  });
}
