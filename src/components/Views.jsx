import { useEffect, useState } from 'react';
import { Plus, FolderOpen, X, FileText, Moon, Sun, SlidersHorizontal, RotateCcw, Trash2, ListTree, Files } from 'lucide-react';
import {
  useStore,
  newProject,
  openProjectDialog,
  openProjectAt,
  toggleTheme,
  openModal,
  restoreTrash,
  deleteForever,
  emptyTrash,
} from '../store.js';
import { countWords, todayKey } from '../lib/project.js';
import { IconButton, Wordmark } from './ui.jsx';

const prettyPath = (p) => p.replace(/^\/Users\/[^/]+/, '~').replace(/\/[^/]+$/, '');

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

export function Welcome() {
  const isDark = useStore((s) => s.isDark);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    window.api.recent().then(setRecent);
  }, []);
  const remove = async (e, path) => {
    e.stopPropagation();
    await window.api.removeRecent(path);
    setRecent(await window.api.recent());
  };

  return (
    <div className="welcome">
      <div className="welcome-drag drag" />
      <div className="welcome-inner">
        <Wordmark size={30} />
        <p className="welcome-sub">A quiet place to write. Your books live in project files on this computer, saved as you type.</p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={newProject}>
            <Plus size={17} strokeWidth={1.8} /> New project
          </button>
          <button className="btn" onClick={openProjectDialog}>
            <FolderOpen size={17} strokeWidth={1.7} /> Open project…
          </button>
        </div>
        {recent.length > 0 && (
          <div className="recent">
            <div className="panel-label">Recent projects</div>
            {recent.map((r) => (
              <div key={r.path} className={`recent-row ${r.exists ? '' : 'missing'}`} onClick={() => r.exists && openProjectAt(r.path)} title={r.path}>
                <FileText size={18} strokeWidth={1.6} className="muted-icon" />
                <div className="recent-text">
                  <div className="recent-title">{r.title}</div>
                  <div className="recent-path">{r.exists ? prettyPath(r.path) : 'File not found'}</div>
                </div>
                <span className="recent-when">{ago(r.openedAt)}</span>
                <button className="recent-x" title="Remove from list" onClick={(e) => remove(e, r.path)}>
                  <X size={14} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="welcome-foot">
        <IconButton icon={isDark ? Sun : Moon} title="Toggle dark mode" onClick={toggleTheme} />
        <IconButton icon={SlidersHorizontal} title="Settings" onClick={() => openModal('settings')} />
      </div>
    </div>
  );
}

export function TrashView() {
  const project = useStore((s) => s.project);
  const trash = project.trash;
  return (
    <div className="page-scroll">
      <article className="page">
        <h1 className="page-title static">Trash</h1>
        <div className="page-meta">
          <span>Deleted chapters, sections and drafts stay here until you empty the trash.</span>
          {trash.length > 0 && (
            <button className="link-btn danger" onClick={emptyTrash}>
              Empty trash
            </button>
          )}
        </div>
        <div className="trash-list">
          {!trash.length && <p className="muted">Nothing here.</p>}
          {trash.map((t) => {
            const isDraft = t.kind === 'draft';
            const title = isDraft ? t.draft.name : t.doc.title || 'Untitled';
            const words = isDraft ? t.draft.chapters.reduce((n, c) => n + countWords(c.content), 0) : countWords(t.doc.content);
            const draftName = project.drafts.find((d) => d.id === t.draftId)?.name;
            const Icon = isDraft ? Files : t.kind === 'section' ? ListTree : FileText;
            return (
              <div key={t.id} className="trash-row">
                <Icon size={18} strokeWidth={1.6} className="muted-icon" />
                <div className="trash-text">
                  <div className="trash-title">{title}</div>
                  <div className="trash-sub">
                    {isDraft ? `Draft · ${t.draft.chapters.length} chapters` : t.kind === 'section' ? 'Outline section' : `Chapter${draftName ? ` · ${draftName}` : ''}`} ·{' '}
                    {words.toLocaleString()} words · deleted {new Date(t.deletedAt).toLocaleDateString()}
                  </div>
                </div>
                <button className="btn small" onClick={() => restoreTrash(t.id)}>
                  <RotateCcw size={14} strokeWidth={1.8} /> Restore
                </button>
                <IconButton icon={Trash2} size={16} title="Delete forever" onClick={() => deleteForever(t.id)} />
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

export function StatusBar() {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const goal = useStore((s) => s.prefs.dailyGoal) || 0;
  const id = project.ui.openId;
  let words = 0;
  let where = '';
  if (view === 'trash') where = 'Trash';
  else if (view === 'bible') where = 'Story bible';
  else if (id === 'notes') {
    words = countWords(project.notes.content);
    where = 'Notes';
  } else {
    const s = project.outline.find((x) => x.id === id);
    const c = !s && project.drafts.find((d) => d.id === project.activeDraftId)?.chapters.find((x) => x.id === id);
    words = countWords((s || c)?.content);
    where = s ? 'Outline' : 'Manuscript';
  }
  const today = project.stats.daily[todayKey()] || 0;
  return (
    <footer className="statusbar">
      <span className="sb-stat">
        {view === 'page' && (
          <>
            {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            <span className="dot-sep">·</span>
          </>
        )}
        {where}
      </span>
      <span className="sb-stat">
        Today<span className="dot-sep">·</span>
        {today > 0 ? '+' : ''}
        {today.toLocaleString()} net words
        {goal > 0 && (
          <>
            <span className="dot-sep">·</span>
            {Math.min(100, Math.round((Math.max(0, today) / goal) * 100))}% of goal
          </>
        )}
      </span>
    </footer>
  );
}
