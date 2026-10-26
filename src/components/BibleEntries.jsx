import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, MoreHorizontal, Trash2, Repeat, ExternalLink } from 'lucide-react';
import { useStore, setBible, openMenu, openProjectAt, smartActive } from '../store.js';
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
} from '../bibleActions.js';
import { relLabel, sceneCast, needsCheck } from '../lib/bible.js';
import MarkdownEditor from './MarkdownEditor.jsx';
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
  const all = view.entries.filter((e) => e.type === type);
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
            <button key={e.id} className={`be-item ${sel?.id === e.id ? 'on' : ''}`} onClick={() => setBible({ selected: e.id, noteTab: 'all' })}>
              <span className="be-item-top">
                <span className="be-item-name">{e.name || 'Untitled'}</span>
                <span className="be-item-count">{fmt(total(e))}</span>
              </span>
              {e.role && <span className="be-item-role">{e.role}</span>}
              {ctx.inSeries && <OwnerBadge e={e} ctx={ctx} />}
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

function EntryDetail({ e, ctx, analysis, view, scope }) {
  const focusName = useStore((s) => s.bible.focusName);
  const noteTab = useStore((s) => s.bible.noteTab);
  const prefs = useStore((s) => s.prefs);
  const nameRef = useRef(null);
  const [reviewAll, setReviewAll] = useState(false);
  const readOnly = e.store === 'sibling';
  const uuid = ctx.uuid;

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
      <input
        ref={nameRef}
        className="be-name"
        value={e.name}
        readOnly={readOnly}
        placeholder={e.type === 'place' ? 'Name of the place' : 'Name'}
        spellCheck={false}
        onChange={(ev) => renameEntry(e.id, ev.target.value)}
      />
      <input
        className="be-role"
        value={e.role}
        readOnly={readOnly}
        placeholder={e.type === 'place' ? 'What kind of place, in a few words' : 'Who they are, in a few words'}
        onChange={(ev) => updateEntry(e.id, { role: ev.target.value })}
      />
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

