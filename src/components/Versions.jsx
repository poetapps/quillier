import { useEffect, useRef, useState } from 'react';
import { Bookmark, BookCheck, Check, Columns2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  useStore,
  setState,
  openMenu,
  openTake,
  newTake,
  renameTake,
  putTakeInBook,
  deleteTake,
  saveVersion,
  renameVersion,
  deleteVersion,
  restoreVersion,
  openCompare,
} from '../store.js';
import { countWords, isBook, wordsFor } from '../lib/project.js';
import { allTakes, openText, versionsOf, versionWhen, dayLabel } from '../lib/versions.js';

const words = (md) => {
  const n = countWords(md);
  return `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;
};

// The menu for one take (its card's ··· button, or right-click).
export function takeItems(project, doc, take) {
  const open = openText(project, doc);
  return [
    take.id !== open.id && { label: 'Open', icon: Pencil, onClick: () => openTake(doc.id, take.id) },
    !take.inBook && { label: 'Put in the book', icon: BookCheck, onClick: () => putTakeInBook(doc.id, take.id) },
    take.id !== open.id && { label: `Compare with “${open.name}”`, icon: Columns2, onClick: () => openCompare(doc.id, `t:${take.id}`) },
    { label: 'Rename…', icon: Pencil, onClick: () => renameTake(doc.id, take.id) },
    !take.inBook && { separator: true },
    !take.inBook && { label: 'Delete take', icon: Trash2, danger: true, onClick: () => deleteTake(doc.id, take.id) },
  ];
}

// The "Take: …" button under a chapter's title: switch takes, start one, compare.
export function takeSwitcher(project, doc) {
  const open = openText(project, doc);
  const takes = allTakes(doc);
  const other = open.inBook ? takes[1] : takes[0];
  return [
    { heading: 'Takes' },
    ...takes.map((t) => ({ label: t.name, checked: t.id === open.id, hint: t.inBook ? 'In the book' : null, onClick: () => openTake(doc.id, t.id) })),
    { separator: true },
    { label: 'New take from this one…', icon: Plus, onClick: () => newTake(doc.id) },
    !open.inBook && { label: 'Put this take in the book', icon: BookCheck, onClick: () => putTakeInBook(doc.id, open.id) },
    other && { label: `Compare with “${other.name}”`, icon: Columns2, onClick: () => openCompare(doc.id, `t:${other.id}`) },
    { label: 'Rename take…', icon: Pencil, onClick: () => renameTake(doc.id, open.id) },
  ];
}

function TakeCard({ project, doc, take, open }) {
  const menu = (anchor) => openMenu(anchor, takeItems(project, doc, take), { width: 230 });
  return (
    <div
      className={`take-card ${open ? 'open' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        menu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button className="take-main" onClick={() => openTake(doc.id, take.id)} title={open ? 'Open on the page' : 'Open this take'}>
        <span className="take-name">{take.name}</span>
        <span className="take-sub">
          {take.inBook && (
            <>
              <Check size={12} strokeWidth={2.2} /> In the book ·{' '}
            </>
          )}
          {words(take.content)}
          {!take.inBook && take.createdAt && ` · started ${dayLabel(take.createdAt)}`}
        </span>
      </button>
      <button className="take-more icon-btn" title="More" aria-label={`More for ${take.name}`} onClick={(e) => menu(e.currentTarget.getBoundingClientRect())}>
        <MoreHorizontal size={15} strokeWidth={1.7} />
      </button>
    </div>
  );
}

