import { useState } from 'react';
import { Target } from 'lucide-react';
import { setProjectMeta, openPopover, closeMenu } from '../store.js';
import { goalStatus } from '../lib/goal.js';
import { dayOf, todayKey } from '../lib/project.js';

const n = (v) => v.toLocaleString('en-US');
const day = (key) => dayOf(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric', ...(key.slice(0, 4) === todayKey().slice(0, 4) ? {} : { year: 'numeric' }) });

function GoalForm({ goal }) {
  const [words, setWords] = useState(goal?.words ? String(goal.words) : '80000');
  const [by, setBy] = useState(goal?.by || '');
  const save = (e) => {
    e.preventDefault();
    const w = parseInt(words.replace(/[^\d]/g, ''), 10);
    if (!(w > 0)) return;
    setProjectMeta({ goal: { words: w, by: by || null } });
    closeMenu();
  };
  return (
    <form className="goal-form" onSubmit={save}>
      <label>
        <span>Words</span>
        <input className="text-input" autoFocus inputMode="numeric" value={words} onChange={(e) => setWords(e.target.value)} onFocus={(e) => e.target.select()} />
      </label>
      <label>
        <span>Finish by</span>
        <input className="text-input" type="date" value={by} min={todayKey()} onChange={(e) => setBy(e.target.value)} />
      </label>
      <p className="goal-form-hint">Leave the date empty for a goal with no deadline.</p>
      <div className="goal-form-actions">
        {goal && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setProjectMeta({ goal: null });
              closeMenu();
            }}
          >
            Remove goal
          </button>
        )}
        <button type="submit" className="btn small primary">
          {goal ? 'Save' : 'Set goal'}
        </button>
      </div>
    </form>
  );
}

const editGoal = (e, goal) => openPopover(e.currentTarget.getBoundingClientRect(), <GoalForm goal={goal} />, { align: 'right', width: 250 });

// The book's goal in the Details tab: how far along it is, and what a day takes to make the deadline.
export function BookGoal({ project }) {
  const goal = project.meta.goal;
  const g = goalStatus(project);
  if (!g) {
    return (
      <button className="panel-more goal-set" onClick={(e) => editGoal(e, null)}>
        <Target size={14} strokeWidth={1.8} /> Set a goal for the book, with a deadline if you like
      </button>
    );
  }
  const pct = Math.min(100, Math.round((g.total / g.target) * 100));
  let line;
  if (g.done) line = `You’ve reached ${n(g.target)} words.`;
  else if (g.late) line = `The deadline, ${day(g.by)}, has passed. ${n(g.left)} words to go.`;
  else if (g.perDay) line = `${n(g.perDay)} words a day reaches it by ${day(g.by)}.`;
  else line = `${n(g.left)} words to go.`;
  let pace = null;
  if (!g.done && g.finish) {
    pace = `At your pace over the last two weeks (about ${n(g.pace)} a day), you’d finish around ${day(g.finish)}${g.onTrack === false ? ', after the deadline' : ''}.`;
  }
  return (
    <div className="book-goal">
      <div className="book-goal-top">
        <span>
          <b>{n(g.total)}</b> of {n(g.target)} words
        </span>
        <button className="link-btn" onClick={(e) => editGoal(e, goal)}>
          Edit
        </button>
      </div>
      <div className="goal-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="kv">
        <span>{pct}% there</span>
        <b>{g.by ? (g.daysLeft > 0 ? `${g.daysLeft === 1 ? 'Last day' : `${g.daysLeft} days left`} · ${day(g.by)}` : day(g.by)) : 'No deadline'}</b>
      </div>
      <p className="panel-hint">{line}</p>
      {pace && <p className="panel-hint">{pace}</p>}
    </div>
  );
}
