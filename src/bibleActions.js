// Story bible editing, the library (home screen) and series management.
import {
  getState,
  setState,
  commit,
  commitSeries,
  toast,
  prompt,
  openModal,
  settle,
  openProjectAt,
  setBible,
  registerCommand,
  reloadSeries,
  adoptProject,
  chooseStart,
  focusNewBook,
  suggestedName,
} from './store.js';
import { newEntry, newRelationship, normalizeProject, defaultAliases } from './lib/project.js';
import { createBook } from './lib/structure.js';
import { createSeries, normalizeSeries, mergeIntoSeries, removeFromSeries, numberedCount, baseName, dirOf, SERIES_FILE } from './lib/series.js';
import { buildContext, analyze } from './lib/bible.js';

const api = window.api;
const nowIso = () => new Date().toISOString();

// ---------- where things are stored ----------

function storeOf(id) {
  const s = getState();
  if (s.project?.bible.entries.some((e) => e.id === id)) return 'book';
  if (s.series?.data.bible.entries.some((e) => e.id === id)) return 'series';
  return null; // another book's entry: read-only from here
}

function relStoreOf(id) {
  const s = getState();
  if (s.project?.bible.relationships.some((r) => r.id === id)) return 'book';
  if (s.series?.data.bible.relationships.some((r) => r.id === id)) return 'series';
  return null;
}

const bibleOf = (s, store) => (store === 'book' ? s.project?.bible : store === 'series' ? s.series?.data.bible : null);

function putBible(store, bible) {
  if (store === 'book') commit((p) => ({ ...p, bible }));
  else commitSeries((d) => ({ ...d, bible }));
}

// Apply fn to the bible ({ entries, relationships, … }) in the given store. Every change goes
// through here so it can be undone. `tag` names a field being edited: repeated edits to the same
// one (typing a name, dragging a node) within a moment undo as one step.
function editBible(store, fn, tag) {
  const before = bibleOf(getState(), store);
  if (!before) return;
  const next = fn(before);
  if (!next || next === before) return;
  record(store, before, tag);
  putBible(store, next);
}

// ---------- undo ----------

// Each step keeps the bibles as they were before it. Everything changed in one go (deleting an
// entry and its relationships, moving one to the series) is a single step. Text in the notes
// editor and in input fields keeps its own undo while it has focus.
const history = { key: null, past: [], future: [] };
let recording = null;
const historyKey = (s) => `${s.project?.meta?.uuid || ''}|${s.series?.data?.uuid || ''}`;

function record(store, before, tag) {
  const key = historyKey(getState());
  if (history.key !== key) Object.assign(history, { key, past: [], future: [] });
  const now = Date.now();
  if (!recording) {
    const last = history.past[history.past.length - 1];
    if (tag && last?.tag === tag && now - last.at < 1500 && !history.future.length) recording = last;
    else {
      recording = { before: {}, tag, at: now };
      history.past.push(recording);
      if (history.past.length > 200) history.past.shift();
    }
    history.future = [];
    queueMicrotask(() => (recording = null));
  }
  if (!(store in recording.before)) recording.before[store] = before;
  recording.at = now;
}

function swap(from, to) {
  const s = getState();
  if (history.key !== historyKey(s) || !from.length) return false;
  const step = from.pop();
  const current = {};
  for (const store of Object.keys(step.before)) {
    current[store] = bibleOf(s, store);
    if (current[store]) putBible(store, step.before[store]);
  }
  to.push({ before: current, tag: null, at: 0 });
  recording = null;
  return true;
}

export const undoBible = () => swap(history.past, history.future);
export const redoBible = () => swap(history.future, history.past);

const mapEntry = (id, fn) => (b) => ({ ...b, entries: b.entries.map((e) => (e.id === id ? fn(e) : e)) });
const mapRel = (id, fn) => (b) => ({ ...b, relationships: b.relationships.map((r) => (r.id === id ? fn(r) : r)) });

