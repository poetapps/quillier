import { useEffect, useRef, useState } from 'react';
import {
  Folder,
  ChevronDown,
  FileText,
  StickyNote,
  ListTree,
  Plus,
  MoreHorizontal,
  Download,
  Upload,
  Moon,
  Sun,
  SlidersHorizontal,
  PanelLeft,
  Trash2,
  FolderOpen,
  FilePlus,
  Pencil,
  Copy,
  ArrowUp,
  ArrowDown,
  X,
  Files,
  Users,
  Layers,
  LogOut,
} from 'lucide-react';
import {
  useStore,
  getState,
  setState,
  openDoc,
  addChapter,
  addSection,
  toggleOutline,
  openMenu,
  updateDocField,
  duplicateDoc,
  deleteDoc,
  nudgeDoc,
  moveDoc,
  switchDraft,
  newDraft,
  renameDraft,
  deleteDraft,
  toggleTheme,
  openModal,
  toggleSidebar,
  importManuscript,
  showTrash,
  newProject,
  openProjectDialog,
  openProjectAt,
  renameProject,
  saveCopy,
  revealProject,
  closeProject,
  showBible,
} from '../store.js';
import { startAddToSeries, takeOutOfSeries, renameSeries } from '../bibleActions.js';
import { bookLabels } from '../lib/series.js';
import { activeDraft } from '../lib/project.js';
import { IconButton, Wordmark } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');

async function projectMenu(e) {
  const anchor = e.currentTarget.getBoundingClientRect();
  const { path, series, project } = getState();
  const recent = (await window.api.recent()).filter((r) => r.exists && r.path !== path).slice(0, 6);
  const uuid = project.meta.uuid;
  const labels = series ? bookLabels(series.data.books) : {};
  const books = series
    ? [
        { heading: series.data.title },
        ...series.data.books.map((b) => {
          const sib = series.siblings[b.uuid];
          const missing = b.uuid !== uuid && (!sib || sib.missing);
          return {
            label: b.uuid === uuid ? project.title : sib?.title || b.title,
            sub: labels[b.uuid].long + (missing ? ' · missing' : ''),
            checked: b.uuid === uuid,
            disabled: missing,
            onClick: () => b.uuid !== uuid && openProjectAt(sib.path, { view: getState().view === 'bible' ? 'bible' : undefined }),
          };
        }),
        { separator: true },
      ]
    : [];
  openMenu(
    anchor,
    [
      ...books,
      { label: series ? 'Rename book…' : 'Rename project…', icon: Pencil, onClick: renameProject },
      { label: 'Show in Finder', icon: FolderOpen, onClick: revealProject },
      { label: 'Save a copy…', icon: Copy, onClick: saveCopy, hint: '⇧⌘S' },
      series
        ? { label: 'Rename series…', icon: Layers, onClick: () => renameSeries(series.path, series.data.title) }
        : { label: 'Add to a series…', icon: Layers, onClick: () => startAddToSeries(path) },
      series && { label: 'Take out of series…', icon: LogOut, onClick: () => takeOutOfSeries(series.path, uuid, path) },
      { separator: true },
      ...(recent.length ? [{ heading: 'Recent' }, ...recent.map((r) => ({ label: r.title, icon: Folder, onClick: () => openProjectAt(r.path) })), { separator: true }] : []),
      { label: 'New project…', icon: FilePlus, onClick: newProject, hint: '⇧⌘N' },
      { label: 'Open project…', icon: FolderOpen, onClick: openProjectDialog, hint: '⌘O' },
      { label: 'Close project', icon: X, onClick: closeProject },
    ],
    { width: 270 }
  );
}

function itemMenu(anchor, id, kind) {
  openMenu(
    anchor,
    [
      { label: 'Rename', icon: Pencil, onClick: () => setState({ renamingId: id }) },
      { label: 'Duplicate', icon: Copy, onClick: () => duplicateDoc(id) },
      { label: 'Move up', icon: ArrowUp, onClick: () => nudgeDoc(id, -1) },
      { label: 'Move down', icon: ArrowDown, onClick: () => nudgeDoc(id, 1) },
      { separator: true },
      { label: kind === 'chapter' ? 'Delete chapter' : 'Delete section', icon: Trash2, danger: true, onClick: () => deleteDoc(id) },
    ],
    { width: 190 }
  );
}

