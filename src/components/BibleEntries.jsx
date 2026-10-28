import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, MoreHorizontal, Trash2, Repeat, ExternalLink, Pencil, ChevronDown } from 'lucide-react';
import { useStore, getState, setBible, openMenu, openProjectAt, smartActive } from '../store.js';
import {
  addEntry,
  updateEntry,
  renameEntry,
  setEntryNotes,
  deleteEntry,
  promoteEntry,
  addRelationship,
  setDecision,
  setAliases,
  renameInText,
} from '../bibleActions.js';
import { renamePairs, namesIn, countNames } from '../lib/find.js';
import { timelineMode } from '../lib/timeline.js';
import { relLabel, sceneCast, needsCheck } from '../lib/bible.js';
import { presetFace } from '../lib/face.js';
import { GENDERS, AGES } from '../lib/project.js';
import MarkdownEditor from './MarkdownEditor.jsx';
import Avatar from './Avatar.jsx';
import FaceEditor from './FaceEditor.jsx';
import { IconButton } from './ui.jsx';
import { OwnerBadge, Strip, fmt, plural, shortName } from './bibleUi.jsx';

const matchesQuery = (e, q) => {
  if (!q) return true;
  const n = q.toLowerCase();
  return [e.name, e.role, ...(e.aliases || [])].some((x) => (x || '').toLowerCase().includes(n));
};

export default function BibleEntries({ ctx, analysis, view, scope, type }) {
  const selectedId = useStore((s) => s.bible.selected);
  const [query, setQuery] = useState('');
  // The entry you're on stays listed even if this book no longer mentions it (say, mid-rename).
  const picked = ctx.byId[selectedId];
  const shown = view.entries.filter((e) => e.type === type);
  const all = picked?.type === type && !shown.includes(picked) ? [...shown, picked] : shown;
  const list = all.filter((e) => matchesQuery(e, query));
  const sel = list.find((e) => e.id === selectedId) || all.find((e) => e.id === selectedId) || list[0] || null;
  const total = (e) => view.uuids.reduce((n, b) => n + (analysis.totals[e.id]?.[b] || 0), 0);
  const noun = type === 'place' ? 'place' : 'character';

  return (
    <div className="be">
      <div className="be-list">
        <label className="be-search">
          <Search size={15} strokeWidth={1.8} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names and aliases" aria-label="Search names and aliases" />
          {query && (
            <button className="be-search-x" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </label>
        <div className="be-list-head">
          <span>{plural(list.length, noun)}</span>
          <span>Mentions</span>
        </div>
        <div className="be-items">
          {list.map((e) => (
            <button key={e.id} className={`be-item ${type === 'character' ? 'with-avatar' : ''} ${sel?.id === e.id ? 'on' : ''}`} onClick={() => setBible({ selected: e.id, noteTab: 'all' })}>
              {type === 'character' && <Avatar entry={e} size={30} />}
              <span className="be-item-body">
                <span className="be-item-top">
                  <span className="be-item-name">{e.name || 'Untitled'}</span>
                  <span className="be-item-count">{fmt(total(e))}</span>
                </span>
                {e.role && <span className="be-item-role">{e.role}</span>}
                {ctx.inSeries && <OwnerBadge e={e} ctx={ctx} />}
              </span>
            </button>
          ))}
          {!all.length && (
            <div className="be-empty">
              <p>No {noun}s yet.</p>
              <p className="muted">
                Add the people and places in your story. Their names are counted in every chapter, and they finish themselves as you type.
              </p>
              <button className="btn small" onClick={() => addEntry(type)}>
                <Plus size={14} strokeWidth={1.8} /> Add a {noun}
              </button>
            </div>
          )}
          {all.length > 0 && !list.length && <p className="be-none muted">Nothing matches “{query}”.</p>}
        </div>
      </div>
      {sel ? <EntryDetail key={sel.id} e={sel} ctx={ctx} analysis={analysis} view={view} scope={scope} /> : <div className="be-detail be-detail-empty" />}
    </div>
  );
}

function entryMenu(ev, e, ctx) {
  const items =
    e.store === 'sibling'
      ? [
          {
            label: `Open ${ctx.bookById[e.owner]?.title || 'that book'} to edit`,
            icon: ExternalLink,
            onClick: () => openProjectAt(ctx.bookById[e.owner].path, { view: 'bible', bible: { selected: e.id, tab: e.type === 'place' ? 'places' : 'characters' } }),
          },
        ]
      : [
          {
            label: e.type === 'place' ? 'Make it a character' : 'Make it a place',
            icon: Repeat,
            onClick: () => {
              updateEntry(e.id, { type: e.type === 'place' ? 'character' : 'place' });
              setBible({ tab: e.type === 'place' ? 'characters' : 'places' });
            },
          },
          { separator: true },
          { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteEntry(e.id) },
        ];
  openMenu(ev.currentTarget.getBoundingClientRect(), items, { align: 'right', width: 220 });
}

function Aliases({ e, readOnly }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (t && t !== e.name && !e.aliases.includes(t)) setAliases(e.id, [...e.aliases, t]);
    setText('');
    setAdding(false);
  };
  return (
    <div className="chips">
      {e.aliases.map((a) => (
        <span key={a} className="chip">
          {a}
          {!readOnly && (
            <button className="chip-x" aria-label={`Remove ${a}`} onClick={() => setAliases(e.id, e.aliases.filter((x) => x !== a))}>
              <X size={11} strokeWidth={2.2} />
            </button>
          )}
        </span>
      ))}
      {!readOnly &&
        (adding ? (
          <input
            className="chip-input"
            autoFocus
            value={text}
            placeholder="Another name"
            onChange={(ev) => setText(ev.target.value)}
            onBlur={add}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') add();
              if (ev.key === 'Escape') {
                setText('');
                setAdding(false);
              }
            }}
          />
        ) : (
          <button className="chip ghost" onClick={() => setAdding(true)}>
            <Plus size={12} strokeWidth={2} /> Alias
          </button>
        ))}
    </div>
  );
}

