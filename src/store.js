import { useSyncExternalStore } from 'react';
import {
  normalizeProject,
  findDoc,
  mapDoc,
  mapActiveChapters,
  activeDraft,
  newDoc,
  countWords,
  todayKey,
  uid,
  parseImport,
  isFolder,
  chaptersOf,
  normalizeTree,
  subtreeRange,
  moveInTree,
  nudgeInTree,
  copyTree,
  kindOf,
  isBook,
  docName,
  newPage,
  homeId,
  sortEntries,
  splitDate,
  wordsFor,
  countOf,
  longDate,
  statusLabel,
} from './lib/project.js';
import {
  takeIdOf,
  takeText,
  openText,
  openTakeId,
  allTakes,
  mapText,
  withOpenTake,
  putInBook,
  addVersion,
  sessionName,
} from './lib/versions.js';
import { createBook, mirrorFolders, unmirrorFolders, renameLinked, applyStructure, mirrorOf } from './lib/structure.js';
import { exportMarkdown, exportChapterFiles, exportHtml, exportBookHtml, bookTypesetting, bookPageTotal, exportManuscriptHtml, buildEpub } from './lib/export.js';
import { typesetBook, typesetSummary } from './lib/typeset.js';
import { buildDocx } from './lib/docx.js';
import { normalizeSeries, candidatePaths, relativePath, dirOf, SERIES_FILE } from './lib/series.js';
import { noteRange, removeNoteMarks, applyAnchors } from './lib/inlineNotes.js';
import { matterOf } from './lib/matter.js';
import { findRegex, searchProject, replaceMatches, replaceAll, renameIn, renameChanges, applyChanges } from './lib/find.js';

const api = window.api;

// ---------- tiny external store ----------

let state = {
  ready: false,
  prefs: null,
  isDark: false,
  update: null, // see electron/updater.js
  path: null,
  project: null,
  save: { status: 'saved', error: null },
  // The series the open book belongs to: { path, data, siblings: { [bookUuid]: { path, title, chapters, bible, missing } } }
  series: null,
  library: null, // home screen listing, see refreshLibrary()
  libraryNonce: 0,
  bible: { tab: 'characters', scope: 'book', selected: null, noteTab: 'all', graphSel: null, graphMode: 'graph', focusName: null },
  smart: { status: null, verdicts: {}, presence: {}, relations: {}, progress: null },
  dictation: { status: null, session: null }, // see src/dictation.js
  sidebar: true,
  panel: true,
  panelTab: 'notes',
  focus: false,
  view: 'page', // 'page' | 'trash' | 'bible'
  modal: null,
  menu: null,
  toast: null,
  renamingId: null,
  focusTitleId: null,
  focusBodyId: null, // page whose text should take the cursor (a new journal entry)
  activeNoteId: null, // inline note under the cursor
  focusNoteId: null, // inline note whose text box should take focus
  compare: null, // { docId, against: 'v:<version id>' | 't:<take id>' } while comparing a chapter
  textRev: 0, // bumped when a page's text is replaced from outside its editor, so the editor reloads
  versionForm: null, // set to open the "Save version" form in the panel
  find: { query: '', replace: '', matchCase: false, wholeWord: false }, // the Find tab in the panel
  findFocus: 0, // bumped to put the cursor in the Find box
  findJump: null, // { docId, takeId, index } while the page opens on a match
};

const listeners = new Set();
export const getState = () => state;
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}
export const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useStore = (selector) => useSyncExternalStore(subscribe, () => selector(state));

// ---------- editors register a flush so pending keystrokes are never lost ----------

const flushers = new Set();
export function registerFlusher(fn) {
  flushers.add(fn);
  return () => flushers.delete(fn);
}
export function flushEditors() {
  for (const f of [...flushers]) f();
}

let mainEditor = null;
export const setMainEditor = (ed) => (mainEditor = ed);
export const getMainEditor = () => (mainEditor && !mainEditor.isDestroyed ? mainEditor : null);

// ---------- autosave ----------

let saveTimer = null;
let retryTimer = null;
let saving = false;
let dirty = false;

function setSave(status, error = null) {
  if (state.save.status !== status || state.save.error !== error) setState({ save: { status, error } });
}

function markDirty() {
  dirty = true;
  if (!saving) setSave('unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const { path, project } = state;
  if (!path || !project || !dirty) return;
  if (saving) {
    saveTimer = setTimeout(saveNow, 150);
    return;
  }
  saving = true;
  dirty = false;
  setSave('saving');
  let res;
  try {
    res = await api.saveProject(path, JSON.stringify(project));
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  saving = false;
  if (state.path !== path) return;
  if (!res.ok) {
    dirty = true;
    setSave('error', res.error || 'Could not save');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(saveNow, 5000);
  } else if (dirty) {
    saveTimer = setTimeout(saveNow, 300);
  } else if (!seriesDirty && !seriesSaving) {
    setSave('saved');
  }
}

// The series file saves on its own schedule, the same way.
let seriesTimer = null;
let seriesSaving = false;
let seriesDirty = false;

function markSeriesDirty() {
  seriesDirty = true;
  if (!seriesSaving) setSave('unsaved');
  clearTimeout(seriesTimer);
  seriesTimer = setTimeout(saveSeriesNow, 700);
}

export async function saveSeriesNow() {
  clearTimeout(seriesTimer);
  seriesTimer = null;
  const series = state.series;
  if (!series || !seriesDirty) return;
  if (seriesSaving) {
    seriesTimer = setTimeout(saveSeriesNow, 150);
    return;
  }
  seriesSaving = true;
  seriesDirty = false;
  let res;
  try {
    res = await api.saveSeries(series.path, JSON.stringify(series.data));
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  seriesSaving = false;
  if (!res.ok) {
    seriesDirty = true;
    setSave('error', res.error || 'Could not save the series');
    seriesTimer = setTimeout(saveSeriesNow, 5000);
  } else if (seriesDirty) {
    seriesTimer = setTimeout(saveSeriesNow, 300);
  } else if (!dirty && !saving) {
    setSave('saved');
  }
}

// Flush editors and wait until everything is on disk.
export async function settle() {
  flushEditors();
  for (let i = 0; i < 200 && (saving || dirty || seriesSaving || seriesDirty); i++) {
    if (!saving && dirty) await saveNow();
    else if (!seriesSaving && seriesDirty) await saveSeriesNow();
    else await new Promise((r) => setTimeout(r, 25));
  }
}

window.addEventListener('beforeunload', () => {
  flushEditors();
  if ((dirty || saving) && state.path && state.project) {
    api.saveProjectSync(state.path, JSON.stringify(state.project));
    dirty = false;
  }
  if ((seriesDirty || seriesSaving) && state.series) {
    api.saveSeriesSync(state.series.path, JSON.stringify(state.series.data));
    seriesDirty = false;
  }
});

export function commit(fn, { touch = true } = {}) {
  const p = state.project;
  if (!p) return;
  let next = fn(p);
  if (!next || next === p) return;
  if (touch) next = { ...next, updatedAt: new Date().toISOString() };
  setState({ project: next });
  markDirty();
}

// Change the series file's data (only when a series is loaded).
export function commitSeries(fn) {
  const sr = state.series;
  if (!sr) return;
  const next = fn(sr.data);
  if (!next || next === sr.data) return;
  setState({ series: { ...sr, data: { ...next, updatedAt: new Date().toISOString() } } });
  markSeriesDirty();
}

// ---------- toasts & modals ----------

let toastTimer = null;
export function toast(message, action) {
  clearTimeout(toastTimer);
  setState({ toast: { id: uid(), message, action } });
  toastTimer = setTimeout(() => setState({ toast: null }), action ? 6000 : 3500);
}

export function prompt({ title, label, value = '', confirm = 'Save' }) {
  return new Promise((resolve) => setState({ modal: { type: 'prompt', title, label, value, confirm, resolve } }));
}

export function closeModal(result) {
  const m = state.modal;
  setState({ modal: null });
  m?.resolve?.(result);
}

export const openModal = (type, extra) => setState({ modal: { type, ...extra }, menu: null });

// anchor: a DOMRect (menu opens below it) or {x, y} (opens at point)
export function openMenu(anchor, items, { align = 'left', width, content, className } = {}) {
  const pos =
    'width' in anchor
      ? { x: align === 'right' ? anchor.right : anchor.left, y: anchor.bottom + 4, align, avoidY: anchor.top }
      : { x: anchor.x, y: anchor.y, align: 'left' };
  setState({ menu: { ...pos, items, width, content, className } });
}

// Placed and dismissed like a menu, but holds any content instead of a list of items.
export const openPopover = (anchor, content, opts) => openMenu(anchor, [], { ...opts, content });
export const closeMenu = () => setState({ menu: null });

// ---------- prefs & layout ----------

export function setPrefs(patch) {
  setState((s) => ({ prefs: { ...s.prefs, ...patch } }));
  return api.setPrefs(patch);
}

// Smart features are an alpha feature: they only count when alpha features are on too.
export const smartActive = (prefs) => !!prefs?.alphaFeatures && !!prefs?.smartEnabled;

// The theme the prefs ask for, which can run a moment ahead of the screen while a fade plays.
export const wantsDark = (s) => (s.prefs?.theme === 'system' ? s.isDark : s.prefs?.theme === 'dark');

function paintTheme(prefs) {
  const root = document.documentElement;
  root.dataset.dark = prefs.darkStyle || 'dark';
  root.dataset.light = prefs.lightStyle || 'white';
}

const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Puts the latest theme prefs on screen. Light vs dark is the window's color scheme, which the main
// process sets, so this waits for the page to see it flip before calling the new look done.
async function applyTheme() {
  const { theme, darkStyle, lightStyle } = state.prefs;
  paintTheme(state.prefs);
  await api.setPrefs({ theme, darkStyle, lightStyle });
  const dark = await api.isDark();
  if (darkScheme.matches === dark) return;
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 500);
    darkScheme.addEventListener('change', () => (clearTimeout(t), resolve()), { once: true });
  });
}

