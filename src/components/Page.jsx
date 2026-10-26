import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
} from '../store.js';
import { findDoc, STATUSES, statusLabel, sceneCount, countWords } from '../lib/project.js';
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
  const { doc, kind, index } = found;
  const words = countWords(doc.content);
  const scenes = sceneCount(doc.content);

  const placeholder =
    kind === 'chapter' ? 'Start writing…' : kind === 'section' ? 'Plan this part of the story…' : 'Characters, places, research, anything…';

  return (
    <div className="page-scroll" ref={scrollRef}>
      <article className="page">
        {kind === 'chapter' && <div className="page-kicker">Chapter {pad(index + 1)}</div>}
        {kind === 'section' && <div className="page-kicker">Outline</div>}
        <TitleInput doc={doc} readOnly={kind === 'notes'} />
        <div className="page-meta">
          {kind === 'chapter' ? <StatusPicker doc={doc} /> : <span>{kind === 'notes' ? 'Project notes' : 'Outline section'}</span>}
          <span className="page-meta-right">
            {kind === 'chapter' && (
              <>
                <button className="link-btn" onClick={() => togglePanel('details')}>
                  {scenes} {scenes === 1 ? 'scene' : 'scenes'}
                </button>
                <span className="dot-sep">·</span>
              </>
            )}
            {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
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
