import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { updateEntry } from '../bibleActions.js';
import { FACE_PARTS, FACE_EXTRAS, FACE_COLORS, faceSvg, presetFace, partLabel, hidesEars } from '../lib/face.js';
import Avatar from './Avatar.jsx';

const COLOR_ROWS = [
  { key: 'skin', label: 'Skin' },
  { key: 'hairColor', label: 'Hair' },
  { key: 'scarf', label: 'Scarf', when: (f) => f.hair === 'scarf' },
  { key: 'iris', label: 'Eyes' },
  { key: 'bg', label: 'Background' },
  { key: 'shirt', label: 'Shirt' },
];

// Popover for building a character's portrait. Every option is drawn on the character itself.
export default function FaceEditor({ entry, anchor, onClose }) {
  const face = entry.face;
  const id = useId().replace(/[^\w-]/g, '');
  const ref = useRef(null);
  const hadFace = useRef(false);
  const [pos, setPos] = useState(null);

  // Open below the portrait so the name stays visible, letting the parts list scroll in whatever
  // room there is. Only a short window pushes it up over the header.
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(anchor.left, window.innerWidth - r.width - 8));
    const below = window.innerHeight - anchor.bottom - 16;
    if (below >= 360) setPos({ x, y: anchor.bottom + 8, maxHeight: Math.min(620, below) });
    else setPos({ x, y: Math.max(8, window.innerHeight - Math.min(r.height, window.innerHeight - 16) - 8) });
  }, [anchor, !!face]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Undoing the portrait away closes the editor.
  useEffect(() => {
    if (face) hadFace.current = true;
    else if (hadFace.current) onClose();
  }, [face, onClose]);

  if (!face) return null;
  // Each pick is its own undo step.
  const set = (patch) => updateEntry(entry.id, { face: { ...face, ...patch } }, null);
  const tile = (patch, viewBox, key, label, on, onClick) => (
    <button key={key} className={`fe-tile ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={onClick}>
      <span dangerouslySetInnerHTML={{ __html: faceSvg({ ...face, ...patch }, { id: `${id}-${key}`, detail: false, viewBox }) }} />
    </button>
  );

  return (
    <div className="menu-backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        className="face-editor"
        style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, maxHeight: pos?.maxHeight }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Portrait"
      >
        <div className="fe-side">
          <Avatar entry={entry} size={148} />
          <button className="btn small" onClick={() => updateEntry(entry.id, { face: presetFace(entry, face) }, null)}>
            <Shuffle size={14} strokeWidth={1.8} /> Shuffle
          </button>
          <button className="text-link fe-remove" onClick={() => updateEntry(entry.id, { face: null }, null)}>
            Remove portrait
          </button>
        </div>
        <div className="fe-parts">
          {FACE_PARTS.map((part) =>
            part.key === 'earrings' && hidesEars(face) ? null : (
              <section key={part.key} className="fe-row">
                <div className="fe-label">{part.label}</div>
                <div className="fe-tiles">
                  {part.options.map((o) => tile({ [part.key]: o }, part.crop, `${part.key}-${o}`, partLabel(o), face[part.key] === o, () => set({ [part.key]: o })))}
                </div>
              </section>
            )
          )}
          <section className="fe-row">
            <div className="fe-label">Extras</div>
            <div className="fe-tiles">
              {FACE_EXTRAS.map((x) => tile({ [x.key]: true }, x.crop, x.key, x.label, face[x.key], () => set({ [x.key]: !face[x.key] })))}
            </div>
          </section>
          {COLOR_ROWS.filter((c) => !c.when || c.when(face)).map((c) => (
            <section key={c.key} className="fe-row">
              <div className="fe-label">{c.label}</div>
              <div className="fe-swatches">
                {Object.entries(FACE_COLORS[c.key]).map(([k, hex]) => (
                  <button
                    key={k}
                    className={`fe-swatch ${face[c.key] === k ? 'on' : ''}`}
                    style={{ background: hex }}
                    title={partLabel(k)}
                    aria-label={`${c.label}: ${partLabel(k)}`}
                    aria-pressed={face[c.key] === k}
                    onClick={() => set({ [c.key]: k })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