// Theme changes crossfade from a snapshot of the old look. A change asked for mid-fade waits for
// that fade to end, then fades to whatever is newest, so dragging the slider never stutters.
let fading = false;
let fadeAgain = false;

export function setTheme(patch) {
  setState((s) => ({ prefs: { ...s.prefs, ...patch } }));
  if (fading) return void (fadeAgain = true);
  if (!document.startViewTransition || reduceMotion.matches) return void applyTheme();
  fading = true;
  document
    .startViewTransition(applyTheme)
    .finished.catch(() => {})
    .finally(() => {
      fading = false;
      if (fadeAgain) {
        fadeAgain = false;
        setTheme({});
      }
    });
}

export function toggleTheme() {
  setTheme({ theme: wantsDark(state) ? 'light' : 'dark' });
}

export function toggleSidebar() {
  const sidebar = !state.sidebar;
  setState({ sidebar });
  setPrefs({ sidebar });
}

export function togglePanel(tab) {
  const panel = tab && state.panel && state.panelTab !== tab ? true : !state.panel;
  setState({ panel, ...(tab ? { panelTab: tab } : {}) });
  setPrefs({ panel });
}

export const toggleFocus = () => setState({ focus: !state.focus, menu: null });

export function bumpFontSize(delta) {
  const size = Math.min(28, Math.max(13, (state.prefs.fontSize || 18) + delta));
  setPrefs({ fontSize: size });
}

// ---------- projects ----------

export async function openProjectAt(path, { quiet = false, view, bible } = {}) {
  if (SERIES_FILE.test(path)) return openSeriesFile(path, { quiet });
  if (state.path === path && state.project) {
    if (view) setState({ view, ...(bible ? { bible: { ...state.bible, ...bible } } : {}) });
    return true;
  }
  await settle();
  const res = await api.readProject(path);
  if (!res.ok) {
    if (!quiet) api.confirm({ type: 'warning', message: 'Could not open project', detail: res.error, buttons: ['OK'] });
    return false;
  }
  let project;
  try {
    project = normalizeProject(res.data);
  } catch (err) {
    if (!quiet) api.confirm({ type: 'warning', message: 'Could not open project', detail: err.message, buttons: ['OK'] });
    return false;
  }
  if (!findDoc(project, project.ui.openId) || (!isBook(project) && project.ui.openId === 'notes')) {
    project.ui.openId = isBook(project) ? chaptersOf(activeDraft(project))[0]?.id || 'notes' : homeId(project);
  }
  dirty = false;
  const series = await loadSeriesFor(path, project);
  seriesDirty = false;
  setState({
    path,
    project,
    series,
    save: { status: 'saved', error: null },
    view: view || 'page',
    bible: { ...state.bible, selected: null, graphSel: null, ...(bible || {}), ...(series ? {} : { scope: 'book' }) },
    modal: null,
    menu: null,
    toast: null,
    focus: false,
    compare: null,
  });
  if (series) fixSeriesLink(path, project, series.path);
  return true;
}

// ---------- series ----------

// Load the series a book belongs to, plus its sibling books (read-only), so the story bible can
// count who appears where across the whole series.
async function loadSeriesFor(bookPath, project) {
  if (!project.series) return null;
  let res = null;
  for (const p of candidatePaths(bookPath, project.series)) {
    res = await api.readSeries(p);
    if (res.ok) break;
  }
  if (!res?.ok) {
    toast('Couldn’t find this book’s series file, so only this book’s story bible is shown');
    return null;
  }
  let data;
  try {
    data = normalizeSeries(res.data);
  } catch {
    return null;
  }
  if (!data.books.some((b) => b.uuid === project.meta.uuid)) return null;
  return { path: res.path, data, siblings: await loadSiblings(res.path, data, project.meta.uuid) };
}

export async function loadSiblings(seriesPath, data, currentUuid) {
  const links = data.books.filter((b) => b.uuid !== currentUuid).map((b) => ({ uuid: b.uuid, candidates: candidatePaths(seriesPath, b) }));
  const siblings = {};
  for (const r of await api.loadSeriesBooks(links)) {
    if (!r.exists) {
      siblings[r.uuid] = { missing: true };
      continue;
    }
    try {
      const p = normalizeProject(r.data);
      siblings[r.uuid] = { path: r.path, title: p.title, chapters: chaptersOf(activeDraft(p)), bible: p.bible, missing: false };
    } catch {
      siblings[r.uuid] = { missing: true };
    }
  }
  return siblings;
}

// Swap in a project that was just written to disk by something else (joining or leaving a series).
export function adoptProject(project) {
  dirty = false;
  setState({ project });
}

