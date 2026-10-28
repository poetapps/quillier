// Find and replace across the whole book: every chapter (each of its takes), the outline and the
// project notes, in the draft that's open. Matching runs on the Markdown that's stored. Link
// targets and raw HTML tags are skipped, so a search never changes a URL.
//
// Straight and curly quotes count as the same character, so "Maren's" finds “Maren’s”.

import { activeDraft, chapterNumber, isBook, isFolder, docName, wordsFor, mapDoc } from './project.js';
import { allTakes, hasTakes, mapText, addVersion } from './versions.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUOTES = { "'": "['‘’]", '‘': "['‘’]", '’': "['‘’]", '"': '["“”]', '“': '["“”]', '”': '["“”]' };
const WORD_CHAR = /[\p{L}\p{N}]/u;

function pattern(text, wholeWord) {
  const body = [...text].map((c) => QUOTES[c] || escapeRe(c)).join('');
  if (!wholeWord) return body;
  // Only insist on a boundary where the search itself starts or ends with a letter or digit.
  const chars = [...text];
  return `${WORD_CHAR.test(chars[0]) ? '(?<![\\p{L}\\p{N}_])' : ''}${body}${WORD_CHAR.test(chars[chars.length - 1]) ? '(?![\\p{L}\\p{N}])' : ''}`;
}

// The search as a regular expression, or null for an empty search.
export function findRegex(query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return null;
  return new RegExp(pattern(query, wholeWord), `gu${matchCase ? '' : 'i'}`);
}

// Where link targets and HTML tags sit, so matches inside them can be left alone.
function maskedRanges(text) {
  const out = [];
  for (const m of text.matchAll(/\]\([^)\n]*\)|<[^>\n]+>/g)) out.push([m.index, m.index + m[0].length]);
  return out;
}

// [{ start, end }] for every match of `re` in `text`, in order.
export function matchesIn(text, re) {
  if (!re || !text) return [];
  const masked = maskedRanges(text);
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (!m[0].length) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = start + m[0].length;
    if (!masked.some(([a, b]) => start < b && end > a)) out.push({ start, end });
  }
  return out;
}

// The text with each of `matches` swapped for `replacement` (a string, or a function of the matched text).
export function replaceMatches(text, matches, replacement) {
  let out = '';
  let at = 0;
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue;
    const found = text.slice(m.start, m.end);
    out += text.slice(at, m.start) + (typeof replacement === 'function' ? replacement(found) : replacement);
    at = m.end;
  }
  return out + text.slice(at);
}

export const replaceAll = (text, re, replacement) => replaceMatches(text, matchesIn(text, re), replacement);

// The words around a match, for the results list.
export function snippet(text, m, around = 34) {
  const flat = (s) => s.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ');
  let a = Math.max(0, m.start - around);
  let b = Math.min(text.length, m.end + around);
  while (a > 0 && a > m.start - around - 12 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && b < m.end + around + 12 && /\S/.test(text[b])) b++;
  return {
    before: (a > 0 ? '…' : '') + flat(text.slice(a, m.start)).trimStart(),
    text: text.slice(m.start, m.end),
    after: flat(text.slice(m.end, b)).trimEnd() + (b < text.length ? '…' : ''),
  };
}

// Every page whose text can be searched, in the order the sidebar shows them: the project notes,
// the outline, then the manuscript. A chapter with other takes gives one target per take.
export function searchTargets(p) {
  const book = isBook(p);
  const out = [];
  const add = (doc, take, area, label, sub) =>
    out.push({ key: `${doc.id}:${take.id}`, docId: doc.id, takeId: take.id, area, label, sub, content: take.content, inlineNotes: take.inlineNotes, chapter: area === 'manuscript' && !isFolder(doc) });
  if (book) add(p.notes, allTakes(p.notes)[0], 'notes', 'Notes', 'Project notes');
  if (book) for (const s of p.outline) add(s, allTakes(s)[0], 'outline', s.title || 'Untitled', isFolder(s) ? 'Outline folder' : 'Outline');
  for (const d of activeDraft(p).chapters) {
    const label = isFolder(d) ? d.title || 'Untitled folder' : book ? `${chapterNumber(p, d.id)}. ${d.title || 'Untitled'}` : docName(d);
    const kind = isFolder(d) ? 'Folder' : wordsFor(p).Page;
    for (const t of allTakes(d)) add(d, t, 'manuscript', label, hasTakes(d) ? `${kind} · ${t.inBook ? `${t.name}, in the book` : `${t.name}, another take`}` : kind);
  }
  return out;
}

