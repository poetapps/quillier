import { Home, ChevronRight, Maximize2, Minimize2, PanelRight, PanelLeft, CheckCheck, AlertCircle, Loader } from 'lucide-react';
import { useStore, closeProject, toggleFocus, togglePanel, toggleSidebar, saveNow, openDoc, showBible } from '../store.js';
import { findDoc, chapterNumber } from '../lib/project.js';
import { IconButton } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');

function SaveStatus() {
  const save = useStore((s) => s.save);
  const path = useStore((s) => s.path);
  if (save.status === 'error') {
    return (
      <button className="save-status error no-drag" title={save.error} onClick={saveNow}>
        <AlertCircle size={15} strokeWidth={1.8} /> Couldn’t save — retry
      </button>
    );
  }
  const saved = save.status === 'saved';
  return (
    <span className="save-status" title={path}>
      {saved ? 'Saved' : 'Saving…'}
      {saved ? <CheckCheck size={16} strokeWidth={1.7} /> : <Loader size={14} strokeWidth={1.7} className="spin" />}
    </span>
  );
}

export default function TopBar() {
  const project = useStore((s) => s.project);
  const view = useStore((s) => s.view);
  const focus = useStore((s) => s.focus);
  const sidebar = useStore((s) => s.sidebar);
  const panel = useStore((s) => s.panel);
  const series = useStore((s) => s.series);
  const found = findDoc(project, project.ui.openId);

  let crumb = '';
  if (view === 'trash') crumb = 'Trash';
  else if (view === 'bible') crumb = 'Story bible';
  else if (found?.kind === 'chapter') crumb = `${pad(chapterNumber(project, found.doc.id))} ${found.doc.title || 'Untitled'}`;
  else if (found?.kind === 'section' || (found?.kind === 'folder' && found.area === 'outline')) crumb = `Outline / ${found.doc.title || 'Untitled'}`;
  else if (found?.kind === 'folder') crumb = found.doc.title || 'Untitled';
  else if (found) crumb = 'Notes';

  return (
    <header className="topbar drag">
      {(!sidebar || focus) && <div className="traffic-space" />}
      {!sidebar && !focus && <IconButton icon={PanelLeft} title="Show sidebar  ⌘\" className="no-drag" onClick={toggleSidebar} />}
      <nav className="crumbs no-drag">
        <IconButton icon={Home} size={18} title="Library" onClick={closeProject} />
        <ChevronRight size={15} strokeWidth={1.6} className="crumb-sep" />
        {series && (
          <>
            <button className="crumb muted" onClick={() => showBible({ scope: 'series' })} title="Series story bible">
              {series.data.title}
            </button>
            <ChevronRight size={15} strokeWidth={1.6} className="crumb-sep" />
          </>
        )}
        <button className="crumb" onClick={() => openDoc('notes')}>
          {project.title}
        </button>
        {crumb && (
          <>
            <ChevronRight size={15} strokeWidth={1.6} className="crumb-sep" />
            <span className="crumb current">{crumb}</span>
          </>
        )}
      </nav>
      <div className="topbar-right no-drag">
        <IconButton icon={focus ? Minimize2 : Maximize2} title={focus ? 'Exit focus mode  Esc' : 'Focus mode  ⇧⌘F'} onClick={toggleFocus} />
        <SaveStatus />
        {!focus && view !== 'bible' && (
          <IconButton icon={PanelRight} title={panel ? 'Hide notes panel  ⇧⌘\\' : 'Show notes panel  ⇧⌘\\'} onClick={() => togglePanel()} className={panel ? 'on' : ''} />
        )}
      </div>
    </header>
  );
}
