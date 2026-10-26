// The research test cases (cases.json, exported from research/julia-1/cases.py) as smart-feature
// API items, each with its gold answer and the same correctness rule research/julia-1/score.py uses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const C = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));

// First index of the largest value (Python's max(range(n), key=probs.__getitem__)).
export const argmax = (xs) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);

// group: the row in the results table. score(result) -> boolean.
export function buildRows() {
  const rows = [];
  const add = (group, item, gold, score) => rows.push({ group, item, gold, score });

  for (const [entity, target, , passage, gold] of C.DISAMBIG) {
    const senses = C.ENTITIES[entity].senses;
    const keys = Object.keys(senses);
    add('names', { task: 'names', passage, word: target, senses: Object.values(senses) }, gold,
      (r) => (keys[argmax(r.probs)] === 'entity') === (gold === 'entity'));
  }
  for (const [mention, passage, gold] of C.ALIAS_RESOLVE) {
    const goldId = gold === C.OTHER ? 'other' : gold;
    add('resolve', { task: 'resolve', cast: C.CAST_STRUCTURED, passage, mention }, goldId,
      (r) => r.options[argmax(r.probs)] === goldId);
  }
  for (const [alias, person, passage, gold] of C.ALIAS_SAME) {
    add('same', { task: 'same', passage, alias, person }, gold, (r) => (r.p >= 0.5) === gold);
  }
  for (const [a, b, passage, gold] of C.RELATIONSHIPS) {
    add('relation', { task: 'relation', a, b, passage }, gold, (r) => r.keys[argmax(r.probs)] === gold);
  }
  const reversed = Object.keys(C.RELATIONS).reverse();
  for (const [a, b, passage, gold] of C.RELATIONSHIPS) {
    add('relation_reversed', { task: 'relation', a, b, passage, order: reversed }, gold, (r) => r.keys[argmax(r.probs)] === gold);
  }
  for (const [question, names, passage, gold] of C.DIRECTION) {
    add('direction', { task: 'direction', passage, question, names }, gold, (r) => names[argmax(r.probs)] === gold);
  }
  for (const [passage, line, names, gold] of C.SPEAKERS) {
    add('speaker', { task: 'speaker', passage, line, names }, gold, (r) => names[argmax(r.probs)] === gold);
  }
  for (const [person, passage, gold] of C.PRESENCE) {
    add('presence', { task: 'presence', passage, person }, gold, (r) => (r.p >= 0.5) === gold);
  }
  return rows;
}

// Same rows, read from a research/julia-1 results-*.json (the Ollama runs), for comparison.
export function ollamaCorrectness(results) {
  const R = results;
  const ent = (p) => p === 'entity';
  return {
    names: R.disambiguation.map((x) => ent(x.plain.pick) === (x.gold === 'entity')),
    resolve: R.alias_resolve.map((x) => x.codex_aliases.pick === x.gold),
    same: R.alias_same.map((x) => (x.p >= 0.5) === x.gold),
    relation: R.relationships.map((x) => x.pick === x.gold),
    relation_reversed: R.relationships.map((x) => x.reversed.pick === x.gold),
    direction: R.direction.map((x) => x.pick === x.gold),
    speaker: R.speakers.map((x) => x.pick === x.gold),
    presence: R.presence.map((x) => (x.p >= 0.5) === x.gold),
  };
}
