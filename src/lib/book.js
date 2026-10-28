// The book in reading order, as every export sees it.
import { activeDraft, isFolder, partNumbers, partLabel } from './project.js';

// Chapters still called "Untitled chapter" export as "Chapter 3" etc.
export function chapterTitle(c, i) {
  const t = (c.title || '').trim();
  return !t || /^untitled chapter$/i.test(t) ? `Chapter ${i + 1}` : t;
}

// A part page shows "Part Two" and the folder's name, unless the name only says "Part Two" again.
function partSubtitle(folder) {
  const t = (folder.title || '').trim();
  return !t || /^untitled folder$/i.test(t) || /^part\s+([a-z]+|\d+)$/i.test(t) ? '' : t;
}

// The book in reading order: chapters, plus a part page wherever a folder marked as a book part
// starts. Other folders only organize the manuscript and leave no trace. `parent` is the part an
// item sits in and `depth` how many parts deep it is.
export function bookItems(p) {
  const draft = activeDraft(p);
  const byId = new Map(draft.chapters.map((d) => [d.id, d]));
  const parts = partNumbers(draft);
  const partAbove = (d) => {
    for (let f = byId.get(d.parent); f; f = byId.get(f.parent)) if (f.part) return f.id;
    return null;
  };
  const items = [];
  const depth = {};
  let index = 0;
  for (const d of draft.chapters) {
    const parent = partAbove(d);
    depth[d.id] = parent ? depth[parent] + 1 : 0;
    if (!isFolder(d)) {
      items.push({ type: 'chapter', id: d.id, chapter: d, index, title: chapterTitle(d, index), parent, depth: depth[d.id] });
      index++;
    } else if (d.part) {
      const label = partLabel(parts[d.id]);
      const subtitle = partSubtitle(d);
      items.push({ type: 'part', id: d.id, n: parts[d.id], label, subtitle, title: subtitle ? `${label}: ${subtitle}` : label, parent, depth: depth[d.id] });
    }
  }
  return items;
}

// A title page's word count: to the nearest hundred, or thousand from ten thousand up.
export function roundedWords(n) {
  if (n < 100) return n;
  const step = n >= 10000 ? 1000 : 100;
  return Math.round(n / step) * step;
}
