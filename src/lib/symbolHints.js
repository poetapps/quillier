import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

// Instead of silently converting things like 1/2 or (c), offer the symbol in a small popover.
// Tab accepts, Space (or any other typing) keeps what you wrote, Esc dismisses.

const FRACTIONS = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
  '1/6': '⅙', '5/6': '⅚', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞',
};

const RULES = [
  { re: /(?:^|[^\d/])(\d\/\d)$/, out: (m) => FRACTIONS[m] },
  { re: /(\([cC]\))$/, out: () => '©' },
  { re: /(\([rR]\))$/, out: () => '®' },
  { re: /(\((?:tm|TM)\))$/, out: () => '™' },
  { re: /(<->)$/, out: () => '↔' },
  { re: /(?:^|[^<])(->)$/, out: () => '→' },
  { re: /(<-)$/, out: () => '←' },
  { re: /(=>)$/, out: () => '⇒' },
  { re: /(\+\/-)$/, out: () => '±' },
  { re: /(!=)$/, out: () => '≠' },
  { re: /(<<)$/, out: () => '«' },
  { re: /(>>)$/, out: () => '»' },
];

const key = new PluginKey('symbolHints');

function findSuggestion(state) {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  if ($from.marks().some((m) => m.type.name === 'code')) return null;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 12), $from.parentOffset, null, '￼');
  for (const rule of RULES) {
    const m = before.match(rule.re);
    if (!m) continue;
    const out = rule.out(m[1]);
    if (out) return { from: $from.pos - m[1].length, to: $from.pos, text: m[1], out };
  }
  return null;
}

function accept(view) {
  const s = key.getState(view.state);
  if (!s) return false;
  view.dispatch(view.state.tr.insertText(s.out, s.from, s.to).setMeta(key, 'dismiss'));
  return true;
}

function dismiss(view) {
  if (!key.getState(view.state)) return false;
  view.dispatch(view.state.tr.setMeta(key, 'dismiss'));
  return true;
}

export const SymbolHints = Extension.create({
  name: 'symbolHints',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => null,
          apply(tr, prev, oldState, newState) {
            if (tr.getMeta(key) === 'dismiss') return null;
            // Only suggest right after something was typed (the document grew and the cursor is at the end of it).
            if (tr.docChanged && newState.doc.content.size > oldState.doc.content.size && !tr.getMeta('uiEvent')) {
              return findSuggestion(newState);
            }
            if (prev && (tr.docChanged || !newState.selection.empty || newState.selection.from !== prev.to)) return null;
            return prev;
          },
        },
        props: {
          handleKeyDown(view, event) {
            if (!key.getState(view.state)) return false;
            if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
              event.preventDefault();
              return accept(view);
            }
            if (event.key === 'Escape') return dismiss(view);
            return false;
          },
          handleDOMEvents: {
            blur: (view) => {
              dismiss(view);
              return false;
            },
          },
        },
        view(editorView) {
          const el = document.createElement('div');
          el.className = 'symbol-hint';
          el.style.display = 'none';
          const glyph = document.createElement('span');
          glyph.className = 'symbol-hint-glyph';
          const kbd = document.createElement('span');
          kbd.className = 'symbol-hint-key';
          kbd.textContent = 'Tab';
          el.append(glyph, kbd);
          el.title = 'Tab to use · Space to keep what you typed';
          el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            accept(editorView);
          });
          document.body.appendChild(el);
          const hide = () => (el.style.display = 'none');
          window.addEventListener('scroll', hide, true);

          return {
            update(view) {
              const s = key.getState(view.state);
              if (!s) return hide();
              glyph.textContent = s.out;
              el.style.display = 'flex';
              const c = view.coordsAtPos(s.to);
              const start = view.coordsAtPos(s.from);
              const r = el.getBoundingClientRect();
              const below = c.bottom + 6 + r.height < window.innerHeight;
              el.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, start.left - 4))}px`;
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
