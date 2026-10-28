// Takes and saved versions of a chapter.
//
// A chapter can have more than one take: other versions of its text to write in (a darker ending,
// another point of view). The take in the book is the chapter's own `content` and `inlineNotes`, so
// export, word counts and the story bible never look anywhere else; the other takes wait in `takes`
// as { id, name, content, inlineNotes, createdAt, updatedAt }. The take in the book keeps its id and
// name in `takeId` / `takeName`, and `ui.takes` remembers which take each chapter has open.
//
// `versions` are frozen copies of a take's text, newest first:
// { id, takeId, name, createdAt, content, inlineNotes, auto?, keep? }. Ones you save stay until you
// delete them. Automatic ones (one each time you sit down to write) thin out: after a few days only
// the last of each day is kept, and never more than AUTO_MAX per take. `keep` ones (a status change,
// a restore) are automatic but never thinned.

import { mapDoc, uid, todayKey } from './project.js';

const EMPTY = [];
const AUTO_DAYS = 3;
const AUTO_MAX = 40;

export const takeIdOf = (doc) => doc.takeId || 'main';
export const takeNameOf = (doc) => doc.takeName || 'Original';
export const hasTakes = (doc) => !!doc?.takes?.length;

// The text of one take; the chapter's own for the take in the book. Null if there's no such take.
export function takeText(doc, takeId) {
  if (!takeId || takeId === takeIdOf(doc)) {
    return {
      id: takeIdOf(doc),
      name: takeNameOf(doc),
      content: doc.content,
      inlineNotes: doc.inlineNotes || EMPTY,
      createdAt: doc.takeCreatedAt || doc.createdAt,
      inBook: true,
    };
  }
  const t = doc.takes?.find((x) => x.id === takeId);
  return t ? { ...t, inlineNotes: t.inlineNotes || EMPTY, inBook: false } : null;
}

// Every take, the one in the book first.
export const allTakes = (doc) => [takeText(doc), ...(doc.takes || []).map((t) => takeText(doc, t.id))];

export function openTakeId(p, doc) {
  const id = p.ui.takes?.[doc.id];
  return id && doc.takes?.some((t) => t.id === id) ? id : takeIdOf(doc);
}

// What the page shows: the open take of a chapter, or any other page's own text.
export const openText = (p, doc) => takeText(doc, openTakeId(p, doc));

export const withOpenTake = (p, docId, takeId) => ({ ...p, ui: { ...p.ui, takes: { ...(p.ui.takes || {}), [docId]: takeId } } });

// Change one take of page `id` (the open one when `takeId` is null): fn gets the take's text and
// returns the fields to change. Writing to a take that's gone does nothing.
export function mapText(p, id, takeId, fn) {
  return mapDoc(p, id, (d) => {
    const tid = takeId || openTakeId(p, d);
    if (tid === takeIdOf(d)) return { ...d, ...fn(takeText(d)) };
    const t = d.takes?.find((x) => x.id === tid);
    if (!t) return d;
    const patch = fn(takeText(d, tid));
    return { ...d, ...(patch.updatedAt ? { updatedAt: patch.updatedAt } : {}), takes: d.takes.map((x) => (x === t ? { ...x, ...patch } : x)) };
  });
}

// Make take `takeId` the one in the book; the one that was there joins the other takes in its place.
export function putInBook(doc, takeId) {
  const t = doc.takes?.find((x) => x.id === takeId);
  if (!t) return doc;
  const was = takeText(doc);
  const out = { id: was.id, name: was.name, content: was.content, inlineNotes: was.inlineNotes, createdAt: was.createdAt, updatedAt: doc.updatedAt };
  return {
    ...doc,
    takeId: t.id,
    takeName: t.name,
    takeCreatedAt: t.createdAt,
    content: t.content,
    inlineNotes: t.inlineNotes || [],
    takes: doc.takes.map((x) => (x === t ? out : x)),
  };
}

// ---------- saved versions ----------

export const versionsOf = (doc, takeId) => (doc.versions || EMPTY).filter((v) => (v.takeId || 'main') === takeId);

export function addVersion(doc, { takeId, name, content, inlineNotes, auto = false, keep = false, at = new Date() }) {
  if (auto && (!content.trim() || versionsOf(doc, takeId)[0]?.content === content)) return doc;
  const v = {
    id: uid(),
    takeId,
    name,
    createdAt: at.toISOString(),
    content,
    inlineNotes: inlineNotes || [],
    ...(auto ? { auto: true } : {}),
    ...(keep ? { keep: true } : {}),
  };
  return { ...doc, versions: thin([v, ...(doc.versions || [])], takeId, at) };
}

function thin(list, takeId, now) {
  const cutoff = now.getTime() - AUTO_DAYS * 86400000;
  const days = new Set();
  let autos = 0;
  return list.filter((v) => {
    if ((v.takeId || 'main') !== takeId || !v.auto || v.keep) return true;
    if (++autos > AUTO_MAX) return false;
    const t = Date.parse(v.createdAt);
    if (t >= cutoff) return true;
    const day = todayKey(new Date(t));
    if (days.has(day)) return false; // newest first, so the first one seen is the day's last
    days.add(day);
    return true;
  });
}

// The name of an automatic version saved when you sit down to write.
export function sessionName(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Morning session';
  if (h >= 12 && h < 17) return 'Afternoon session';
  if (h >= 17 && h < 22) return 'Evening session';
  return 'Late-night session';
}

// "Today, 2:14 PM", "Yesterday, 8:15 PM", "Oct 22, 8:15 PM", "Oct 22, 2025".
export function whenLabel(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = todayKey(d);
  if (day === todayKey()) return `Today, ${time}`;
  if (day === todayKey(new Date(Date.now() - 86400000))) return `Yesterday, ${time}`;
  if (d.getFullYear() === new Date().getFullYear()) return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// "today", "yesterday", "Oct 22", "Oct 22, 2025".
export function dayLabel(iso) {
  const d = new Date(iso);
  const day = todayKey(d);
  if (day === todayKey()) return 'today';
  if (day === todayKey(new Date(Date.now() - 86400000))) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
}

export const versionWhen = (v) => (v.auto ? `Saved automatically · ${whenLabel(v.createdAt)}` : whenLabel(v.createdAt));

// What a compare view is comparing the open take with: 'v:<version id>' or 't:<take id>'.
export function resolveAgainst(doc, against) {
  if (against?.startsWith('v:')) {
    const v = doc.versions?.find((x) => x.id === against.slice(2));
    return v ? { kind: 'version', ...v } : null;
  }
  if (against?.startsWith('t:')) {
    const t = takeText(doc, against.slice(2));
    return t ? { kind: 'take', ...t } : null;
  }
  return null;
}