export async function reloadSeries() {
  const { path, project } = state;
  if (!path || !project) return;
  await settle();
  const series = await loadSeriesFor(path, project);
  seriesDirty = false;
  setState({ series });
}

// Keep the relative links between a book and its series current if either file moved.
function fixSeriesLink(bookPath, project, seriesPath) {
  const rel = relativePath(dirOf(bookPath), seriesPath);
  if (project.series.path !== rel || project.series.abs !== seriesPath) {
    commit((p) => ({ ...p, series: { ...p.series, path: rel, abs: seriesPath } }), { touch: false });
  }
  const link = state.series.data.books.find((b) => b.uuid === project.meta.uuid);
  const bookRel = relativePath(dirOf(seriesPath), bookPath);
  if (link && (link.path !== bookRel || link.abs !== bookPath || link.title !== project.title)) {
    commitSeries((d) => ({ ...d, books: d.books.map((b) => (b.uuid === project.meta.uuid ? { ...b, path: bookRel, abs: bookPath, title: project.title } : b)) }));
  }
}

// Opening a .quillseries file: remember it and show it in the library.
async function openSeriesFile(path, { quiet } = {}) {
  const res = await api.readSeries(path);
  if (!res.ok) {
    if (!quiet) api.confirm({ type: 'warning', message: 'Could not open series', detail: res.error, buttons: ['OK'] });
    return false;
  }
  if (state.project) await closeProject();
  setState({ libraryNonce: Date.now() });
  return true;
}

export async function openProjectDialog() {
  const path = await api.chooseOpenProject();
  if (path) await openProjectAt(path);
}

// The extra step before a new project: a book (blank or from a story structure), or, unless `kinds`
// is false, a journal or notebook. Resolves to { kind, structure, mirror, chapters } (structure null
// for a blank book), or null if cancelled.
export const chooseStart = ({ kinds = true } = {}) =>
  new Promise((resolve) => setState({ modal: { type: 'structure', mode: 'new', kinds, resolve }, menu: null }));

// After a new project opens: a journal puts the cursor in the entry, a blank book or a notebook in the title.
export function focusNewBook(project) {
  if (kindOf(project) === 'journal') setState({ focusBodyId: project.ui.openId });
  else if (!project.outline.length) setState({ focusTitleId: project.ui.openId });
}

export const suggestedName = (start) => ({ journal: 'Journal', notebook: 'Notebook' })[start?.kind] || 'Untitled';

export async function newProject() {
  const start = await chooseStart();
  if (!start) return;
  const path = await api.chooseNewProject(suggestedName(start));
  if (!path) return;
  await settle();
  const title = path.split(/[\\/]/).pop().replace(/\.(quill|ldraft)$/i, '');
  const project = createBook(title, start);
  const res = await api.saveProject(path, JSON.stringify(project));
  if (!res.ok) {
    api.confirm({ type: 'warning', message: 'Could not create project', detail: res.error, buttons: ['OK'] });
    return;
  }
  setState({ path: null, project: null });
  await openProjectAt(path);
  focusNewBook(project);
}

export async function closeProject() {
  await settle();
  dirty = false;
  seriesDirty = false;
  setState({ path: null, project: null, series: null, view: 'page', modal: null, menu: null, toast: null, focus: false, compare: null });
  api.projectClosed();
}

export async function renameProject() {
  const title = await prompt({ title: 'Rename project', label: 'Project name', value: state.project.title, confirm: 'Rename' });
  if (!title || !title.trim()) return;
  commit((p) => ({ ...p, title: title.trim() }));
  api.projectRenamed(state.path, title.trim());
  const uuid = state.project.meta.uuid;
  commitSeries((d) => ({ ...d, books: d.books.map((b) => (b.uuid === uuid ? { ...b, title: title.trim() } : b)) }));
}

export async function saveCopy() {
  await settle();
  const where = await api.saveCopy(`${state.project.title} copy`, JSON.stringify(state.project));
  if (where) toast('Saved a copy');
}

export const revealProject = () => state.path && api.reveal(state.path);

// ---------- pages ----------

export function openDoc(id) {
  flushEditors();
  setState({ view: 'page', renamingId: null, activeNoteId: null, compare: null });
  if (state.project.ui.openId === id) return;
  commit((p) => ({ ...p, ui: { ...p.ui, openId: id } }), { touch: false });
}

function addDailyWords(p, delta) {
  if (!delta) return p;
  const k = todayKey();
  return { ...p, stats: { ...p.stats, daily: { ...p.stats.daily, [k]: (p.stats.daily[k] || 0) + delta } } };
}

export function updateDocField(id, field, value) {
  commit((p) => {
    const found = findDoc(p, id);
    if (!found || found.doc[field] === value) return p;
    let next = mapDoc(p, id, (d) => ({ ...d, [field]: value, updatedAt: new Date().toISOString() }));
    if (field === 'content' && found.kind === 'chapter') next = addDailyWords(next, countWords(value) - countWords(found.doc.content));
    if (field === 'title' && found.kind === 'folder') next = renameLinked(next, id, value);
    return next;
  });
}

// A chapter's take is saved as an automatic version when you start writing in it after a break.
const SESSION_GAP = 45 * 60 * 1000;
const lastWrite = new Map(); // `${docId}:${takeId}` -> when its text last changed

// Page text changed. `anchors` (if given) is where each inline note's passage now sits. `takeId` is
// the take the editor was showing (by default the open one).
export function updateDocContent(id, md, anchors, takeId) {
  const now = Date.now();
  let wrote = null;
  commit((p) => {
    const found = findDoc(p, id);
    if (!found) return p;
    const doc = takeText(found.doc, takeId || openText(p, found.doc).id);
    if (!doc) return p;
    let inlineNotes = doc.inlineNotes;
    if (anchors) {
      let changed = false;
      const synced = inlineNotes.map((n) => {
        const a = anchors[n.id];
        const next = a ? { ...n, ...a, detached: false } : { ...n, detached: true };
        if (next.quote !== n.quote || next.prefix !== n.prefix || next.suffix !== n.suffix || next.offset !== n.offset || !!next.detached !== !!n.detached) {
          changed = true;
          return next;
        }
        return n;
      });
      if (changed) inlineNotes = synced;
    }
    if (doc.content === md && inlineNotes === doc.inlineNotes) return p;
    let next = mapText(p, id, doc.id, () => ({ content: md, inlineNotes, updatedAt: new Date(now).toISOString() }));
    if (found.kind === 'chapter' && doc.content !== md) {
      wrote = `${id}:${doc.id}`;
      if (now - (lastWrite.get(wrote) || 0) > SESSION_GAP) {
        const v = { takeId: doc.id, name: sessionName(new Date(now)), content: doc.content, inlineNotes: doc.inlineNotes, auto: true, at: new Date(now) };
        next = mapDoc(next, id, (d) => addVersion(d, v));
      }
      next = addDailyWords(next, countWords(md) - countWords(doc.content));
    }
    return next;
  });
  if (wrote) lastWrite.set(wrote, now);
}

// ---------- notes on selected text ----------

