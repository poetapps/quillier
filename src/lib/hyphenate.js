// Where words can be hyphenated, from the TeX hyphenation patterns (Liang's algorithm) for the
// book's language. Loaded on demand: each language's patterns are their own chunk.

import createHyphenator from 'hyphen/hyphen.js';

const PATTERNS = {
  af: () => import('hyphen/patterns/af.js'),
  bg: () => import('hyphen/patterns/bg.js'),
  ca: () => import('hyphen/patterns/ca.js'),
  cs: () => import('hyphen/patterns/cs.js'),
  cy: () => import('hyphen/patterns/cy.js'),
  da: () => import('hyphen/patterns/da.js'),
  de: () => import('hyphen/patterns/de-1996.js'),
  el: () => import('hyphen/patterns/el-monoton.js'),
  en: () => import('hyphen/patterns/en-us.js'),
  'en-gb': () => import('hyphen/patterns/en-gb.js'),
  es: () => import('hyphen/patterns/es.js'),
  et: () => import('hyphen/patterns/et.js'),
  eu: () => import('hyphen/patterns/eu.js'),
  fi: () => import('hyphen/patterns/fi.js'),
  fr: () => import('hyphen/patterns/fr.js'),
  ga: () => import('hyphen/patterns/ga.js'),
  gl: () => import('hyphen/patterns/gl.js'),
  hr: () => import('hyphen/patterns/hr.js'),
  hu: () => import('hyphen/patterns/hu.js'),
  id: () => import('hyphen/patterns/id.js'),
  is: () => import('hyphen/patterns/is.js'),
  it: () => import('hyphen/patterns/it.js'),
  la: () => import('hyphen/patterns/la.js'),
  lt: () => import('hyphen/patterns/lt.js'),
  lv: () => import('hyphen/patterns/lv.js'),
  nb: () => import('hyphen/patterns/nb.js'),
  nl: () => import('hyphen/patterns/nl.js'),
  nn: () => import('hyphen/patterns/nn.js'),
  pl: () => import('hyphen/patterns/pl.js'),
  pt: () => import('hyphen/patterns/pt.js'),
  ro: () => import('hyphen/patterns/ro.js'),
  ru: () => import('hyphen/patterns/ru.js'),
  sk: () => import('hyphen/patterns/sk.js'),
  sl: () => import('hyphen/patterns/sl.js'),
  sr: () => import('hyphen/patterns/sr-cyrl.js'),
  sv: () => import('hyphen/patterns/sv.js'),
  tr: () => import('hyphen/patterns/tr.js'),
  uk: () => import('hyphen/patterns/uk.js'),
};
const ALIASES = { no: 'nb', 'en-au': 'en-gb', 'en-nz': 'en-gb', 'en-ie': 'en-gb', 'en-za': 'en-gb', 'en-in': 'en-gb' };

// The patterns' key for a language tag like "en-GB" or "pt_BR", or null if there are none.
export function patternsFor(lang) {
  const tag = String(lang || '').toLowerCase().replace(/_/g, '-');
  const [primary, region] = tag.split('-');
  const full = region ? `${primary}-${region}` : primary;
  for (const k of [full, ALIASES[full], ALIASES[primary], primary]) if (k && PATTERNS[k]) return k;
  return null;
}

const MARK = '\u00AD';

// A function from a word to the offsets it can be hyphenated after, leaving at least `left`
// letters before a hyphen and `right` after, in words of `min` letters or more. Words that start
// with a capital (names, mostly) and words with digits aren't hyphenated. Null if `lang` has no
// patterns.
export async function hyphenator(lang, { min = 6, left = 3, right = 3 } = {}) {
  const key = patternsFor(lang);
  if (!key) return null;
  const mod = await PATTERNS[key]();
  const hyphenate = createHyphenator(mod.default || mod, { hyphenChar: MARK, minWordLength: min });
  const cache = new Map();
  return (word) => {
    if (word.length < min || /^\p{Lu}|\d/u.test(word)) return [];
    let points = cache.get(word);
    if (points) return points;
    points = [];
    const lower = word.toLowerCase();
    if (lower.length !== word.length) return points;
    let at = 0;
    for (const ch of hyphenate(lower)) {
      if (ch === MARK) points.push(at);
      else at += ch.length;
    }
    points = points.filter((p) => p >= left && word.length - p >= right);
    cache.set(word, points);
    return points;
  };
}
