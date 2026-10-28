import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { openDoc, setBible } from '../store.js';
import { setTimelineMode } from '../bibleActions.js';
import { bookScenes, storyOrder, timelineMode, timelineChecks, dayLabel, TIMES } from '../lib/timeline.js';
import { Segmented } from './ui.jsx';
import { WhenChip, PovChip } from './SceneTime.jsx';
import { plural, shortName } from './bibleUi.jsx';

const timeOf = (s) => TIMES.find((t) => t.id === s.when?.time)?.label || '';

function Row({ s, prev, ctx, view, scenes, mode, editable }) {
  const where = s.cast.where ? ctx.byId[s.cast.where] : null;
  return (
    <div className="tl-row">
      <span className="tl-time">{timeOf(s)}</span>
      <button className="tl-ch" title="Open this chapter" disabled={!editable} onClick={() => openDoc(s.ch.id)}>
        Ch. {s.ch.index + 1} · {s.sc.index + 1}
      </button>
      <span className="tl-opens">
        {s.sc.opens || 'Empty scene'}
        {s.earlier && <span className="tl-tag" title="It happens before the scene read just before it">Earlier than the scene before</span>}
      </span>
      <span className="tl-where">{where ? where.name : <span className="muted">—</span>}</span>
      <PovChip s={s} ctx={ctx} view={view} chapterScenes={scenes.filter((x) => x.ch === s.ch)} editable={editable} />
      <WhenChip s={s} prev={prev} mode={mode} editable={editable} />
    </div>
  );
}

function BookTimeline({ ctx, view, book, chapters, single }) {
  const [showUnplaced, setShowUnplaced] = useState(true);
  const mode = timelineMode(book.bible);
  const { scenes, placed, unplaced, checks } = useMemo(() => {
    const scenes = bookScenes(book, chapters, ctx.byId);
    const order = storyOrder(scenes);
    return { scenes, ...order, checks: timelineChecks(scenes, ctx.byId, mode) };
  }, [book, chapters, ctx.byId, mode]);
  const prevOf = (s) => scenes[s.read - 1];
  const editable = book.current;

  // Placed scenes, grouped by day.
  const days = [];
  for (const s of placed) {
    const k = s.key.split('|')[0];
    if (days[days.length - 1]?.k !== k) days.push({ k, label: dayLabel(s.when, mode), list: [] });
    days[days.length - 1].list.push(s);
  }

  return (
    <section className="tl-book">
      {!single && (
        <div className="bs-book-head">
          <span className="bs-book-title">{`${book.label} · ${book.title}`}</span>
        </div>
      )}
      {checks.length > 0 && (
        <div className="tl-checks">
          {checks.map((c) => (
            <div key={c.key} className="tl-check">
              <span className="bd-dot gap" />
              <span className="bd-note-text">
                <span>{c.text}</span>
                <span className="bd-note-sub">{c.sub}</span>
              </span>
              <button className="btn small" onClick={() => setBible({ tab: 'characters', selected: c.entryId, noteTab: 'all' })}>
                {shortName(ctx.byId[c.entryId])}
              </button>
            </div>
          ))}
        </div>
      )}
      {!scenes.length ? (
        <div className="bs-empty">{book.missing ? 'This book’s file couldn’t be found.' : 'No scenes yet. Write a chapter and they show up here.'}</div>
      ) : (
        <>
          {days.length > 0 ? (
            <div className="tl-days">
              {days.map((d) => (
                <div key={d.k} className="tl-day">
                  <div className="tl-day-label">{d.label}</div>
                  <div className="tl-day-rows">
                    {d.list.map((s) => (
                      <Row key={`${s.ch.id}:${s.sc.index}`} s={s} prev={prevOf(s)} ctx={ctx} view={view} scenes={scenes} mode={mode} editable={editable} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bs-empty">
              {editable
                ? `Nothing on the timeline yet. Give a scene a ${mode === 'date' ? 'date' : 'story day'} below and it takes its place here, in story order.`
                : 'Nothing on this book’s timeline yet.'}
            </div>
          )}
          {unplaced.length > 0 && (
            <div className="tl-unplaced">
              <button className="bs-book-head" onClick={() => setShowUnplaced(!showUnplaced)}>
                <ChevronDown size={15} strokeWidth={1.8} className={`sb-chevron ${showUnplaced ? '' : 'closed'}`} />
                <span className="bs-book-title">Not on the timeline yet</span>
                <span className="bs-book-meta">
                  {plural(unplaced.length, 'scene')} of {scenes.length}, in reading order
                </span>
              </button>
              {showUnplaced && (
                <div className="tl-day-rows">
                  {unplaced.map((s) => (
                    <Row key={`${s.ch.id}:${s.sc.index}`} s={s} prev={prevOf(s)} ctx={ctx} view={view} scenes={scenes} mode={mode} editable={editable} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// Every scene in story order, by the day it happens, with the scenes that don't add up called out.
export default function BibleTimeline({ ctx, analysis, view }) {
  const mode = timelineMode(ctx.currentBook.bible);
  return (
    <div className="tl">
      <div className="tl-head">
        <Segmented
          value={mode}
          onChange={setTimelineMode}
          options={[
            { value: 'day', label: 'Story days' },
            { value: 'date', label: 'Calendar dates' },
          ]}
        />
        <span className="bible-scope-hint">
          {mode === 'day'
            ? 'Count days from the start of the story: Day 1, Day 2… Earlier days (backstory) can be 0 or less.'
            : 'Real dates. Give characters a birth year and their ages are checked against each scene.'}
        </span>
      </div>
      {view.books.map((b) => (
        <BookTimeline key={b.uuid} ctx={ctx} view={view} book={b} chapters={analysis.books[b.uuid]?.chapters || []} single={view.books.length === 1} />
      ))}
      <p className="bs-foot">
        Set when a scene happens here or on the Scenes tab. Someone in two places at the same time is pointed out (counting the point of view, anyone you
        added and anyone named more than once, not passing mentions), and so is a scene that happens earlier than the one read before it, in case it isn’t
        meant as a flashback.
      </p>
    </div>
  );
}