export function addInlineNote() {
  const ed = getMainEditor();
  const p = state.project;
  if (!ed || !p || state.view !== 'page') return;
  const { from, to, empty } = ed.state.selection;
  if (empty) {
    toast('Select some text first, then add a note to it');
    return;
  }
  const id = uid();
  const docId = p.ui.openId;
  const note = { id, text: '', quote: ed.state.doc.textBetween(from, to, '\n'), createdAt: new Date().toISOString() };
  commit((proj) => mapText(proj, docId, null, (t) => ({ inlineNotes: [...t.inlineNotes, note] })));
  ed.chain().setMark('note', { id }).setTextSelection(to).run();
  editInlineNote(id);
}

// Open the notes panel with this note's text box focused.
export function editInlineNote(noteId) {
  setState({ panel: true, panelTab: 'notes', focusNoteId: noteId, activeNoteId: noteId });
  setPrefs({ panel: true });
}

export function updateInlineNote(docId, noteId, text) {
  commit((p) => mapText(p, docId, null, (t) => ({ inlineNotes: t.inlineNotes.map((n) => (n.id === noteId ? { ...n, text } : n)) })));
}

export function deleteInlineNote(docId, noteId) {
  const found = findDoc(state.project, docId);
  const text = found && openText(state.project, found.doc);
  const note = text?.inlineNotes.find((n) => n.id === noteId);
  if (!note) return;
  const index = text.inlineNotes.indexOf(note);
  commit((p) => mapText(p, docId, text.id, (t) => ({ inlineNotes: t.inlineNotes.filter((n) => n.id !== noteId) })));
  const ed = getMainEditor();
  if (ed && state.project.ui.openId === docId) removeNoteMarks(ed, [noteId]);
  toast('Note deleted', {
    label: 'Undo',
    run: () => {
      commit((p) => mapText(p, docId, text.id, (t) => ({ inlineNotes: [...t.inlineNotes.slice(0, index), note, ...t.inlineNotes.slice(index)] })));
      const e = getMainEditor();
      if (e && state.project.ui.openId === docId && !note.detached) applyAnchors(e, [note]);
    },
  });
}

