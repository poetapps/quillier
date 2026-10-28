// The .quill project file: one JSON document holding the whole book.
// (Files from before the rename use .ldraft and format 'libredraft'; both still open.)
// Every page's text is stored as Markdown.

import { normalizeFace } from './face.js';

export const FORMAT = 'quillier';
const KNOWN_FORMATS = [FORMAT, 'libredraft'];
export const FORMAT_VERSION = 1;

export const STATUSES = [
  { id: 'idea', label: 'Not started' },
  { id: 'progress', label: 'In progress' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'revised', label: 'Revised' },
  { id: 'done', label: 'Done' },
];

export const statusLabel = (id) => (STATUSES.find((s) => s.id === id) || STATUSES[0]).label;

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const nowIso = () => new Date().toISOString();

export function newDoc(kind, title, content = '') {
  const doc = { id: uid(), title, content, notes: '', inlineNotes: [], createdAt: nowIso(), updatedAt: nowIso() };
  if (kind === 'chapter') doc.status = 'idea';
  if (kind === 'folder') Object.assign(doc, { type: 'folder', open: true });
  return doc;
}

// ---------- kinds of project ----------
// A book has chapters, an outline and a story bible. A journal is dated entries, newest first, and a
// notebook is pages in folders (research, study notes). All three keep their pages in the draft's
// chapter list, so saving, trash, word counts and export work the same; a journal or notebook just
// never shows the outline, the story bible or more than one draft.

export const KINDS = ['book', 'journal', 'notebook'];
export const kindOf = (p) => (KINDS.includes(p?.kind) ? p.kind : 'book');
export const isBook = (p) => kindOf(p) === 'book';

const WORDING = {
  book: { name: 'Book', page: 'chapter', pages: 'chapters', Page: 'Chapter', Pages: 'Chapters', whole: 'Manuscript' },
  journal: { name: 'Journal', page: 'entry', pages: 'entries', Page: 'Entry', Pages: 'Entries', whole: 'Journal' },
  notebook: { name: 'Notebook', page: 'page', pages: 'pages', Page: 'Page', Pages: 'Pages', whole: 'Notebook' },
};
export const wordsFor = (p) => WORDING[kindOf(p)];
export const countOf = (p, n) => `${n.toLocaleString('en-US')} ${n === 1 ? wordsFor(p).page : wordsFor(p).pages}`;

// A new chapter, journal entry (dated today) or notebook page.
export function newPage(p, title) {
  const kind = kindOf(p);
  if (kind === 'journal') return { ...newDoc('page', title || ''), date: todayKey() };
  if (kind === 'notebook') return newDoc('page', title || 'Untitled page');
  return newDoc('chapter', title || 'Untitled chapter');
}

// The page to open when nothing else is: a book's Notes, a journal's newest entry, a notebook's first page.
export function homeId(p) {
  const pages = chaptersOf(activeDraft(p));
  if (kindOf(p) === 'journal') return pages[pages.length - 1]?.id || null;
  return isBook(p) ? 'notes' : pages[0]?.id || null;
}

// ---------- journal dates ----------
// An entry's `date` is a local calendar day, "2026-10-26". Entries are kept in date order (oldest
// first, so exports read in order) and the sidebar lists them newest first.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isDayKey = (s) => typeof s === 'string' && DAY.test(s);
export const dayOf = (key) => {
  const [, y, m, d] = key.match(DAY);
  return new Date(+y, +m - 1, +d);
};
export const entryDate = (d) => (isDayKey(d.date) ? d.date : todayKey(d.createdAt ? new Date(d.createdAt) : new Date()));

export function sortEntries(list) {
  const pages = list.filter((d) => !isFolder(d)).map((d, i) => ({ d: d.parent ? { ...d, parent: null } : d, key: entryDate(d), i }));
  pages.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.i - b.i));
  const out = pages.map((x) => x.d);
  return out.length === list.length && out.every((d, i) => d === list[i]) ? list : out;
}

export const longDate = (key) => dayOf(key).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
export const shortDate = (key) =>
  dayOf(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(key.slice(0, 4) === todayKey().slice(0, 4) ? {} : { year: 'numeric' }) });
export const monthLabel = (key) =>
  dayOf(`${key.slice(0, 7)}-01`).toLocaleDateString(undefined, { month: 'long', ...(key.slice(0, 4) === todayKey().slice(0, 4) ? {} : { year: 'numeric' }) });

