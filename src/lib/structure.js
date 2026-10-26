// How the Outline and the manuscript connect.
// An outline folder with "Show in manuscript" on has a matching folder in the open draft (its `link`
// names the outline folder). The two share a name; everything inside the manuscript folder is its own.
// Chapters can also name the outline pages (beats) they cover in `beats`.

import { activeDraft, chaptersOf, createProject, isFolder, mapActiveChapters, moveInTree, newDoc, normalizeTree, subtreeRange } from './project.js';

const findFolder = (list, test) => list.find((d) => isFolder(d) && test(d)) || null;

// The manuscript folder in the open draft that follows outline folder `id`.
export const mirrorOf = (p, id) => findFolder(activeDraft(p).chapters, (c) => c.link === id);

// The outline folder a manuscript folder follows, if it's still there.
export const linkedOutline = (p, folder) => (folder?.link ? findFolder(p.outline, (s) => s.id === folder.link) : null);

// Turn "Show in manuscript" on for outline folder `id` and every folder inside it. A folder that was
// linked before (and kept when that was turned off) is linked again; otherwise a new manuscript folder
// goes where the outline's order says: after the folder matching its nearest earlier sibling.
export function mirrorFolders(p, id) {
  const range = subtreeRange(p.outline, id);
  if (!range) return p;
  let list = activeDraft(p).chapters;
  for (const f of p.outline.slice(range[0], range[1]).filter(isFolder)) {
    if (findFolder(list, (c) => c.link === f.id)) continue;
    const former = findFolder(list, (c) => !c.link && c.unlinked === f.id);
    if (former) {
      list = list.map((c) => (c === former ? { ...c, link: f.id, unlinked: null, title: f.title } : c));
      continue;
    }
    const parent = (f.parent && findFolder(list, (c) => c.link === f.parent)?.id) || null;
    const siblings = p.outline.filter((s) => isFolder(s) && (s.parent || null) === (f.parent || null));
    const at = siblings.indexOf(f);
    const mirrorIn = (s) => findFolder(list, (c) => c.link === s.id && (c.parent || null) === parent);
    const prev = siblings.slice(0, at).reverse().map(mirrorIn).find(Boolean);
    const next = siblings.slice(at + 1).map(mirrorIn).find(Boolean);
    const index = prev ? subtreeRange(list, prev.id)[1] : next ? list.indexOf(next) : parent ? subtreeRange(list, parent)[1] : list.length;
    const folder = { ...newDoc('folder', f.title), parent, link: f.id };
    list = [...list.slice(0, index), folder, ...list.slice(index)];
  }
  return mapActiveChapters(p, () => normalizeTree(list));
}

// Turn it off again. Matching folders that are empty go; ones holding chapters or notes stay as
// ordinary folders, so nothing written is lost. `kept` says how many stayed.
export function unmirrorFolders(p, id) {
  const range = subtreeRange(p.outline, id);
  if (!range) return { project: p, kept: 0 };
  const ids = new Set(p.outline.slice(range[0], range[1]).filter(isFolder).map((f) => f.id));
  let kept = 0;
  const project = mapActiveChapters(p, (chapters) => {
    let list = chapters;
    // Innermost first, so a folder whose only contents were other matching folders can go too.
    for (const m of chapters.filter((c) => isFolder(c) && ids.has(c.link)).reverse()) {
      const [start, end] = subtreeRange(list, m.id);
      const empty = end - start === 1 && !m.content.trim() && !m.notes.trim() && !m.inlineNotes?.length;
      if (empty) list = [...list.slice(0, start), ...list.slice(end)];
      else {
        kept++;
        list = list.map((c) => (c.id === m.id ? { ...c, link: null, unlinked: m.link } : c));
      }
    }
    return list;
  });
  return { project, kept };
}

// A linked folder has one name: renaming either side renames the other, in every draft.
export function renameLinked(p, id, title) {
  const outline = findFolder(p.outline, (s) => s.id === id) || linkedOutline(p, findFolder(activeDraft(p).chapters, (c) => c.id === id));
  if (!outline) return p;
  const rename = (d) => (d.title === title ? d : { ...d, title });
  return {
    ...p,
    outline: p.outline.map((s) => (s.id === outline.id ? rename(s) : s)),
    drafts: p.drafts.map((dr) => ({ ...dr, chapters: dr.chapters.map((c) => (isFolder(c) && c.link === outline.id ? rename(c) : c)) })),
  };
}

// The outline pages a chapter covers, in outline order.
export const beatsOf = (p, chapter) => {
  const ids = new Set(chapter?.beats || []);
  return p.outline.filter((s) => !isFolder(s) && ids.has(s.id));
};

export const chaptersCovering = (p, beatId) => chaptersOf(activeDraft(p)).filter((c) => c.beats?.includes(beatId));

// "Act One › Catalyst": the folders an outline item sits in.
export function outlinePath(p, id) {
  const names = [];
  for (let d = p.outline.find((s) => s.id === id); d?.parent; ) {
    d = p.outline.find((s) => s.id === d.parent);
    if (d) names.unshift(d.title || 'Untitled');
  }
  return names;
}

// Add a story structure (see templates.js) to the Outline, at the end of folder `parent` or of the
// Outline. `mirror` shows its folders in the manuscript; `chapters` starts a chapter for every beat.
export function applyStructure(p, structure, { parent = null, mirror = true, chapters = false } = {}) {
  const added = [];
  for (const f of structure.folders) {
    const folder = { ...newDoc('folder', f.title, f.content), parent };
    added.push(folder);
    for (const b of f.beats) added.push({ ...newDoc('section', b.title, b.content), parent: folder.id });
  }
  const at = parent ? subtreeRange(p.outline, parent)[1] : p.outline.length;
  let next = { ...p, outline: [...p.outline.slice(0, at), ...added, ...p.outline.slice(at)] };
  // Added inside a folder, the manuscript gets that folder too, with the new ones in it.
  if (mirror) next = parent ? mirrorFolders(next, parent) : added.filter(isFolder).reduce((q, f) => mirrorFolders(q, f.id), next);
  if (chapters) {
    next = mapActiveChapters(next, (cs) => {
      let list = cs;
      for (const b of added.filter((d) => !isFolder(d))) {
        const holder = findFolder(list, (c) => c.link === b.parent);
        const index = holder ? subtreeRange(list, holder.id)[1] : list.length;
        list = [...list.slice(0, index), { ...newDoc('chapter', b.title), parent: holder?.id || null, beats: [b.id] }, ...list.slice(index)];
      }
      return list;
    });
  }
  return next;
}

// A new book, blank or started from a structure. `start` is what the New project step returns.
export function createBook(title, start) {
  const blank = createProject(title);
  if (!start?.structure) return blank;
  const first = activeDraft(blank).chapters[0];
  let p = applyStructure(blank, start.structure, start);
  // The empty first chapter either makes way for the per-beat chapters or moves into the first act.
  p = mapActiveChapters(p, (cs) => {
    if (start.chapters) return cs.filter((c) => c.id !== first.id);
    const act = cs.find(isFolder);
    return act ? moveInTree(cs, first.id, act.id, null) : cs;
  });
  const openId = p.outline.find((s) => !isFolder(s))?.id || p.ui.openId;
  return { ...p, ui: { ...p.ui, openId, outlineOpen: true } };
}