function VersionRow({ doc, v, on }) {
  const items = [
    { label: on ? 'Comparing' : 'Compare with now', icon: Columns2, disabled: on, onClick: () => openCompare(doc.id, `v:${v.id}`) },
    { label: 'Restore this version', icon: RotateCcw, onClick: () => restoreVersion(doc.id, v.id) },
    { separator: true },
    { label: 'Rename…', icon: Pencil, onClick: () => renameVersion(doc.id, v.id) },
    { label: 'Delete', icon: Trash2, danger: true, onClick: () => deleteVersion(doc.id, v.id) },
  ];
  return (
    <li
      className={`ver-row ${on ? 'on' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu({ x: e.clientX, y: e.clientY }, items, { width: 210 });
      }}
    >
      <span className={`ver-dot ${on ? 'on' : v.auto ? 'auto' : ''}`} />
      <button className="ver-btn" onClick={() => openCompare(doc.id, `v:${v.id}`)} title="Compare with what’s on the page">
        <span className="ver-name">{v.name}</span>
        <span className="ver-sub">{versionWhen(v)}</span>
      </button>
      <span className="ver-words">{on ? 'Comparing' : words(v.content)}</span>
      <button
        className="ver-more icon-btn"
        title="More"
        aria-label={`More for ${v.name}`}
        onClick={(e) => openMenu(e.currentTarget.getBoundingClientRect(), items, { width: 210, align: 'right' })}
      >
        <MoreHorizontal size={15} strokeWidth={1.7} />
      </button>
    </li>
  );
}

// The panel's Versions tab: a chapter's takes (books only) and its saved versions.
export default function Versions({ project, found }) {
  const compare = useStore((s) => s.compare);
  const formAsked = useStore((s) => s.versionForm);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!formAsked) return;
    setSaving(true);
    setState({ versionForm: null });
  }, [formAsked]);
  useEffect(() => {
    if (saving) inputRef.current?.focus();
  }, [saving]);

  if (found.kind !== 'chapter') {
    return <div className="panel-scroll panel-empty">Open a {wordsFor(project).page} to see its saved versions.</div>;
  }
  const doc = found.doc;
  const open = openText(project, doc);
  const takes = allTakes(doc);
  const versions = versionsOf(doc, open.id);
  const book = isBook(project);
  const done = () => {
    setSaving(false);
    setName('');
  };

  return (
    <div className="panel-scroll">
      {book && (
        <>
          <div className="panel-label panel-label-row">
            <span>Takes</span>
            <button className="panel-head-btn" onClick={() => newTake(doc.id)}>
              <Plus size={13} strokeWidth={1.9} /> New take
            </button>
          </div>
          <div className="take-list">
            {takes.map((t) => (
              <TakeCard key={t.id} project={project} doc={doc} take={t} open={!compare && t.id === open.id} />
            ))}
          </div>
          {takes.length === 1 && (
            <p className="panel-hint">A take is another version of this chapter to write in, like a different ending. Only the one in the book is exported.</p>
          )}
        </>
      )}

      <div className="panel-label panel-label-row">
        <span>Saved versions</span>
        {!saving && (
          <button className="panel-head-btn" onClick={() => setSaving(true)} title="Save a version  ⌥⌘S">
            <Bookmark size={13} strokeWidth={1.9} /> Save version
          </button>
        )}
      </div>
      {saving && (
        <form
          className="ver-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveVersion(doc.id, name);
            done();
          }}
        >
          <input
            ref={inputRef}
            className="text-input"
            value={name}
            placeholder="Name it (optional), like “Before the big cut”"
            aria-label="Version name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && done()}
          />
          <span className="ver-form-btns">
            <button type="button" className="btn small" onClick={done}>
              Cancel
            </button>
            <button type="submit" className="btn small primary">
              Save
            </button>
          </span>
        </form>
      )}
      <ol className="ver-list">
        <li className="ver-row now">
          <span className="ver-dot now" />
          <div className="ver-btn">
            <span className="ver-name">Now</span>
            <span className="ver-sub">
              {words(open.content)} · {takes.length > 1 ? open.name : 'what’s on the page'}
            </span>
          </div>
        </li>
        {versions.map((v) => (
          <VersionRow key={v.id} doc={doc} v={v} on={compare?.docId === doc.id && compare.against === `v:${v.id}`} />
        ))}
      </ol>
      <p className="panel-hint">
        {versions.length
          ? 'Click a version to compare it with what’s on the page. One is also saved each time you sit down to write; older automatic ones thin out to one a day.'
          : 'Save a version before a big change, so you can compare and go back. One is also saved each time you sit down to write.'}
      </p>
    </div>
  );
}
