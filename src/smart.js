// Optional smart features: a small local model reads the open book in the background.
//
// Nothing here is needed for the app to work, and nothing runs unless the writer turned on alpha
// features, downloaded a model and turned smart features on. Answers are remembered per book (in
// the app's own folder, never in the project file), so each passage is only read once.
//
//  - names:     is "May" here the character, or the month? (ambiguous uses only)
//  - presence:  is this character in the scene, or only mentioned?
//  - relation:  what are two characters who keep turning up together to each other?

import { getState, setState, subscribe, smartActive } from './store.js';
import {
  buildContext,
  analyze,
  passageAround,
  cleanMd,
  presenceKey,
  pairKey,
  scoped,
  pairs,
  suggestionsFrom,
  sceneCast,
  MONTHS,
} from './lib/bible.js';

const api = window.api;
const BATCH = 6;
const CACHE_VERSION = 2; // bump when the questions change, so old answers are dropped
const IDLE_MS = 2500;

let cache = null; // { book, model, verdicts, presence, relations }
let saveTimer = null;
let runTimer = null;
let running = false;
let stamp = 0; // bumps whenever the book changes, so a run in progress yields

const setSmart = (patch) => setState((s) => ({ smart: { ...s.smart, ...patch } }));

export function activeModel() {
  const { prefs, smart } = getState();
  if (!smartActive(prefs) || !smart.status) return null;
  const installed = (smart.status.models || []).filter((m) => m.installed);
  return (installed.find((m) => m.id === prefs.smartModel) || installed[installed.length - 1])?.id || null;
}

function publish() {
  if (!cache) return setSmart({ verdicts: {}, presence: {}, relations: {} });
  setSmart({ verdicts: { ...cache.verdicts }, presence: { ...cache.presence }, relations: { ...cache.relations } });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (cache) api.smartCacheSave(`book-${cache.book}`, cache);
  }, 1500);
}

async function ensureCache(book, model) {
  if (cache && cache.book === book && cache.model === model) return;
  if (cache) await api.smartCacheSave(`book-${cache.book}`, cache);
  const saved = await api.smartCacheLoad(`book-${book}`).catch(() => null);
  cache =
    saved && saved.model === model && saved.v === CACHE_VERSION
      ? { verdicts: {}, presence: {}, relations: {}, ...saved, book, model }
      : { v: CACHE_VERSION, book, model, verdicts: {}, presence: {}, relations: {} };
  publish();
}

// A few sentences around this character's first mentions in a scene.
function scenePassage(text, entry, matcher) {
  if (!matcher.re) return null;
  const parts = [];
  matcher.re.lastIndex = 0;
  let m;
  while ((m = matcher.re.exec(text)) && parts.length < 3) {
    if (matcher.map.get(m[0]) !== entry.id) continue;
    const p = passageAround(text, m.index, m.index + m[0].length, 360).passage;
    if (!parts.includes(p)) parts.push(p);
  }
  return parts.length ? parts.join(' … ').slice(0, 900) : null;
}

// Paragraphs where both characters are named.
function pairPassage(ctx, analysis, a, b) {
  const found = [];
  for (const book of ctx.books) {
    const matcher = analysis.books[book.uuid]?.matcher;
    if (!matcher?.re) continue;
    for (const ch of book.chapters) {
      for (const para of (ch.content || '').split(/\n\s*\n/)) {
        const ids = new Set();
        matcher.re.lastIndex = 0;
        let m;
        while ((m = matcher.re.exec(para))) ids.add(matcher.map.get(m[0]));
        if (ids.has(a.id) && ids.has(b.id)) found.push(cleanMd(para).trim());
        if (found.length === 2) return found.join('\n\n').slice(0, 900);
      }
    }
  }
  return found.length ? found.join('\n\n').slice(0, 900) : null;
}

