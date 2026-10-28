import { useState } from 'react';
import { Clock, Eye, Minus, Plus } from 'lucide-react';
import { openMenu, openPopover, closeMenu } from '../store.js';
import { setSceneMeta, setScenesMeta } from '../bibleActions.js';
import { TIMES, whenLabel } from '../lib/timeline.js';
import { dayOf, todayKey } from '../lib/project.js';
import { shortName } from './bibleUi.jsx';

const nextDay = (when, mode) => {
  if (mode === 'day') return { ...when, day: when.day + 1, time: undefined };
  const d = dayOf(when.date);
  d.setDate(d.getDate() + 1);
  return { ...when, date: todayKey(d), time: undefined };
};

const hasDay = (when, mode) => (mode === 'date' ? !!when?.date : Number.isInteger(when?.day));

// When a scene happens: a story day or a date, and a time of day. Changes save as you make them.
function WhenPicker({ s, prev, mode }) {
  const [when, setWhen] = useState(s.when || {});
  const save = (next) => {
    setWhen(next || {});
    setSceneMeta(s.ch.id, s.sc.index, s.sc.opens, { when: next && hasDay(next, mode) ? next : null });
  };
  const day = Number.isInteger(when.day) ? when.day : null;
  const setDay = (d) => save({ ...when, day: d });
  const pickTime = (time) => {
    let next = { ...when, time };
    // A time of day needs a day; in story days, start from the scene before's (or Day 1).
    if (!hasDay(next, mode) && mode === 'day') next.day = prev?.when && Number.isInteger(prev.when.day) ? prev.when.day : 1;
    save(next);
  };
  return (
    <div className="when-form">
      <div className="menu-heading">When this scene happens</div>
      {mode === 'day' ? (
        <div className="when-day">
          <span>Day</span>
          <button className="when-step" aria-label="Day before" onClick={() => setDay((day ?? 2) - 1)}>
            <Minus size={13} strokeWidth={2} />
          </button>
          <input
            className="text-input"
            inputMode="numeric"
            value={day ?? ''}
            placeholder="—"
            autoFocus
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === '') return save({ ...when, day: undefined });
              if (/^-?\d{1,5}$/.test(v)) setDay(parseInt(v, 10));
            }}
          />
          <button className="when-step" aria-label="Day after" onClick={() => setDay((day ?? 0) + 1)}>
            <Plus size={13} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <input className="text-input when-date" type="date" value={when.date || ''} autoFocus onChange={(e) => save({ ...when, date: e.target.value || undefined })} />
      )}
      <div className="when-times">
        {TIMES.map((t) => (
          <button key={t.id} className={when.time === t.id ? 'on' : ''} onClick={() => pickTime(when.time === t.id ? undefined : t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {prev?.when && hasDay(prev.when, mode) && (
        <div className="when-quick">
          <button onClick={() => save({ ...prev.when })}>Same as the scene before · {whenLabel(prev.when, mode)}</button>
          <button onClick={() => save(nextDay(prev.when, mode))}>The day after the scene before</button>
        </div>
      )}
      {hasDay(when, mode) && (
        <button
          className="when-clear"
          onClick={() => {
            save(null);
            closeMenu();
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}

export function WhenChip({ s, prev, mode, editable }) {
  const label = whenLabel(s.when, mode);
  const open = (e) => openPopover(e.currentTarget.getBoundingClientRect(), <WhenPicker s={s} prev={prev} mode={mode} />, { width: 260 });
  if (!editable) return label ? <span className="when-chip">{label}</span> : <span className="muted">—</span>;
  return (
    <button className={`when-chip ${label ? '' : 'empty'} ${s.earlier ? 'earlier' : ''}`} onClick={open} title={s.earlier ? 'Earlier in the story than the scene read before it' : 'When this scene happens'}>
      {label ? (
        label
      ) : (
        <>
          <Clock size={12} strokeWidth={1.8} /> Set time
        </>
      )}
    </button>
  );
}

// Whose point of view a scene is told from. The people in it come first.
export function PovChip({ s, ctx, view, chapterScenes, editable }) {
  const pov = s.pov ? ctx.byId[s.pov] : null;
  const chars = view.entries.filter((e) => e.type === 'character');
  const save = (id) => setSceneMeta(s.ch.id, s.sc.index, s.sc.opens, { pov: id });
  const open = (e) => {
    const inScene = s.cast.who.map((id) => ctx.byId[id]).filter((c) => c?.type === 'character');
    const others = chars.filter((c) => !s.cast.who.includes(c.id));
    const item = (c) => ({ label: c.name || 'Untitled', sub: c.role, checked: s.pov === c.id, onClick: () => save(c.id) });
    const rest = chapterScenes.filter((x) => x !== s);
    openMenu(
      e.currentTarget.getBoundingClientRect(),
      [
        { heading: 'Point of view' },
        ...inScene.map(item),
        ...(others.length ? [...(inScene.length ? [{ heading: 'Not found in this scene' }] : []), ...others.map(item)] : []),
        { separator: true },
        { label: 'Not set', checked: !s.pov, onClick: () => save(null) },
        pov &&
          rest.length > 0 && {
            label: `${shortName(pov)} for the whole chapter`,
            onClick: () => setScenesMeta(chapterScenes.map((x) => ({ chapterId: x.ch.id, index: x.sc.index, opens: x.sc.opens })), { pov: pov.id }),
          },
      ],
      { width: 250 }
    );
  };
  if (!editable) return pov ? <span className="pov-chip">{shortName(pov)}</span> : <span className="muted">—</span>;
  if (!chars.length) return <span className="muted">—</span>;
  return (
    <button className={`pov-chip ${pov ? '' : 'empty'}`} onClick={open} title="Whose point of view this scene is told from">
      {pov ? (
        <>
          <Eye size={12} strokeWidth={1.8} /> {shortName(pov)}
        </>
      ) : (
        'Set POV'
      )}
    </button>
  );
}