// ---------- entries ----------

export function addEntry(type, { name = '', scope } = {}) {
  const s = getState();
  const toSeries = !!s.series && (scope || s.bible.scope) === 'series';
  const e = newEntry(type, name);
  editBible(toSeries ? 'series' : 'book', (b) => ({ ...b, entries: [...b.entries, e] }));
  setBible({ tab: type === 'place' ? 'places' : 'characters', selected: e.id, noteTab: 'all', focusName: e.id });
  setState({ view: 'bible' });
  return e;
}

export function updateEntry(id, patch, tag = `entry:${id}:${Object.keys(patch).sort()}`) {
  editBible(storeOf(id), mapEntry(id, (e) => ({ ...e, ...patch, updatedAt: nowIso() })), tag);
}

// Rename, and keep the automatic first-name alias ("Maren" for "Maren Holt") in step until the
// writer edits the aliases themselves.
export function renameEntry(id, name) {
  const s = getState();
  const e = [...(s.project?.bible.entries || []), ...(s.series?.data.bible.entries || [])].find((x) => x.id === id);
  if (!e) return;
  const auto = e.autoAlias !== false && (!e.aliases.length || (e.aliases.length === 1 && e.aliases[0] === defaultAliases(e.name, e.type)[0]));
  updateEntry(id, auto ? { name, aliases: defaultAliases(name, e.type) } : { name }, `name:${id}`);
}

export const setAliases = (id, aliases) => updateEntry(id, { aliases, autoAlias: false });

// notes for 'all' books (the overview) or one book of the series.
export function setEntryNotes(id, book, text) {
  editBible(
    storeOf(id),
    mapEntry(id, (e) => (book === 'all' ? { ...e, notes: text, updatedAt: nowIso() } : { ...e, perBook: { ...e.perBook, [book]: text }, updatedAt: nowIso() })),
    `notes:${id}:${book}`
  );
}

export function deleteEntry(id) {
  const store = storeOf(id);
  if (!store) return;
  const s = getState();
  const bible = store === 'book' ? s.project.bible : s.series.data.bible;
  const index = bible.entries.findIndex((e) => e.id === id);
  const entry = bible.entries[index];
  const touching = (b) => b.relationships.filter((r) => r.a === id || r.b === id);
  const relsHere = touching(bible);
  const relsInBook = store === 'series' ? touching(s.project.bible) : [];
  editBible(store, (b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id), relationships: b.relationships.filter((r) => r.a !== id && r.b !== id) }));
  if (relsInBook.length) editBible('book', (b) => ({ ...b, relationships: b.relationships.filter((r) => r.a !== id && r.b !== id) }));
  if (getState().bible.selected === id) setBible({ selected: null });
  toast(`Deleted “${entry.name || 'Untitled'}”`, {
    label: 'Undo',
    run: () => {
      if (bibleOf(getState(), store)?.entries.some((e) => e.id === id)) return; // already undone
      editBible(store, (b) => ({ ...b, entries: [...b.entries.slice(0, index), entry, ...b.entries.slice(index)], relationships: [...b.relationships, ...relsHere] }));
      if (relsInBook.length) editBible('book', (b) => ({ ...b, relationships: [...b.relationships, ...relsInBook] }));
      setBible({ selected: id });
    },
  });
}

// A book-only entry becomes part of the series bible. Relationships that now join two series
// entries move with it.
export function promoteEntry(id) {
  const s = getState();
  if (!s.series || storeOf(id) !== 'book') return;
  const entry = s.project.bible.entries.find((e) => e.id === id);
  const seriesIds = new Set([...s.series.data.bible.entries.map((e) => e.id), id]);
  const moving = s.project.bible.relationships.filter((r) => seriesIds.has(r.a) && seriesIds.has(r.b));
  const uuid = s.project.meta.uuid;
  editBible('series', (b) => ({ ...b, entries: [...b.entries, entry], relationships: [...b.relationships, ...moving.map((r) => ({ ...r, books: [uuid] }))] }));
  const movingIds = new Set(moving.map((r) => r.id));
  editBible('book', (b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id), relationships: b.relationships.filter((r) => !movingIds.has(r.id)) }));
  toast(`${entry.name || 'This entry'} is now in the series bible`);
}

