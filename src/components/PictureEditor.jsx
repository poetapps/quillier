import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { updateEntry } from '../bibleActions.js';
import { FACE_PARTS, FACE_EXTRAS, FACE_COLORS, faceSvg, presetFace, partLabel, hidesEars } from '../lib/face.js';
import { PLACE_PARTS, PLACE_EXTRAS, placeSvg, presetPlace, hasChimney } from '../lib/place.js';
import Avatar from './Avatar.jsx';

// What each kind of entry's picture is made of. `when` hides a row that doesn't apply right now.
export const KITS = {
  character: {
    field: 'face',
    name: 'portrait',
    parts: FACE_PARTS.map((p) => (p.key === 'earrings' ? { ...p, when: (f) => !hidesEars(f) } : p)),
    extras: FACE_EXTRAS,
    colors: [
      { key: 'skin', label: 'Skin' },
      { key: 'hairColor', label: 'Hair' },
      { key: 'scarf', label: 'Scarf', when: (f) => f.hair === 'scarf' },
      { key: 'iris', label: 'Eyes' },
      { key: 'bg', label: 'Background' },
      { key: 'shirt', label: 'Shirt' },
    ],
    draw: faceSvg,
    preset: presetFace,
    preview: 148,
  },
  place: {
    field: 'postcard',
    name: 'postcard',
    parts: PLACE_PARTS,
    extras: PLACE_EXTRAS.map((x) => (x.key === 'smoke' ? { ...x, when: hasChimney } : x)),
    colors: [],
    draw: placeSvg,
    preset: presetPlace,
    preview: 180,
    wide: true,
  },
};

const shown = (row, pic) => !row.when || row.when(pic);

// Popover for building a character's portrait or a place's postcard. Every option is drawn on the
// picture itself, with just that one choice changed.
export default function PictureEditor({ entry, anchor, onClose }) {
  const kit = KITS[entry.type];
  const pic = entry[kit.field];
  const id = useId().replace(/[^\w-]/g, '');
  const ref = useRef(null);
  const hadPic = useRef(false);
  const [pos, setPos] = useState(null);

  // Open below the picture so the name stays visible, letting the options scroll in whatever
  // room there is. Only a short window pushes it up over the header.
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(anchor.left, window.innerWidth - r.width - 8));
    const below = window.innerHeight - anchor.bottom - 16;
    if (below >= 360) setPos({ x, y: anchor.bottom + 8, maxHeight: Math.min(620, below) });
    else setPos({ x, y: Math.max(8, window.innerHeight - Math.min(r.height, window.innerHeight - 16) - 8) });
  }, [anchor, !!pic]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Undoing the picture away closes the editor.
  useEffect(() => {
    if (pic) hadPic.current = true;
    else if (hadPic.current) onClose();
  }, [pic, onClose]);

  if (!pic) return null;
  // Each pick is its own undo step.
  const set = (patch) => updateEntry(entry.id, { [kit.field]: { ...pic, ...patch } }, null);
  const tile = (patch, viewBox, key, label, on, onClick) => (
    <button key={key} className={`fe-tile ${kit.wide ? 'wide' : ''} ${on ? 'on' : ''}`} title={label} aria-label={label} aria-pressed={on} onClick={onClick}>
      <span dangerouslySetInnerHTML={{ __html: kit.draw({ ...pic, ...patch }, { id: `${id}-${key}`, detail: false, viewBox }) }} />
    </button>
  );

  return (
    <div className="menu-backdrop" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`picture-editor ${kit.wide ? 'wide' : ''}`}
        style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, maxHeight: pos?.maxHeight }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={partLabel(kit.name)}
      >
        <div className="fe-side">
          <Avatar entry={entry} size={kit.preview} />
          <button className="btn small" onClick={() => updateEntry(entry.id, { [kit.field]: kit.preset(entry, pic) }, null)}>
            <Shuffle size={14} strokeWidth={1.8} /> Shuffle
          </button>
          <button className="text-link fe-remove" onClick={() => updateEntry(entry.id, { [kit.field]: null }, null)}>
            Remove {kit.name}
          </button>
        </div>
        <div className="fe-parts">
          {kit.parts
            .filter((part) => shown(part, pic))
            .map((part) => (
              <section key={part.key} className="fe-row">
                <div className="fe-label">{part.label}</div>
                <div className="fe-tiles">
                  {part.options.map((o) =>
                    tile({ [part.key]: o }, part.crop, `${part.key}-${o}`, part.labels?.[o] || partLabel(o), pic[part.key] === o, () => set({ [part.key]: o }))
                  )}
                </div>
              </section>
            ))}
          <section className="fe-row">
            <div className="fe-label">Extras</div>
            <div className="fe-tiles">
              {kit.extras.filter((x) => shown(x, pic)).map((x) => tile({ [x.key]: true }, x.crop, x.key, x.label, pic[x.key], () => set({ [x.key]: !pic[x.key] })))}
            </div>
          </section>
          {kit.colors
            .filter((c) => shown(c, pic))
            .map((c) => (
              <section key={c.key} className="fe-row">
                <div className="fe-label">{c.label}</div>
                <div className="fe-swatches">
                  {Object.entries(FACE_COLORS[c.key]).map(([k, hex]) => (
                    <button
                      key={k}
                      className={`fe-swatch ${pic[c.key] === k ? 'on' : ''}`}
                      style={{ background: hex }}
                      title={partLabel(k)}
                      aria-label={`${c.label}: ${partLabel(k)}`}
                      aria-pressed={pic[c.key] === k}
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
