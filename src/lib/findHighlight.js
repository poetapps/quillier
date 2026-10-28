import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { flatText } from './inlineNotes.js';
import { matchesIn } from './find.js';

// Tints every match of the Find tab's search on the page, and the one you jumped to a little more.
// getRegex: () => the search (lib/find.js) while the Find tab is open, else null.

const key = new PluginKey('findHighlight');

function build(doc, re, current) {
  if (!re) return { deco: DecorationSet.empty, hits: [] };
  const flat = flatText(doc);
  const hits = matchesIn(flat.text, re).map((m) => ({ from: flat.pos[m.start], to: flat.pos[m.end - 1] + 1 }));
  const deco = hits.map((h, i) => Decoration.inline(h.from, h.to, { class: i === current ? 'find-hit current' : 'find-hit' }));
  return { deco: DecorationSet.create(doc, deco), hits };
}

export const FindHighlight = Extension.create({
  name: 'findHighlight',

  addOptions() {
    return { getRegex: () => null };
  },

  addProseMirrorPlugins() {
    const getRegex = () => this.options.getRegex();
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc, getRegex(), -1),
          apply(tr, old, _before, state) {
            const meta = tr.getMeta(key);
            if (meta) return build(state.doc, getRegex(), meta.current ?? -1);
            return tr.docChanged ? build(state.doc, getRegex(), -1) : old;
          },
        },
        props: { decorations: (state) => key.getState(state).deco },
      }),
    ];
  },
});

// Redraw after the search changes. `current` is the match to mark as the one you're on.
export function refreshFind(editor, current = -1) {
  if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(key, { current }).setMeta('addToHistory', false));
}

export const findHits = (editor) => key.getState(editor.state)?.hits || [];
