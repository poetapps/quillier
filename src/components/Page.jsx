import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Layers, ListTree, Link2, Plus } from 'lucide-react';
import {
  useStore,
  getState,
  setState,
  updateDocField,
  updateDocContent,
  setStatus,
  openMenu,
  setMainEditor,
  getMainEditor,
  togglePanel,
  addInlineNote,
  openDoc,
  setShowInManuscript,
  setEntryDate,
  addChapter,
  openCompare,
  putTakeInBook,
} from '../store.js';
import {
  findDoc,
  STATUSES,
  statusLabel,
  sceneCount,
  countWords,
  chapterNumber,
  isFolder,
  subtreeRange,
  activeDraft,
  partNumbers,
  partLabel,
  kindOf,
  wordsFor,
  countOf,
  longDate,
  todayKey,
} from '../lib/project.js';
import { beatsOf, chaptersCovering, linkedOutline, mirrorOf, outlinePath } from '../lib/structure.js';
import { beatMenu } from './Sidebar.jsx';
import { Toggle } from './ui.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import NotePeek from './NotePeek.jsx';
import { nameHintsFor } from '../lib/nameHints.js';
import { openText, takeText, takeIdOf, takeNameOf, hasTakes } from '../lib/versions.js';
import { findRegex } from '../lib/find.js';
import { refreshFind, findHits } from '../lib/findHighlight.js';
import { takeSwitcher } from './Versions.jsx';

const pad = (n) => String(n).padStart(2, '0');

// The Find tab's search while it's open, for highlighting on the page.
const findOnPage = () => {
  const s = getState();
  return s.panel && s.panelTab === 'find' && !s.focus ? findRegex(s.find.query, s.find) : null;
};

// A journal entry's date, above its title. Click to move the entry to another day.
function EntryDate({ doc }) {
  const ref = useRef(null);
  const today = doc.date === todayKey();
  return (
    <div className="page-kicker entry-date">
      <button className="entry-date-btn" title="Change the date" onClick={() => ref.current?.showPicker?.()}>
        {longDate(doc.date)}
        {today && <span className="entry-today">Today</span>}
      </button>
      <input
        ref={ref}
        type="date"
        className="entry-date-input"
        tabIndex={-1}
        aria-label="Entry date"
        value={doc.date}
        onChange={(e) => e.target.value && setEntryDate(doc.id, e.target.value)}
      />
    </div>
  );
}

// The path of folders a notebook page sits in: "Biology › Cells".
function folderPath(list, id) {
  const names = [];
  for (let d = list.find((x) => x.id === id); d?.parent; ) {
    d = list.find((x) => x.id === d.parent);
    if (d) names.unshift(d.title || 'Untitled');
  }
  return names;
}

function TitleInput({ doc, readOnly }) {
  const ref = useRef(null);
  const focusTitleId = useStore((s) => s.focusTitleId);
  useEffect(() => {
    if (focusTitleId === doc.id && ref.current) {
      ref.current.focus();
      ref.current.select();
      setState({ focusTitleId: null });
    }
  }, [focusTitleId, doc.id]);
  return (
    <textarea
      ref={ref}
      className="page-title"
      rows={1}
      value={doc.title}
      placeholder="Untitled"
      readOnly={readOnly}
      spellCheck={false}
      onChange={(e) => updateDocField(doc.id, 'title', e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.target.selectionStart === e.target.value.length)) {
          e.preventDefault();
          getMainEditor()?.commands.focus('start');
        }
      }}
    />
  );
}

function StatusPicker({ doc }) {
  return (
    <button
      className="meta-btn"
      onClick={(e) =>
        openMenu(
          e.currentTarget.getBoundingClientRect(),
          STATUSES.map((s) => ({ label: s.label, checked: s.id === doc.status, onClick: () => setStatus(doc.id, s.id) })),
          { width: 170 }
        )
      }
    >
      <span className={`status-dot s-${doc.status}`} />
      {statusLabel(doc.status)}
      <ChevronDown size={14} strokeWidth={1.7} />
    </button>
  );
}

// Which take of the chapter is on the page, when it has more than one.
function TakeButton({ project, doc, text }) {
  return (
    <button
      className="meta-btn"
      title="This chapter’s takes"
      onClick={(e) => openMenu(e.currentTarget.getBoundingClientRect(), takeSwitcher(project, doc), { width: 250 })}
    >
      <Layers size={14} strokeWidth={1.7} />
      Take: {text.name}
      <ChevronDown size={14} strokeWidth={1.7} />
    </button>
  );
}

// Writing in a take that isn't the one in the book.
function TakeBanner({ doc, text }) {
  return (
    <div className="take-banner">
      <span>
        You’re writing in <b>{text.name}</b>. It isn’t in the book, so export and word counts still use <b>{takeNameOf(doc)}</b>.
      </span>
      <button className="btn small" onClick={() => openCompare(doc.id, `t:${takeIdOf(doc)}`)}>
        Compare
      </button>
      <button className="btn small primary" onClick={() => putTakeInBook(doc.id, text.id)}>
        Put this take in the book
      </button>
    </div>
  );
}

