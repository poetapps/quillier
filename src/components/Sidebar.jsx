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
  ChevronRight,
  FolderPlus,
  LayoutTemplate,
  Link2,
  Unlink,
  NotebookPen,
  NotebookText,
} from 'lucide-react';
import {
  useStore,
  getState,
  setState,
  openDoc,
  addChapter,
  addSection,
  addFolder,
  addStructure,
  toggleFolder,
  ungroupFolder,
  setShowInManuscript,
  linkFolder,
  unlinkFolder,
  toggleBeat,
  toast,
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
  toggleMonth,
} from '../store.js';
import { startAddToSeries, takeOutOfSeries, renameSeries } from '../bibleActions.js';
import { bookLabels } from '../lib/series.js';
import { activeDraft, chaptersOf, findDoc, isFolder, depthMap, subtreeRange, kindOf, isBook, wordsFor, entryLabel, monthLabel, dayOf } from '../lib/project.js';
import { linkedOutline, mirrorOf, outlinePath } from '../lib/structure.js';
import { IconButton, Wordmark } from './ui.jsx';

const pad = (n) => String(n).padStart(2, '0');

async function projectMenu(e) {
  const anchor = e.currentTarget.getBoundingClientRect();
  const { path, series, project } = getState();
  const recent = (await window.api.recent()).filter((r) => r.exists && r.path !== path).slice(0, 6);
  const uuid = project.meta.uuid;
  const book = isBook(project);
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
      { label: series ? 'Rename book…' : book ? 'Rename project…' : `Rename ${wordsFor(project).name.toLowerCase()}…`, icon: Pencil, onClick: renameProject },
      { label: 'Show in Finder', icon: FolderOpen, onClick: revealProject },
      { label: 'Save a copy…', icon: Copy, onClick: saveCopy, hint: '⇧⌘S' },
      series
        ? { label: 'Rename series…', icon: Layers, onClick: () => renameSeries(series.path, series.data.title) }
        : book && { label: 'Add to a series…', icon: Layers, onClick: () => startAddToSeries(path) },
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

// The menu for a page or folder in the Outline or the manuscript (from its ⋯ button or a right-click).
function itemMenu(anchor, id) {
  const project = getState().project;
  const found = findDoc(project, id);
  if (!found) return;
  const { doc, kind, area } = found;
  const outline = area === 'outline';
  const book = isBook(project);
  const journal = kindOf(project) === 'journal';
  const name = kind === 'folder' ? 'folder' : kind === 'chapter' ? wordsFor(project).page : 'section';
  const linked = kind === 'folder' && !outline ? linkedOutline(project, doc) : null;
  // Journal entries keep to date order, so they can't be moved by hand.
  const general = [
    { label: 'Rename', icon: Pencil, onClick: () => setState({ renamingId: id }) },
    !journal && { label: 'Duplicate', icon: Copy, onClick: () => duplicateDoc(id) },
    !journal && { label: 'Move up', icon: ArrowUp, onClick: () => nudgeDoc(id, -1) },
    !journal && { label: 'Move down', icon: ArrowDown, onClick: () => nudgeDoc(id, 1) },
  ];
  const folderItems =
    kind !== 'folder'
      ? []
      : outline
        ? [
            { label: 'New section here', icon: Plus, onClick: () => addSection(id) },
            { label: 'New folder here', icon: FolderPlus, onClick: () => addFolder('outline', id) },
            { label: 'Add a structure here…', icon: LayoutTemplate, onClick: () => addStructure(id) },
            { separator: true },
            { label: 'Show in manuscript', checked: !!mirrorOf(project, id), onClick: () => setShowInManuscript(id, !mirrorOf(project, id)) },
            { separator: true },
          ]
        : !book
          ? [
              { label: 'New page here', icon: Plus, onClick: () => addChapter(id) },
              { label: 'New folder here', icon: FolderPlus, onClick: () => addFolder('manuscript', id) },
              { separator: true },
            ]
          : [
              { label: 'New chapter here', icon: Plus, onClick: () => addChapter(id) },
              { label: 'New folder here', icon: FolderPlus, onClick: () => addFolder('manuscript', id) },
              { separator: true },
              { label: 'Book part', checked: !!doc.part, onClick: () => updateDocField(id, 'part', !doc.part) },
              linked
                ? { label: `Unlink from “${linked.title || 'Untitled'}”`, icon: Unlink, onClick: () => unlinkFolder(id) }
                : { label: 'Link to an outline folder…', icon: Link2, onClick: () => outlineFolderMenu(anchor, id) },
              { separator: true },
            ];
  openMenu(
    anchor,
    [
      ...folderItems,
      book && kind === 'chapter' && { label: 'Link to outline…', icon: ListTree, onClick: () => beatMenu(anchor, id) },
      book && kind === 'chapter' && { separator: true },
      ...general.filter(Boolean),
      { separator: true },
      kind === 'folder' && { label: 'Remove folder, keep contents', icon: FolderOpen, onClick: () => ungroupFolder(id) },
      { label: `Delete ${name}`, icon: Trash2, danger: true, onClick: () => deleteDoc(id) },
    ],
    { width: 220 }
  );
}

// Tick the outline pages a chapter covers. The menu stays open so several can be ticked in a row.
export function beatMenu(anchor, chapterId) {
  const p = getState().project;
  const chapter = findDoc(p, chapterId)?.doc;
  const sections = p.outline.filter((s) => !isFolder(s));
  if (!chapter) return;
  if (!sections.length) return toast('Add pages to the Outline first, then link chapters to them');
  const items = [];
  let lastPath = null;
  for (const s of sections) {
    const path = outlinePath(p, s.id).join(' › ');
    if (path !== lastPath) {
      if (path) items.push({ heading: path });
      lastPath = path;
    }
    items.push({
      label: s.title || 'Untitled',
      checked: chapter.beats?.includes(s.id),
      onClick: () => {
        toggleBeat(chapterId, s.id);
        beatMenu(anchor, chapterId);
      },
    });
  }
  openMenu(anchor, items, { width: 240 });
}

function outlineFolderMenu(anchor, folderId) {
  const p = getState().project;
  const taken = new Set(activeDraft(p).chapters.filter((c) => isFolder(c) && c.link).map((c) => c.link));
  const folders = p.outline.filter((s) => isFolder(s) && !taken.has(s.id));
  if (!folders.length) return toast('Every outline folder already has a folder in the manuscript');
  openMenu(
    anchor,
    [
      { heading: 'Outline folders' },
      ...folders.map((f) => ({ label: f.title || 'Untitled', sub: outlinePath(p, f.id).join(' › '), icon: Folder, onClick: () => linkFolder(folderId, f.id) })),
    ],
    { width: 240 }
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
        sub: `${chaptersOf(d).length} ch`,
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

// Drag to reorder within one list. Dropping on the middle of a folder puts the item inside it.
let drag = null;

// Where a drop at this row lands: { parent, beforeId } for moveDoc, plus how to mark the row.
function dropAt(list, row, e) {
  const r = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  const parent = row.parent || null;
  if (isFolder(row) && y > 0.25 && y < 0.75) return { parent: row.id, beforeId: null, mark: 'drop-into' };
  if (y <= (isFolder(row) ? 0.25 : 0.5)) return { parent, beforeId: row.id, mark: 'drop-before' };
  const [, end] = subtreeRange(list, row.id);
  if (isFolder(row) && row.open && end > list.indexOf(row) + 1) return { parent: row.id, beforeId: list[list.indexOf(row) + 1].id, mark: 'drop-after' };
  const next = list[end] && (list[end].parent || null) === parent ? list[end] : null;
  return { parent, beforeId: next?.id || null, mark: 'drop-after' };
}

function TreeRow({ area, list, doc, depth, number, twisty, active, renaming, mark, setMark, linked, count }) {
  const folder = isFolder(doc);
  const kind = folder ? 'folder' : area === 'outline' ? 'section' : 'chapter';
  const onDone = (title) => {
    if (title) updateDocField(doc.id, 'title', title);
    setState({ renamingId: null });
  };
  const inDragged = () => {
    if (!drag || drag.area !== area) return true;
    const range = subtreeRange(list, drag.id);
    return !range || list.slice(range[0], range[1]).some((d) => d.id === doc.id);
  };
  return (
    <div
      className={`sb-item sb-doc ${kind} ${area} ${twisty ? 'has-twisty' : ''} ${active ? 'active' : ''} ${mark || ''}`}
      style={{ '--depth': depth }}
      draggable={!renaming}
      onClick={() => openDoc(doc.id)}
      onDoubleClick={() => setState({ renamingId: doc.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        itemMenu({ x: e.clientX, y: e.clientY }, doc.id);
      }}
      onDragStart={(e) => {
        drag = { area, id: doc.id };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', doc.title);
      }}
      onDragOver={(e) => {
        if (inDragged()) return;
        e.preventDefault();
        setMark({ id: doc.id, ...dropAt(list, doc, e) });
      }}
      onDrop={(e) => {
        e.preventDefault();
        const at = !inDragged() && dropAt(list, doc, e);
        if (at) moveDoc(area, drag.id, at.parent, at.beforeId);
        drag = null;
        setMark(null);
      }}
      onDragEnd={() => {
        drag = null;
        setMark(null);
      }}
    >
      {twisty &&
        (folder ? (
          <button
            className="sb-twisty"
            title={doc.open ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(doc.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <ChevronRight size={14} strokeWidth={1.9} className={doc.open ? 'open' : ''} />
          </button>
        ) : (
          <span className="sb-twisty" />
        ))}
      {folder ? (
        <Folder className="sb-icon" size={17} strokeWidth={1.6} />
      ) : kind === 'chapter' ? (
        <FileText className="sb-icon" size={17} strokeWidth={1.6} />
      ) : (
        <span className="sb-bullet" />
      )}
      {number && <span className="sb-num">{number}</span>}
      {renaming ? <RenameInput value={doc.title} onDone={onDone} /> : <span className="sb-label">{doc.title || 'Untitled'}</span>}
      {!renaming && doc.part && <span className="sb-tag">Part</span>}
      {!renaming && !folder && doc.takes?.length > 0 && (
        <span className="sb-linked" title={`${doc.takes.length + 1} takes`}>
          <Layers size={13} strokeWidth={1.8} />
        </span>
      )}
      {!renaming && linked && (
        <span className="sb-linked" title={area === 'outline' ? 'Shows in the manuscript' : 'Linked to the outline'}>
          <Link2 size={13} strokeWidth={1.8} />
        </span>
      )}
      {!renaming && folder && !doc.open && count > 0 && <span className="sb-count">{count}</span>}
      {!renaming && (
        <button
          className="sb-more"
          title="More"
          onClick={(e) => {
            e.stopPropagation();
            itemMenu(e.currentTarget.getBoundingClientRect(), doc.id);
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
}

// The Outline or the manuscript: folders show their contents indented below them unless collapsed.
function Tree({ area, list, openId, renamingId, mark, setMark }) {
  const project = useStore((s) => s.project);
  const numbered = area === 'manuscript' && isBook(project);
  const depth = depthMap(list);
  const twisty = list.some(isFolder);
  const mirrored = new Set(area === 'outline' ? activeDraft(project).chapters.filter((c) => isFolder(c) && c.link).map((c) => c.link) : []);
  const counts = {};
  const rows = [];
  const hidden = new Set();
  let n = 0;
  for (const d of list) {
    const number = numbered && !isFolder(d) ? pad(++n) : null;
    for (let id = d.parent; id; id = list.find((x) => x.id === id)?.parent) if (!isFolder(d) || area === 'outline') counts[id] = (counts[id] || 0) + 1;
    if (d.parent && hidden.has(d.parent)) {
      hidden.add(d.id);
      continue;
    }
    if (isFolder(d) && !d.open) hidden.add(d.id);
    rows.push({ d, number });
  }
  const linkedOf = (d) => isFolder(d) && (area === 'outline' ? mirrored.has(d.id) : !!linkedOutline(project, d));
  return (
    <>
      {rows.map(({ d, number }) => (
        <TreeRow
          key={d.id}
          area={area}
          list={list}
          doc={d}
          depth={depth[d.id]}
          number={number}
          twisty={twisty}
          active={openId === d.id}
          renaming={renamingId === d.id}
          mark={mark?.id === d.id ? mark.mark : ''}
          setMark={setMark}
          linked={linkedOf(d)}
          count={counts[d.id] || 0}
        />
      ))}
      {list.length > 0 && (
        <div
          className={`sb-drop-end ${mark?.id === `end:${area}` ? 'drop-before' : ''}`}
          onDragOver={(e) => {
            if (!drag || drag.area !== area) return;
            e.preventDefault();
            setMark({ id: `end:${area}`, mark: 'drop-before' });
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.area === area) moveDoc(area, drag.id, null, null);
            drag = null;
            setMark(null);
          }}
        />
      )}
    </>
  );
}

// A journal's entries, newest first, under a heading for each month. Months fold up.
function JournalList({ project, openId, renamingId }) {
  const entries = chaptersOf(activeDraft(project));
  const closed = new Set(project.ui.closedMonths || []);
  const months = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const key = e.date.slice(0, 7);
    if (months[months.length - 1]?.key !== key) months.push({ key, entries: [] });
    months[months.length - 1].entries.push(e);
  }
  if (!months.length) return <div className="sb-empty-note">No entries yet.</div>;
  return months.map((m) => (
    <div key={m.key} className="sb-month">
      <button className="sb-section-head sb-month-head" onClick={() => toggleMonth(m.key)} aria-expanded={!closed.has(m.key)}>
        <span>{monthLabel(m.key)}</span>
        <span className="sb-head-tools">
          {closed.has(m.key) && <span className="sb-count">{m.entries.length}</span>}
          <ChevronDown size={14} strokeWidth={1.7} className={`sb-chevron ${closed.has(m.key) ? 'closed' : ''}`} />
        </span>
      </button>
      {!closed.has(m.key) &&
        m.entries.map((e) => {
          const day = dayOf(e.date);
          const renaming = renamingId === e.id;
          return (
            <div
              key={e.id}
              className={`sb-item sb-entry ${openId === e.id ? 'active' : ''}`}
              onClick={() => openDoc(e.id)}
              onDoubleClick={() => setState({ renamingId: e.id })}
              onContextMenu={(ev) => {
                ev.preventDefault();
                itemMenu({ x: ev.clientX, y: ev.clientY }, e.id);
              }}
            >
              <span className="sb-day" title={day.toLocaleDateString(undefined, { dateStyle: 'full' })}>
                <b>{day.getDate()}</b>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              {renaming ? (
                <RenameInput
                  value={e.title}
                  onDone={(title) => {
                    if (title) updateDocField(e.id, 'title', title);
                    setState({ renamingId: null });
                  }}
                />
              ) : (
                <span className={`sb-label ${e.title.trim() ? '' : 'excerpt'}`}>{entryLabel(e)}</span>
              )}
              {!renaming && (
                <button
                  className="sb-more"
                  title="More"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    itemMenu(ev.currentTarget.getBoundingClientRect(), e.id);
                  }}
                >
                  <MoreHorizontal size={16} strokeWidth={1.7} />
                </button>
              )}
            </div>
          );
        })}
    </div>
  ));
}

function outlineAddMenu(e) {
  e.stopPropagation();
  openMenu(
    e.currentTarget.getBoundingClientRect(),
    [
      { label: 'New section', icon: Plus, onClick: () => addSection(null) },
      { label: 'New folder', icon: FolderPlus, onClick: () => addFolder('outline', null) },
      { label: 'Add a structure…', icon: LayoutTemplate, onClick: () => addStructure() },
    ],
    { width: 210 }
  );
}

export default function Sidebar() {
  const project = useStore((s) => s.project);
  const series = useStore((s) => s.series);
  const isDark = useStore((s) => s.isDark);
  const renamingId = useStore((s) => s.renamingId);
  const view = useStore((s) => s.view);
  const seriesLabel = series ? bookLabels(series.data.books)[project.meta.uuid]?.long : null;
  const [dropMark, setDropMark] = useState(null);

  const draft = activeDraft(project);
  const openId = view === 'page' ? project.ui.openId : null;
  const outlineOpen = project.ui.outlineOpen !== false;
  const kind = kindOf(project);
  const words = wordsFor(project);
  const ProjectIcon = series ? Layers : kind === 'journal' ? NotebookPen : kind === 'notebook' ? NotebookText : Folder;

  return (
    <aside className="sidebar">
      <div className="sb-top drag">
        <Wordmark size={19} />
        <IconButton icon={PanelLeft} title="Hide sidebar  ⌘\" className="no-drag" onClick={toggleSidebar} />
      </div>

      <button className={`sb-project ${series ? 'in-series' : ''}`} onClick={projectMenu} title={series ? 'Book and series' : kind === 'book' ? 'Project' : words.name}>
        <ProjectIcon size={19} strokeWidth={1.6} />
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

      {kind === 'journal' ? (
        <nav className="sb-scroll">
          <button className="sb-item sb-add sb-new-entry" onClick={() => addChapter()} title="New entry  ⌘N">
            <Plus className="sb-icon" size={17} strokeWidth={1.6} />
            <span className="sb-label">New entry</span>
          </button>
          <JournalList project={project} openId={openId} renamingId={renamingId} />
        </nav>
      ) : kind === 'notebook' ? (
        <nav className="sb-scroll">
          <div className="sb-section-head">
            <span>Pages</span>
            <span className="sb-head-tools">
              <button className="sb-head-btn" title="New folder" onClick={() => addFolder('manuscript', null)}>
                <FolderPlus size={15} strokeWidth={1.7} />
              </button>
            </span>
          </div>
          <Tree area="manuscript" list={draft.chapters} openId={openId} renamingId={renamingId} mark={dropMark} setMark={setDropMark} />
          <button className="sb-item sb-add" onClick={() => addChapter()} title="New page  ⌘N">
            <Plus className="sb-icon" size={17} strokeWidth={1.6} />
            <span className="sb-label">New page</span>
          </button>
        </nav>
      ) : (
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
            <button className="sb-more" title="Add to the outline" onClick={outlineAddMenu}>
              <Plus size={16} strokeWidth={1.7} />
            </button>
            <ChevronDown size={16} strokeWidth={1.7} className={`sb-chevron ${outlineOpen ? '' : 'closed'}`} />
          </div>
          {outlineOpen && (
            <div className="sb-children">
              <Tree area="outline" list={project.outline} openId={openId} renamingId={renamingId} mark={dropMark} setMark={setDropMark} />
              {!project.outline.length && (
                <div className="sb-empty-outline">
                  <button className="sb-item sb-add sb-doc section outline" onClick={() => addSection(null)}>
                    <span className="sb-bullet" />
                    <span className="sb-label">Add a section</span>
                  </button>
                  <button className="sb-item sb-add sb-doc section outline" onClick={() => addStructure()}>
                    <LayoutTemplate className="sb-icon" size={15} strokeWidth={1.6} />
                    <span className="sb-label">Start from a structure…</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="sb-section-head">
            <span>Manuscript</span>
            <span className="sb-head-tools">
              <button className="sb-head-btn" title="New folder" onClick={() => addFolder('manuscript', null)}>
                <FolderPlus size={15} strokeWidth={1.7} />
              </button>
              <button className="sb-draft" onClick={(e) => draftMenu(e, project)}>
                {draft.name}
                <ChevronDown size={14} strokeWidth={1.7} />
              </button>
            </span>
          </div>
          <Tree area="manuscript" list={draft.chapters} openId={openId} renamingId={renamingId} mark={dropMark} setMark={setDropMark} />
          <button className="sb-item sb-add" onClick={() => addChapter()} title="New chapter  ⌘N">
            <Plus className="sb-icon" size={17} strokeWidth={1.6} />
            <span className="sb-label">New chapter</span>
          </button>
        </nav>
      )}

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
          <span className="sb-label">Export {words.whole.toLowerCase()}</span>
        </button>
        <button className="sb-item small" onClick={importManuscript}>
          <Upload className="sb-icon" size={16} strokeWidth={1.6} />
          <span className="sb-label">Import {kind === 'book' ? 'manuscript' : words.pages}</span>
        </button>
        <div className="sb-icons">
          <IconButton icon={Plus} size={19} title={`New ${words.page}  ⌘N`} onClick={() => addChapter()} />
          <IconButton icon={isDark ? Sun : Moon} size={18} title="Toggle dark mode  ⇧⌘L" onClick={toggleTheme} />
          <IconButton icon={SlidersHorizontal} size={18} title="Settings  ⌘," onClick={() => openModal('settings')} />
        </div>
      </div>
    </aside>
  );
}

