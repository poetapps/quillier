// A series links several book files and keeps one shared story bible for them.
//
// The series is its own small JSON file (.quillseries). Each book stays in its own .quill file and
// points back at the series. Entries every book can use (and relationships between them) live in
// the series file; entries only one book uses stay in that book.
//
// series file: { format, formatVersion, uuid, title, books: [{ uuid, path, abs, title, kind }], bible: { entries, relationships } }
// book.series: { uuid, path, abs }   (path is relative to the book's folder, abs is where it was last seen)

import { uid, normalizeBible } from './project.js';

export const SERIES_FORMAT = 'quillier-series';
export const SERIES_VERSION = 1;
export const SERIES_FILE = /\.quillseries$/i;
export const BOOK_KINDS = ['book', 'prequel', 'companion'];

const nowIso = () => new Date().toISOString();

export function createSeries(title) {
  return {
    format: SERIES_FORMAT,
    formatVersion: SERIES_VERSION,
    uuid: crypto.randomUUID(),
    title: title || 'Untitled series',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    books: [],
    bible: { entries: [], relationships: [] },
  };
}

export function normalizeSeries(data) {
  if (!data || typeof data !== 'object' || data.format !== SERIES_FORMAT) throw new Error('This file is not a Quillier series.');
  const bible = normalizeBible(data.bible);
  return {
    ...data,
    uuid: data.uuid || crypto.randomUUID(),
    title: data.title || 'Untitled series',
    books: (Array.isArray(data.books) ? data.books : [])
      .filter((b) => b && b.uuid)
      .map((b) => ({ uuid: b.uuid, path: b.path || '', abs: b.abs || '', title: b.title || 'Untitled', kind: BOOK_KINDS.includes(b.kind) ? b.kind : 'book' })),
    bible: { entries: bible.entries, relationships: bible.relationships },
  };
}

// "Book 1", "Book 2", "Prequel", "Companion"… Prequels and companions don't take a number.
export function bookLabels(books) {
  const out = {};
  let n = 0;
  for (const b of books) {
    if (b.kind === 'prequel') out[b.uuid] = { long: 'Prequel', short: 'P' };
    else if (b.kind === 'companion') out[b.uuid] = { long: 'Companion', short: 'C' };
    else {
      n++;
      out[b.uuid] = { long: `Book ${n}`, short: `B${n}` };
    }
  }
  return out;
}

export const numberedCount = (books) => books.filter((b) => b.kind === 'book').length;

// ---------- paths (the renderer has no `path` module) ----------

const isWin = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
const parts = (p) => p.split(/[\\/]+/).filter(Boolean);

export function dirOf(p) {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i < 0 ? '' : p.slice(0, i) || '/';
}

export const baseName = (p) => p.split(/[\\/]/).pop();

// Relative path from a folder to a file, with forward slashes. Falls back to the absolute path when
// the two are on different drives.
export function relativePath(fromDir, to) {
  const a = parts(fromDir);
  const b = parts(to);
  if (isWin(fromDir) !== isWin(to) || (isWin(to) && a[0]?.toLowerCase() !== b[0]?.toLowerCase())) return to;
  let i = 0;
  const same = (x, y) => (isWin(to) ? x.toLowerCase() === y.toLowerCase() : x === y);
  while (i < a.length && i < b.length - 1 && same(a[i], b[i])) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

export function resolvePath(dir, rel) {
  if (!rel) return '';
  if (rel.startsWith('/') || isWin(rel)) return rel;
  const sep = isWin(dir) ? '\\' : '/';
  const out = parts(dir);
  for (const seg of parts(rel)) {
    if (seg === '..') out.pop();
    else if (seg !== '.') out.push(seg);
  }
  return (isWin(dir) ? '' : '/') + out.join(sep);
}

// Where to look for a linked file, best guess first.
export const candidatePaths = (fromFile, link) => [...new Set([resolvePath(dirOf(fromFile), link.path), link.abs].filter(Boolean))];

// ---------- matching entries by name ----------

const namesOf = (e) => [e.name, ...(e.aliases || [])].map((n) => n.trim().toLowerCase()).filter(Boolean);

export function findMatch(entry, candidates) {
  const mine = namesOf(entry);
  return candidates.find((c) => c.type === entry.type && namesOf(c).some((n) => mine.includes(n))) || null;
}

export function matchReason(entry, target) {
  if (entry.name.trim().toLowerCase() === target.name.trim().toLowerCase()) return 'Same name in both.';
  const theirs = namesOf(target);
  const common = [entry.name, ...entry.aliases].find((n) => theirs.includes(n.trim().toLowerCase())) || entry.name;
  return `Matched on “${common}”, which ${target.name} already goes by.`;
}

// ---------- adding a book to a series ----------

// Returns what joining would do, for the review step: entries that look like ones the series has,
// and entries that are new to it.
export function planMerge(book, series) {
  const rows = book.bible.entries.map((e) => ({ entry: e, match: findMatch(e, series.bible.entries) }));
  return { matches: rows.filter((r) => r.match), fresh: rows.filter((r) => !r.match) };
}

const remapKeys = (obj, remap) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k.replace(/^[^|]+/, (id) => remap[id] || id), v]));
const remapScenes = (scenes, remap) =>
  Object.fromEntries(
    Object.entries(scenes || {}).map(([chId, list]) => [
      chId,
      (list || []).map((s) =>
        s ? { ...s, where: remap[s.where] || s.where, add: (s.add || []).map((id) => remap[id] || id), remove: (s.remove || []).map((id) => remap[id] || id) } : s
      ),
    ])
  );

