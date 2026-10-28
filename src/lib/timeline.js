// When each scene happens in the story, and whose point of view it's told from.
//
// Both are pinned by hand in a scene's notes (bible.scenes, see sceneMeta in lib/bible.js):
// `when` is { day, time } in story days ("Day 3, evening") or { date, time } in calendar dates,
// whichever the book uses (bible.timeline.mode), and `pov` is a character's entry id. Nothing is
// guessed, so the checks below only speak up about things the writer has said.

import { isDayKey, dayOf, AGES } from './project.js';
import { sceneCast } from './bible.js';

export const TIMES = [
  { id: 'dawn', label: 'Dawn' },
  { id: 'morning', label: 'Morning' },
  { id: 'midday', label: 'Midday' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];
const timeIndex = (id) => TIMES.findIndex((t) => t.id === id);

export const timelineMode = (bible) => (bible?.timeline?.mode === 'date' ? 'date' : 'day');

// A key that sorts scenes in story order, or null if the scene has no time in this mode. A day
// with no time of day set sorts before that day's dawn.
export function whenKey(when, mode) {
  if (!when) return null;
  const t = String(timeIndex(when.time) + 1);
  if (mode === 'date') return isDayKey(when.date) ? `${when.date}|${t}` : null;
  return Number.isInteger(when.day) ? `${String(when.day + 100000).padStart(7, '0')}|${t}` : null;
}

// The day alone, for grouping: "Day 3", or the date written out.
export function dayLabel(when, mode, { short = false } = {}) {
  if (mode === 'date') return isDayKey(when?.date) ? dayOf(when.date).toLocaleDateString(undefined, { month: short ? 'short' : 'long', day: 'numeric', year: 'numeric' }) : '';
  return Number.isInteger(when?.day) ? `Day ${when.day}` : '';
}

// "Day 3 · Evening", "Mar 2, 1888 · Evening", or null.
export function whenLabel(when, mode) {
  const d = dayLabel(when, mode, { short: true });
  if (!d) return null;
  const t = TIMES[timeIndex(when.time)];
  return t ? `${d} · ${t.label}` : d;
}

// Every scene of one book (its chapters as lib/bible.js's analyze() sees them), in reading order,
// with what's known about it.
export function bookScenes(book, chapters, byId) {
  const mode = timelineMode(book.bible);
  const out = [];
  for (const ch of chapters) {
    for (const sc of ch.scenes) {
      const cast = sceneCast(sc, ch.id, book.bible, byId);
      const when = cast.meta?.when || null;
      const pov = cast.meta?.pov && byId[cast.meta.pov]?.type === 'character' ? cast.meta.pov : null;
      out.push({ book, ch, sc, cast, when, key: whenKey(when, mode), pov, read: out.length });
    }
  }
  return out;
}

// Story order: the scenes with a time, sorted (reading order breaks ties), and the rest. A placed
// scene is `earlier` when it happens before the placed scene read just before it: a flashback, or
// a slip.
export function storyOrder(scenes) {
  let last = null;
  for (const s of scenes) {
    s.earlier = !!(s.key && last && s.key.split('|')[0] < last.split('|')[0]);
    if (s.key) last = s.key;
  }
  const placed = scenes.filter((s) => s.key).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.read - b.read));
  return { placed, unplaced: scenes.filter((s) => !s.key) };
}

// ---------- checks ----------

const AGE_RANGES = { child: [0, 12], teen: [13, 17], young: [18, 29], adult: [30, 49], middle: [50, 64], older: [65, 150] };

// A birth year (or date), "1866" or "1866-04-02", as a date.
export function bornDate(born) {
  const s = (born || '').trim();
  if (isDayKey(s)) return dayOf(s);
  if (!/^-?\d{1,4}$/.test(s)) return null;
  const d = new Date(2000, 0, 1);
  d.setFullYear(+s); // so year 45 stays 45, not 1945
  return d;
}

const yearsBetween = (a, b) => {
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return y;
};

// Whether a character is really in a scene, not just thought of or talked about: the scene is in
// their point of view, the writer added them to it, or it names them more than once.
const present = (s, id) => s.pov === id || (s.cast.meta?.add || []).includes(id) || (s.sc.counts[id] || 0) >= 2;

// Things the timeline says that don't add up: [{ key, kind, text, sub, scenes, entryId }].
// - someone in two places at the same time of the same day (see present())
// - a character in a scene dated before they were born, or whose age band doesn't fit their age
//   in their first dated scene (calendar dates only)
export function timelineChecks(scenes, byId, mode, where = (s) => `Ch. ${s.ch.index + 1} · ${s.sc.index + 1}`) {
  const out = [];
  const byTime = new Map();
  for (const s of scenes) {
    if (!s.key || timeIndex(s.when.time) < 0 || !s.cast.where) continue;
    byTime.set(s.key, [...(byTime.get(s.key) || []), s]);
  }
  for (const [key, list] of byTime) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.cast.where === b.cast.where) continue;
        for (const id of a.cast.who.filter((x) => b.cast.who.includes(x) && present(a, x) && present(b, x))) {
          const e = byId[id];
          out.push({
            key: `clash:${id}:${key}:${a.ch.id}.${a.sc.index}:${b.ch.id}.${b.sc.index}`,
            kind: 'clash',
            entryId: id,
            scenes: [a, b],
            text: `${e.name} is in ${byId[a.cast.where].name} and ${byId[b.cast.where].name} at the same time.`,
            sub: `${whenLabel(a.when, mode)}: ${where(a)} and ${where(b)}.`,
          });
        }
      }
    }
  }
  if (mode !== 'date') return out;
  const first = new Map();
  for (const s of [...scenes].filter((x) => x.key).sort((a, b) => (a.key < b.key ? -1 : 1))) {
    for (const id of s.cast.who) {
      const e = byId[id];
      const born = bornDate(e?.born);
      if (!born) continue;
      const age = yearsBetween(born, dayOf(s.when.date));
      if (age < 0) {
        out.push({ key: `unborn:${id}:${s.ch.id}.${s.sc.index}`, kind: 'age', entryId: id, scenes: [s], text: `${e.name} is in a scene from before they were born.`, sub: `${where(s)}, ${dayLabel(s.when, mode)}. Born ${e.born}.` });
      } else if (!first.has(id)) {
        first.set(id, true);
        const range = AGE_RANGES[e.age];
        const band = AGES.find((a) => a.id === e.age);
        if (range && (age < range[0] || age > range[1])) {
          out.push({ key: `age:${id}:${e.age}:${e.born}:${s.when.date}`, kind: 'age', entryId: id, scenes: [s], text: `${e.name} is set as ${band.label} (${band.sub}) but is ${age} in their first scene.`, sub: `${where(s)}, ${dayLabel(s.when, mode)}. Born ${e.born}.` });
        }
      }
    }
  }
  return out;
}

// ---------- point of view ----------

// Who tells how much of the story: [{ id, scenes, words, chapters: Set of chapter positions, last }],
// most words first. `cols` numbers chapters across the books in view (see chapterColumns).
export function povShares(scenes, colOf) {
  const by = new Map();
  for (const s of scenes) {
    if (!s.pov) continue;
    const r = by.get(s.pov) || { id: s.pov, scenes: 0, words: 0, chapters: new Set(), last: -1 };
    r.scenes++;
    r.words += s.sc.words;
    const c = colOf(s);
    r.chapters.add(c);
    r.last = Math.max(r.last, c);
    by.set(s.pov, r);
  }
  return [...by.values()].sort((a, b) => b.words - a.words);
}
