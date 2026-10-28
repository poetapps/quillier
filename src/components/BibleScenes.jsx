import { useState } from 'react';
import { ChevronDown, MapPin, Plus, Pencil } from 'lucide-react';
import { useStore, openMenu, openDoc, smartActive } from '../store.js';
import { setSceneMeta } from '../bibleActions.js';
import { presenceKey } from '../lib/bible.js';
import { bookScenes, storyOrder, timelineMode } from '../lib/timeline.js';
import { fmt, plural, shortName } from './bibleUi.jsx';
import { WhenChip, PovChip } from './SceneTime.jsx';

function NoteEditor({ value, onDone }) {
  const [text, setText] = useState(value || '');
  return (
    <input
      className="bs-note-input"
      autoFocus
      value={text}
      placeholder="A note about this scene"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(text);
        if (e.key === 'Escape') onDone(value || '');
      }}
    />
  );
}

// One scene: where it opens, when it happens, where it's set, whose point of view, who's in it.
// `s` is the scene as lib/timeline.js's bookScenes() sees it; `prev` the one read before it.
export function SceneRow({ ctx, view, book, s, prev, chapterScenes, presence, smartOn, mode }) {
  const [editing, setEditing] = useState(false);
  const editable = book.current;
  const { ch, sc, cast } = s;
  const meta = cast.meta || {};
  const detected = Object.entries(sc.counts)
    .filter(([id, n]) => n > 0 && ctx.byId[id]?.type === 'character')
    .map(([id]) => id);
  const places = view.entries.filter((e) => e.type === 'place');
  const chars = view.entries.filter((e) => e.type === 'character');
  const save = (patch) => setSceneMeta(ch.id, sc.index, sc.opens, patch);

  const whereMenu = (e) =>
    openMenu(
      e.currentTarget.getBoundingClientRect(),
      [
        { heading: 'Where this scene is set' },
        ...places.map((p) => ({ label: p.name || 'Untitled', checked: cast.where === p.id, onClick: () => save({ where: p.id }) })),
        { separator: true },
        { label: 'Find it by name', checked: !cast.pinned, onClick: () => save({ where: null }) },
      ],
      { width: 230 }
    );

  const toggleWho = (id) => {
    let add = meta.add || [];
    let remove = meta.remove || [];
    if (cast.who.includes(id)) {
      add = add.filter((x) => x !== id);
      if (detected.includes(id)) remove = [...new Set([...remove, id])];
    } else {
      remove = remove.filter((x) => x !== id);
      if (!detected.includes(id)) add = [...new Set([...add, id])];
    }
    save({ add, remove });
  };
  const whoMenu = (e) =>
    openMenu(
      e.currentTarget.getBoundingClientRect(),
      [{ heading: 'Who’s in this scene' }, ...chars.map((c) => ({ label: c.name || 'Untitled', checked: cast.who.includes(c.id), onClick: () => toggleWho(c.id) }))],
      { width: 230 }
    );

  const where = cast.where ? ctx.byId[cast.where] : null;
  return (
    <div className="bs-row">
      <button className="bs-cell bs-num" title="Open this chapter" onClick={() => book.current && openDoc(ch.id)} disabled={!book.current}>
        Ch. {ch.index + 1} · {sc.index + 1}
      </button>
      <div className="bs-cell bs-opens">
        <span className="bs-opens-text">{sc.opens || 'Empty scene'}</span>
        {editing ? (
          <NoteEditor
            value={meta.note}
            onDone={(note) => {
              setEditing(false);
              if ((note || '') !== (meta.note || '')) save({ note: note.trim() });
            }}
          />
        ) : meta.note ? (
          <button className="bs-note" disabled={!editable} onClick={() => setEditing(true)}>
            Note: {meta.note}
          </button>
        ) : (
          editable && (
            <button className="bs-add-note" onClick={() => setEditing(true)}>
              <Pencil size={11} strokeWidth={2} /> Add note
            </button>
          )
        )}
      </div>
      <div className="bs-cell">
        <WhenChip s={s} prev={prev} mode={mode} editable={editable} />
      </div>
      <div className="bs-cell">
        {where ? (
          <button className={`place-chip ${cast.pinned ? 'pinned' : ''}`} disabled={!editable} onClick={whereMenu} title={cast.pinned ? 'Pinned by you' : 'Found by name'}>
            <span className="place-dot" />
            {where.name}
          </button>
        ) : editable && places.length ? (
          <button className="place-chip empty" onClick={whereMenu}>
            <MapPin size={12} strokeWidth={1.8} /> Pick a place
          </button>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="bs-cell">
        <PovChip s={s} ctx={ctx} view={view} chapterScenes={chapterScenes} editable={editable} />
      </div>
      <div className="bs-cell bs-who">
        {cast.who.map((id) => {
          const p = presence[presenceKey(ch.id, sc, id)];
          const away = smartOn && typeof p === 'number' && p < 0.5;
          return (
            <span key={id} className={`who-chip ${away ? 'away' : ''}`} title={away ? 'Only mentioned here, not in the scene' : ctx.byId[id].name}>
              {shortName(ctx.byId[id])}
            </span>
          );
        })}
        {editable && chars.length > 0 && (
          <button className="who-chip ghost" onClick={whoMenu} aria-label="Change who’s in this scene">
            <Plus size={11} strokeWidth={2} />
          </button>
        )}
      </div>
      <span className="bs-cell bs-words">{fmt(sc.words)}</span>
    </div>
  );
}

export default function BibleScenes({ ctx, analysis, view }) {
  const [open, setOpen] = useState({});
  const presence = useStore((s) => s.smart.presence);
  const smartOn = useStore((s) => smartActive(s.prefs));

  return (
    <div className="bs">
      {view.books.map((b) => {
        const chapters = analysis.books[b.uuid]?.chapters || [];
        const n = chapters.reduce((m, c) => m + c.scenes.length, 0);
        const isOpen = open[b.uuid] ?? b.current;
        const scenes = bookScenes(b, chapters, ctx.byId);
        storyOrder(scenes);
        const mode = timelineMode(b.bible);
        return (
          <section key={b.uuid} className="bs-book">
            <button className="bs-book-head" onClick={() => setOpen({ ...open, [b.uuid]: !isOpen })}>
              <ChevronDown size={15} strokeWidth={1.8} className={`sb-chevron ${isOpen ? '' : 'closed'}`} />
              <span className="bs-book-title">{ctx.inSeries ? `${b.label} · ${b.title}` : b.title}</span>
              <span className="bs-book-meta">
                {b.missing ? 'File not found' : `${plural(n, 'scene')} in ${plural(chapters.length, 'chapter')}`}
              </span>
            </button>
            {isOpen &&
              (n ? (
                <div className="bs-table">
                  <div className="bs-row bs-head-row">
                    <span>Scene</span>
                    <span>Opens with</span>
                    <span>When</span>
                    <span>Where</span>
                    <span>Point of view</span>
                    <span>Who</span>
                    <span className="bs-words">Words</span>
                  </div>
                  {scenes.map((s, i) => (
                    <SceneRow
                      key={`${s.ch.id}:${s.sc.index}`}
                      ctx={ctx}
                      view={view}
                      book={b}
                      s={s}
                      prev={scenes[i - 1]}
                      chapterScenes={scenes.filter((x) => x.ch === s.ch)}
                      presence={presence}
                      smartOn={smartOn}
                      mode={mode}
                    />
                  ))}
                </div>
              ) : (
                <div className="bs-empty">{b.missing ? 'This book’s file couldn’t be found.' : 'No scenes yet. Write a chapter and they show up here.'}</div>
              ))}
          </section>
        );
      })}
      <p className="bs-foot">
        Scenes come from the *** breaks in each chapter. Where and who are found by name, and you can pin them by hand when a scene needs it. When and point
        of view are yours to set; the Timeline puts the scenes in story order.
        {smartOn && ' Faded names are only mentioned, not there.'}
      </p>
    </div>
  );
}