export const setEntryPos = (id, pos) => editBible(storeOf(id), mapEntry(id, (e) => ({ ...e, pos })), `pos:${id}`);

// ---------- relationships ----------

export function addRelationship(a, b, label = '') {
  const s = getState();
  const sa = storeOf(a);
  const sb = storeOf(b);
  if (!sa || !sb) {
    toast('Open that book to connect its own characters');
    return null;
  }
  const r = newRelationship(a, b, label);
  if (sa === 'series' && sb === 'series') {
    if (s.bible.scope === 'book') r.books = [s.project.meta.uuid];
    editBible('series', (bible) => ({ ...bible, relationships: [...bible.relationships, r] }));
  } else {
    editBible('book', (bible) => ({ ...bible, relationships: [...bible.relationships, r] }));
  }
  setBible({ tab: 'relationships', graphSel: { kind: 'rel', id: r.id } });
  return r;
}

export const updateRelationship = (id, patch) => editBible(relStoreOf(id), mapRel(id, (r) => ({ ...r, ...patch })), `rel:${id}:${Object.keys(patch).sort()}`);

export const updateRelBook = (id, book, patch) =>
  editBible(relStoreOf(id), mapRel(id, (r) => ({ ...r, byBook: { ...r.byBook, [book]: { ...(r.byBook[book] || {}), ...patch } } })), `rel:${id}:${book}:${Object.keys(patch).sort()}`);

// Which books of the series a relationship applies to. `current` is what applies now (the explicit
// list, or the books where both characters appear when none is listed).
export function toggleRelBook(id, book, current) {
  editBible(
    relStoreOf(id),
    mapRel(id, (r) => {
      const next = current.includes(book) ? current.filter((x) => x !== book) : [...current, book];
      return { ...r, books: next.length ? next : [book] };
    })
  );
}

export function deleteRelationship(id) {
  const store = relStoreOf(id);
  if (!store) return;
  const s = getState();
  const bible = store === 'book' ? s.project.bible : s.series.data.bible;
  const rel = bible.relationships.find((r) => r.id === id);
  editBible(store, (b) => ({ ...b, relationships: b.relationships.filter((r) => r.id !== id) }));
  setBible({ graphSel: null });
  toast('Relationship deleted', {
    label: 'Undo',
    run: () => {
      if (bibleOf(getState(), store)?.relationships.some((r) => r.id === id)) return; // already undone
      editBible(store, (b) => ({ ...b, relationships: [...b.relationships, rel] }));
      setBible({ graphSel: { kind: 'rel', id } });
    },
  });
}

// ---------- scenes, decisions, dismissed notes (always the open book) ----------

export function setSceneMeta(chapterId, index, opens, patch) {
  editBible('book', (b) => {
    const list = [...(b.scenes[chapterId] || [])];
    const at = list[index] && list[index].opens === opens ? index : list.findIndex((x) => x && x.opens === opens);
    const i = at >= 0 ? at : index;
    list[i] = { ...(at >= 0 ? list[at] : {}), opens, ...patch };
    return { ...b, scenes: { ...b.scenes, [chapterId]: list } };
  });
}

export function setDecision(key, value) {
  editBible('book', (b) => {
    const decisions = { ...b.decisions };
    if (value) decisions[key] = value;
    else delete decisions[key];
    return { ...b, decisions };
  });
}

export function dismissNote(key) {
  editBible('book', (b) => ({ ...b, dismissed: [...new Set([...b.dismissed, key])] }));
}

// ---------- library ----------

export async function refreshLibrary() {
  setState({ library: await api.library() });
}

