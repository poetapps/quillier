import { useId, useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { faceSvg } from '../lib/face.js';
import { placeSvg } from '../lib/place.js';

const TITLE_WORD = /^(Old|Young|Brother|Sister|Captain|Widow|Mr\.?|Mrs\.?|Miss|Dr\.?|Lord|Lady|Sir|The)$/i;

export function initials(e) {
  const words = (e.name || '?').split(/\s+/).filter((w) => !TITLE_WORD.test(w));
  return (words.length ? words : [e.name || '?']).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// A character's portrait or a place's postcard. Until the writer makes one, a character shows their
// initials and a place shows a pin. `size` is the width; postcards are 3:2.
export default function Avatar({ entry, size = 28, className = '' }) {
  const id = useId().replace(/[^\w-]/g, '');
  const place = entry.type === 'place';
  const art = place ? entry.postcard : entry.type === 'character' ? entry.face : null;
  const svg = useMemo(() => (!art ? null : place ? placeSvg(art, { id, detail: size >= 72 }) : faceSvg(art, { id, detail: size >= 48 })), [art, place, id, size]);
  if (place) {
    const style = { width: size, height: Math.round((size * 2) / 3), borderRadius: Math.max(3, Math.round(size / 16)) };
    if (svg) return <span className={`avatar postcard has-art ${className}`} style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
    return (
      <span className={`avatar postcard ${className}`} style={style}>
        <MapPin size={Math.round(size * 0.34)} strokeWidth={1.8} />
      </span>
    );
  }
  if (svg) return <span className={`avatar has-face ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {initials(entry)}
    </span>
  );
}