// The targets that match, each with its matches: [{ ...target, matches: [{ start, end }] }].
export function searchProject(p, re) {
  if (!re) return [];
  return searchTargets(p)
    .map((t) => ({ ...t, matches: matchesIn(t.content, re) }))
    .filter((t) => t.matches.length);
}

// ---------- changing the text ----------

// The same change made to notes on text (their quoted passage and the words around it), so they
// still find their place when the page opens.
export function adjustNotes(notes, fn) {
  let changed = false;
  const out = notes.map((n) => {
    const next = { ...n, quote: fn(n.quote || ''), prefix: fn(n.prefix || ''), suffix: fn(n.suffix || '') };
    if (next.quote === (n.quote || '') && next.prefix === (n.prefix || '') && next.suffix === (n.suffix || '')) return n;
    changed = true;
    return next;
  });
  return changed ? out : notes;
}

// Put new text on the pages in `changes` ([{ ...search target, was, content }]). A chapter keeps an
// automatic version of each take as it was, named `versionName`. `fixNotes` is the change as a
// function of a string, for notes on text.
export function applyChanges(p, changes, versionName, fixNotes) {
  const stamp = new Date().toISOString();
  let next = p;
  for (const c of changes) {
    if (c.chapter) next = mapDoc(next, c.docId, (d) => addVersion(d, { takeId: c.takeId, name: versionName, content: c.was, inlineNotes: c.inlineNotes, auto: true }));
    next = mapText(next, c.docId, c.takeId, (t) => ({ content: c.content, inlineNotes: adjustNotes(t.inlineNotes, fixNotes), updatedAt: stamp }));
  }
  return next;
}

// ---------- renaming a story bible entry ----------

// When an entry's name changes, the names it used to go by that it no longer matches:
// [{ from, to }], longest first. "Maren Holt" → "Mara Holt" (and its automatic alias "Maren" → "Mara").
export function renamePairs(before, after) {
  const now = new Set([after.name, ...(after.aliases || [])].map((s) => (s || '').trim()).filter(Boolean));
  const pairs = [];
  const add = (from, to) => {
    from = (from || '').trim();
    to = (to || '').trim();
    if (from.length > 1 && to && from !== to && !now.has(from) && !pairs.some((x) => x.from === from)) pairs.push({ from, to });
  };
  add(before.name, after.name);
  const a = before.aliases || [];
  const b = after.aliases || [];
  if (a.length === b.length) a.forEach((x, i) => add(x, b[i]));
  return pairs.sort((x, y) => y.from.length - x.from.length);
}

// One pass over the text, so a new name that contains an old one is never renamed twice.
export function namesRegex(pairs) {
  if (!pairs.length) return null;
  return new RegExp(pairs.map((x) => `(?:${pattern(x.from, true)})`).join('|'), 'gu');
}

export function renameIn(text, pairs) {
  const re = namesRegex(pairs);
  if (!re) return text;
  const to = (found) => pairs.find((x) => new RegExp(`^(?:${pattern(x.from, false)})$`, 'u').test(found))?.to ?? found;
  return replaceAll(text, re, to);
}

export const countNames = (text, pairs) => matchesIn(text, namesRegex(pairs)).length;

// Every page of `p` that uses one of the old names, with them renamed: [{ ...target, was, content, n }].
export function renameChanges(p, pairs) {
  return searchTargets(p)
    .map((t) => {
      const content = renameIn(t.content, pairs);
      return content === t.content ? null : { ...t, n: countNames(t.content, pairs), was: t.content, content };
    })
    .filter(Boolean);
}

export const namesIn = (p, pairs) => searchTargets(p).reduce((n, t) => n + countNames(t.content, pairs), 0);