export function jumpToNote(noteId) {
  const ed = getMainEditor();
  if (!ed) return;
  const r = noteRange(ed, noteId);
  if (!r) {
    toast('The text this note was attached to has been deleted');
    return;
  }
  ed.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(r.from).run();
  setState({ activeNoteId: noteId });
  const spans = ed.view.dom.querySelectorAll(`[data-note="${noteId}"]`);
  spans[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  spans.forEach((el) => {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
  });
}

// ---------- find and replace (see lib/find.js) ----------

export const setFind = (patch) => setState({ find: { ...state.find, ...patch } });

// ⌘F: the panel's Find tab, starting from the selected words if there are a few.
export function openFind() {
  if (!state.project) return;
  flushEditors();
  const ed = getMainEditor();
  let query = state.find.query;
  if (ed && state.view === 'page') {
    const { from, to, empty } = ed.state.selection;
    const picked = empty ? '' : ed.state.doc.textBetween(from, to, '\n');
    if (picked.trim() && picked.length <= 80 && !picked.includes('\n')) query = picked;
  }
  setState({ view: 'page', compare: null, panel: true, panelTab: 'find', find: { ...state.find, query }, findFocus: Date.now(), menu: null });
  setPrefs({ panel: true });
}

// Open the page a match is on (in the take it's in) and show that match.
export function jumpToMatch(docId, takeId, index) {
  flushEditors();
  const found = findDoc(state.project, docId);
  if (!found) return;
  if (found.kind === 'chapter' && openTakeId(state.project, found.doc) !== takeId) {
    commit((p) => withOpenTake(p, docId, takeId), { touch: false });
    setState({ textRev: state.textRev + 1 });
  }
  openDoc(docId);
  setState({ findJump: { docId, takeId, index, at: Date.now() } });
}

// Change the text of every page in `changes` (see applyChanges in lib/find.js). Not counted as
// writing. Returns what was there, for restorePages.
function rewritePages(changes, versionName, fixNotes) {
  const before = changes.map((c) => ({ docId: c.docId, takeId: c.takeId, content: c.was, inlineNotes: c.inlineNotes }));
  commit((p) => applyChanges(p, changes, versionName, fixNotes));
  setState({ textRev: state.textRev + 1 });
  return before;
}

function restorePages(before) {
  flushEditors();
  commit((p) => before.reduce((next, b) => mapText(next, b.docId, b.takeId, () => ({ content: b.content, inlineNotes: b.inlineNotes, updatedAt: nowIso() })), p));
  setState({ textRev: state.textRev + 1 });
}

const pagesLabel = (p, changes) => {
  const ids = new Set(changes.map((c) => c.docId));
  const chapters = new Set(changes.filter((c) => c.chapter).map((c) => c.docId)).size;
  return chapters === ids.size ? countOf(p, chapters) : `${ids.size} ${ids.size === 1 ? 'page' : 'pages'}`;
};

// Replace every match of the Find tab's search, except the ones in `skip` ("<target key>:<start>").
export function replaceInBook(skip = new Set()) {
  flushEditors();
  const { query, replace, matchCase, wholeWord } = state.find;
  const re = findRegex(query, { matchCase, wholeWord });
  const changes = searchProject(state.project, re)
    .map((g) => {
      const use = g.matches.filter((m) => !skip.has(`${g.key}:${m.start}`));
      return use.length ? { ...g, n: use.length, was: g.content, content: replaceMatches(g.content, use, replace) } : null;
    })
    .filter(Boolean);
  if (!changes.length) return;
  const n = changes.reduce((sum, c) => sum + c.n, 0);
  const before = rewritePages(changes, `Before replacing “${query}”`, (s) => replaceAll(s, re, replace));
  toast(`Replaced ${n.toLocaleString('en-US')} ${n === 1 ? 'match' : 'matches'} in ${pagesLabel(state.project, changes)}`, { label: 'Undo', run: () => restorePages(before) });
}

// Write a renamed entry's new name in place of its old ones ([{ from, to }]) all through the open book.
export function renameInBook(pairs, label) {
  flushEditors();
  const changes = renameChanges(state.project, pairs);
  if (!changes.length) return null;
  const before = rewritePages(changes, `Before renaming ${label}`, (s) => renameIn(s, pairs));
  return { n: changes.reduce((sum, c) => sum + c.n, 0), pages: pagesLabel(state.project, changes), undo: () => restorePages(before) };
}

// ---------- outline and manuscript lists (with folders) ----------

const listOf = (p, area) => (area === 'outline' ? p.outline : activeDraft(p).chapters);
const withList = (p, area, list) => (area === 'outline' ? { ...p, outline: list } : mapActiveChapters(p, () => list));

// Open folder `id` and every folder around it, so an item inside shows in the sidebar.
function revealIn(list, id) {
  const open = new Set();
  for (let d = list.find((x) => x.id === id); d; d = d.parent && list.find((x) => x.id === d.parent)) if (isFolder(d) && !d.open) open.add(d.id);
  return open.size ? list.map((d) => (open.has(d.id) ? { ...d, open: true } : d)) : list;
}

// New items go at the end of the folder the open page is in (or of the open folder itself),
// otherwise at the end of the list. `parent` overrides that: a folder id, or null for the top level.
function addItem(area, doc, parent) {
  if (!state.project) return;
  flushEditors();
  commit((p) => {
    let list = listOf(p, area);
    if (parent === undefined) {
      const open = list.find((d) => d.id === p.ui.openId);
      parent = open ? (isFolder(open) ? open.id : open.parent || null) : null;
    }
    const index = parent ? subtreeRange(list, parent)[1] : list.length;
    list = revealIn([...list.slice(0, index), { ...doc, parent }, ...list.slice(index)], doc.id);
    if (area === 'manuscript' && kindOf(p) === 'journal') list = sortEntries(list);
    let next = withList(p, area, list);
    // A folder made inside one that shows in the manuscript shows there too.
    if (area === 'outline' && isFolder(doc) && parent && mirrorOf(next, parent)) next = mirrorFolders(next, doc.id);
    return { ...next, ui: { ...p.ui, openId: doc.id, ...(area === 'outline' ? { outlineOpen: true } : {}) } };
  });
  setState({ view: 'page', ...(area === 'manuscript' && kindOf(state.project) === 'journal' ? { focusBodyId: doc.id } : { focusTitleId: doc.id }) });
}

const where = (inFolder) => (typeof inFolder === 'string' || inFolder === null ? inFolder : undefined);

// A new chapter, notebook page or journal entry. In a journal, an untouched entry from today is
// reused instead of starting a second empty one.
export function addChapter(inFolder) {
  const p = state.project;
  if (!p) return;
  if (kindOf(p) === 'journal') {
    const today = chaptersOf(activeDraft(p)).filter((c) => c.date === todayKey()).pop();
    if (today && !today.title.trim() && !today.content.trim()) {
      openDoc(today.id);
      return setState({ focusBodyId: today.id });
    }
  }
  addItem('manuscript', newPage(p), isBook(p) ? where(inFolder) : kindOf(p) === 'journal' ? null : where(inFolder));
}

// Move a journal entry to another day.
export function setEntryDate(id, date) {
  commit((p) => {
    const found = findDoc(p, id);
    if (!found || found.doc.date === date) return p;
    const moved = mapDoc(p, id, (d) => ({ ...d, date, updatedAt: new Date().toISOString() }));
    const closed = (p.ui.closedMonths || []).filter((m) => m !== date.slice(0, 7));
    return { ...mapActiveChapters(moved, sortEntries), ui: { ...p.ui, closedMonths: closed } };
  });
}

// Collapse or expand a month in a journal's list ("2026-10").
export function toggleMonth(month) {
  commit((p) => {
    const closed = p.ui.closedMonths || [];
    return { ...p, ui: { ...p.ui, closedMonths: closed.includes(month) ? closed.filter((m) => m !== month) : [...closed, month] } };
  }, { touch: false });
}
export const addSection = (inFolder) => addItem('outline', newDoc('section', 'Untitled section'), where(inFolder));
export const addFolder = (area, inFolder) => addItem(area, newDoc('folder', 'Untitled folder'), where(inFolder));

export function toggleOutline() {
  commit((p) => ({ ...p, ui: { ...p.ui, outlineOpen: !p.ui.outlineOpen } }), { touch: false });
}

export function toggleFolder(id) {
  commit((p) => mapDoc(p, id, (d) => ({ ...d, open: !d.open })), { touch: false });
}

export function duplicateDoc(id) {
  flushEditors();
  const found = findDoc(state.project, id);
  if (!found || found.kind === 'notes') return;
  commit((p) => {
    const list = listOf(p, found.area);
    const [start, end] = subtreeRange(list, id);
    const copies = copyTree(list.slice(start, end)).map((d) => (found.area === 'manuscript' && isFolder(d) ? { ...d, link: null } : d));
    copies[0] = { ...copies[0], title: `${found.doc.title} copy`, createdAt: new Date().toISOString() };
    return { ...withList(p, found.area, [...list.slice(0, end), ...copies, ...list.slice(end)]), ui: { ...p.ui, openId: copies[0].id } };
  });
}

// Move an item (and anything inside it) into folder `parent` (null: top level), before `beforeId` (null: at the end).
export function moveDoc(area, id, parent, beforeId) {
  commit((p) => {
    const list = listOf(p, area);
    const moved = moveInTree(list, id, parent, beforeId);
    return moved === list ? p : withList(p, area, parent ? revealIn(moved, parent) : moved);
  });
}

export function nudgeDoc(id, dir) {
  const found = findDoc(state.project, id);
  if (!found || found.kind === 'notes') return;
  commit((p) => {
    const list = listOf(p, found.area);
    const moved = nudgeInTree(list, id, dir);
    return moved === list ? p : withList(p, found.area, revealIn(moved, id));
  });
}

// Take the folder away but keep what was in it, one level up.
export function ungroupFolder(id) {
  const found = findDoc(state.project, id);
  if (found?.kind !== 'folder') return;
  flushEditors();
  commit((p) => {
    const list = listOf(p, found.area)
      .filter((d) => d.id !== id)
      .map((d) => (d.parent === id ? { ...d, parent: found.doc.parent || null } : d));
    const next = withList(p, found.area, normalizeTree(list));
    return p.ui.openId === id ? { ...next, ui: { ...next.ui, openId: list[found.index]?.id || homeId(next) } } : next;
  });
}

export function deleteDoc(id) {
  flushEditors();
  const p0 = state.project;
  const found = findDoc(p0, id);
  if (!found || found.kind === 'notes') return;
  const list0 = listOf(p0, found.area);
  const [start, end] = subtreeRange(list0, id);
  const entry = {
    id: uid(),
    kind: found.kind,
    area: found.area,
    draftId: p0.activeDraftId,
    index: found.index,
    doc: found.doc,
    ...(found.kind === 'folder' ? { docs: list0.slice(start, end) } : {}),
    deletedAt: new Date().toISOString(),
  };
  commit((p) => {
    const list = listOf(p, found.area);
    const gone = new Set(list0.slice(start, end).map((d) => d.id));
    const left = list.filter((d) => !gone.has(d.id));
    let next = { ...withList(p, found.area, left), trash: [entry, ...p.trash] };
    if (gone.has(p.ui.openId)) {
      const neighbor = left[Math.min(found.index, left.length - 1)];
      next.ui = { ...p.ui, openId: neighbor ? neighbor.id : homeId(next) };
    }
    return next;
  });
  const inside = end - start - 1;
  const what = `“${docName(found.doc)}”${inside ? ` and ${inside} item${inside === 1 ? '' : 's'} in it` : ''}`;
  toast(`Moved ${what} to trash`, { label: 'Undo', run: () => restoreTrash(entry.id) });
}

export function restoreTrash(entryId) {
  const entry = state.project?.trash.find((t) => t.id === entryId);
  if (!entry) return;
  commit((p) => {
    let next = { ...p, trash: p.trash.filter((t) => t.id !== entryId) };
    if (entry.kind === 'draft') {
      return { ...next, drafts: [...next.drafts, entry.draft], activeDraftId: entry.draft.id, ui: { ...next.ui, openId: chaptersOf(entry.draft)[0]?.id || 'notes' } };
    }
    // A take goes back to its chapter. If the chapter is gone too, it comes back as a chapter of its own.
    if (entry.kind === 'take') {
      const draft = next.drafts.find((d) => d.chapters.some((c) => c.id === entry.docId));
      if (draft) {
        next = { ...next, activeDraftId: draft.id };
        next = withOpenTake(mapDoc(next, entry.docId, (d) => ({ ...d, takes: [...(d.takes || []), entry.take] })), entry.docId, entry.take.id);
        return { ...next, ui: { ...next.ui, openId: entry.docId } };
      }
    }
    // The folder it was in may be gone too; then it comes back at the top level.
    const at = (list) => normalizeTree(revealIn([...list.slice(0, entry.index), ...(entry.docs || [entry.doc]), ...list.slice(entry.index)], entry.doc.id));
    if (entry.area === 'outline' || entry.kind === 'section') {
      next = { ...next, outline: at(next.outline), ui: { ...next.ui, outlineOpen: true } };
    } else {
      const draftId = next.drafts.some((d) => d.id === entry.draftId) ? entry.draftId : next.activeDraftId;
      next = { ...next, activeDraftId: draftId };
      next = mapActiveChapters(next, at);
      if (kindOf(next) === 'journal') next = mapActiveChapters(next, sortEntries);
    }
    return { ...next, ui: { ...next.ui, openId: entry.doc.id } };
  });
  setState({ view: 'page' });
}

export async function deleteForever(entryId) {
  const entry = state.project.trash.find((t) => t.id === entryId);
  if (!entry) return;
  const name = entry.kind === 'draft' ? entry.draft.name : docName(entry.doc);
  const ok = await api.confirm({
    type: 'warning',
    message: `Permanently delete “${name}”?`,
    detail: 'This can’t be undone.',
    buttons: ['Delete', 'Cancel'],
  });
  if (ok !== 0) return;
  commit((p) => ({ ...p, trash: p.trash.filter((t) => t.id !== entryId) }));
}

export async function emptyTrash() {
  const ok = await api.confirm({
    type: 'warning',
    message: `Permanently delete ${state.project.trash.length} item(s) in the trash?`,
    detail: 'This can’t be undone.',
    buttons: ['Empty Trash', 'Cancel'],
  });
  if (ok !== 0) return;
  commit((p) => ({ ...p, trash: [] }));
  setState({ view: 'page' });
}

export const showTrash = () => {
  flushEditors();
  setState({ view: 'trash', compare: null });
};

export function showBible(patch) {
  flushEditors();
  setState({ view: 'bible', renamingId: null, compare: null, ...(patch ? { bible: { ...state.bible, ...patch } } : {}) });
}

export const setBible = (patch) => setState({ bible: { ...state.bible, ...patch } });

export function showMatter() {
  flushEditors();
  setState({ view: 'matter', renamingId: null, compare: null });
}

// Front and back matter (lib/matter.js): change one page, `id`, of p.matter.
export function setMatter(id, patch) {
  commit((p) => {
    const m = matterOf(p);
    return { ...p, matter: { ...m, [id]: { ...m[id], ...patch } } };
  });
}

// Marking a chapter Drafted, Revised or Done keeps a copy of it as it was then.
export function setStatus(id, status) {
  flushEditors();
  const found = findDoc(state.project, id);
  if (found?.kind === 'chapter' && found.doc.status !== status && ['drafted', 'revised', 'done'].includes(status)) {
    commit((p) =>
      mapDoc(p, id, (d) => {
        const t = takeText(d);
        return addVersion(d, { takeId: t.id, name: `Marked “${statusLabel(status)}”`, content: t.content, inlineNotes: t.inlineNotes, auto: true, keep: true });
      })
    );
  }
  updateDocField(id, 'status', status);
}

// ---------- takes and saved versions (see lib/versions.js) ----------

const nowIso = () => new Date().toISOString();
const freshNotes = (notes) => notes.map((n) => ({ ...n, id: uid() }));

function chapterOf(docId) {
  const found = findDoc(state.project, docId);
  return found?.kind === 'chapter' ? found.doc : null;
}

// Replace a take's text from outside its editor (so the editor reloads it). Not counted as writing.
function setText(docId, takeId, content, inlineNotes) {
  commit((p) => mapText(p, docId, takeId, (t) => ({ content, inlineNotes: inlineNotes || t.inlineNotes, updatedAt: nowIso() })));
  setState({ textRev: state.textRev + 1 });
}

export function openTake(docId, takeId) {
  flushEditors();
  const doc = chapterOf(docId);
  if (doc && openTakeId(state.project, doc) === takeId) return setState({ view: 'page', compare: null });
  commit((p) => withOpenTake(p, docId, takeId), { touch: false });
  setState({ view: 'page', compare: null, activeNoteId: null, textRev: state.textRev + 1 });
}

export async function newTake(docId) {
  flushEditors();
  const doc = chapterOf(docId);
  if (!doc) return;
  const from = openText(state.project, doc);
  const name = await prompt({ title: 'New take', label: `Starts as a copy of “${from.name}”`, value: `Take ${allTakes(doc).length + 1}`, confirm: 'Create take' });
  if (!name || !name.trim()) return;
  const take = { id: uid(), name: name.trim(), content: from.content, inlineNotes: freshNotes(from.inlineNotes), createdAt: nowIso(), updatedAt: nowIso() };
  commit((p) => withOpenTake(mapDoc(p, docId, (d) => ({ ...d, takes: [...(d.takes || []), take] })), docId, take.id));
  setState({ view: 'page', compare: null, activeNoteId: null, textRev: state.textRev + 1 });
  toast(`Started “${take.name}”. The take in the book hasn’t changed.`);
}

export async function renameTake(docId, takeId) {
  const doc = chapterOf(docId);
  const t = doc && takeText(doc, takeId);
  if (!t) return;
  const name = await prompt({ title: 'Rename take', label: 'Take name', value: t.name, confirm: 'Rename' });
  if (!name || !name.trim()) return;
  commit((p) =>
    mapDoc(p, docId, (d) =>
      takeId === takeIdOf(d) ? { ...d, takeName: name.trim() } : { ...d, takes: d.takes.map((x) => (x.id === takeId ? { ...x, name: name.trim() } : x)) }
    )
  );
}

export function putTakeInBook(docId, takeId) {
  flushEditors();
  const doc = chapterOf(docId);
  if (!doc || !doc.takes?.some((t) => t.id === takeId)) return;
  const was = takeText(doc);
  commit((p) => withOpenTake(mapDoc(p, docId, (d) => putInBook(d, takeId)), docId, takeId));
  setState({ compare: null, textRev: state.textRev + 1 });
  toast(`“${takeText(doc, takeId).name}” is now the take in the book`, { label: 'Undo', run: () => putTakeInBook(docId, was.id) });
}

// To the trash, so it can come back. (An older Quillier restores it as a chapter of its own.)
export function deleteTake(docId, takeId) {
  flushEditors();
  const p0 = state.project;
  const found = findDoc(p0, docId);
  const take = found?.doc.takes?.find((t) => t.id === takeId);
  if (!take) return;
  const entry = {
    id: uid(),
    kind: 'take',
    area: 'manuscript',
    draftId: p0.activeDraftId,
    index: found.index + 1,
    docId,
    take,
    doc: { ...newDoc('chapter', `${found.doc.title || 'Untitled'} (${take.name})`), content: take.content, inlineNotes: take.inlineNotes || [] },
    deletedAt: nowIso(),
  };
  commit((p) => ({ ...mapDoc(p, docId, (d) => ({ ...d, takes: d.takes.filter((t) => t.id !== takeId) })), trash: [entry, ...p.trash] }));
  setState({ compare: null, textRev: state.textRev + 1 });
  toast(`Moved “${take.name}” to trash`, { label: 'Undo', run: () => restoreTrash(entry.id) });
}

// Save the open take as it is now. A blank name gets a plain one.
export function saveVersion(docId, name) {
  flushEditors();
  const doc = chapterOf(docId);
  if (!doc) return;
  const t = openText(state.project, doc);
  const label = name?.trim() || 'Saved version';
  commit((p) => mapDoc(p, docId, (d) => addVersion(d, { takeId: t.id, name: label, content: t.content, inlineNotes: t.inlineNotes })));
  toast(`Saved “${label}”`);
}

// Open the panel's "Save version" form (⌥⌘S).
export function startSaveVersion() {
  const found = state.project && findDoc(state.project, state.project.ui.openId);
  if (state.view !== 'page' || found?.kind !== 'chapter') return;
  setState({ panel: true, panelTab: 'versions', versionForm: Date.now() });
  setPrefs({ panel: true });
}

export async function renameVersion(docId, versionId) {
  const v = chapterOf(docId)?.versions?.find((x) => x.id === versionId);
  if (!v) return;
  const name = await prompt({ title: 'Rename version', label: 'Version name', value: v.name, confirm: 'Rename' });
  if (!name || !name.trim()) return;
  commit((p) => mapDoc(p, docId, (d) => ({ ...d, versions: d.versions.map((x) => (x.id === versionId ? { ...x, name: name.trim(), auto: false } : x)) })));
}

export function deleteVersion(docId, versionId) {
  const doc = chapterOf(docId);
  const index = doc?.versions?.findIndex((x) => x.id === versionId) ?? -1;
  if (index < 0) return;
  const v = doc.versions[index];
  commit((p) => mapDoc(p, docId, (d) => ({ ...d, versions: d.versions.filter((x) => x.id !== versionId) })));
  if (state.compare?.against === `v:${versionId}`) setState({ compare: null });
  toast(`Deleted “${v.name}”`, {
    label: 'Undo',
    run: () => commit((p) => mapDoc(p, docId, (d) => ({ ...d, versions: [...d.versions.slice(0, index), v, ...d.versions.slice(index)] }))),
  });
}

// Put a saved version back. What was there is kept as a version first, so nothing is lost.
export function restoreVersion(docId, versionId) {
  flushEditors();
  const doc = chapterOf(docId);
  const v = doc?.versions?.find((x) => x.id === versionId);
  if (!v) return;
  const target = takeText(doc, v.takeId) || openText(state.project, doc);
  const latest = (doc.versions || []).find((x) => (x.takeId || 'main') === target.id);
  const kept = latest?.content === target.content ? latest.name : 'Before restoring';
  commit((p) => {
    const saved = mapDoc(p, docId, (d) => addVersion(d, { takeId: target.id, name: 'Before restoring', content: target.content, inlineNotes: target.inlineNotes, auto: true, keep: true }));
    return withOpenTake(mapText(saved, docId, target.id, () => ({ content: v.content, inlineNotes: v.inlineNotes, updatedAt: nowIso() })), docId, target.id);
  });
  setState({ compare: null, textRev: state.textRev + 1 });
  toast(`Restored “${v.name}”. What you had is saved as “${kept}”.`, { label: 'Undo', run: () => setText(docId, target.id, target.content, target.inlineNotes) });
}

// From the compare view: the open take's text with some changes taken back.
export function takeOlderWording(docId, takeId, content, message) {
  const doc = chapterOf(docId);
  const before = doc && takeText(doc, takeId);
  if (!before) return;
  setText(docId, takeId, content);
  toast(message, { label: 'Undo', run: () => setText(docId, takeId, before.content, before.inlineNotes) });
}

export function openCompare(docId, against) {
  flushEditors();
  setState({ view: 'page', compare: { docId, against }, panel: true, panelTab: 'versions', menu: null });
}

export const closeCompare = () => setState({ compare: null });

// ---------- drafts ----------

function openMatchingChapter(p, prevDraft) {
  const found = findDoc({ ...p, activeDraftId: prevDraft }, p.ui.openId);
  const chapters = activeDraft(p).chapters;
  if (found?.area === 'manuscript') {
    const c = chapters[Math.min(found.index, chapters.length - 1)];
    return { ...p, ui: { ...p.ui, openId: c ? c.id : 'notes' } };
  }
  return p;
}

export function switchDraft(id) {
  flushEditors();
  commit((p) => openMatchingChapter({ ...p, activeDraftId: id }, p.activeDraftId), { touch: false });
}

export async function newDraft() {
  flushEditors();
  const p0 = state.project;
  const name = await prompt({ title: 'New draft', label: `Starts as a copy of “${activeDraft(p0).name}”`, value: `Draft ${p0.drafts.length + 1}`, confirm: 'Create draft' });
  if (!name || !name.trim()) return;
  commit((p) => {
    const src = activeDraft(p);
    const draft = { id: uid(), name: name.trim(), chapters: copyTree(src.chapters) };
    return openMatchingChapter({ ...p, drafts: [...p.drafts, draft], activeDraftId: draft.id }, p.activeDraftId);
  });
  toast(`Created ${name.trim()}`);
}

export async function renameDraft(id) {
  const d = state.project.drafts.find((x) => x.id === id);
  const name = await prompt({ title: 'Rename draft', label: 'Draft name', value: d.name, confirm: 'Rename' });
  if (!name || !name.trim()) return;
  commit((p) => ({ ...p, drafts: p.drafts.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)) }));
}

