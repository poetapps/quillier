import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useStore, editInlineNote } from '../store.js';
import { findDoc } from '../lib/project.js';
import { noteIdsAtCursor } from '../lib/inlineNotes.js';

// Shows the note for a noted passage, just below the line, when you hover it or put the cursor in it.
// It stays out of the formatting bar's way: that bar sits above a selection, this sits below the
// line, and this never shows while text is selected.

const HOVER_DELAY = 280;
const LEAVE_GRACE = 180;

const sameIds = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);

export default function NotePeek({ editor, docId, containerRef }) {
  const notes = useStore((s) => findDoc(s.project, docId)?.doc.inlineNotes);
  const [cursorPeek, setCursorPeek] = useState(null); // { ids, rect }
  const [hoverPeek, setHoverPeek] = useState(null);
  const ref = useRef(null);
  const hoverTimer = useRef(null);
  const leaveTimer = useRef(null);
  const overPeek = useRef(false);

  const scheduleHoverHide = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => !overPeek.current && setHoverPeek(null), LEAVE_GRACE);
  };

  // Cursor inside a noted passage (collapsed selection, editor focused).
  useEffect(() => {
    if (!editor) return;
    const update = ({ transaction } = {}) => {
      const { state, view } = editor;
      if (!state.selection.empty) {
        setCursorPeek(null);
        setHoverPeek(null);
        return;
      }
      if (transaction?.docChanged || !view.hasFocus()) return setCursorPeek(null);
      const ids = [...new Set(noteIdsAtCursor(state))];
      if (!ids.length) return setCursorPeek(null);
      const c = view.coordsAtPos(state.selection.from);
      setCursorPeek((prev) =>
        prev && sameIds(prev.ids, ids) && prev.rect.bottom === c.bottom ? prev : { ids, rect: { left: c.left, top: c.top, bottom: c.bottom } }
      );
    };
    const onBlur = () => setCursorPeek(null);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setCursorPeek(null);
        setHoverPeek(null);
      }
    };
    editor.on('transaction', update);
    editor.on('focus', update);
    editor.on('blur', onBlur);
    editor.view.dom.addEventListener('keydown', onKey);
    return () => {
      editor.off('transaction', update);
      editor.off('focus', update);
      editor.off('blur', onBlur);
      editor.view.dom.removeEventListener('keydown', onKey);
    };
  }, [editor]);

  // Mouse hovering a noted passage.
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const onOver = (e) => {
      const span = e.target.closest?.('.note-anchor');
      if (!span || !dom.contains(span)) return;
      clearTimeout(leaveTimer.current);
      const ids = [];
      for (let n = span; n && n !== dom; n = n.parentElement) if (n.classList.contains('note-anchor')) ids.push(n.dataset.note);
      const rects = [...span.getClientRects()];
      const r = rects.find((x) => e.clientY >= x.top && e.clientY <= x.bottom) || rects[0];
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => {
        if (!editor.state.selection.empty) return;
        setHoverPeek((prev) => (prev && sameIds(prev.ids, ids) ? prev : { ids, rect: { left: r.left, top: r.top, bottom: r.bottom } }));
      }, HOVER_DELAY);
    };
    const onOut = (e) => {
      if (e.relatedTarget?.closest?.('.note-anchor') && dom.contains(e.relatedTarget)) return;
      clearTimeout(hoverTimer.current);
      scheduleHoverHide();
    };
    dom.addEventListener('mouseover', onOver);
    dom.addEventListener('mouseout', onOut);
    return () => {
      dom.removeEventListener('mouseover', onOver);
      dom.removeEventListener('mouseout', onOut);
      clearTimeout(hoverTimer.current);
      clearTimeout(leaveTimer.current);
    };
  }, [editor]);

  const peek = hoverPeek || cursorPeek;
  const items = peek ? peek.ids.map((id) => notes?.find((n) => n.id === id)).filter(Boolean) : [];

  // Position under the line (flip above only if there's no room below), and emphasise its underline.
  useLayoutEffect(() => {
    const el = ref.current;
    const box = containerRef.current;
    if (!el || !box || !peek) return;
    const b = box.getBoundingClientRect();
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const below = peek.rect.bottom + 8 + h < window.innerHeight - 48;
    const top = below ? peek.rect.bottom - b.top + 8 : peek.rect.top - b.top - 8 - h;
    const left = Math.max(0, Math.min(peek.rect.left - b.left - 12, b.width - w));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    const spans = peek.ids.flatMap((id) => [...editor.view.dom.querySelectorAll(`[data-note="${id}"]`)]);
    spans.forEach((s) => s.classList.add('peeked'));
    return () => spans.forEach((s) => s.classList.remove('peeked'));
  }, [peek, notes, containerRef, editor]);

  if (!items.length) return null;
  return (
    <div
      ref={ref}
      className="note-peek"
      onMouseEnter={() => {
        overPeek.current = true;
        clearTimeout(leaveTimer.current);
      }}
      onMouseLeave={() => {
        overPeek.current = false;
        scheduleHoverHide();
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((n) => (
        <button
          key={n.id}
          className="note-peek-item"
          title="Edit this note"
          onClick={() => {
            setHoverPeek(null);
            setCursorPeek(null);
            editInlineNote(n.id);
          }}
        >
          <MessageSquare size={13} strokeWidth={1.8} className="note-peek-icon" />
          {n.text.trim() ? <span className="note-peek-text">{n.text}</span> : <span className="note-peek-empty">Empty note. Click to write it.</span>}
        </button>
      ))}
    </div>
  );
}
