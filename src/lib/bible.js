// Reads the manuscript against the story bible: who and what shows up where.
//
// Nothing is ever written into the text. Mentions are found by name and alias (whole words,
// case-sensitive), so exports stay clean and pasted or imported chapters are counted too.

import { activeDraft, countWords, excerpt } from './project.js';
import { bookLabels } from './series.js';

export const MONTHS = new Set(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
const SUBJECTS = new Set(['i', 'we', 'you', 'he', 'she', 'they', 'it', 'the', 'this', 'that', 'there']);
const TIME_PREP = new Set(['in', 'of', 'early', 'late', 'mid', 'since', 'until', 'till', 'by', 'last', 'next', 'this', 'every', 'through', 'during', 'throughout']);
const SPEECH = new Set(['said', 'asked', 'replied', 'whispered', 'called', 'shouted', 'told', 'muttered', 'cried', 'snapped', 'says', 'asks']);
const MODALS = new Set(['May', 'Will', 'Can', 'Shall', 'Might', 'Must']);

const HR_LINE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---------- the bible as seen from the open book ----------

// Every entry and relationship the open book can see, tagged with where it's stored:
// store 'series' (the series file), 'book' (this book's file) or 'sibling' (another book's file, read-only).
export function buildContext(project, series) {
  const uuid = project.meta.uuid;
  const current = {
    uuid,
    title: project.title,
    current: true,
    missing: false,
    chapters: activeDraft(project).chapters,
    bible: project.bible,
    label: 'This book',
    short: '',
  };
  const inSeries = !!series?.data?.books.some((b) => b.uuid === uuid);
  if (!inSeries) {
    const entries = project.bible.entries.map((e) => ({ ...e, owner: uuid, store: 'book' }));
    return finish({ inSeries: false, uuid, seriesTitle: null, books: [current], entries, rels: tagRels(project.bible.relationships, 'book', uuid) });
  }
  const labels = bookLabels(series.data.books);
  const books = series.data.books.map((b) => {
    if (b.uuid === uuid) return { ...current, kind: b.kind, label: labels[b.uuid].long, short: labels[b.uuid].short };
    const sib = series.siblings?.[b.uuid];
    return {
      uuid: b.uuid,
      title: sib?.title || b.title,
      current: false,
      missing: !sib || sib.missing,
      path: sib?.path,
      chapters: sib?.chapters || [],
      bible: sib?.bible || { entries: [], relationships: [], decisions: {}, scenes: {} },
      kind: b.kind,
      label: labels[b.uuid].long,
      short: labels[b.uuid].short,
    };
  });
  const entries = series.data.bible.entries.map((e) => ({ ...e, owner: 'series', store: 'series' }));
  let rels = tagRels(series.data.bible.relationships, 'series', 'series');
  for (const b of books) {
    const store = b.current ? 'book' : 'sibling';
    for (const e of b.bible.entries) entries.push({ ...e, owner: b.uuid, store });
    rels = rels.concat(tagRels(b.bible.relationships, store, b.uuid));
  }
  return finish({ inSeries: true, uuid, seriesTitle: series.data.title, seriesPath: series.path, books, entries, rels });
}

const tagRels = (rels, store, owner) => rels.map((r) => ({ ...r, store, owner }));

function finish(ctx) {
  ctx.byId = Object.fromEntries(ctx.entries.map((e) => [e.id, e]));
  ctx.rels = ctx.rels.filter((r) => ctx.byId[r.a] && ctx.byId[r.b]);
  ctx.bookById = Object.fromEntries(ctx.books.map((b) => [b.uuid, b]));
  ctx.currentBook = ctx.books.find((b) => b.current);
  return ctx;
}

// Entries a book's text is matched against: the series' shared ones plus its own.
export const entriesForBook = (ctx, bookUuid) => ctx.entries.filter((e) => e.owner === 'series' || e.owner === bookUuid);

// ---------- matching ----------

const matcherCache = new Map();

export function matcherFor(entries) {
  const pairs = [];
  for (const e of entries) {
    for (const raw of [e.name, ...(e.aliases || [])]) {
      const t = (raw || '').trim();
      if (t.length < 2) continue;
      pairs.push([t, e.id]);
      // "the bell-girl" can start a sentence too.
      if (/^\p{Ll}/u.test(t)) pairs.push([t[0].toUpperCase() + t.slice(1), e.id]);
    }
  }
  const key = pairs.map(([t, id]) => `${t}\u0001${id}`).sort().join('\u0002');
  const hit = matcherCache.get(key);
  if (hit) return hit;
  const map = new Map();
  const shared = new Map(); // a name listed by more than one entry
  for (const [t, id] of pairs) {
    if (!map.has(t)) map.set(t, id);
    else if (map.get(t) !== id) shared.set(t, [...new Set([...(shared.get(t) || [map.get(t)]), id])]);
  }
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  const single = names.filter((n) => /^\p{Lu}[\p{L}'’-]*$/u.test(n));
  const m = { key, re, map, shared, single };
  if (matcherCache.size > 50) matcherCache.clear();
  matcherCache.set(key, m);
  return m;
}

// ---------- which names are also ordinary words ----------

const lowerCache = new Map();
function lowerWords(content) {
  const hit = lowerCache.get(content);
  if (hit) return hit;
  const set = new Set(content.match(/(?<![\p{L}])\p{Ll}[\p{Ll}'’]*/gu) || []);
  if (lowerCache.size > 600) lowerCache.clear();
  lowerCache.set(content, set);
  return set;
}

// A single-word name is ambiguous in a book if it's a month, or if the book also uses it as an ordinary
// lowercase word ("will", "may", "hope").
function ambiguousNames(matcher, chapters) {
  const sets = chapters.map((c) => lowerWords(c.content || ''));
  return new Set(matcher.single.filter((n) => MONTHS.has(n) || sets.some((s) => s.has(n.toLowerCase()))));
}

function atSentenceStart(text, i) {
  let j = i - 1;
  while (j >= 0 && /[\s"“‘'(\[*_—–-]/.test(text[j]) && text[j] !== '\n') j--;
  return j < 0 || text[j] === '\n' || /[.!?…:]/.test(text[j]);
}

// Same idea as the plain rules that were measured alongside the models: true = probably the character.
function ruleVerdict(word, text, i) {
  const before = text.slice(Math.max(0, i - 80), i);
  const after = text.slice(i + word.length, i + word.length + 40);
  const prev = (before.match(/[A-Za-z']+/g) || ['']).pop().toLowerCase();
  const next = (after.match(/[A-Za-z']+|\d+/) || [''])[0];
  const start = atSentenceStart(text, i);
  if (/^\d/.test(next)) return false;
  if (MONTHS.has(word) && TIME_PREP.has(prev)) return false;
  if (/^['’]s\b/.test(after)) return true;
  if (SPEECH.has(prev) || SPEECH.has(next.toLowerCase())) return true;
  if (/^\s*[?!,]/.test(after) && !start) return true;
  if (start && MODALS.has(word) && SUBJECTS.has(next.toLowerCase())) return false;
  return true;
}

// The sentence around a position, with a neighbour on each side, inside its paragraph.
export function passageAround(text, start, end = start, max = 520) {
  let a = text.lastIndexOf('\n', start - 1) + 1;
  let b = text.indexOf('\n', end);
  if (b < 0) b = text.length;
  const para = text.slice(a, b);
  const sentences = para.match(/[^.!?…]+(?:[.!?…]+["”’)]*|$)\s*/g) || [para];
  let pos = a;
  let idx = 0;
  const spans = sentences.map((s) => {
    const span = [pos, pos + s.length];
    pos += s.length;
    return span;
  });
  idx = Math.max(0, spans.findIndex(([x, y]) => start >= x && start < y));
  let from = spans[Math.max(0, idx - 1)][0];
  let to = spans[Math.min(spans.length - 1, idx + 1)][1];
  if (to - from > max) {
    from = Math.max(spans[idx][0], start - max / 2);
    to = Math.min(spans[idx][1], start + max / 2);
  }
  const sentence = text.slice(spans[idx][0], spans[idx][1]).trim();
  return { passage: cleanMd(text.slice(from, to)).trim(), sentence: cleanMd(sentence) };
}

export const cleanMd = (s) => s.replace(/[*_`#>]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[ \t]+/g, ' ');

// ---------- scanning one chapter ----------

const scanCache = new Map();

export function splitScenesWithOffsets(content) {
  const scenes = [];
  let cur = { start: 0, lines: [] };
  let offset = 0;
  for (const line of content.split('\n')) {
    if (HR_LINE.test(line)) {
      scenes.push(cur);
      cur = { start: offset + line.length + 1, lines: [] };
    } else cur.lines.push(line);
    offset += line.length + 1;
  }
  scenes.push(cur);
  return scenes
    .map((s) => ({ start: s.start, end: s.start + s.lines.join('\n').length, text: s.lines.join('\n') }))
    .filter((s) => s.text.trim());
}

function scanChapter(cacheKey, content, matcher, ambiguous, ambKey) {
  const hit = scanCache.get(cacheKey);
  if (hit && hit.content === content && hit.mkey === matcher.key && hit.ambKey === ambKey) return hit.result;
  const scenes = splitScenesWithOffsets(content).map((s, index) => ({
    index,
    start: s.start,
    end: s.end,
    opens: excerpt(s.text, 10).replace(/[.,;:!?]+…$/, '…'),
    words: countWords(s.text),
    counts: {},
  }));
  const counts = {};
  const amb = [];
  if (matcher.re && content) {
    matcher.re.lastIndex = 0;
    let m;
    const seenInSentence = new Map();
    while ((m = matcher.re.exec(content))) {
      const word = m[0];
      const id = matcher.map.get(word);
      const scene = scenes.findIndex((s) => m.index >= s.start && m.index <= s.end);
      counts[id] = (counts[id] || 0) + 1;
      if (scene >= 0) scenes[scene].counts[id] = (scenes[scene].counts[id] || 0) + 1;
      if (ambiguous.has(word) && (MONTHS.has(word) || atSentenceStart(content, m.index))) {
        const { passage, sentence } = passageAround(content, m.index, m.index + word.length);
        const base = `${id}|${hash(sentence)}`;
        const k = seenInSentence.get(base) || 0;
        seenInSentence.set(base, k + 1);
        amb.push({ key: `${base}|${k}`, entryId: id, word, scene, passage, sentence, rule: ruleVerdict(word, content, m.index) });
      }
    }
  }
  const result = { counts, scenes, ambiguous: amb };
  if (scanCache.size > 2000) scanCache.clear();
  scanCache.set(cacheKey, { content, mkey: matcher.key, ambKey, result });
  return result;
}

// ---------- the whole series (or book) ----------

// verdicts: { [ambiguousKey]: probability it's the character } from smart features, if on.
// Writer decisions (book.bible.decisions) beat smart verdicts, which beat the plain rules.
export function analyze(ctx, verdicts = {}) {
  const books = {};
  const totals = {};
  const ambiguous = [];
  for (const book of ctx.books) {
    const matcher = matcherFor(entriesForBook(ctx, book.uuid));
    const ambNames = ambiguousNames(matcher, book.chapters);
    const ambKey = [...ambNames].sort().join('|');
    const decisions = book.bible?.decisions || {};
    const chapters = book.chapters.map((ch, chIndex) => {
      const scan = scanChapter(`${book.uuid}:${ch.id}`, ch.content || '', matcher, ambNames, ambKey);
      let counts = scan.counts;
      let scenes = scan.scenes;
      for (const h of scan.ambiguous) {
        const writer = decisions[h.key];
        const p = verdicts[h.key];
        let isEntity;
        let source;
        if (writer === 'yes' || writer === 'no') {
          isEntity = writer === 'yes';
          source = 'writer';
        } else if (typeof p === 'number') {
          isEntity = p >= 0.5;
          source = 'smart';
        } else {
          isEntity = h.rule;
          source = 'rule';
        }
        // The model and a confident grammar rule disagree: count what the model says, but ask.
        const disputed = source === 'smart' && h.rule === false && p >= 0.5;
        ambiguous.push({ ...h, bookUuid: book.uuid, chapterId: ch.id, chIndex, isEntity, source, p, disputed });
        if (!isEntity) {
          if (counts === scan.counts) counts = { ...counts };
          counts[h.entryId] -= 1;
          if (h.scene >= 0) {
            if (scenes === scan.scenes) scenes = scenes.map((s) => ({ ...s, counts: { ...s.counts } }));
            scenes[h.scene].counts[h.entryId] -= 1;
          }
        }
      }
      return { id: ch.id, title: ch.title, index: chIndex, counts, scenes, words: countWords(ch.content) };
    });
    for (const ch of chapters) {
      for (const [id, n] of Object.entries(ch.counts)) {
        if (n <= 0) continue;
        totals[id] = totals[id] || {};
        totals[id][book.uuid] = (totals[id][book.uuid] || 0) + n;
      }
    }
    books[book.uuid] = { chapters, matcher };
  }
  return { books, totals, ambiguous };
}

// Uses of an everyday-word name the writer should look at: ones the plain rules didn't count, and
// ones smart features weren't sure about (or disagreed with a rule on).
export const needsCheck = (h) =>
  h.source !== 'writer' && ((h.source === 'rule' && !h.isEntity) || (h.source === 'smart' && (h.disputed || (h.p > 0.1 && h.p < 0.9))));

export const heatLevel = (n) => (!n || n <= 0 ? 0 : n <= 2 ? 1 : n <= 7 ? 2 : 3);

export const mentionsIn = (analysis, id, bookUuids) => bookUuids.reduce((sum, b) => sum + (analysis.totals[id]?.[b] || 0), 0);

// ---------- scope: one book, or the whole series ----------

export function scoped(ctx, analysis, scope) {
  const series = ctx.inSeries && scope === 'series';
  const books = series ? ctx.books : [ctx.currentBook];
  const uuids = books.map((b) => b.uuid);
  const cur = ctx.uuid;
  const relApplies = (r) => r.store !== 'series' || !r.books.length || r.books.includes(cur);
  const touches = (r, id) => r.a === id || r.b === id;
  const inBook = (e) =>
    e.owner === cur ||
    (e.owner === 'series' &&
      ((analysis.totals[e.id]?.[cur] || 0) > 0 ||
        (e.perBook?.[cur] || '').trim() ||
        ctx.rels.some((r) => touches(r, e.id) && (r.store === 'book' || (r.store === 'series' && r.books.includes(cur))))));
  const entries = series ? ctx.entries : ctx.entries.filter(inBook);
  const ids = new Set(entries.map((e) => e.id));
  const rels = ctx.rels.filter((r) => ids.has(r.a) && ids.has(r.b) && (series ? true : r.store !== 'sibling' && relApplies(r)));
  return { series, books, uuids, entries, rels, ids };
}

export const relLabel = (r, scope, bookUuid) => (scope === 'book' ? r.byBook?.[bookUuid]?.label || r.label : r.label) || '';

// Characters who share chapters, most first. rel is set when they already have a relationship.
export function pairs(view, analysis) {
  const chars = view.entries.filter((e) => e.type === 'character');
  const cols = [];
  for (const b of view.books) for (const ch of analysis.books[b.uuid]?.chapters || []) cols.push(ch.counts);
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i].id;
      const b = chars[j].id;
      let n = 0;
      for (const c of cols) if (c[a] > 0 && c[b] > 0) n++;
      if (!n) continue;
      const rel = view.rels.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
      out.push({ a: chars[i], b: chars[j], n, rel, key: `${a}|${b}` });
    }
  }
  return out.sort((x, y) => y.n - x.n);
}

export const suggestionsFrom = (pairList) => pairList.filter((p) => !p.rel && p.n >= 3).slice(0, 3);

// The book's chapters in order, flattened across the books in view, for "last seen" style questions.
export function chapterColumns(view, analysis) {
  const cols = [];
  for (const b of view.books) for (const ch of analysis.books[b.uuid]?.chapters || []) cols.push({ book: b, ch });
  return cols;
}

// Notes and pinned where/who for one scene. Stored per chapter by position, and re-found by the
// scene's opening words if scenes were added or removed above it.
export function sceneMeta(bible, chapterId, index, opens) {
  const list = bible?.scenes?.[chapterId] || [];
  if (list[index] && list[index].opens === opens) return list[index];
  return list.find((x) => x && x.opens === opens) || null;
}

// Who is in a scene and where it's set: found by name, unless the writer pinned it.
export function sceneCast(scene, chapterId, bible, byId) {
  const meta = sceneMeta(bible, chapterId, scene.index, scene.opens);
  const ids = Object.entries(scene.counts)
    .filter(([id, n]) => n > 0 && byId[id])
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  let who = ids.filter((id) => byId[id].type === 'character');
  if (meta) {
    who = who.filter((id) => !(meta.remove || []).includes(id));
    for (const id of meta.add || []) if (byId[id] && !who.includes(id)) who.push(id);
  }
  const places = ids.filter((id) => byId[id].type === 'place');
  const where = meta?.where && byId[meta.where] ? meta.where : places[0] || null;
  return { meta, who, where, pinned: !!(meta?.where && byId[meta.where]) };
}

// Keys smart-feature answers are remembered by. They change when the text they were about changes.
export const presenceKey = (chapterId, scene, entryId) => `${entryId}|${hash(`${chapterId}|${scene.opens}|${scene.words}`)}`;
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