export function deleteDraft(id) {
  flushEditors();
  const p0 = state.project;
  if (p0.drafts.length < 2) return;
  const draft = p0.drafts.find((x) => x.id === id);
  const entry = { id: uid(), kind: 'draft', draft, deletedAt: new Date().toISOString() };
  commit((p) => {
    const drafts = p.drafts.filter((x) => x.id !== id);
    const next = { ...p, drafts, trash: [entry, ...p.trash] };
    if (p.activeDraftId !== id) return next;
    return openMatchingChapter({ ...next, activeDraftId: drafts[0].id }, id);
  });
  toast(`Moved “${draft.name}” to trash`, { label: 'Undo', run: () => restoreTrash(entry.id) });
}

// ---------- outline ↔ manuscript ----------

export function setShowInManuscript(outlineId, on) {
  flushEditors();
  if (on) return commit((p) => mirrorFolders(p, outlineId));
  let kept = 0;
  commit((p) => {
    const res = unmirrorFolders(p, outlineId);
    kept = res.kept;
    return res.project;
  });
  if (kept) toast(kept === 1 ? 'The manuscript folder stays, since there’s writing in it' : `${kept} manuscript folders stay, since there’s writing in them`);
}

export function linkFolder(id, outlineId) {
  const outline = state.project.outline.find((s) => s.id === outlineId);
  if (!outline) return;
  commit((p) => mapDoc(p, id, (d) => ({ ...d, link: outlineId, title: outline.title })));
}