// Which outline pages this chapter covers; click to change.
function BeatsButton({ project, doc }) {
  if (!project.outline.some((s) => !isFolder(s))) return null;
  const beats = beatsOf(project, doc);
  return (
    <button
      className={`meta-btn beats-btn ${beats.length ? '' : 'empty'}`}
      title="The outline pages this chapter covers"
      onClick={(e) => beatMenu(e.currentTarget.getBoundingClientRect(), doc.id)}
    >
      <ListTree size={14} strokeWidth={1.7} />
      <span className="beats-label">{beats.length ? beats.map((b) => b.title || 'Untitled').join(', ') : 'Link to outline'}</span>
    </button>
  );
}

function CoveredBy({ project, doc }) {
  const chapters = chaptersCovering(project, doc.id);
  if (!chapters.length) return <span>Outline section</span>;
  return (
    <span className="covered-by">
      Covered in
      {chapters.map((c) => (
        <button key={c.id} className="link-btn" onClick={() => openDoc(c.id)} title={c.title}>
          Chapter {chapterNumber(project, c.id)}
        </button>
      ))}
    </span>
  );
}

function MetaToggle({ label, checked, onChange, hint }) {
  return (
    <label className="meta-toggle" title={hint}>
      <Toggle checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

// What a folder holds, for its page: chapter or page count and words written.
function folderStats(list, id) {
  const [start, end] = subtreeRange(list, id);
  const inside = list.slice(start + 1, end).filter((d) => !isFolder(d));
  return { count: inside.length, words: inside.reduce((n, d) => n + countWords(d.content), 0) };
}

export default function Page() {
  const project = useStore((s) => s.project);
  const prefs = useStore((s) => s.prefs);
  const found = findDoc(project, project.ui.openId);
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const focusBodyId = useStore((s) => s.focusBodyId);
  const textRev = useStore((s) => s.textRev);
  const findKey = useStore((s) => (s.panel && s.panelTab === 'find' && !s.focus ? `${s.find.query}\u0001${s.find.matchCase}\u0001${s.find.wholeWord}` : ''));
  const findJump = useStore((s) => s.findJump);
  const pk = kindOf(project);
  const wording = wordsFor(project);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [found?.doc.id]);

  // A new journal entry starts with the cursor in its text. (The last page's editor is destroyed a
  // little later, so wait for the one that's actually on the page.)
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.view.dom.isConnected && focusBodyId && focusBodyId === found?.doc.id) {
      editor.commands.focus('end');
      setState({ focusBodyId: null });
    }
  }, [editor, focusBodyId, found?.doc.id]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) refreshFind(editor);
  }, [editor, findKey]);

  // Opened from the Find tab: show the match it was opened on. The editor has to be this page's
  // (the last one's is destroyed a little later), so it's checked by the page it was made for.
  const pageKey = found && `${found.doc.id}:${openText(project, found.doc).id}`;
  useEffect(() => {
    if (!editor || editor.isDestroyed || !findJump || editor.pageKey !== pageKey || pageKey !== `${findJump.docId}:${findJump.takeId}`) return;
    refreshFind(editor, findJump.index);
    const hit = findHits(editor)[findJump.index];
    if (hit) {
      editor.commands.setTextSelection(hit);
      requestAnimationFrame(() => scrollRef.current?.querySelector('.find-hit.current')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    setState({ findJump: null });
  }, [editor, findJump, pageKey]);

  if (!found) {
    if (pk === 'book') return <div className="page-scroll" />;
    return (
      <div className="page-scroll">
        <div className="page-empty">
          <p>{pk === 'journal' ? 'No entries yet.' : 'No pages yet.'}</p>
          <button className="btn primary" onClick={() => addChapter()}>
            <Plus size={16} strokeWidth={1.8} /> New {wording.page}
          </button>
        </div>
      </div>
    );
  }
  const { doc, kind, area } = found;
  const book = pk === 'book';
  const entry = pk === 'journal' && kind === 'chapter';
  const text = openText(project, doc);
  const words = countWords(text.content);
  const scenes = sceneCount(text.content);
  const outlineFolder = kind === 'folder' && area === 'outline';
  const bookFolder = kind === 'folder' && area === 'manuscript';
  const stats = kind === 'folder' ? folderStats(area === 'outline' ? project.outline : activeDraft(project).chapters, doc.id) : null;
  const linked = bookFolder ? linkedOutline(project, doc) : null;
  const where = area === 'outline' ? outlinePath(project, doc.id) : [];

  const placeholder = {
    chapter: { book: 'Start writing…', journal: 'What’s on your mind?', notebook: 'Notes, quotes, sources, anything…' }[pk],
    section: 'Plan this part of the story…',
    notes: 'Characters, places, research, anything…',
    folder: outlineFolder
      ? 'What happens in this part of the story…'
      : book
        ? 'Notes on this part of the book. They stay out of exports.'
        : 'What this folder is for. It stays out of exports.',
  }[kind];
  const pagePath = !book && !entry && area === 'manuscript' ? folderPath(activeDraft(project).chapters, doc.id) : [];
  const kicker = {
    chapter: book ? `Chapter ${pad(chapterNumber(project, doc.id))}` : pagePath.join(' › ') || null,
    section: ['Outline', ...where].join(' · '),
    folder: outlineFolder
      ? ['Outline', ...where].join(' · ')
      : doc.part && book
        ? partLabel(partNumbers(activeDraft(project))[doc.id])
        : ['Folder', ...pagePath].join(' · '),
    notes: null,
  }[kind];

  return (
    <div className={`page-scroll kind-${pk}`} ref={scrollRef}>
      <article className="page">
        {entry ? <EntryDate doc={doc} /> : kicker && <div className="page-kicker">{kicker}</div>}
        <TitleInput doc={doc} readOnly={kind === 'notes'} />
        <div className="page-meta">
          {book && kind === 'chapter' && (
            <span className="page-meta-left">
              <StatusPicker doc={doc} />
              {hasTakes(doc) && <TakeButton project={project} doc={doc} text={text} />}
              <BeatsButton project={project} doc={doc} />
            </span>
          )}
          {kind === 'section' && <CoveredBy project={project} doc={doc} />}
          {kind === 'notes' && <span>Project notes</span>}
          {outlineFolder && (
            <MetaToggle
              label="Show in manuscript"
              hint="Gives the manuscript a matching folder (and one for each folder inside this one)"
              checked={!!mirrorOf(project, doc.id)}
              onChange={(on) => setShowInManuscript(doc.id, on)}
            />
          )}
          {bookFolder && book && (
            <span className="page-meta-left">
              <MetaToggle
                label="Book part"
                hint="Exports start this folder with its own part page, like “Part One”"
                checked={!!doc.part}
                onChange={(on) => updateDocField(doc.id, 'part', on)}
              />
              {linked && (
                <button className="meta-btn" title="Show what the outline says about it" onClick={() => togglePanel('notes')}>
                  <Link2 size={14} strokeWidth={1.7} />
                  Linked to the outline
                </button>
              )}
            </span>
          )}
          <span className="page-meta-right">
            {book && kind === 'chapter' && (
              <>
                <button className="link-btn" onClick={() => togglePanel('details')}>
                  {scenes} {scenes === 1 ? 'scene' : 'scenes'}
                </button>
                <span className="dot-sep">·</span>
              </>
            )}
            {kind === 'folder' ? (
              <>
                {area === 'outline' ? `${stats.count} ${stats.count === 1 ? 'page' : 'pages'}` : countOf(project, stats.count)}
                {area === 'manuscript' && (
                  <>
                    <span className="dot-sep">·</span>
                    {stats.words.toLocaleString()} {stats.words === 1 ? 'word' : 'words'}
                  </>
                )}
              </>
            ) : (
              <>
                {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
              </>
            )}
          </span>
        </div>
        {!text.inBook && <TakeBanner doc={doc} text={text} />}
        <div ref={bodyRef} className="page-body" onMouseDown={(e) => e.target === e.currentTarget && getMainEditor()?.commands.focus('end')}>
          <MarkdownEditor
            key={`${doc.id}:${text.id}:${textRev}:${prefs.smartTypography}:${prefs.symbolHints}:${prefs.spellcheck}:${prefs.nameHints !== false}`}
            value={text.content}
            onChange={(md, anchors) => updateDocContent(doc.id, md, anchors, text.id)}
            getNotes={() => {
              const d = findDoc(getState().project, doc.id)?.doc;
              return (d && takeText(d, text.id)?.inlineNotes) || [];
            }}
            onAddNote={addInlineNote}
            onActiveNote={(noteId) => getState().activeNoteId !== noteId && setState({ activeNoteId: noteId })}
            placeholder={placeholder}
            typography={prefs.smartTypography}
            symbolHints={prefs.symbolHints}
            getNames={book && prefs.nameHints !== false ? () => nameHintsFor(getState().project, getState().series) : null}
            getFind={findOnPage}
            spellcheck={prefs.spellcheck}
            className="page-editor"
            formatBar
            onReady={(ed) => {
              ed.pageKey = `${doc.id}:${text.id}`;
              setMainEditor(ed);
              setEditor(ed);
            }}
          />
          {editor && !editor.isDestroyed && <NotePeek key={`${doc.id}:${text.id}`} editor={editor} docId={doc.id} containerRef={bodyRef} />}
        </div>
      </article>
    </div>
  );
}