// What an entry is called in lists: its title, else its first words.
export const entryLabel = (d) => (d.title || '').trim() || excerpt(d.content, 8) || 'Empty entry';

// What a page is called in toasts and the trash. A journal entry goes by its date.
export const docName = (d) => (isDayKey(d?.date) && !isFolder(d) ? [shortDate(d.date), (d.title || '').trim()].filter(Boolean).join(' · ') : d?.title || 'Untitled');

// "2026-10-26 Rain all day" (an imported file's name or heading) → its date and the rest.
export function splitDate(title) {
  const m = (title || '').match(/^(\d{4}-\d{2}-\d{2})(?:[\s._–—-]+(.*))?$/);
  return m && todayKey(dayOf(m[1])) === m[1] ? { date: m[1], title: (m[2] || '').trim() } : { date: null, title: title || '' };
}

export function createProject(title, kind = 'book') {
  const p = { kind };
  const chapter = newPage(p);
  const draft = { id: uid(), name: 'Draft 1', chapters: [chapter] };
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind: kindOf(p),
    title,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    notes: { id: 'notes', title: 'Notes', content: '', notes: '', inlineNotes: [] },
    outline: [],
    drafts: [draft],
    activeDraftId: draft.id,
    trash: [],
    stats: { daily: {} },
    meta: { uuid: crypto.randomUUID(), author: '', contact: '', language: '' },
    ui: { openId: chapter.id, outlineOpen: true },
    bible: emptyBible(),
    series: null,
  };
}

// ---------- story bible data ----------
// Characters and places ("entries") and the relationships between them. A standalone book keeps
// all of them in its own file. In a series, shared entries live in the series file and only the
// ones a single book uses stay in that book (see lib/series.js).

export const emptyBible = () => ({ entries: [], relationships: [], scenes: {}, decisions: {}, dismissed: [] });

const TITLE_WORDS = new Set(['old', 'young', 'brother', 'sister', 'father', 'mother', 'captain', 'widow', 'the', 'mr', 'mr.', 'mrs', 'mrs.', 'miss', 'ms', 'ms.', 'dr', 'dr.', 'lord', 'lady', 'sir', 'aunt', 'uncle']);

// A two-word name like "Maren Holt" is usually written as just "Maren", so start with that alias.
export function defaultAliases(name, type) {
  const words = (name || '').trim().split(/\s+/);
  if (type !== 'character' || words.length < 2 || TITLE_WORDS.has(words[0].toLowerCase())) return [];
  return [words[0]];
}

// Optional character traits, picked from a short list so they stay machine-readable.
export const GENDERS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'nonbinary', label: 'Nonbinary' },
  { id: 'other', label: 'Other' },
];
export const AGES = [
  { id: 'child', label: 'Child', sub: 'Under 13' },
  { id: 'teen', label: 'Teen', sub: '13–17' },
  { id: 'young', label: 'Young adult', sub: '18–29' },
  { id: 'adult', label: 'Adult', sub: '30–49' },
  { id: 'middle', label: 'Middle-aged', sub: '50–64' },
  { id: 'older', label: 'Older', sub: '65 and up' },
];
const pickId = (list, v) => (list.some((x) => x.id === v) ? v : '');