export const unlinkFolder = (id) => commit((p) => mapDoc(p, id, (d) => ({ ...d, link: null, unlinked: d.link })));

export function toggleBeat(chapterId, beatId) {
  commit((p) =>
    mapDoc(p, chapterId, (d) => {
      const beats = d.beats || [];
      return { ...d, beats: beats.includes(beatId) ? beats.filter((b) => b !== beatId) : [...beats, beatId] };
    })
  );
}

export async function addStructure(parent = null) {
  const choice = await new Promise((resolve) => setState({ modal: { type: 'structure', mode: 'add', resolve }, menu: null }));
  if (!choice?.structure) return;
  flushEditors();
  commit((p) => {
    const next = applyStructure(p, choice.structure, { ...choice, parent });
    const first = next.outline.find((s) => !p.outline.includes(s) && !isFolder(s));
    return { ...next, outline: parent ? revealIn(next.outline, parent) : next.outline, ui: { ...next.ui, openId: first?.id || next.ui.openId, outlineOpen: true } };
  });
  setState({ view: 'page' });
}

// ---------- import / export ----------

export async function importManuscript() {
  if (!state.project) return;
  const files = await api.chooseImport();
  if (!files.length) return;
  const p0 = state.project;
  const journal = kindOf(p0) === 'journal';
  // A journal takes each entry's date from a file name or heading that starts with one ("2026-10-26 …").
  const chapters = parseImport(files).map((c) => {
    if (!journal) return { ...newPage(p0, c.title), content: c.content };
    const { date, title } = splitDate(c.title);
    return { ...newPage(p0, date ? title : c.title), content: c.content, ...(date ? { date } : {}) };
  });
  if (!chapters.length) return;
  flushEditors();
  commit((p) => {
    const next = mapActiveChapters(p, (cs) => {
      const blank = cs.length === 1 && !cs[0].content.trim() && !cs[0].notes.trim();
      const list = blank ? chapters : [...cs, ...chapters];
      return journal ? sortEntries(list) : list;
    });
    return { ...next, ui: { ...next.ui, openId: chapters[0].id } };
  });
  setState({ view: 'page' });
  toast(`Imported ${countOf(p0, chapters.length)}`);
}