// choices: { [bookEntryId]: 'merge' | 'separate' | 'share' | 'keep' }. Defaults: merge a match, share the rest.
// position: 'prequel' | 'after' | 'companion'. Returns new { book, series } plus counts.
export function mergeIntoSeries({ book, bookPath, series, seriesPath, position, choices = {} }) {
  const bookUuid = book.meta.uuid;
  const sEntries = series.bible.entries.map((e) => ({ ...e, aliases: [...e.aliases], perBook: { ...e.perBook } }));
  const sRels = series.bible.relationships.map((r) => ({ ...r, books: [...r.books], byBook: { ...r.byBook } }));
  const keep = [];
  const remap = {};
  let merged = 0;
  let shared = 0;
  const seriesIds = new Set(sEntries.map((e) => e.id));

  for (const e of book.bible.entries) {
    const match = findMatch(e, series.bible.entries);
    const choice = choices[e.id] || (match ? 'merge' : 'share');
    if (match && choice === 'merge') {
      const t = sEntries.find((x) => x.id === match.id);
      for (const a of [e.name, ...e.aliases]) {
        const n = a.trim();
        if (n && n.toLowerCase() !== t.name.trim().toLowerCase() && !t.aliases.some((x) => x.toLowerCase() === n.toLowerCase())) t.aliases.push(n);
      }
      if (e.notes.trim()) t.perBook[bookUuid] = [t.perBook[bookUuid], e.notes].filter(Boolean).join('\n\n');
      if (!t.role && e.role) t.role = e.role;
      t.updatedAt = nowIso();
      remap[e.id] = t.id;
      merged++;
    } else if (choice === 'keep') {
      keep.push(e);
    } else {
      const id = seriesIds.has(e.id) ? uid() : e.id;
      if (id !== e.id) remap[e.id] = id;
      sEntries.push({ ...e, id });
      seriesIds.add(id);
      shared++;
    }
  }

  const inSeries = (id) => seriesIds.has(id);
  const bookRels = [];
  for (const r0 of book.bible.relationships) {
    const r = { ...r0, a: remap[r0.a] || r0.a, b: remap[r0.b] || r0.b };
    if (r.a === r.b) continue;
    if (inSeries(r.a) && inSeries(r.b)) {
      const same = sRels.find((x) => (x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a));
      if (same) {
        if (!same.books.includes(bookUuid)) same.books.push(bookUuid);
        same.byBook[bookUuid] = { label: r.label, note: r.note };
      } else {
        sRels.push({ ...r, books: [bookUuid], byBook: {} });
      }
    } else {
      bookRels.push(r);
    }
  }

  const link = { uuid: bookUuid, path: relativePath(dirOf(seriesPath), bookPath), abs: bookPath, title: book.title, kind: position === 'prequel' ? 'prequel' : position === 'companion' ? 'companion' : 'book' };
  const books = series.books.filter((b) => b.uuid !== bookUuid);
  if (position === 'prequel') books.unshift(link);
  else books.push(link);

  return {
    merged,
    shared,
    series: { ...series, updatedAt: nowIso(), books, bible: { entries: sEntries, relationships: sRels } },
    book: {
      ...book,
      series: { uuid: series.uuid, path: relativePath(dirOf(bookPath), seriesPath), abs: seriesPath },
      bible: {
        ...book.bible,
        entries: keep,
        relationships: bookRels,
        decisions: remapKeys(book.bible.decisions, remap),
        scenes: remapScenes(book.bible.scenes, remap),
      },
    },
  };
}

// ---------- taking a book back out ----------

// `used`: ids of series entries this book uses (mentioned in it, or with notes for it). Those are
// copied into the book, with this book's notes folded in, so it stands on its own again.
export function removeFromSeries({ book, series, used }) {
  const bookUuid = book.meta.uuid;
  const usedSet = new Set(used);
  const copied = series.bible.entries
    .filter((e) => usedSet.has(e.id) || (e.perBook[bookUuid] || '').trim())
    .map((e) => {
      const { [bookUuid]: mine, ...rest } = e.perBook;
      return { ...e, notes: [e.notes, mine].filter((x) => x && x.trim()).join('\n\n'), perBook: {}, _rest: rest };
    })
    .map(({ _rest, ...e }) => e);
  const ids = new Set(copied.map((e) => e.id));
  const rels = series.bible.relationships
    .filter((r) => ids.has(r.a) && ids.has(r.b) && (!r.books.length || r.books.includes(bookUuid)))
    .map((r) => ({ ...r, label: r.byBook[bookUuid]?.label || r.label, note: r.byBook[bookUuid]?.note || r.note, books: [], byBook: {} }));
  const existing = new Set(book.bible.entries.map((e) => e.id));
  return {
    book: {
      ...book,
      series: null,
      bible: {
        ...book.bible,
        entries: [...book.bible.entries, ...copied.filter((e) => !existing.has(e.id))],
        relationships: [...book.bible.relationships, ...rels],
      },
    },
    series: {
      ...series,
      updatedAt: nowIso(),
      books: series.books.filter((b) => b.uuid !== bookUuid),
      bible: {
        entries: series.bible.entries.map((e) => {
          if (!(bookUuid in e.perBook)) return e;
          const { [bookUuid]: _drop, ...perBook } = e.perBook;
          return { ...e, perBook };
        }),
        relationships: series.bible.relationships.map((r) => {
          if (!r.books.includes(bookUuid) && !(bookUuid in r.byBook)) return r;
          const { [bookUuid]: _drop, ...byBook } = r.byBook;
          return { ...r, books: r.books.filter((x) => x !== bookUuid), byBook };
        }),
      },
    },
  };
}