function draftMenu(e, project) {
  const draft = activeDraft(project);
  openMenu(
    e.currentTarget.getBoundingClientRect(),
    [
      { heading: 'Drafts' },
      ...project.drafts.map((d) => ({
        label: d.name,
        sub: `${d.chapters.length} ch`,
        checked: d.id === draft.id,
        onClick: () => switchDraft(d.id),
      })),
      { separator: true },
      { label: 'New draft from this one…', icon: Files, onClick: newDraft },
      { label: 'Rename draft…', icon: Pencil, onClick: () => renameDraft(draft.id) },
      project.drafts.length > 1 && { label: 'Delete draft', icon: Trash2, danger: true, onClick: () => deleteDraft(draft.id) },
    ],
    { align: 'right', width: 230 }
  );
}

function RenameInput({ value, onDone }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (save) => onDone(save && text.trim() ? text.trim() : null);
  return (
    <input
      ref={ref}
      className="sb-rename"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// Drag-to-reorder within one list (chapters or outline sections).
let drag = null;

function DocItem({ doc, index, kind, active, renaming, number, dropMark, setDropMark }) {
  const onDone = (title) => {
    if (title) updateDocField(doc.id, 'title', title);
    setState({ renamingId: null });
  };
  return (
    <div
      className={`sb-item sb-doc ${kind} ${active ? 'active' : ''} ${dropMark || ''}`}
      draggable={!renaming}
      onClick={() => openDoc(doc.id)}
      onDoubleClick={() => setState({ renamingId: doc.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        itemMenu({ x: e.clientX, y: e.clientY }, doc.id, kind);
      }}
      onDragStart={(e) => {
        drag = { kind, index };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', doc.title);
      }}
      onDragOver={(e) => {
        if (!drag || drag.kind !== kind) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        setDropMark({ kind, index: after ? index + 1 : index });
      }}
      onDrop={(e) => {
        e.preventDefault();
        const mark = getDropMark();
        if (drag && mark && drag.kind === kind) moveDoc(kind, drag.index, mark.index);
        drag = null;
        setDropMark(null);
      }}
      onDragEnd={() => {
        drag = null;
        setDropMark(null);
      }}
    >
      {kind === 'chapter' ? (
        <FileText className="sb-icon" size={17} strokeWidth={1.6} />
      ) : (
        <span className="sb-bullet" />
      )}
      {number && <span className="sb-num">{number}</span>}
      {renaming ? <RenameInput value={doc.title} onDone={onDone} /> : <span className="sb-label">{doc.title || 'Untitled'}</span>}
      {!renaming && (
        <button
          className="sb-more"
          title="More"
          onClick={(e) => {
            e.stopPropagation();
            itemMenu(e.currentTarget.getBoundingClientRect(), doc.id, kind);
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
}

let currentDropMark = null;
const getDropMark = () => currentDropMark;

export default function Sidebar() {
  const project = useStore((s) => s.project);
  const series = useStore((s) => s.series);
  const isDark = useStore((s) => s.isDark);
  const renamingId = useStore((s) => s.renamingId);
  const view = useStore((s) => s.view);
  const seriesLabel = series ? bookLabels(series.data.books)[project.meta.uuid]?.long : null;
  const [dropMark, setDropMarkState] = useState(null);
  const setDropMark = (m) => {
    currentDropMark = m;
    setDropMarkState(m);
  };

  const draft = activeDraft(project);
  const openId = view === 'page' ? project.ui.openId : null;
  const outlineOpen = project.ui.outlineOpen !== false;
  const markFor = (kind, i, len) => {
    if (!dropMark || dropMark.kind !== kind) return '';
    if (dropMark.index === i) return 'drop-before';
    if (i === len - 1 && dropMark.index === len) return 'drop-after';
    return '';
  };

  return (
    <aside className="sidebar">
      <div className="sb-top drag">
        <Wordmark size={19} />
        <IconButton icon={PanelLeft} title="Hide sidebar  ⌘\" className="no-drag" onClick={toggleSidebar} />
      </div>

      <button className={`sb-project ${series ? 'in-series' : ''}`} onClick={projectMenu} title={series ? 'Book and series' : 'Project'}>
        {series ? <Layers size={19} strokeWidth={1.6} /> : <Folder size={19} strokeWidth={1.6} />}
        <span className="sb-project-text">
          {series && (
            <span className="sb-project-series">
              {series.data.title} · {seriesLabel}
            </span>
          )}
          <span className="sb-project-name">{project.title}</span>
        </span>
        <ChevronDown size={16} strokeWidth={1.7} className="muted-icon" />
      </button>

      <nav className="sb-scroll">
        <div className={`sb-item ${openId === 'notes' ? 'active' : ''}`} onClick={() => openDoc('notes')}>
          <StickyNote className="sb-icon" size={17} strokeWidth={1.6} />
          <span className="sb-label">Notes</span>
        </div>

        <div className={`sb-item ${view === 'bible' ? 'active' : ''}`} onClick={() => showBible()}>
          <Users className="sb-icon" size={17} strokeWidth={1.6} />
          <span className="sb-label">Story bible</span>
        </div>

        <div className="sb-item sb-group-head" onClick={toggleOutline}>
          <ListTree className="sb-icon" size={17} strokeWidth={1.6} />
          <span className="sb-label">Outline</span>
          <button
            className="sb-more"
            title="New section  ⌥⌘N"
            onClick={(e) => {
              e.stopPropagation();
              addSection();
            }}
          >
            <Plus size={16} strokeWidth={1.7} />
          </button>
          <ChevronDown size={16} strokeWidth={1.7} className={`sb-chevron ${outlineOpen ? '' : 'closed'}`} />
        </div>
        {outlineOpen && (
          <div className="sb-children">
            {project.outline.map((s, i) => (
              <DocItem
                key={s.id}
                doc={s}
                index={i}
                kind="section"
                active={openId === s.id}
                renaming={renamingId === s.id}
                dropMark={markFor('section', i, project.outline.length)}
                setDropMark={setDropMark}
              />
            ))}
            {!project.outline.length && (
              <button className="sb-item sb-add sb-doc section" onClick={addSection}>
                <span className="sb-bullet" />
                <span className="sb-label">Add a section</span>
              </button>
            )}
          </div>
        )}

        <div className="sb-section-head">
          <span>Manuscript</span>
          <button className="sb-draft" onClick={(e) => draftMenu(e, project)}>
            {draft.name}
            <ChevronDown size={14} strokeWidth={1.7} />
          </button>
        </div>
        {draft.chapters.map((c, i) => (
          <DocItem
            key={c.id}
            doc={c}
            index={i}
            kind="chapter"
            number={pad(i + 1)}
            active={openId === c.id}
            renaming={renamingId === c.id}
            dropMark={markFor('chapter', i, draft.chapters.length)}
            setDropMark={setDropMark}
          />
        ))}
        <button className="sb-item sb-add" onClick={addChapter} title="New chapter  ⌘N">
          <Plus className="sb-icon" size={17} strokeWidth={1.6} />
          <span className="sb-label">New chapter</span>
        </button>
      </nav>

      <div className="sb-bottom">
        {project.trash.length > 0 && (
          <button className={`sb-item small ${view === 'trash' ? 'active' : ''}`} onClick={showTrash}>
            <Trash2 className="sb-icon" size={16} strokeWidth={1.6} />
            <span className="sb-label">Trash</span>
            <span className="sb-count">{project.trash.length}</span>
          </button>
        )}
        <button className="sb-item small" onClick={() => openModal('export')}>
          <Download className="sb-icon" size={16} strokeWidth={1.6} />
          <span className="sb-label">Export manuscript</span>
        </button>
        <button className="sb-item small" onClick={importManuscript}>
          <Upload className="sb-icon" size={16} strokeWidth={1.6} />
          <span className="sb-label">Import manuscript</span>
        </button>
        <div className="sb-icons">
          <IconButton icon={Plus} size={19} title="New chapter  ⌘N" onClick={addChapter} />
          <IconButton icon={isDark ? Sun : Moon} size={18} title="Toggle dark mode  ⇧⌘L" onClick={toggleTheme} />
          <IconButton icon={SlidersHorizontal} size={18} title="Settings  ⌘," onClick={() => openModal('settings')} />
        </div>
      </div>
    </aside>
  );
}