export function setProjectMeta(patch) {
  commit((p) => ({ ...p, meta: { ...p.meta, ...patch } }));
}

// A journal exports each entry under its date (and title, if it has one).
function exportable(p) {
  if (kindOf(p) !== 'journal') return p;
  const title = (c) => [longDate(c.date), c.title.trim()].filter(Boolean).join(' — ');
  return mapActiveChapters(p, (cs) => cs.map((c) => (isFolder(c) ? c : { ...c, title: title(c) })));
}

// The rest of the series, for an "Also by" page: { title, books: [title] }, in series order.
export function otherBooksInSeries() {
  const sr = state.series;
  if (!sr) return null;
  const uuid = state.project.meta.uuid;
  return { title: sr.data.title, books: sr.data.books.filter((b) => b.uuid !== uuid).map((b) => sr.siblings?.[b.uuid]?.title || b.title) };
}

export async function exportManuscript(format, options) {
  await settle();
  const p = exportable(state.project);
  const opts = { ...options, series: otherBooksInSeries() };
  let where = null;
  if (format === 'md') where = await api.exportFile({ suggested: p.title, ext: 'md', content: exportMarkdown(p, opts) });
  if (format === 'folder') where = await api.exportFolder({ suggested: p.title, files: exportChapterFiles(p, opts) });
  if (format === 'html') where = await api.exportFile({ suggested: p.title, ext: 'html', content: exportHtml(p, opts) });
  let report = null;
  if (format === 'pdf') ({ where, report } = await exportBookPdf(p, opts));
  if (format === 'manuscript') where = await api.exportPdf({ suggested: `${p.title} (manuscript)`, html: exportManuscriptHtml(p, opts) });
  if (format === 'docx') where = await api.exportDocx({ suggested: `${p.title} (manuscript)`, files: buildDocx(p, opts) });
  if (format === 'epub') where = await api.exportEpub({ suggested: p.title, files: await buildEpub(p, opts) });
  if (where) toast(report ? typesetSummary(report) : `Exported ${wordsFor(p).whole.toLowerCase()}`);
  return where;
}

// The print-ready PDF. lib/typeset.js sets it when it can, and a print checks it came out the
// length it should; otherwise Chromium pages it, after a measuring print (see exportBookHtml).
async function exportBookPdf(p, opts) {
  let book = null;
  try {
    const set = await typesetBook(exportBookHtml(p, opts, { flow: true }), bookTypesetting(p, opts));
    if (set) {
      const html = exportBookHtml(p, opts, set);
      const printed = (await api.pdfPageWidths({ html })).length;
      const planned = bookPageTotal(p, opts, set.counts);
      if (printed === planned) book = { html, report: { ...set.report, total: planned } };
      else console.warn(`Typeset book printed to ${printed} pages, not ${planned}; letting Chromium page it`);
    }
  } catch (e) {
    console.warn('Typesetting failed; letting Chromium page the book', e);
  }
  if (!book) book = { html: exportBookHtml(p, opts, { widths: await api.pdfPageWidths({ html: exportBookHtml(p, opts) }) }), report: null };
  return { where: await api.exportPdf({ suggested: p.title, html: book.html }), report: book.report };
}

// ---------- updates ----------

export async function checkForUpdates() {
  setState({ update: await api.checkForUpdates() });
}

// ---------- menu commands ----------

const commands = {
  'new-chapter': () => addChapter(),
  'new-section': () => isBook(state.project) && addSection(),
  'new-project': newProject,
  'open-project': openProjectDialog,
  import: importManuscript,
  export: () => state.project && openModal('export'),
  'save-copy': () => state.project && saveCopy(),
  reveal: revealProject,
  'close-project': () => state.project && closeProject(),
  settings: () => openModal('settings'),
  'check-updates': () => {
    openModal('settings', { section: 'updates' });
    checkForUpdates();
  },
  'toggle-sidebar': () => state.project && toggleSidebar(),
  'toggle-panel': () => state.project && togglePanel(),
  'toggle-focus': () => state.project && toggleFocus(),
  'toggle-theme': toggleTheme,
  'font-bigger': () => bumpFontSize(1),
  'font-smaller': () => bumpFontSize(-1),
  'format-bold': () => getMainEditor()?.chain().focus().toggleBold().run(),
  'format-italic': () => getMainEditor()?.chain().focus().toggleItalic().run(),
  'scene-break': () => getMainEditor()?.chain().focus().setHorizontalRule().run(),
  'add-note': addInlineNote,
  'save-version': () => state.project && startSaveVersion(),
  find: openFind,
};

export function registerCommand(name, fn) {
  commands[name] = fn;
}

export function runCommand(name) {
  commands[name]?.();
}

// ---------- boot ----------

export async function init() {
  const [prefs, isDark, update] = await Promise.all([api.getPrefs(), api.isDark(), api.updateStatus()]);
  paintTheme(prefs);
  setState({ prefs, isDark, update, sidebar: prefs.sidebar ?? true, panel: prefs.panel ?? true });
  api.onMenu(runCommand);
  api.onOpenPath((p) => openProjectAt(p));
  api.onThemeChanged((dark) => setState({ isDark: dark }));
  api.onPrefsChanged((p) => setState({ prefs: p }));
  api.onUpdateStatus((update) => setState({ update }));
  const initial = await api.initialPath();
  if (initial) await openProjectAt(initial, { quiet: true });
  setState({ ready: true });
}
