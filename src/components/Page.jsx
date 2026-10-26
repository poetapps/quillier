import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ListTree, Link2 } from 'lucide-react';
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
} from '../store.js';
import { findDoc, STATUSES, statusLabel, sceneCount, countWords, chapterNumber, isFolder, subtreeRange, activeDraft, partNumbers, partLabel } from '../lib/project.js';
import { beatsOf, chaptersCovering, linkedOutline, mirrorOf, outlinePath } from '../lib/structure.js';
import { beatMenu } from './Sidebar.jsx';
import { Toggle } from './ui.jsx';
import MarkdownEditor from './MarkdownEditor.jsx';
import NotePeek from './NotePeek.jsx';
import { nameHintsFor } from '../lib/nameHints.js';

const pad = (n) => String(n).padStart(2, '0');

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

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [found?.doc.id]);

  if (!found) {
    return <div className="page-scroll" />;
  }
  const { doc, kind, area } = found;
  const words = countWords(doc.content);
  const scenes = sceneCount(doc.content);
  const outlineFolder = kind === 'folder' && area === 'outline';
  const bookFolder = kind === 'folder' && area === 'manuscript';
  const stats = kind === 'folder' ? folderStats(area === 'outline' ? project.outline : activeDraft(project).chapters, doc.id) : null;
  const linked = bookFolder ? linkedOutline(project, doc) : null;
  const where = area === 'outline' ? outlinePath(project, doc.id) : [];

  const placeholder = {
    chapter: 'Start writing…',
    section: 'Plan this part of the story…',
    notes: 'Characters, places, research, anything…',
    folder: outlineFolder ? 'What happens in this part of the story…' : 'Notes on this part of the book. They stay out of exports.',
  }[kind];
  const kicker = {
    chapter: `Chapter ${pad(chapterNumber(project, doc.id))}`,
    section: ['Outline', ...where].join(' · '),
    folder: outlineFolder ? ['Outline', ...where].join(' · ') : doc.part ? partLabel(partNumbers(activeDraft(project))[doc.id]) : 'Folder',
    notes: null,
  }[kind];

  return (
    <div className="page-scroll" ref={scrollRef}>
      <article className="page">
        {kicker && <div className="page-kicker">{kicker}</div>}
        <TitleInput doc={doc} readOnly={kind === 'notes'} />
        <div className="page-meta">
          {kind === 'chapter' && (
            <span className="page-meta-left">
              <StatusPicker doc={doc} />
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
          {bookFolder && (
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
            {kind === 'chapter' && (
              <>
                <button className="link-btn" onClick={() => togglePanel('details')}>
                  {scenes} {scenes === 1 ? 'scene' : 'scenes'}
                </button>
                <span className="dot-sep">·</span>
              </>
            )}
            {kind === 'folder' ? (
              <>
                {stats.count} {area === 'outline' ? (stats.count === 1 ? 'page' : 'pages') : stats.count === 1 ? 'chapter' : 'chapters'}
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
        <div ref={bodyRef} className="page-body" onMouseDown={(e) => e.target === e.currentTarget && getMainEditor()?.commands.focus('end')}>
          <MarkdownEditor
            key={`${doc.id}:${prefs.smartTypography}:${prefs.symbolHints}:${prefs.spellcheck}:${prefs.nameHints !== false}`}
            value={doc.content}
            onChange={(md, anchors) => updateDocContent(doc.id, md, anchors)}
            getNotes={() => findDoc(getState().project, doc.id)?.doc.inlineNotes || []}
            onAddNote={addInlineNote}
            onActiveNote={(noteId) => getState().activeNoteId !== noteId && setState({ activeNoteId: noteId })}
            placeholder={placeholder}
            typography={prefs.smartTypography}
            symbolHints={prefs.symbolHints}
            getNames={prefs.nameHints !== false ? () => nameHintsFor(getState().project, getState().series) : null}
            spellcheck={prefs.spellcheck}
            className="page-editor"
            formatBar
            onReady={(ed) => {
              setMainEditor(ed);
              setEditor(ed);
            }}
          />
          {editor && !editor.isDestroyed && <NotePeek key={doc.id} editor={editor} docId={doc.id} containerRef={bodyRef} />}
        </div>
      </article>
    </div>
  );
}
