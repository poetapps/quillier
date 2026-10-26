// The .quill project file: one JSON document holding the whole book.
// (Files from before the rename use .ldraft and format 'libredraft'; both still open.)
// Every page's text is stored as Markdown.

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
  return doc;
}

export function createProject(title) {
  const chapter = newDoc('chapter', 'Untitled chapter');
  const draft = { id: uid(), name: 'Draft 1', chapters: [chapter] };
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
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
  const fixDoc = (d, kind) => ({
    ...newDoc(kind, 'Untitled'),
    ...d,
    id: d.id || uid(),
    content: typeof d.content === 'string' ? d.content : '',
    notes: typeof d.notes === 'string' ? d.notes : '',
    inlineNotes: Array.isArray(d.inlineNotes) ? d.inlineNotes.filter((n) => n && n.id) : [],
  });
  let drafts = Array.isArray(data.drafts) && data.drafts.length ? data.drafts : [{ id: uid(), name: 'Draft 1', chapters: [] }];
  drafts = drafts.map((dr) => ({
    id: dr.id || uid(),
    name: dr.name || 'Draft',
    chapters: (dr.chapters || []).map((c) => fixDoc(c, 'chapter')),
  }));
  const activeDraftId = drafts.some((d) => d.id === data.activeDraftId) ? data.activeDraftId : drafts[0].id;
  // Unknown keys are kept, so a file written by a newer version keeps its data when an older one saves it.
  return {
    ...data,
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    title: data.title || 'Untitled',
    createdAt: data.createdAt || nowIso(),
    updatedAt: data.updatedAt || nowIso(),
    notes: { title: 'Notes', content: '', notes: '', inlineNotes: [], ...(data.notes || {}), id: 'notes' },
    outline: (data.outline || []).map((s) => fixDoc(s, 'section')),
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

export function findDoc(p, id) {
  if (!p || !id) return null;
  if (id === p.notes.id) return { doc: p.notes, kind: 'notes', index: 0 };
  const si = p.outline.findIndex((s) => s.id === id);
  if (si >= 0) return { doc: p.outline[si], kind: 'section', index: si };
  const chapters = activeDraft(p).chapters;
  const ci = chapters.findIndex((c) => c.id === id);
  if (ci >= 0) return { doc: chapters[ci], kind: 'chapter', index: ci };
  return null;
}

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

export function moveItem(list, from, to) {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to > from ? to - 1 : to, 0, item);
  return next;
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

export const manuscriptWords = (p) => activeDraft(p).chapters.reduce((n, c) => n + countWords(c.content), 0);

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