export async function newBook() {
  const start = await chooseStart();
  if (!start) return;
  const path = await api.chooseNewProject(suggestedName(start));
  if (!path) return;
  const project = createBook(baseName(path).replace(/\.(quill|ldraft)$/i, ''), start);
  const res = await api.writeTogether([{ path, json: JSON.stringify(project) }], 'new');
  if (!res.ok) return api.confirm({ type: 'warning', message: 'Could not create the book', detail: res.error, buttons: ['OK'] });
  await openProjectAt(path);
  focusNewBook(project);
}

export async function newSeries() {
  await settle();
  const path = await api.chooseNewSeries('Untitled series');
  if (!path) return;
  const data = createSeries(baseName(path).replace(SERIES_FILE, ''));
  const res = await api.writeTogether([{ path, json: JSON.stringify(data) }], 'new');
  if (!res.ok) return api.confirm({ type: 'warning', message: 'Could not create the series', detail: res.error, buttons: ['OK'] });
  if (getState().project) toast(`Created ${data.title}. Add books to it from the library.`);
  await refreshLibrary();
}

async function readSeries(path) {
  const res = await api.peekProject(path);
  if (!res.ok) throw new Error(res.error);
  return normalizeSeries(res.data);
}

async function readBook(path) {
  const s = getState();
  if (s.path === path && s.project) return s.project;
  const res = await api.peekProject(path);
  if (!res.ok) throw new Error(res.error);
  return normalizeProject(res.data);
}

async function writeAll(files, reason) {
  const res = await api.writeTogether(
    files.map((f) => ({ path: f.path, json: JSON.stringify(f.data) })),
    reason
  );
  if (!res.ok) api.confirm({ type: 'warning', message: 'Could not save the change', detail: res.error, buttons: ['OK'] });
  return res.ok;
}

// After changing a series file on disk, bring the open book (if it's in it) up to date.
async function afterSeriesChange(seriesPath) {
  const s = getState();
  if (s.series?.path === seriesPath) await reloadSeries();
  if (!s.project) await refreshLibrary();
}

async function changeSeries(seriesPath, fn) {
  await settle();
  try {
    const data = fn(await readSeries(seriesPath));
    if (!data) return;
    if (await writeAll([{ path: seriesPath, data: { ...data, updatedAt: nowIso() } }], 'before-change')) await afterSeriesChange(seriesPath);
  } catch (err) {
    api.confirm({ type: 'warning', message: 'Could not update the series', detail: String(err.message || err), buttons: ['OK'] });
  }
}

export async function newBookInSeries(seriesPath) {
  await settle();
  let series;
  try {
    series = await readSeries(seriesPath);
  } catch (err) {
    return api.confirm({ type: 'warning', message: 'Could not open the series', detail: String(err.message || err), buttons: ['OK'] });
  }
  const start = await chooseStart({ kinds: false });
  if (!start) return;
  const bookPath = await api.chooseNewProject(`${series.title} ${numberedCount(series.books) + 1}`, dirOf(seriesPath));
  if (!bookPath) return;
  const project = createBook(baseName(bookPath).replace(/\.(quill|ldraft)$/i, ''), start);
  const out = mergeIntoSeries({ book: project, bookPath, series, seriesPath, position: 'after' });
  if (!(await writeAll([{ path: seriesPath, data: out.series }, { path: bookPath, data: out.book }], 'new-book'))) return;
  await openProjectAt(bookPath);
  focusNewBook(out.book);
}

export async function openSeriesBible(item) {
  const pick = [...item.books].filter((b) => b.exists).sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0))[0];
  if (!pick) return toast('Add a book to this series first');
  await openProjectAt(pick.path, { view: 'bible', bible: { scope: 'series', tab: 'characters' } });
}

