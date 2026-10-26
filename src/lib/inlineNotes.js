import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';

// Notes attached to a passage of text.
//
// In the editor, an annotated passage carries an invisible `note` mark ({id}). The mark is not
// written into the Markdown, so chapters and exports stay clean. Instead each page stores
// `inlineNotes: [{ id, text, quote, prefix, suffix, offset }]`, and when a page opens the
// passages are found again by their quoted text (prefix/suffix/offset break ties).

const CONTEXT = 32;

export const NoteMark = Mark.create({
  name: 'note',
  inclusive: false,
  excludes: '', // overlapping notes are allowed
  addOptions() {
    return { onAdd: null };
  },
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-note'),
        renderHTML: (attrs) => ({ 'data-note': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-note]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'note-anchor' }), 0];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-m': () => {
        this.options.onAdd?.();
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: new PluginKey('noteMarkPaste'),
        props: {
          // Copying annotated text must not duplicate the note. Cut-and-paste (the passage is
          // no longer in the document) keeps it, so moving a paragraph keeps its notes.
          transformPasted(slice, view) {
            const present = new Set(collectRanges(view.state.doc, type).keys());
            if (!present.size) return slice;
            const strip = (fragment) => {
              const nodes = [];
              fragment.forEach((n) => {
                if (n.isText) {
                  nodes.push(n.mark(n.marks.filter((m) => m.type !== type || !present.has(m.attrs.id))));
                } else {
                  nodes.push(n.copy(strip(n.content)));
                }
              });
              return Fragment.fromArray(nodes);
            };
            return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});

// Plain text of the document with a doc-position for every character. Block boundaries become
// '\n' (positioned at the block start, so positions stay strictly increasing).
export function flatText(doc) {
  const parts = [];
  const pos = [];
  let len = 0;
  doc.descendants((node, p) => {
    if (node.isTextblock && len) {
      parts.push('\n');
      pos.push(p);
      len++;
    } else if (node.isText) {
      parts.push(node.text);
      for (let i = 0; i < node.text.length; i++) pos.push(p + i);
      len += node.text.length;
    } else if (node.type.name === 'hardBreak') {
      parts.push('\n');
      pos.push(p);
      len++;
    }
  });
  return { text: parts.join(''), pos };
}

function indexOfPos(flat, docPos) {
  let lo = 0;
  let hi = flat.pos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (flat.pos[mid] < docPos) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function collectRanges(doc, type) {
  const ranges = new Map();
  doc.descendants((node, p) => {
    if (!node.isText) return;
    for (const m of node.marks) {
      if (m.type !== type || !m.attrs.id) continue;
      const r = ranges.get(m.attrs.id);
      const end = p + node.nodeSize;
      if (r) {
        r.from = Math.min(r.from, p);
        r.to = Math.max(r.to, end);
      } else ranges.set(m.attrs.id, { from: p, to: end });
    }
  });
  return ranges;
}

// Current anchor data for every annotated passage: { [id]: { quote, prefix, suffix, offset } }
export function readAnchors(doc) {
  const type = doc.type.schema.marks.note;
  if (!type) return {};
  const ranges = collectRanges(doc, type);
  if (!ranges.size) return {};
  const flat = flatText(doc);
  const out = {};
  for (const [id, { from, to }] of ranges) {
    const a = indexOfPos(flat, from);
    const b = indexOfPos(flat, to);
    out[id] = {
      quote: flat.text.slice(a, b),
      prefix: flat.text.slice(Math.max(0, a - CONTEXT), a),
      suffix: flat.text.slice(b, b + CONTEXT),
      offset: a,
    };
  }
  return out;
}

const commonSuffix = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};
const commonPrefix = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

export function locate(flat, note) {
  if (!note.quote) return null;
  let best = null;
  let bestScore = -Infinity;
  for (let i = flat.text.indexOf(note.quote), tries = 0; i >= 0 && tries < 500; i = flat.text.indexOf(note.quote, i + 1), tries++) {
    const end = i + note.quote.length;
    const score =
      commonSuffix(flat.text.slice(Math.max(0, i - CONTEXT), i), note.prefix || '') +
      commonPrefix(flat.text.slice(end, end + CONTEXT), note.suffix || '') -
      Math.abs(i - (note.offset || 0)) / 1e6;
    if (score > bestScore) {
      bestScore = score;
      best = { from: flat.pos[i], to: flat.pos[end - 1] + 1 };
    }
  }
  return best;
}

// Put marks back on a freshly loaded document. Not part of undo history, and not a user edit.
export function applyAnchors(editor, notes) {
  const type = editor.schema.marks.note;
  if (!type || !notes?.length) return;
  const flat = flatText(editor.state.doc);
  const tr = editor.state.tr;
  for (const note of notes) {
    const r = locate(flat, note);
    if (r) tr.addMark(r.from, r.to, type.create({ id: note.id }));
  }
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
}

export function removeNoteMarks(editor, ids) {
  const type = editor.schema.marks.note;
  if (!type) return;
  const set = new Set(ids);
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, p) => {
    if (!node.isText) return;
    for (const m of node.marks) if (m.type === type && set.has(m.attrs.id)) tr.removeMark(p, p + node.nodeSize, m);
  });
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
}

export function noteRange(editor, id) {
  const type = editor.schema.marks.note;
  return type ? collectRanges(editor.state.doc, type).get(id) || null : null;
}

export function noteIdsAtCursor(state) {
  const { $from } = state.selection;
  const marks = [...($from.nodeBefore?.marks || []), ...($from.nodeAfter?.marks || [])];
  return marks.filter((m) => m.type.name === 'note').map((m) => m.attrs.id);
}