function Highlight({ sentence, word, nth }) {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = sentence.indexOf(word, at + 1);
  if (at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <b>{word}</b>
      {sentence.slice(at + word.length)}
    </>
  );
}

// The portrait beside a character's name. The first click starts them off with a ready-made face
// that fits their gender and age, when those are set.
function PortraitButton({ e, readOnly }) {
  const [anchor, setAnchor] = useState(null);
  if (readOnly) return <Avatar entry={e} size={64} className="be-portrait-art" />;
  const open = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const header = ev.currentTarget.closest('.be-ident').getBoundingClientRect();
    if (!e.face) updateEntry(e.id, { face: presetFace(e) });
    setAnchor({ left: r.left, bottom: header.bottom });
  };
  return (
    <>
      <button className="be-portrait" onClick={open} title={e.face ? 'Edit portrait' : 'Make a portrait'} aria-label={e.face ? 'Edit portrait' : 'Make a portrait'}>
        <Avatar entry={e} size={64} className="be-portrait-art" />
        <span className="be-portrait-badge">
          <Pencil size={11} strokeWidth={2} />
        </span>
      </button>
      {anchor && <FaceEditor entry={e} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}

// A character's birth year (or full date), for the calendar timeline's age checks.
function Born({ e, readOnly }) {
  const [value, setValue] = useState(e.born || '');
  return (
    <label className="be-trait be-born" title="A year, like 1866, or a date, like 1866-04-02. Checked against the timeline.">
      <span className="be-trait-key">Born</span>
      <input
        value={value}
        placeholder="Year"
        readOnly={readOnly}
        spellCheck={false}
        onChange={(ev) => {
          setValue(ev.target.value);
          updateEntry(e.id, { born: ev.target.value.trim() });
        }}
      />
    </label>
  );
}

function Traits({ e, readOnly }) {
  const dates = useStore((s) => timelineMode(s.project.bible) === 'date');
  const chip = (key, list, label) => {
    const value = list.find((o) => o.id === e[key]);
    const pick = (ev) =>
      openMenu(
        ev.currentTarget.getBoundingClientRect(),
        [
          ...list.map((o) => ({ label: o.label, sub: o.sub, checked: e[key] === o.id, onClick: () => updateEntry(e.id, { [key]: o.id }) })),
          { separator: true },
          { label: 'Not set', checked: !value, onClick: () => updateEntry(e.id, { [key]: '' }) },
        ],
        { width: 190 }
      );
    return (
      <button className={`be-trait ${value ? '' : 'empty'}`} disabled={readOnly} onClick={pick}>
        <span className="be-trait-key">{label}</span>
        {value ? value.label : 'Not set'}
        {!readOnly && <ChevronDown size={13} strokeWidth={1.8} />}
      </button>
    );
  };
  return (
    <div className="be-traits">
      {chip('gender', GENDERS, 'Gender')}
      {chip('age', AGES, 'Age')}
      {dates && <Born e={e} readOnly={readOnly} />}
    </div>
  );
}

const quoted = (names) => {
  const q = names.map((n) => `“${n}”`);
  return q.length < 2 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
};

// After a rename, the old name is probably still all through the text. Offer to change it there too:
// in this book, and for a series entry in the other books that use it.
function RenameOffer({ offer, onDone }) {
  const { pairs, here, books } = offer;
  const total = here + books.reduce((n, b) => n + b.n, 0);
  const where = here ? (books.length ? `in this book and ${books.length === 1 ? books[0].title : `${books.length} other books`}` : 'in this book') : books.length === 1 ? `in ${books[0].title}` : `in ${books.length} other books`;
  const run = async (all) => {
    onDone();
    await renameInText(pairs, { label: `“${pairs[0].from}”`, books: all ? books : [] });
  };
  return (
    <div className="be-rename">
      <p>
        {quoted(pairs.map((x) => x.from))} {pairs.length === 1 ? 'is' : 'are'} still written {total.toLocaleString('en-US')} {total === 1 ? 'time' : 'times'} {where}. Change{' '}
        {pairs.length === 1 ? 'it' : 'them'} to {quoted(pairs.map((x) => x.to))}?
      </p>
      <div className="be-rename-actions">
        {here > 0 && (
          <button className={`btn small ${books.length ? '' : 'primary'}`} onClick={() => run(false)}>
            Change in this book
          </button>
        )}
        {books.length > 0 && (
          <button className="btn small primary" onClick={() => run(true)}>
            {here ? `Change in all ${books.length + 1} books` : `Change in ${books.length === 1 ? books[0].title : `${books.length} books`}`}
          </button>
        )}
        <button className="btn small" onClick={onDone}>
          Leave the text
        </button>
      </div>
    </div>
  );
}

function EntryDetail({ e, ctx, analysis, view, scope }) {
  const focusName = useStore((s) => s.bible.focusName);
  const noteTab = useStore((s) => s.bible.noteTab);
  const prefs = useStore((s) => s.prefs);
  const nameRef = useRef(null);
  const [reviewAll, setReviewAll] = useState(false);
  const [offer, setOffer] = useState(null);
  const startName = useRef(null);
  const readOnly = e.store === 'sibling';
  const uuid = ctx.uuid;

  // The name as it was before this rename started (or before the last one, if that offer is still up).
  const nameFocus = () => {
    startName.current = offer?.before || { name: e.name, aliases: e.aliases };
    // Pin the selection, so the entry stays on screen if its new name stops matching this book.
    if (getState().bible.selected !== e.id) setBible({ selected: e.id });
  };
  const nameBlur = () => {
    const before = startName.current;
    startName.current = null;
    if (!before || readOnly) return;
    const pairs = renamePairs(before, e);
    if (!pairs.length) return setOffer(null);
    const here = namesIn(getState().project, pairs);
    const books =
      e.owner === 'series'
        ? ctx.books
            .filter((b) => !b.current && !b.missing && b.path)
            .map((b) => ({ path: b.path, title: b.title, n: b.chapters.reduce((n, c) => n + countNames(c.content || '', pairs), 0) }))
            .filter((b) => b.n > 0)
        : [];
    setOffer(here || books.length ? { before, pairs, here, books } : null);
  };

  useEffect(() => {
    if (focusName === e.id && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
      setBible({ focusName: null });
    }
  }, [focusName, e.id]);

  const stripBooks = ctx.inSeries ? ctx.books : [ctx.currentBook];
  const totals = analysis.totals[e.id] || {};
  const inBooks = ctx.books.filter((b) => totals[b.uuid] > 0);
  const totalText = ctx.inSeries
    ? inBooks.map((b) => `${fmt(totals[b.uuid])} in ${b.label}`).join(' · ')
    : totals[uuid]
      ? plural(totals[uuid], 'mention')
      : '';

  const noteBooks = e.owner === 'series' ? ctx.books.filter((b) => b.current || totals[b.uuid] > 0 || (e.perBook[b.uuid] || '').trim()) : [];
  const tab = noteTab !== 'all' && noteBooks.some((b) => b.uuid === noteTab) ? noteTab : 'all';
  const noteValue = tab === 'all' ? e.notes : e.perBook[tab] || '';

  const rels = view.rels.filter((r) => r.a === e.id || r.b === e.id);
  const others = view.entries.filter((x) => x.type === 'character' && x.id !== e.id && !rels.some((r) => r.a === x.id || r.b === x.id));

  // Uses of an everyday-word name ("Will", "May") that weren't counted, or that smart features weren't sure about.
  const mine = analysis.ambiguous.filter((h) => h.entryId === e.id && h.bookUuid === uuid);
  const checks = reviewAll ? mine : mine.filter(needsCheck);
  const checked = mine.filter((h) => h.source === 'writer').length;

  const scenesHere = useMemo(() => {
    if (e.type !== 'place') return [];
    const out = [];
    for (const b of view.books) {
      for (const ch of analysis.books[b.uuid]?.chapters || []) {
        for (const sc of ch.scenes) {
          if (sceneCast(sc, ch.id, b.bible, ctx.byId).where === e.id) out.push({ b, ch, sc });
        }
      }
    }
    return out;
  }, [e.id, e.type, view.books, analysis, ctx.byId]);

  let share;
  if (!ctx.inSeries) share = null;
  else if (e.owner === 'series') share = `Appears in ${inBooks.length} of ${ctx.books.length} ${ctx.books.length === 1 ? 'book' : 'books'}.`;
  else if (readOnly) share = `Only in ${ctx.bookById[e.owner]?.title}. Open that book to edit it.`;
  else share = `Only in ${ctx.currentBook.title}. Other books won’t suggest this name.`;

  return (
    <article className="be-detail">
      <div className="be-detail-head">
        <span className="be-eyebrow">{e.type === 'place' ? 'Place' : 'Character'}</span>
        <IconButton icon={MoreHorizontal} title="More" onClick={(ev) => entryMenu(ev, e, ctx)} />
      </div>
      <div className="be-ident">
        {e.type === 'character' && <PortraitButton e={e} readOnly={readOnly} />}
        <div className="be-ident-text">
          <input
            ref={nameRef}
            className="be-name"
            value={e.name}
            readOnly={readOnly}
            placeholder={e.type === 'place' ? 'Name of the place' : 'Name'}
            spellCheck={false}
            onChange={(ev) => renameEntry(e.id, ev.target.value)}
            onFocus={nameFocus}
            onBlur={nameBlur}
            onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
          />
          <input
            className="be-role"
            value={e.role}
            readOnly={readOnly}
            placeholder={e.type === 'place' ? 'What kind of place, in a few words' : 'Who they are, in a few words'}
            onChange={(ev) => updateEntry(e.id, { role: ev.target.value })}
          />
          {e.type === 'character' && <Traits e={e} readOnly={readOnly} />}
        </div>
      </div>
      {offer && <RenameOffer offer={offer} onDone={() => setOffer(null)} />}
      {ctx.inSeries && (
        <div className="be-share">
          <OwnerBadge e={e} ctx={ctx} />
          <span>{share}</span>
          {!readOnly && e.owner !== 'series' && (
            <button className="text-link" onClick={() => promoteEntry(e.id)}>
              Move to series bible
            </button>
          )}
        </div>
      )}

      <section className="be-section">
        <div className="be-label">Also matched as</div>
        <Aliases e={e} readOnly={readOnly} />
      </section>

      <section className="be-section">
        <div className="be-label split">
          <span>Appears in</span>
          <span>{totalText ? `Mentions: ${totalText}` : 'Not mentioned yet'}</span>
        </div>
        <div className="be-strips">
          {stripBooks.map((b) => {
            const chs = analysis.books[b.uuid]?.chapters || [];
            return (
              <div key={b.uuid} className="be-strip">
                <Strip counts={chs.map((c) => c.counts[e.id] || 0)} titles={chs.map((c, i) => `${ctx.inSeries ? `${b.label}, ` : ''}Ch. ${i + 1} ${c.title || ''}`)} />
                <span className={`be-strip-label ${b.current ? 'current' : ''}`}>
                  {ctx.inSeries ? b.label : chs.length ? `Chapters 1 to ${chs.length}` : 'No chapters yet'}
                  {b.missing && ' · file not found'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {mine.length > 0 && !readOnly && (
        <section className="be-section">
          <div className="be-label split">
            <span>{reviewAll ? `Every use of “${mine[0].word}” at the start of a sentence` : checks.length ? `Is this ${shortName(e)}?` : `“${mine[0].word}” is also an everyday word`}</span>
            <button className="text-link" onClick={() => setReviewAll(!reviewAll)}>
              {reviewAll ? 'Only the unsure ones' : `Review all ${mine.length}`}
            </button>
          </div>
          {!reviewAll && (
            <p className="be-hint">
              {checks.length === 0
                ? `${plural(mine.length, 'use')} sorted ${smartActive(prefs) ? 'by smart features' : 'by a few simple rules'}${checked ? `, ${checked} by you` : ''}. Nothing needs a look.`
                : smartActive(prefs)
                  ? `“${checks[0].word}” is also an everyday word. Smart features weren’t sure about these.`
                  : `“${checks[0].word}” is also an everyday word, so these weren’t counted. Say which ones mean ${shortName(e)}.`}
            </p>
          )}
          {checks.length > 0 && (
            <div className="be-checks">
              {checks.slice(0, reviewAll ? 60 : 6).map((h) => (
                <div key={h.key} className="be-check">
                  <span className="be-check-text">
                    <Highlight sentence={h.sentence} word={h.word} nth={+h.key.split('|')[2] || 0} />
                  </span>
                  <span className="be-check-actions">
                    <button className={`btn small ${h.source === 'writer' && h.isEntity ? 'primary' : ''}`} onClick={() => setDecision(h.key, h.source === 'writer' && h.isEntity ? null : 'yes')}>
                      {reviewAll && h.isEntity && h.source !== 'writer' ? 'Yes ✓' : 'Yes'}
                    </button>
                    <button className={`btn small ${h.source === 'writer' && !h.isEntity ? 'primary' : ''}`} onClick={() => setDecision(h.key, h.source === 'writer' && !h.isEntity ? null : 'no')}>
                      {reviewAll && !h.isEntity && h.source !== 'writer' ? 'No ✓' : 'No'}
                    </button>
                  </span>
                </div>
              ))}
              {checks.length > (reviewAll ? 60 : 6) && <p className="be-hint">{plural(checks.length - (reviewAll ? 60 : 6), 'more use')}.</p>}
            </div>
          )}
        </section>
      )}

      <section className="be-section">
        {noteBooks.length > 0 && (
          <div className="segmented be-note-tabs">
            <button className={tab === 'all' ? 'on' : ''} onClick={() => setBible({ noteTab: 'all' })}>
              Overview
            </button>
            {noteBooks.map((b) => (
              <button key={b.uuid} className={tab === b.uuid ? 'on' : ''} onClick={() => setBible({ noteTab: b.uuid })}>
                {b.label}
              </button>
            ))}
          </div>
        )}
        {noteBooks.length === 0 && <div className="be-label">Notes</div>}
        <div className="be-notes">
          {readOnly ? (
            <div className="be-notes-readonly">{noteValue || <span className="muted">No notes.</span>}</div>
          ) : (
            <MarkdownEditor
              key={`${e.id}:${tab}:${prefs.smartTypography}:${prefs.spellcheck}`}
              value={noteValue}
              onChange={(md) => setEntryNotes(e.id, tab, md)}
              placeholder={tab === 'all' ? 'Looks, history, what they want, how they talk…' : `What’s true for ${e.name || 'them'} as of this book…`}
              typography={prefs.smartTypography}
              symbolHints={prefs.symbolHints}
              spellcheck={prefs.spellcheck}
              className="notes-editor"
            />
          )}
        </div>
        {noteBooks.length > 0 && (
          <span className="be-hint">
            {tab === 'all'
              ? 'What stays true in every book.'
              : `True as of ${ctx.bookById[tab].label}. Shown while you write ${ctx.bookById[tab].title}.`}
          </span>
        )}
      </section>

      {e.type === 'character' && (
        <section className="be-section">
          <div className="be-label">Relationships</div>
          <div className="chips">
            {rels.map((r) => {
              const other = ctx.byId[r.a === e.id ? r.b : r.a];
              return (
                <button key={r.id} className="chip rel" onClick={() => setBible({ tab: 'relationships', graphSel: { kind: 'rel', id: r.id } })}>
                  <span>{other.name || 'Untitled'}</span>
                  <span className="muted">{relLabel(r, scope, ctx.uuid) || 'No label yet'}</span>
                </button>
              );
            })}
            {!readOnly && others.length > 0 && (
              <button
                className="chip ghost"
                onClick={(ev) =>
                  openMenu(
                    ev.currentTarget.getBoundingClientRect(),
                    [{ heading: 'Connect to' }, ...others.map((o) => ({ label: o.name || 'Untitled', sub: o.role, onClick: () => addRelationship(e.id, o.id) }))],
                    { width: 240 }
                  )
                }
              >
                <Plus size={12} strokeWidth={2} /> Relationship
              </button>
            )}
          </div>
        </section>
      )}

      {scenesHere.length > 0 && (
        <section className="be-section">
          <div className="be-label">Scenes set here</div>
          <div className="be-scenes">
            {scenesHere.slice(0, 12).map(({ b, ch, sc }) => (
              <div key={`${b.uuid}:${ch.id}:${sc.index}`} className="be-scene">
                <span className="be-scene-where">
                  {ctx.inSeries && scope === 'series' ? `${b.short} · ` : ''}Ch. {ch.index + 1} · {sc.index + 1}
                </span>
                <span className="be-scene-opens">{sc.opens}</span>
              </div>
            ))}
            {scenesHere.length > 12 && <p className="be-hint">and {plural(scenesHere.length - 12, 'more scene')}</p>}
          </div>
        </section>
      )}
    </article>
  );
}