function collectJobs() {
  const s = getState();
  const ctx = buildContext(s.project, s.series);
  const analysis = analyze(ctx, cache.verdicts);
  const cur = ctx.currentBook;
  const jobs = [];

  for (const h of analysis.ambiguous) {
    if (h.bookUuid !== ctx.uuid || h.key in cache.verdicts || cur.bible.decisions?.[h.key]) continue;
    const e = ctx.byId[h.entryId];
    if (!e) continue;
    const senses = [
      e.type === 'place' ? `${h.word}, a place in the story` : `${h.word}, a character in the story (a person)`,
      MONTHS.has(h.word) ? `the month of ${h.word}` : `the ordinary word "${h.word.toLowerCase()}"`,
    ];
    // Just the sentence, as in the measured tests: neighbouring sentences about the character pull
    // the answer toward "the character".
    jobs.push({ kind: 'names', key: h.key, item: { task: 'names', passage: h.sentence, word: h.word, senses } });
  }

  const book = analysis.books[ctx.uuid];
  for (const ch of book.chapters) {
    const content = cur.chapters[ch.index]?.content || '';
    for (const sc of ch.scenes) {
      for (const id of sceneCast(sc, ch.id, cur.bible, ctx.byId).who) {
        const key = presenceKey(ch.id, sc, id);
        if (key in cache.presence) continue;
        const passage = scenePassage(content.slice(sc.start, sc.end), ctx.byId[id], book.matcher);
        if (passage) jobs.push({ kind: 'presence', key, item: { task: 'presence', passage, person: ctx.byId[id].name } });
      }
    }
  }

  const seen = new Set();
  for (const scope of ctx.inSeries ? ['book', 'series'] : ['book']) {
    for (const p of suggestionsFrom(pairs(scoped(ctx, analysis, scope), analysis))) {
      const key = pairKey(p.a.id, p.b.id);
      if (seen.has(key) || key in cache.relations) continue;
      seen.add(key);
      const passage = pairPassage(ctx, analysis, p.a, p.b);
      if (passage) jobs.push({ kind: 'relation', key, item: { task: 'relation', a: p.a.name, b: p.b.name, passage } });
    }
  }
  // Same kind of question together, so the model can reuse its worked examples.
  const order = { names: 0, relation: 1, presence: 2 };
  return jobs.sort((x, y) => order[x.kind] - order[y.kind]);
}

function store(job, r) {
  if (job.kind === 'names') cache.verdicts[job.key] = r.probs?.[0] ?? 0.5;
  else if (job.kind === 'presence') cache.presence[job.key] = r.p ?? 0.5;
  else if (job.kind === 'relation') {
    let best = 0;
    (r.probs || []).forEach((p, i) => {
      if (p > r.probs[best]) best = i;
    });
    cache.relations[job.key] = { key: r.keys?.[best] || 'none', p: r.probs?.[best] || 0 };
  }
}

async function run() {
  const model = activeModel();
  const s = getState();
  if (!model || running || !s.project) return;
  running = true;
  const myStamp = stamp;
  try {
    await ensureCache(s.project.meta.uuid, model);
    const jobs = collectJobs();
    if (!jobs.length) return setSmart({ progress: null, error: null });
    // The first question loads the model (and, right after installing, macOS prepares it once).
    setSmart({ progress: { done: 0, total: jobs.length, book: s.project.title, warming: getState().smart.status?.loaded !== model }, error: null });
    for (let i = 0; i < jobs.length; i += BATCH) {
      if (stamp !== myStamp || activeModel() !== model || getState().project?.meta.uuid !== cache.book) break;
      const batch = jobs.slice(i, i + BATCH);
      const res = await api.smartAsk({ model, items: batch.map((j) => j.item) });
      if (!res?.ok) {
        setSmart({ error: res?.error || 'The model couldn’t answer.' });
        break;
      }
      res.results.forEach((r, k) => store(batch[k], r));
      publish();
      scheduleSave();
      setSmart({ progress: { done: Math.min(i + BATCH, jobs.length), total: jobs.length, book: s.project.title } });
    }
  } catch (err) {
    setSmart({ error: String(err?.message || err) });
  } finally {
    running = false;
    setSmart({ progress: null });
    // Edits came in while reading: go again once things are quiet.
    if (stamp !== myStamp) schedule();
  }
}

function schedule() {
  clearTimeout(runTimer);
  runTimer = setTimeout(run, IDLE_MS);
}

export async function initSmart() {
  if (!api.smartStatus) return;
  try {
    setSmart({ status: await api.smartStatus() });
  } catch {
    return; // runtime not available in this build
  }
  api.onSmartStatus((status) => {
    setSmart({ status });
    schedule();
  });
  let last = {};
  subscribe(() => {
    const s = getState();
    const now = { project: s.project, series: s.series, on: smartActive(s.prefs), model: s.prefs?.smartModel };
    if (now.project === last.project && now.series === last.series && now.on === last.on && now.model === last.model) return;
    const turnedOff = last.on && !now.on;
    last = now;
    stamp++;
    if (turnedOff || !activeModel()) {
      if (turnedOff) api.smartUnload();
      if (cache) {
        api.smartCacheSave(`book-${cache.book}`, cache);
        cache = null;
      }
      publish();
      return;
    }
    if (!now.project) return;
    schedule();
  });
}

// ---------- settings actions ----------

export const downloadModel = (id) => api.smartDownload(id).then((status) => setSmart({ status }));
export const cancelDownload = () => api.smartCancel().then((status) => setSmart({ status }));
export async function removeModel(id) {
  const ok = await api.confirm({ type: 'question', message: 'Delete this model?', detail: 'You can download it again any time.', buttons: ['Delete', 'Cancel'] });
  if (ok !== 0) return;
  setSmart({ status: await api.smartRemove(id) });
}