export function newEntry(type, name = '') {
  return {
    id: uid(),
    type,
    name,
    role: '',
    aliases: defaultAliases(name, type),
    notes: '',
    perBook: {},
    pos: null,
    gender: '',
    age: '',
    face: null,
    born: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function newRelationship(a, b, label = '') {
  return { id: uid(), a, b, label, note: '', books: [], byBook: {} };
}

function normalizeEntry(e) {
  return {
    ...newEntry(e.type === 'place' ? 'place' : 'character'),
    ...e,
    id: e.id || uid(),
    name: typeof e.name === 'string' ? e.name : '',
    role: typeof e.role === 'string' ? e.role : '',
    aliases: Array.isArray(e.aliases) ? e.aliases.filter((a) => typeof a === 'string' && a.trim()) : [],
    notes: typeof e.notes === 'string' ? e.notes : '',
    perBook: e.perBook && typeof e.perBook === 'object' ? e.perBook : {},
    gender: pickId(GENDERS, e.gender),
    age: pickId(AGES, e.age),
    face: normalizeFace(e.face),
    born: typeof e.born === 'string' ? e.born : '',
  };
}

function normalizeRelationship(r) {
  return {
    ...newRelationship(r.a, r.b),
    ...r,
    id: r.id || uid(),
    label: typeof r.label === 'string' ? r.label : '',
    note: typeof r.note === 'string' ? r.note : '',
    books: Array.isArray(r.books) ? r.books : [],
    byBook: r.byBook && typeof r.byBook === 'object' ? r.byBook : {},
  };
}

export function normalizeBible(b) {
  const bible = b && typeof b === 'object' ? b : {};
  return {
    ...emptyBible(),
    ...bible,
    entries: (Array.isArray(bible.entries) ? bible.entries : []).filter((e) => e && typeof e === 'object').map(normalizeEntry),
    relationships: (Array.isArray(bible.relationships) ? bible.relationships : []).filter((r) => r && r.a && r.b).map(normalizeRelationship),
    scenes: bible.scenes && typeof bible.scenes === 'object' ? bible.scenes : {},
    decisions: bible.decisions && typeof bible.decisions === 'object' ? bible.decisions : {},
    dismissed: Array.isArray(bible.dismissed) ? bible.dismissed : [],
  };
}

// A book's status is the least finished of its chapters.
export function bookStatus(chapters) {
  if (!chapters?.length) return 'idea';
  const order = STATUSES.map((s) => s.id);
  return chapters.reduce((low, c) => (order.indexOf(c.status || 'idea') < order.indexOf(low) ? c.status || 'idea' : low), 'done');
}

// Fill in anything missing so older or hand-edited files still open.
export function normalizeProject(data) {
  if (!data || typeof data !== 'object' || (data.format && !KNOWN_FORMATS.includes(data.format))) {
    throw new Error('This file is not a Quillier project.');
  }
  const fixNotes = (list) => (Array.isArray(list) ? list.filter((n) => n && n.id) : []);
  // A chapter's other takes and saved versions (see lib/versions.js).
  const fixTexts = (list) =>
    list.filter((t) => t && typeof t.content === 'string').map((t) => ({ ...t, id: t.id || uid(), inlineNotes: fixNotes(t.inlineNotes) }));
  const fixDoc = (d, kind) => ({
    ...newDoc(kind, 'Untitled'),
    ...d,
    id: d.id || uid(),
    content: typeof d.content === 'string' ? d.content : '',
    notes: typeof d.notes === 'string' ? d.notes : '',
    inlineNotes: fixNotes(d.inlineNotes),
    ...(Array.isArray(d.takes) ? { takes: fixTexts(d.takes) } : {}),
    ...(Array.isArray(d.versions) ? { versions: fixTexts(d.versions) } : {}),
  });
  let drafts = Array.isArray(data.drafts) && data.drafts.length ? data.drafts : [{ id: uid(), name: 'Draft 1', chapters: [] }];
  drafts = drafts.map((dr) => ({
    id: dr.id || uid(),
    name: dr.name || 'Draft',
    chapters: normalizeTree((dr.chapters || []).map((c) => fixDoc(c, isFolder(c) ? 'folder' : 'chapter'))),
  }));
  const kind = kindOf(data);
  // Every journal entry has a date, and they stay in date order.
  if (kind === 'journal') drafts = drafts.map((dr) => ({ ...dr, chapters: sortEntries(dr.chapters.map((c) => (isDayKey(c.date) ? c : { ...c, date: entryDate(c) }))) }));
  const activeDraftId = drafts.some((d) => d.id === data.activeDraftId) ? data.activeDraftId : drafts[0].id;
  // Unknown keys are kept, so a file written by a newer version keeps its data when an older one saves it.
  return {
    ...data,
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind,
    title: data.title || 'Untitled',
    createdAt: data.createdAt || nowIso(),
    updatedAt: data.updatedAt || nowIso(),
    notes: { title: 'Notes', content: '', notes: '', inlineNotes: [], ...(data.notes || {}), id: 'notes' },
    outline: normalizeTree((data.outline || []).map((s) => fixDoc(s, isFolder(s) ? 'folder' : 'section'))),
    drafts,
    activeDraftId,
    trash: Array.isArray(data.trash) ? data.trash : [],
    stats: { daily: {}, ...(data.stats || {}) },
    meta: { author: '', contact: '', language: '', ...(data.meta || {}), uuid: data.meta?.uuid || crypto.randomUUID() },
    ui: { outlineOpen: true, ...(data.ui || {}) },
    bible: normalizeBible(data.bible),
    series: data.series && typeof data.series === 'object' && data.series.uuid ? data.series : null,
  };
}

export const activeDraft = (p) => p.drafts.find((d) => d.id === p.activeDraftId) || p.drafts[0];

// ---------- folders ----------
// The Outline and each draft's chapter list are flat arrays in reading order. Folders sit in the same
// arrays (type: 'folder') and every item names its folder in `parent`, with a folder's contents right
// after it. Keeping chapters in one flat list means numbering, export and the story bible only have to
// skip folders. (An older Quillier shows a folder as an empty chapter, and keeps it intact when it saves.)

export const isFolder = (d) => d?.type === 'folder';
export const chaptersOf = (draft) => draft.chapters.filter((c) => !isFolder(c));

// Put every folder's contents right after it, otherwise keeping the order. Anything whose folder is
// missing, or that sits inside itself, moves to the top level. Returns the same array if nothing moved.
export function normalizeTree(list) {
  const byId = new Map(list.map((d) => [d.id, d]));
  const parentOf = (d) => (d?.parent && isFolder(byId.get(d.parent)) ? d.parent : null);
  const loops = (d) => {
    const seen = new Set([d.id]);
    for (let id = parentOf(d); id; id = parentOf(byId.get(id))) {
      if (seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  };
  const kids = new Map();
  for (const d of list) {
    const parent = loops(d) ? null : parentOf(d);
    if (!kids.has(parent)) kids.set(parent, []);
    kids.get(parent).push(parent === (d.parent || null) ? d : { ...d, parent });
  }
  const out = [];
  const walk = (id) => {
    for (const d of kids.get(id) || []) {
      out.push(d);
      if (isFolder(d)) walk(d.id);
    }
  };
  walk(null);
  return out.length === list.length && out.every((d, i) => d === list[i]) ? list : out;
}

// [start, end): where item `id` and everything inside it sit in the list.
export function subtreeRange(list, id) {
  const start = list.findIndex((d) => d.id === id);
  if (start < 0) return null;
  const inside = new Set([id]);
  let end = start + 1;
  while (end < list.length && inside.has(list[end].parent)) inside.add(list[end++].id);
  return [start, end];
}

export const depthMap = (list) => {
  const depth = {};
  for (const d of list) depth[d.id] = d.parent && d.parent in depth ? depth[d.parent] + 1 : 0;
  return depth;
};

// Move item `id`, with its contents, into folder `parent` (null for the top level), before `beforeId`
// (null for the end of that folder).
export function moveInTree(list, id, parent, beforeId) {
  const range = subtreeRange(list, id);
  if (!range) return list;
  const block = list.slice(range[0], range[1]);
  if (parent && block.some((d) => d.id === parent)) return list;
  const rest = [...list.slice(0, range[0]), ...list.slice(range[1])];
  let at = beforeId ? rest.findIndex((d) => d.id === beforeId) : -1;
  if (at < 0) at = parent ? subtreeRange(rest, parent)[1] : rest.length;
  block[0] = { ...block[0], parent };
  return normalizeTree([...rest.slice(0, at), ...block, ...rest.slice(at)]);
}

// One step up or down among its neighbors, stepping out of the folder at either end.
export function nudgeInTree(list, id, dir) {
  const item = list.find((d) => d.id === id);
  if (!item) return list;
  const parent = item.parent || null;
  const siblings = list.filter((d) => (d.parent || null) === parent);
  const i = siblings.indexOf(item);
  const holder = parent && list.find((d) => d.id === parent);
  if (dir < 0) {
    if (i > 0) return moveInTree(list, id, parent, siblings[i - 1].id);
    return holder ? moveInTree(list, id, holder.parent || null, holder.id) : list;
  }
  if (i < siblings.length - 1) return moveInTree(list, id, parent, siblings[i + 2]?.id || null);
  if (!holder) return list;
  const outer = list.filter((d) => (d.parent || null) === (holder.parent || null));
  return moveInTree(list, id, holder.parent || null, outer[outer.indexOf(holder) + 1]?.id || null);
}

// Copies of these items with fresh ids, folders still holding their own contents.
export function copyTree(items, extra = {}) {
  const ids = new Map(items.map((d) => [d.id, uid()]));
  return items.map((d) => ({ ...d, ...extra, id: ids.get(d.id), parent: ids.get(d.parent) || d.parent || null }));
}

export function findDoc(p, id) {
  if (!p || !id) return null;
  if (id === p.notes.id) return { doc: p.notes, kind: 'notes', area: null, index: 0 };
  const si = p.outline.findIndex((s) => s.id === id);
  if (si >= 0) return { doc: p.outline[si], kind: isFolder(p.outline[si]) ? 'folder' : 'section', area: 'outline', index: si };
  const chapters = activeDraft(p).chapters;
  const ci = chapters.findIndex((c) => c.id === id);
  if (ci >= 0) return { doc: chapters[ci], kind: isFolder(chapters[ci]) ? 'folder' : 'chapter', area: 'manuscript', index: ci };
  return null;
}

// Chapter numbers skip folders: the third chapter is "Chapter 3" wherever it is filed.
export function chapterNumber(p, id) {
  return chaptersOf(activeDraft(p)).findIndex((c) => c.id === id) + 1;
}

// Folders marked as book parts, numbered in reading order: { [folderId]: n }.
export function partNumbers(draft) {
  const out = {};
  let n = 0;
  for (const d of draft.chapters) if (isFolder(d) && d.part) out[d.id] = ++n;
  return out;
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
export const partLabel = (n) => `Part ${NUMBER_WORDS[n] || n}`;

// Return a new project with doc `id` replaced by fn(doc). Unchanged branches keep their identity.
export function mapDoc(p, id, fn) {
  if (id === p.notes.id) return { ...p, notes: fn(p.notes) };
  if (p.outline.some((s) => s.id === id)) {
    return { ...p, outline: p.outline.map((s) => (s.id === id ? fn(s) : s)) };
  }
  return {
    ...p,
    drafts: p.drafts.map((d) =>
      d.chapters.some((c) => c.id === id) ? { ...d, chapters: d.chapters.map((c) => (c.id === id ? fn(c) : c)) } : d
    ),
  };
}

export function mapActiveChapters(p, fn) {
  return { ...p, drafts: p.drafts.map((d) => (d.id === p.activeDraftId ? { ...d, chapters: fn(d.chapters) } : d)) };
}

// ---------- counting ----------

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const HR_LINE = /^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const wordCache = new Map();

export function countWords(md) {
  if (!md) return 0;
  const hit = wordCache.get(md);
  if (hit !== undefined) return hit;
  const text = md
    .replace(/\]\([^)]*\)/g, ']') // link targets
    .replace(/<[^>]+>/g, ' ');
  const n = (text.match(WORD) || []).length;
  if (wordCache.size > 400) wordCache.clear();
  wordCache.set(md, n);
  return n;
}

export function splitScenes(md) {
  const scenes = [[]];
  for (const line of (md || '').split('\n')) {
    if (HR_LINE.test(line)) scenes.push([]);
    else scenes[scenes.length - 1].push(line);
  }
  return scenes.map((lines) => lines.join('\n').trim());
}

export function sceneCount(md) {
  if (!md || !md.trim()) return 0;
  return splitScenes(md).filter(Boolean).length;
}

export const manuscriptWords = (p) => chaptersOf(activeDraft(p)).reduce((n, c) => n + countWords(c.content), 0);

export function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function excerpt(md, words = 9) {
  const plain = (md || '')
    .replace(/[#>*_`~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = plain.split(' ');
  return parts.slice(0, words).join(' ') + (parts.length > words ? '…' : '');
}

// ---------- import ----------

const stripNumberPrefix = (name) => name.replace(/^\d+[\s._-]+/, '').trim() || name;

export function parseImport(files) {
  const chapters = [];
  for (const f of files) {
    let text = f.content.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
    // Plain text usually breaks paragraphs on single newlines.
    if (f.ext === 'txt' || f.ext === 'text') text = text.replace(/([^\n])\n(?!\n)/g, '$1\n\n');

    const h1 = [...text.matchAll(/^# +(.+?)\s*#*\s*$/gm)];
    const before = h1.length ? text.slice(0, h1[0].index).trim() : '';
    if (h1.length > 1 || (h1.length === 1 && !before)) {
      if (before) chapters.push({ title: stripNumberPrefix(f.name), content: before });
      h1.forEach((m, i) => {
        const end = i + 1 < h1.length ? h1[i + 1].index : text.length;
        chapters.push({ title: m[1].trim(), content: text.slice(m.index + m[0].length, end).trim() });
      });
    } else {
      chapters.push({ title: stripNumberPrefix(f.name), content: text.trim() });
    }
  }
  return chapters;
}