export async function renameSeries(seriesPath, current) {
  const title = await prompt({ title: 'Rename series', label: 'Series name', value: current, confirm: 'Rename' });
  if (!title || !title.trim()) return;
  if (getState().series?.path === seriesPath) return commitSeries((d) => ({ ...d, title: title.trim() }));
  await changeSeries(seriesPath, (d) => ({ ...d, title: title.trim() }));
}

export async function moveBookInSeries(seriesPath, uuid, dir) {
  await changeSeries(seriesPath, (d) => {
    const i = d.books.findIndex((b) => b.uuid === uuid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.books.length) return null;
    const books = d.books.slice();
    [books[i], books[j]] = [books[j], books[i]];
    return { ...d, books };
  });
}

export async function setBookKind(seriesPath, uuid, kind) {
  await changeSeries(seriesPath, (d) => ({ ...d, books: d.books.map((b) => (b.uuid === uuid ? { ...b, kind } : b)) }));
}

// Take a book back out of its series. Series entries it uses are copied into it, with its own
// notes folded in, so it stands on its own.
export async function takeOutOfSeries(seriesPath, uuid, bookPath) {
  const ok = await api.confirm({
    type: 'question',
    message: 'Take this book out of the series?',
    detail: 'Characters and places it uses are copied into the book, with their notes. The series keeps its own copies.',
    buttons: ['Take out', 'Cancel'],
  });
  if (ok !== 0) return;
  await settle();
  try {
    const series = await readSeries(seriesPath);
    const book = await readBook(bookPath);
    const ctx = buildContext(book, { path: seriesPath, data: series, siblings: {} });
    const totals = analyze(ctx).totals;
    const used = series.bible.entries.filter((e) => (totals[e.id]?.[uuid] || 0) > 0).map((e) => e.id);
    const out = removeFromSeries({ book, series, used });
    if (!(await writeAll([{ path: seriesPath, data: out.series }, { path: bookPath, data: out.book }], 'before-series'))) return;
    if (getState().path === bookPath) {
      adoptProject(out.book);
      setState({ series: null, bible: { ...getState().bible, scope: 'book' } });
    } else await afterSeriesChange(seriesPath);
    toast(`${book.title} is a standalone book again`);
  } catch (err) {
    api.confirm({ type: 'warning', message: 'Could not take the book out', detail: String(err.message || err), buttons: ['OK'] });
  }
}

export async function removeFromLibrary(path) {
  await api.removeFromLibrary(path);
  await refreshLibrary();
}

// ---------- adding a book to a series ----------

export async function startAddToSeries(bookPath) {
  await settle();
  setState({ library: await api.library() });
  openModal('addToSeries', { bookPath: bookPath || getState().path });
}

export const readBookForMerge = readBook;
export const readSeriesForMerge = readSeries;

export async function chooseNewSeriesFor(book, bookPath) {
  const path = await api.chooseNewSeries(`${book.title} series`, dirOf(bookPath));
  if (!path) return null;
  return { path, series: createSeries(baseName(path).replace(SERIES_FILE, '')) };
}

export async function confirmAddToSeries({ book, bookPath, series, seriesPath, position, choices }) {
  await settle();
  // Re-read the book if it's open, in case anything was typed since the review started.
  const current = getState().path === bookPath ? getState().project : book;
  const out = mergeIntoSeries({ book: current, bookPath, series, seriesPath, position, choices });
  if (!(await writeAll([{ path: seriesPath, data: out.series }, { path: bookPath, data: out.book }], 'before-series'))) return false;
  if (getState().path === bookPath) {
    adoptProject(out.book);
    await reloadSeries();
  } else {
    setState({ libraryHighlight: current.meta.uuid });
    await refreshLibrary();
  }
  const where = position === 'prequel' ? 'the prequel to' : position === 'companion' ? 'a companion to' : 'part of';
  toast(`${current.title} is now ${where} ${series.title}. ${out.merged} ${out.merged === 1 ? 'entry' : 'entries'} merged.`);
  return true;
}

registerCommand('new-series', newSeries);
