import { heatLevel } from '../lib/bible.js';

export const fmt = (n) => (n || 0).toLocaleString('en-US');
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export const shortName = (e) => {
  const words = (e?.name || '').trim().split(/\s+/);
  return e?.aliases?.find((a) => /^\p{Lu}/u.test(a) && !a.includes(' ')) || words[words.length > 1 && /^(Old|Brother|Sister|Captain|Widow|Mr\.?|Mrs\.?|Miss|Dr\.?|Lord|Lady|Sir|The)$/i.test(words[0]) ? 1 : 0] || 'Untitled';
};

export function ownerLabel(e, ctx) {
  if (!ctx.inSeries) return null;
  if (e.owner === 'series') return 'Series';
  return `${ctx.bookById[e.owner]?.label || 'One book'} only`;
}

export function OwnerBadge({ e, ctx }) {
  const label = ownerLabel(e, ctx);
  if (!label) return null;
  return <span className={`owner-badge ${e.owner === 'series' ? 'series' : 'book'}`}>{label}</span>;
}

// One small square per chapter, brighter where an entry is mentioned more.
export function Strip({ counts, titles, current }) {
  return (
    <span className={`strip ${current ? 'current' : ''}`}>
      {counts.map((n, i) => (
        <span key={i} className={`heat heat-${heatLevel(n)}`} title={`${titles[i]}${n ? `: ${plural(n, 'mention')}` : ''}`} />
      ))}
    </span>
  );
}
