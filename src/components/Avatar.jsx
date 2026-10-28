import { useId, useMemo } from 'react';
import { faceSvg } from '../lib/face.js';

const TITLE_WORD = /^(Old|Young|Brother|Sister|Captain|Widow|Mr\.?|Mrs\.?|Miss|Dr\.?|Lord|Lady|Sir|The)$/i;

export function initials(e) {
  const words = (e.name || '?').split(/\s+/).filter((w) => !TITLE_WORD.test(w));
  return (words.length ? words : [e.name || '?']).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// A character's portrait, or their initials until the writer makes one.
export default function Avatar({ entry, size = 28, className = '' }) {
  const id = useId().replace(/[^\w-]/g, '');
  const face = entry.type === 'character' ? entry.face : null;
  const svg = useMemo(() => (face ? faceSvg(face, { id, detail: size >= 48 }) : null), [face, id, size]);
  if (svg) return <span className={`avatar has-face ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {initials(entry)}
    </span>
  );
}
