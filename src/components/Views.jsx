import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Folder, X, FileText, SlidersHorizontal, RotateCcw, Trash2, ListTree, Files, Layers } from 'lucide-react';
import {
  useStore,
  newProject,
  openProjectDialog,
  openProjectAt,
  openModal,
  restoreTrash,
  deleteForever,
  emptyTrash,
} from '../store.js';
import { countWords, todayKey, chaptersOf, isFolder, isBook, wordsFor, docName } from '../lib/project.js';
import { openText } from '../lib/versions.js';
import { IconButton, Wordmark } from './ui.jsx';
import { ThemeButton } from './ThemePicker.jsx';

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
        <ThemeButton />
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
          <span>
            {isBook(project)
              ? 'Deleted chapters, takes, sections, folders and drafts stay here until you empty the trash.'
              : `Deleted ${wordsFor(project).pages}${project.kind === 'notebook' ? ' and folders' : ''} stay here until you empty the trash.`}
          </span>
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
            const title = isDraft ? t.draft.name : docName(t.doc);
            const pages = isDraft ? chaptersOf(t.draft) : (t.docs || [t.doc]).filter((d) => t.kind !== 'folder' || !isFolder(d));
            const words = pages.reduce((n, c) => n + countWords(c.content), 0);
            const draftName = project.drafts.find((d) => d.id === t.draftId)?.name;
            const Icon = isDraft ? Files : t.kind === 'folder' ? Folder : t.kind === 'section' ? ListTree : t.kind === 'take' ? Layers : FileText;
            const inside = (t.docs?.length || 1) - 1;
            const label = {
              section: 'Outline section',
              folder: `${t.area === 'outline' ? 'Outline folder' : 'Folder'}${inside ? ` · ${inside} item${inside === 1 ? '' : 's'}` : ''}`,
              chapter: isBook(project) ? `Chapter${draftName ? ` · ${draftName}` : ''}` : wordsFor(project).Page,
              take: `Take of a chapter${draftName ? ` · ${draftName}` : ''}`,
            }[t.kind];
            return (
              <div key={t.id} className="trash-row">
                <Icon size={18} strokeWidth={1.6} className="muted-icon" />
                <div className="trash-text">
                  <div className="trash-title">{title}</div>
                  <div className="trash-sub">
                    {isDraft ? `Draft · ${chaptersOf(t.draft).length} chapters` : label} ·{' '}
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
    words = countWords(s ? s.content : c && openText(project, c).content);
    where = s ? 'Outline' : c && !openText(project, c).inBook ? `${openText(project, c).name} · not in the book` : wordsFor(project).whole;
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
