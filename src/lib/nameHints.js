import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Names from the story bible finish themselves as you type, like a screenwriting app.
// After a capital and two more letters, the rest of the name shows in grey: Tab takes it, anything
// else keeps typing. When more than one name fits, a short list shows instead (↑/↓ to choose).
// getNames: () => [{ text, entryId, label, sub }], most useful first.

const key = new PluginKey('nameHints');

function findSuggestion(state, getNames) {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.marks().some((m) => m.type.name === 'code')) return null;
  const parent = $from.parent;
  const after = parent.textBetween($from.parentOffset, Math.min(parent.content.size, $from.parentOffset + 1), null, '￼');
  if (/[\p{L}\p{N}]/u.test(after)) return null;
  const before = parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, null, '￼');
  const m = before.match(/(?:^|[^\p{L}\p{N}'’-])(\p{Lu}[\p{L}'’-]{2,})$/u);
  if (!m) return null;
  const typed = m[1];
  const names = getNames() || [];
  if (names.some((n) => n.text === typed)) return null; // already a whole name or alias
  const lower = typed.toLowerCase();
  const seen = new Set();
  const options = [];
  for (const n of names) {
    if (n.text.length <= typed.length || n.text[0] !== typed[0] || !n.text.toLowerCase().startsWith(lower)) continue;
    if (seen.has(n.entryId)) continue;
    seen.add(n.entryId);
    options.push(n);
    if (options.length === 5) break;
  }
  if (!options.length) return null;
  return { from: $from.pos - typed.length, to: $from.pos, typed, options, index: 0 };
}

function accept(view, index) {
  const s = key.getState(view.state);
  if (!s) return false;
  const pick = s.options[index ?? s.index];
  view.dispatch(view.state.tr.insertText(pick.text, s.from, s.to).setMeta(key, 'dismiss'));
  return true;
}

function dismiss(view) {
  if (!key.getState(view.state)) return false;
  view.dispatch(view.state.tr.setMeta(key, 'dismiss'));
  return true;
}

export const NameHints = Extension.create({
  name: 'nameHints',

  addOptions() {
    return { getNames: () => [] };
  },

  addProseMirrorPlugins() {
    const getNames = this.options.getNames;
    return [
      new Plugin({
        key,
        state: {
          init: () => null,
          apply(tr, prev, oldState, newState) {
            const meta = tr.getMeta(key);
            if (meta === 'dismiss') return null;
            if (meta && typeof meta.index === 'number' && prev) return { ...prev, index: meta.index };
            if (tr.docChanged && newState.doc.content.size > oldState.doc.content.size && !tr.getMeta('uiEvent')) {
              return findSuggestion(newState, getNames);
            }
            if (prev && (tr.docChanged || !newState.selection.empty || newState.selection.from !== prev.to)) return null;
            return prev;
          },
        },
        props: {
          decorations(state) {
            const s = key.getState(state);
            if (!s) return null;
            const rest = s.options[s.index].text.slice(s.typed.length);
            const single = s.options.length === 1;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                s.to,
                () => {
                  const span = document.createElement('span');
                  span.className = 'name-ghost';
                  span.textContent = rest;
                  if (single) {
                    const k = document.createElement('span');
                    k.className = 'name-ghost-key';
                    k.textContent = 'Tab';
                    span.appendChild(k);
                  }
                  return span;
                },
                { side: 1, key: `${s.index}:${rest}:${single}` }
              ),
            ]);
          },
          handleKeyDown(view, event) {
            const s = key.getState(view.state);
            if (!s) return false;
            const plain = !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;
            if (event.key === 'Tab' && plain) {
              event.preventDefault();
              return accept(view);
            }
            if (event.key === 'Escape') return dismiss(view);
            if (s.options.length > 1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && plain) {
              event.preventDefault();
              const n = s.options.length;
              const index = (s.index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
              view.dispatch(view.state.tr.setMeta(key, { index }));
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            blur: (view) => {
              dismiss(view);
              return false;
            },
          },
        },
        // The list for when more than one name fits.
        view(editorView) {
          const el = document.createElement('div');
          el.className = 'name-hint-list';
          el.style.display = 'none';
          document.body.appendChild(el);
          const hide = () => (el.style.display = 'none');
          window.addEventListener('scroll', hide, true);
          let last = '';
          return {
            update(view) {
              const s = key.getState(view.state);
              if (!s || s.options.length < 2) {
                last = '';
                return hide();
              }
              const sig = `${s.from}:${s.index}:${s.options.map((o) => o.entryId).join(',')}`;
              if (sig !== last) {
                last = sig;
                el.replaceChildren(
                  ...s.options.map((o, i) => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = `name-hint-item ${i === s.index ? 'on' : ''}`;
                    const name = document.createElement('span');
                    name.className = 'name-hint-name';
                    name.textContent = o.text;
                    item.appendChild(name);
                    if (o.sub) {
                      const sub = document.createElement('span');
                      sub.className = 'name-hint-sub';
                      sub.textContent = o.sub;
                      item.appendChild(sub);
                    }
                    item.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      accept(editorView, i);
                    });
                    return item;
                  }),
                  Object.assign(document.createElement('div'), { className: 'name-hint-foot', textContent: '↑↓ to choose · Tab to use' })
                );
              }
              el.style.display = 'flex';
              const c = view.coordsAtPos(s.from);
              const r = el.getBoundingClientRect();
              const below = c.bottom + 6 + r.height < window.innerHeight;
              el.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, c.left - 8))}px`;
              el.style.top = `${below ? c.bottom + 6 : c.top - r.height - 6}px`;
            },
            destroy() {
              window.removeEventListener('scroll', hide, true);
              el.remove();
            },
          };
        },
      }),
    ];
  },
});

// Names the open book's text can use: the series' shared entries and the book's own.
let cache = { a: null, b: null, list: [] };
export function nameHintsFor(project, series) {
  const a = project?.bible;
  const b = series?.data.bible;
  if (cache.a === a && cache.b === b) return cache.list;
  const entries = [...(b?.entries || []), ...(a?.entries || [])];
  const list = [];
  for (const e of entries) {
    for (const raw of [e.name, ...(e.aliases || [])]) {
      const text = (raw || '').trim();
      if (text.length >= 3 && /^\p{Lu}/u.test(text)) list.push({ text, entryId: e.id, label: e.name, sub: e.role || (e.type === 'place' ? 'Place' : '') });
    }
  }
  cache = { a, b, list };
  return list;
}
