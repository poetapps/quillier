import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useStore, setState, togglePanel, updateDocField, updateInlineNote, deleteInlineNote, jumpToNote, showBible } from '../store.js';
import { useBible } from '../lib/useBible.js';
import {
  findDoc,
  countWords,
  splitScenes,
  excerpt,
  statusLabel,
  manuscriptWords,
  activeDraft,
  todayKey,
} from '../lib/project.js';
import MarkdownEditor from './MarkdownEditor.jsx';

function scrollToScene(i) {
  const editor = document.querySelector('.page-editor');
  if (!editor) return;
  const target = i === 0 ? editor : editor.querySelectorAll('hr')[i - 1];
  target?.scrollIntoView({ behavior: 'smooth', block: i === 0 ? 'start' : 'center' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function History({ daily }) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    days.push({ key, n: daily[key] || 0, label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) });
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <div className="history">
      {days.map((d) => (
        <div key={d.key} className="history-col" title={`${d.label}: ${d.n.toLocaleString()} net words`}>
          <div className={`history-bar ${d.n > 0 ? '' : 'empty'}`} style={{ height: `${Math.max(2, (Math.max(0, d.n) / max) * 100)}%` }} />
        </div>
      ))}
    </div>
  );
}

// Characters and places from the story bible mentioned in this chapter.
function InThisChapter({ doc }) {
  const { ctx, analysis } = useBible();
  const ch = analysis.books[ctx.uuid]?.chapters.find((c) => c.id === doc.id);
  const items = Object.entries(ch?.counts || {})
    .filter(([id, n]) => n > 0 && ctx.byId[id])
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ e: ctx.byId[id], n }));
  return (
    <>
      <div className="panel-label">In this chapter</div>
      {items.length ? (
        <div className="itc-list">
          {items.map(({ e, n }) => (
            <button
              key={e.id}
              className="itc-row"
              onClick={() => showBible({ tab: e.type === 'place' ? 'places' : 'characters', selected: e.id, noteTab: 'all' })}
              title="Open in the story bible"
            >
              <span className={`itc-dot ${e.type}`} />
              <span className="itc-name">{e.name}</span>
              <span className="itc-count">{n}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="panel-hint">{ctx.entries.length ? 'No one from the story bible is mentioned yet.' : 'Add characters and places in the story bible to see who’s in each chapter.'}</p>
      )}
      {items.length > 0 && <p className="panel-hint">Found by name and alias. Nothing is added to your text, so exports stay clean.</p>}
    </>
  );
}

function Details({ project, found }) {
  const prefs = useStore((s) => s.prefs);
  const { doc, kind } = found;
  const words = countWords(doc.content);
  const scenes = kind === 'chapter' ? splitScenes(doc.content).filter(Boolean) : [];
  const total = manuscriptWords(project);
  const today = project.stats.daily[todayKey()] || 0;
  const goal = prefs.dailyGoal || 0;

  return (
    <div className="panel-scroll">
      <div className="panel-label">{kind === 'chapter' ? 'This chapter' : kind === 'section' ? 'This section' : 'Notes'}</div>
      <div className="stat-grid">
        <div>
          <b>{words.toLocaleString()}</b>
          <span>words</span>
        </div>
        <div>
          <b>{Math.max(words ? 1 : 0, Math.round(words / 230))}</b>
          <span>min read</span>
        </div>
        {kind === 'chapter' && (
          <div>
            <b>{scenes.length}</b>
            <span>{scenes.length === 1 ? 'scene' : 'scenes'}</span>
          </div>
        )}
      </div>

      {kind === 'chapter' && <InThisChapter doc={doc} />}

      {kind === 'chapter' && scenes.length > 0 && (
        <>
          <div className="panel-label">Scenes</div>
          <div className="scene-list">
            {scenes.map((s, i) => (
              <button key={i} className="scene-row" onClick={() => scrollToScene(i)}>
                <span className="scene-num">{i + 1}</span>
                <span className="scene-text">{excerpt(s) || 'Empty scene'}</span>
                <span className="scene-words">{countWords(s).toLocaleString()}</span>
              </button>
            ))}
          </div>
          <p className="panel-hint">Type *** on its own line and press Enter, or press ⌘↵, to start a new scene.</p>
        </>
      )}

      <div className="panel-label">Writing</div>
      <div className="kv">
        <span>Today</span>
        <b>
          {today > 0 ? '+' : ''}
          {today.toLocaleString()} net words
        </b>
      </div>
      {goal > 0 && (
        <div className="goal">
          <div className="goal-bar">
            <div style={{ width: `${Math.min(100, (Math.max(0, today) / goal) * 100)}%` }} />
          </div>
          <span>
            {Math.min(100, Math.round((Math.max(0, today) / goal) * 100))}% of {goal.toLocaleString()}
          </span>
        </div>
      )}
      <div className="kv">
        <span>Manuscript</span>
        <b>{total.toLocaleString()} words</b>
      </div>
      <div className="kv">
        <span>Chapters</span>
        <b>{activeDraft(project).chapters.length}</b>
      </div>
      <div className="panel-sublabel">Last 14 days</div>
      <History daily={project.stats.daily} />

      {kind !== 'notes' && (
        <>
          <div className="panel-label">Info</div>
          {kind === 'chapter' && (
            <div className="kv">
              <span>Status</span>
              <b>{statusLabel(doc.status)}</b>
            </div>
          )}
          <div className="kv">
            <span>Created</span>
            <b>{fmtDate(doc.createdAt)}</b>
          </div>
          <div className="kv">
            <span>Last edited</span>
            <b>{fmtDate(doc.updatedAt)}</b>
          </div>
        </>
      )}
    </div>
  );
}

function InlineNoteCard({ docId, note }) {
  const textRef = useRef(null);
  const cardRef = useRef(null);
  const focusNoteId = useStore((s) => s.focusNoteId);
  const active = useStore((s) => s.activeNoteId === note.id);

  useEffect(() => {
    if (focusNoteId === note.id) {
      textRef.current?.focus();
      setState({ focusNoteId: null });
    }
  }, [focusNoteId, note.id]);

  useEffect(() => {
    if (active) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <div ref={cardRef} className={`inote ${active ? 'active' : ''} ${note.detached ? 'detached' : ''}`}>
      <button className="inote-quote" onClick={() => jumpToNote(note.id)} title={note.detached ? 'This text was deleted' : 'Go to this passage'}>
        {note.quote}
      </button>
      <textarea
        ref={textRef}
        className="inote-text"
        rows={1}
        value={note.text}
        placeholder="Write a note…"
        onChange={(e) => updateInlineNote(docId, note.id, e.target.value)}
        onFocus={() => setState({ activeNoteId: note.id })}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            jumpToNote(note.id);
          }
        }}
      />
      {note.detached && <div className="inote-detached">The text this note was on has been deleted.</div>}
      <button className="inote-del" title="Delete note" onClick={() => deleteInlineNote(docId, note.id)}>
        <X size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function InlineNotes({ doc }) {
  const notes = [...(doc.inlineNotes || [])].sort((a, b) => !!a.detached - !!b.detached || (a.offset || 0) - (b.offset || 0));
  return (
    <>
      <div className="panel-label">
        On the page{notes.length > 0 && <span className="panel-count">{notes.length}</span>}
      </div>
      {notes.length ? (
        <div className="inote-list">
          {notes.map((n) => (
            <InlineNoteCard key={n.id} docId={doc.id} note={n} />
          ))}
        </div>
      ) : (
        <p className="panel-hint">Select some text and press ⌥⌘M (or the note button in the formatting bar) to pin a note to it.</p>
      )}
    </>
  );
}

export default function RightPanel() {
  const project = useStore((s) => s.project);
  const tab = useStore((s) => s.panelTab);
  const prefs = useStore((s) => s.prefs);
  const view = useStore((s) => s.view);
  const found = view === 'page' ? findDoc(project, project.ui.openId) : null;

  return (
    <aside className="panel">
      <div className="panel-top drag">
        <div className="tabs no-drag">
          <button className={tab === 'notes' ? 'on' : ''} onClick={() => setState({ panelTab: 'notes' })}>
            Notes
          </button>
          <button className={tab === 'details' ? 'on' : ''} onClick={() => setState({ panelTab: 'details' })}>
            Details
          </button>
        </div>
        <button className="icon-btn no-drag" title="Close panel" onClick={() => togglePanel()}>
          <X size={17} strokeWidth={1.7} />
        </button>
      </div>
      {!found ? (
        <div className="panel-scroll panel-empty">Open a page to see its notes.</div>
      ) : tab === 'notes' ? (
        <div className="panel-scroll panel-notes">
          <div className="panel-label">
            {found.kind === 'chapter' ? 'Chapter notes' : found.kind === 'section' ? 'Section notes' : 'Side notes'}
          </div>
          <div className="free-notes">
            <MarkdownEditor
              key={`notes:${found.doc.id}:${prefs.smartTypography}:${prefs.symbolHints}:${prefs.spellcheck}`}
              value={found.doc.notes}
              onChange={(md) => updateDocField(found.doc.id, 'notes', md)}
              placeholder="Reminders, ideas, things to fix later…"
              typography={prefs.smartTypography}
              symbolHints={prefs.symbolHints}
              spellcheck={prefs.spellcheck}
              className="notes-editor"
            />
          </div>
          <InlineNotes doc={found.doc} />
        </div>
      ) : (
        <Details project={project} found={found} />
      )}
    </aside>
  );
}
