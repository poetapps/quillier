// A book's goal: a word count, and optionally a day to reach it by, kept in p.meta.goal as
// { words, by: "2027-03-01" }. The daily pace is worked out from where the book stood at the start
// of today, so it holds still while you write and only moves overnight.

import { manuscriptWords, todayKey, dayOf, isDayKey } from './project.js';

const DAY = 86400000;
const RECENT = 14; // days the "at your pace" estimate looks back over

const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / DAY);

export function goalStatus(p, now = new Date()) {
  const g = p?.meta?.goal;
  if (!g || !(g.words > 0)) return null;
  const key = todayKey(now);
  const daily = p.stats?.daily || {};
  const total = manuscriptWords(p);
  const today = daily[key] || 0;
  const left = Math.max(0, g.words - total);
  const done = total >= g.words;

  // Counting today and the deadline itself.
  const daysLeft = isDayKey(g.by) ? daysBetween(key, g.by) + 1 : null;
  const perDay = daysLeft > 0 && !done ? Math.ceil(Math.max(0, g.words - (total - today)) / daysLeft) : null;

  let recent = 0;
  for (let i = 0; i < RECENT; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    recent += Math.max(0, daily[todayKey(d)] || 0);
  }
  const pace = Math.round(recent / RECENT);
  let finish = null;
  if (!done && pace > 0) {
    const d = new Date(now);
    d.setDate(d.getDate() + Math.ceil(left / pace));
    finish = todayKey(d);
  }
  return {
    target: g.words,
    by: isDayKey(g.by) ? g.by : null,
    total,
    today,
    left,
    done,
    daysLeft,
    perDay,
    pace,
    finish,
    late: daysLeft !== null && daysLeft <= 0 && !done,
    onTrack: finish && isDayKey(g.by) ? finish <= g.by : null,
  };
}

// The words to aim for today: the deadline's pace if the book has one, else the daily goal in Settings.
export const todayTarget = (p, prefs) => goalStatus(p)?.perDay || prefs?.dailyGoal || 0;
