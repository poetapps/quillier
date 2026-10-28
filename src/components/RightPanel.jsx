import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { X, Folder, ListTree } from 'lucide-react';
import { useStore, setState, setPrefs, togglePanel, updateDocField, updateInlineNote, deleteInlineNote, jumpToNote, showBible, openDoc } from '../store.js';
import { useBible } from '../lib/useBible.js';
import {
  findDoc,
  countWords,
  splitScenes,
  excerpt,
  statusLabel,
  manuscriptWords,
  activeDraft,
  chaptersOf,
  todayKey,
  isFolder,
  subtreeRange,
  bookStatus,
  isBook,
  wordsFor,
} from '../lib/project.js';
import { beatsOf, linkedOutline, outlinePath } from '../lib/structure.js';
import { openText } from '../lib/versions.js';
import MarkdownEditor from './MarkdownEditor.jsx';
import Versions from './Versions.jsx';
import { Toggle } from './ui.jsx';

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

// Markdown from the outline, shown read-only. Raw HTML in it can't run anything.
function safeHtml(md) {
  const tpl = document.createElement('template');
  tpl.innerHTML = marked.parse(md || '');
  tpl.content.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta, img, video, audio').forEach((el) => el.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
  });
  return tpl.innerHTML;
}

function OutlineCard({ project, doc }) {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => safeHtml(doc.content), [doc.content]);
  const long = doc.content.length > 420;
  const path = outlinePath(project, doc.id).join(' › ');
  const Icon = isFolder(doc) ? Folder : ListTree;
  return (
    <div className="ocard">
      <button className="ocard-title" onClick={() => openDoc(doc.id)} title="Open in the outline">
        <Icon size={14} strokeWidth={1.7} />
        <span className="ocard-name">{doc.title || 'Untitled'}</span>
        {path && <span className="ocard-path">{path}</span>}
      </button>
      {doc.content.trim() ? (
        <div className={`ocard-body ${long && !open ? 'clamped' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="panel-hint">Nothing written here yet.</p>
      )}
      {long && (
        <button className="ocard-more" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

// What the outline says about this chapter (the pages it covers) or this folder (the one it's linked to).
function FromOutline({ project, found }) {
  const { doc, kind, area } = found;
  const items = kind === 'chapter' ? beatsOf(project, doc) : kind === 'folder' && area === 'manuscript' ? [linkedOutline(project, doc)].filter(Boolean) : [];
  if (!items.length) return null;
  return (
    <>
      <div className="panel-label">From the outline</div>
      <div className="ocard-list">
        {items.map((s) => (
          <OutlineCard key={s.id} project={project} doc={s} />
        ))}
      </div>
    </>
  );
}

function FolderDetails({ project, found }) {
  const list = found.area === 'outline' ? project.outline : activeDraft(project).chapters;
  const [start, end] = subtreeRange(list, found.doc.id);
  const pages = list.slice(start + 1, end).filter((d) => !isFolder(d));
  const words = pages.reduce((n, d) => n + countWords(d.content), 0);
  return (
    <>
      <div className="panel-label">{found.doc.part ? 'This part' : 'This folder'}</div>
      <div className="stat-grid">
        <div>
          <b>{pages.length}</b>
          <span>{found.area === 'outline' ? (pages.length === 1 ? 'page' : 'pages') : pages.length === 1 ? wordsFor(project).page : wordsFor(project).pages}</span>
        </div>
        <div>
          <b>{words.toLocaleString()}</b>
          <span>words</span>
        </div>
      </div>
      {found.area === 'manuscript' && isBook(project) && pages.length > 0 && (
        <div className="kv">
          <span>Status</span>
          <b>{statusLabel(bookStatus(pages))}</b>
        </div>
      )}
    </>
  );
}

function Details({ project, found }) {
  const prefs = useStore((s) => s.prefs);
  const { doc, kind } = found;
  const text = openText(project, doc).content;
  const words = countWords(text);
  const scenes = kind === 'chapter' ? splitScenes(text).filter(Boolean) : [];
  const total = manuscriptWords(project);
  const today = project.stats.daily[todayKey()] || 0;
  const goal = prefs.dailyGoal || 0;
  const book = isBook(project);

  return (
    <div className="panel-scroll">
      {kind === 'folder' ? (
        <FolderDetails project={project} found={found} />
      ) : (
        <>
      <div className="panel-label">{kind === 'chapter' ? `This ${wordsFor(project).page}` : kind === 'section' ? 'This section' : 'Notes'}</div>
      <div className="stat-grid">
        <div>
          <b>{words.toLocaleString()}</b>
          <span>words</span>
        </div>
        <div>
          <b>{Math.max(words ? 1 : 0, Math.round(words / 230))}</b>
          <span>min read</span>
        </div>
        {book && kind === 'chapter' && (
          <div>
            <b>{scenes.length}</b>
            <span>{scenes.length === 1 ? 'scene' : 'scenes'}</span>
          </div>
        )}
      </div>
        </>
      )}

      {book && kind === 'chapter' && <InThisChapter doc={doc} />}

      {book && kind === 'chapter' && scenes.length > 0 && (
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
        <span>{wordsFor(project).whole}</span>
        <b>{total.toLocaleString()} words</b>
      </div>
      <div className="kv">
        <span>{wordsFor(project).Pages}</span>
        <b>{chaptersOf(activeDraft(project)).length}</b>
      </div>
      <div className="panel-sublabel">Last 14 days</div>
      <History daily={project.stats.daily} />

      {kind !== 'notes' && (
        <>
          <div className="panel-label">Info</div>
          {book && kind === 'chapter' && (
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

// Ids of the notes whose passage is on screen, kept current as the page scrolls, resizes or changes.
function useNotesInView(docId, enabled) {
  const [ids, setIds] = useState(null);
  useEffect(() => {
    setIds(null);
    const scroller = enabled && document.querySelector('.page-scroll');
    if (!scroller) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const view = scroller.getBoundingClientRect();
      const seen = new Set();
      for (const el of scroller.querySelectorAll('.page-editor [data-note]')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > view.top && r.top < view.bottom) seen.add(el.dataset.note);
      }
      setIds((prev) => (prev && prev.size === seen.size && [...seen].every((id) => prev.has(id)) ? prev : seen));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const changes = new MutationObserver(schedule);
    changes.observe(scroller, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-note'] });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      changes.disconnect();
    };
  }, [docId, enabled]);
  return ids;
}

// Notes pinned to passages. Unless "Show all" is on, only the ones on text you can see are listed
// (plus the one you're working on), so the list follows you down the page.
function InlineNotes({ doc, kind }) {
  const project = useStore((s) => s.project);
  const showAll = useStore((s) => s.prefs.notesShowAll === true);
  const activeId = useStore((s) => s.activeNoteId);
  const all = [...openText(project, doc).inlineNotes].sort((a, b) => !!a.detached - !!b.detached || (a.offset || 0) - (b.offset || 0));
  const inView = useNotesInView(doc.id, !showAll && all.length > 0);
  const notes = showAll || !inView ? all : all.filter((n) => inView.has(n.id) || n.id === activeId);
  const elsewhere = all.length - notes.length;
  const where = kind === 'chapter' ? wordsFor(project).page : kind === 'notes' ? 'page' : kind;
  return (
    <>
      <div className="panel-label panel-label-row">
        <span>
          On the page
          {all.length > 0 && <span className="panel-count">{showAll || !elsewhere ? all.length : `${notes.length} of ${all.length}`}</span>}
        </span>
        {all.length > 0 && (
          <label className="panel-switch" title="When off, only notes on the text you can see are listed">
            Show all
            <Toggle checked={showAll} onChange={(on) => setPrefs({ notesShowAll: on })} />
          </label>
        )}
      </div>
      {notes.length > 0 && (
        <div className="inote-list">
          {notes.map((n) => (
            <InlineNoteCard key={n.id} docId={doc.id} note={n} />
          ))}
        </div>
      )}
      {!all.length && <p className="panel-hint">Select some text and press ⌥⌘M (or the note button in the formatting bar) to pin a note to it.</p>}
      {elsewhere > 0 && (
        <button className="panel-more" onClick={() => setPrefs({ notesShowAll: true })}>
          {notes.length ? `${elsewhere} more elsewhere in this ${where}` : `${elsewhere} ${elsewhere === 1 ? 'note' : 'notes'} elsewhere in this ${where}. Scroll to them, or show all.`}
        </button>
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
          <button className={tab === 'versions' ? 'on' : ''} onClick={() => setState({ panelTab: 'versions' })}>
            Versions
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
          <FromOutline project={project} found={found} />
          <div className="panel-label">
            {{ chapter: `${wordsFor(project).Page} notes`, section: 'Section notes', folder: 'Folder notes' }[found.kind] || 'Side notes'}
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
          <InlineNotes doc={found.doc} kind={found.kind} />
        </div>
      ) : tab === 'versions' ? (
        <Versions key={found.doc.id} project={project} found={found} />
      ) : (
        <Details project={project} found={found} />
      )}
    </aside>
  );
}
