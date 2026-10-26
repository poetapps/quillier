import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus, Sparkles } from 'lucide-react';
import { useStore, setBible, openMenu } from '../store.js';
import { addRelationship, updateRelationship, updateRelBook, toggleRelBook, deleteRelationship, setEntryPos } from '../bibleActions.js';
import { relLabel, pairs, suggestionsFrom, pairKey } from '../lib/bible.js';
import { RELATION_LABELS } from '../lib/smartTasks.js';
import { Segmented } from './ui.jsx';
import { plural, shortName } from './bibleUi.jsx';

const HEIGHT = 560;
const clamp = (v) => Math.min(0.95, Math.max(0.05, v));

// Characters without a saved spot go around an ellipse, the most mentioned in the middle.
function layout(chars, mentions) {
  const placed = {};
  const free = chars.filter((e) => !e.pos).sort((a, b) => (mentions[b.id] || 0) - (mentions[a.id] || 0));
  const center = free.length > 3 ? free.shift() : null;
  if (center) placed[center.id] = { x: 0.5, y: 0.47 };
  free.forEach((e, i) => {
    const t = (i / Math.max(1, free.length)) * Math.PI * 2 - Math.PI / 2;
    placed[e.id] = { x: 0.5 + Math.cos(t) * 0.38, y: 0.5 + Math.sin(t) * 0.38 };
  });
  for (const e of chars) if (e.pos) placed[e.id] = e.pos;
  return placed;
}

// Nudge edge labels apart (and off the character pills) so crossing lines don't stack their labels.
function spreadLabels(labels, nodes) {
  const box = (l) => ({ x1: l.x - l.w / 2, x2: l.x + l.w / 2, y1: l.y - 12, y2: l.y + 12 });
  const hit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = box(labels[i]);
        const b = box(labels[j]);
        if (!hit(a, b)) continue;
        const push = (Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)) / 2 + 2;
        const up = labels[i].y <= labels[j].y ? -1 : 1;
        labels[i].y += up * push;
        labels[j].y -= up * push;
        moved = true;
      }
      for (const n of nodes) {
        const a = box(labels[i]);
        const nb = { x1: n.x - n.w / 2, x2: n.x + n.w / 2, y1: n.y - 20, y2: n.y + 20 };
        if (!hit(a, nb)) continue;
        labels[i].y += labels[i].y <= n.y ? -(a.y2 - nb.y1 + 2) : nb.y2 - a.y1 + 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return labels;
}

function initials(e) {
  const words = (e.name || '?').split(/\s+/).filter((w) => !/^(Old|Young|Brother|Sister|Captain|Widow|Mr\.?|Mrs\.?|Miss|Dr\.?|Lord|Lady|Sir|The)$/i.test(w));
  return (words.length ? words : [e.name || '?']).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function RelPanel({ r, ctx, scope, analysis }) {
  const a = ctx.byId[r.a];
  const b = ctx.byId[r.b];
  const readOnly = r.store === 'sibling';
  const series = r.store === 'series';
  // No books listed means "wherever they both appear" (or wherever it has notes).
  const both = (uuid) => (analysis.totals[r.a]?.[uuid] || 0) > 0 && (analysis.totals[r.b]?.[uuid] || 0) > 0;
  const implicit = ctx.books.map((x) => x.uuid).filter((u) => both(u) || r.byBook[u]?.label || r.byBook[u]?.note);
  const applies = series ? (r.books.length ? r.books : implicit.length ? implicit : [ctx.uuid]) : [];
  return (
    <>
      <span className="bg-eyebrow">Relationship</span>
      <div className="bg-title">
        {a.name || 'Untitled'} &amp; {b.name || 'Untitled'}
      </div>
      <input
        className="bg-label-input"
        value={r.label}
        readOnly={readOnly}
        placeholder="What they are to each other"
        onChange={(e) => updateRelationship(r.id, { label: e.target.value })}
      />
      {series ? (
        <>
          <div className="bg-books">
            {ctx.books.map((bk) => (
              <button key={bk.uuid} className={`chip toggle-chip ${applies.includes(bk.uuid) ? 'on' : ''}`} onClick={() => toggleRelBook(r.id, bk.uuid, applies)}>
                {bk.label}
              </button>
            ))}
          </div>
          <div className="bg-timeline">
            {ctx.books
              .filter((bk) => applies.includes(bk.uuid))
              .map((bk) => (
                <div key={bk.uuid} className={`bg-tl-row ${bk.current ? 'current' : ''}`}>
                  <span className="bg-tl-book">{bk.label}</span>
                  <span className="bg-tl-body">
                    <input
                      className="bg-tl-label"
                      value={r.byBook[bk.uuid]?.label || ''}
                      placeholder={r.label || 'Label in this book'}
                      onChange={(e) => updateRelBook(r.id, bk.uuid, { label: e.target.value })}
                    />
                    <textarea
                      className="bg-tl-note"
                      rows={1}
                      value={r.byBook[bk.uuid]?.note || ''}
                      placeholder="How things stand in this book"
                      onChange={(e) => updateRelBook(r.id, bk.uuid, { note: e.target.value })}
                    />
                  </span>
                </div>
              ))}
          </div>
          <p className="bg-foot">How they stand can change from book to book. Looking at one book, the graph uses that book’s label.</p>
        </>
      ) : (
        <textarea
          className="text-input area bg-note"
          value={r.note}
          readOnly={readOnly}
          placeholder="How they met, what’s between them, how it changes…"
          onChange={(e) => updateRelationship(r.id, { note: e.target.value })}
        />
      )}
      {!readOnly && (
        <button className="link-btn danger bg-delete" onClick={() => deleteRelationship(r.id)}>
          <Trash2 size={13} strokeWidth={1.8} /> Delete relationship
        </button>
      )}
      {scope === 'book' && series && r.byBook[ctx.uuid]?.label && <span className="bg-foot">Shown here as “{relLabel(r, 'book', ctx.uuid)}”.</span>}
    </>
  );
}

function NodePanel({ e, ctx, view, scope }) {
  const mine = view.rels.filter((r) => r.a === e.id || r.b === e.id);
  const others = view.entries.filter((x) => x.type === 'character' && x.id !== e.id && !mine.some((r) => r.a === x.id || r.b === x.id));
  return (
    <>
      <span className="bg-eyebrow">Character</span>
      <div className="bg-title">{e.name || 'Untitled'}</div>
      {e.role && <div className="bg-sub">{e.role}</div>}
      <div className="bg-rel-list">
        {mine.map((r) => (
          <button key={r.id} className="bg-rel-row" onClick={() => setBible({ graphSel: { kind: 'rel', id: r.id } })}>
            <span>{ctx.byId[r.a === e.id ? r.b : r.a].name}</span>
            <span className="muted">{relLabel(r, scope, ctx.uuid) || 'No label'}</span>
          </button>
        ))}
        {!mine.length && <span className="muted">No relationships yet.</span>}
      </div>
      <div className="bg-actions">
        {others.length > 0 && e.store !== 'sibling' && (
          <button
            className="btn small"
            onClick={(ev) =>
              openMenu(ev.currentTarget.getBoundingClientRect(), [{ heading: 'Connect to' }, ...others.map((o) => ({ label: o.name || 'Untitled', onClick: () => addRelationship(e.id, o.id) }))], {
                width: 230,
              })
            }
          >
            <Plus size={14} strokeWidth={1.8} /> Connect to…
          </button>
        )}
        <button className="btn small" onClick={() => setBible({ tab: 'characters', selected: e.id, noteTab: 'all' })}>
          Open entry
        </button>
      </div>
    </>
  );
}

function SuggestionPanel({ p, smartGuess }) {
  const label = smartGuess && smartGuess.key !== 'none' ? RELATION_LABELS[smartGuess.key] : '';
  return (
    <>
      <span className="bg-eyebrow">Often together</span>
      <div className="bg-title">
        {p.a.name} &amp; {p.b.name}
      </div>
      <p className="bg-text">
        No relationship yet, but they’re in {plural(p.n, 'chapter')} together. Worth naming what’s between them?
      </p>
      {label && (
        <p className="bg-smart">
          <Sparkles size={13} strokeWidth={1.8} /> Reads like: <b>{label}</b>
        </p>
      )}
      <button className="btn primary small bg-add" onClick={() => addRelationship(p.a.id, p.b.id, label)}>
        Add relationship
      </button>
    </>
  );
}

function Graph({ chars, rels, suggestions, mentions, sel, scope, ctx }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [live, setLive] = useState({});
  const drag = useRef(null);
  const base = useMemo(() => layout(chars, mentions), [chars, mentions]);
  const pos = (id) => live[id] || base[id] || { x: 0.5, y: 0.5 };

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Drop live positions once the saved ones catch up.
  useEffect(() => setLive({}), [base]);

  const xy = (id) => ({ x: pos(id).x * width, y: pos(id).y * HEIGHT });
  const labelPos = useMemo(() => {
    const items = [
      ...rels.map((r) => ({ key: r.id, text: relLabel(r, scope, ctx.uuid) || 'Unlabeled', a: r.a, b: r.b })),
      ...suggestions.map((p) => ({ key: p.key, text: `${p.n} chapters together`, a: p.a.id, b: p.b.id })),
    ].map((l) => {
      const a = xy(l.a);
      const b = xy(l.b);
      return { key: l.key, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: l.text.length * 6.6 + 22 };
    });
    const nodes = chars.map((c) => ({ ...xy(c.id), w: (c.name || 'Untitled').length * 7.6 + 56 }));
    return Object.fromEntries(spreadLabels(items, nodes).map((l) => [l.key, l]));
  }, [rels, suggestions, chars, width, live, base, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const hiNode = sel?.kind === 'node' ? sel.id : null;
  const near = new Set(hiNode ? [hiNode, ...rels.filter((r) => r.a === hiNode || r.b === hiNode).flatMap((r) => [r.a, r.b])] : []);
  const relOn = (r) => (sel?.kind === 'rel' && sel.id === r.id) || (hiNode && (r.a === hiNode || r.b === hiNode));
  const dim = (on) => (hiNode && !on ? 'dim' : '');

  const onDown = (e, ch) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: ch.id, sx: e.clientX, sy: e.clientY, o: pos(ch.id), moved: false, fixed: ch.store === 'sibling' };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || d.fixed) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setLive((l) => ({ ...l, [d.id]: { x: clamp(d.o.x + dx / width), y: clamp(d.o.y + dy / HEIGHT) } }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && !d.fixed) setEntryPos(d.id, live[d.id] || pos(d.id));
    else setBible({ graphSel: hiNode === d.id ? null : { kind: 'node', id: d.id } });
  };

  return (
    <div ref={boxRef} className="bg-canvas" style={{ height: HEIGHT }} onClick={(e) => e.target === e.currentTarget && setBible({ graphSel: null })}>
      <svg className="bg-edges" width={width} height={HEIGHT} aria-hidden="true">
        {rels.map((r) => {
          const a = xy(r.a);
          const b = xy(r.b);
          return <line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`bg-edge ${relOn(r) ? 'on' : ''} ${dim(relOn(r))}`} />;
        })}
        {suggestions.map((p) => {
          const a = xy(p.a.id);
          const b = xy(p.b.id);
          const on = sel?.kind === 'sug' && sel.id === p.key;
          return <line key={p.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`bg-edge sug ${on ? 'on' : ''} ${dim(false)}`} />;
        })}
      </svg>
      {rels.map((r) => {
        const on = sel?.kind === 'rel' && sel.id === r.id;
        return (
          <button
            key={r.id}
            className={`bg-edge-label ${on ? 'on' : ''} ${dim(relOn(r))}`}
            style={{ left: labelPos[r.id].x, top: labelPos[r.id].y }}
            onClick={() => setBible({ graphSel: { kind: 'rel', id: r.id } })}
          >
            {relLabel(r, scope, ctx.uuid) || 'Unlabeled'}
          </button>
        );
      })}
      {suggestions.map((p) => {
        const on = sel?.kind === 'sug' && sel.id === p.key;
        return (
          <button
            key={p.key}
            className={`bg-edge-label sug ${on ? 'on' : ''} ${dim(false)}`}
            style={{ left: labelPos[p.key].x, top: labelPos[p.key].y }}
            onClick={() => setBible({ graphSel: { kind: 'sug', id: p.key } })}
          >
            {p.n} chapters together
          </button>
        );
      })}
      {chars.map((ch) => {
        const p = xy(ch.id);
        const on = hiNode === ch.id || (sel?.kind === 'rel' && rels.some((r) => r.id === sel.id && (r.a === ch.id || r.b === ch.id))) || (sel?.kind === 'sug' && sel.id.split('|').includes(ch.id));
        return (
          <button
            key={ch.id}
            className={`bg-node ${on ? 'on' : ''} ${hiNode && !near.has(ch.id) ? 'dim' : ''}`}
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => onDown(e, ch)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            title={ch.role || ch.name}
          >
            <span className={`bg-avatar ${ctx.inSeries && ch.owner !== 'series' ? 'book' : ''}`}>{initials(ch)}</span>
            {ch.name || 'Untitled'}
          </button>
        );
      })}
      {!chars.length && <div className="bg-empty">Add characters in the Characters tab, then connect them here.</div>}
    </div>
  );
}

function Grid({ chars, rels, sel, scope, ctx }) {
  const find = (a, b) => rels.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  return (
    <div className="bg-grid-wrap">
      <div className="bg-grid">
        <div className="bg-grid-row">
          <span className="bg-grid-name" />
          {chars.map((c) => (
            <span key={c.id} className="bg-grid-head">
              {shortName(c)}
            </span>
          ))}
        </div>
        {chars.map((row) => (
          <div key={row.id} className="bg-grid-row">
            <span className="bg-grid-name">{row.name || 'Untitled'}</span>
            {chars.map((col) => {
              if (col.id === row.id) return <span key={col.id} className="bg-cell self" />;
              const r = find(row.id, col.id);
              if (!r)
                return (
                  <button
                    key={col.id}
                    className="bg-cell empty"
                    title={`Connect ${row.name} and ${col.name}`}
                    onClick={() => row.store !== 'sibling' && col.store !== 'sibling' && addRelationship(row.id, col.id)}
                  >
                    ·
                  </button>
                );
              return (
                <button key={col.id} className={`bg-cell ${sel?.kind === 'rel' && sel.id === r.id ? 'on' : ''}`} onClick={() => setBible({ graphSel: { kind: 'rel', id: r.id } })}>
                  {relLabel(r, scope, ctx.uuid) || 'Unlabeled'}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BibleGraph({ ctx, analysis, view, scope }) {
  const mode = useStore((s) => s.bible.graphMode);
  const chosen = useStore((s) => s.bible.graphSel);
  const guesses = useStore((s) => s.smart.relations);
  const chars = view.entries.filter((e) => e.type === 'character');
  const mentions = useMemo(() => Object.fromEntries(chars.map((e) => [e.id, view.uuids.reduce((n, b) => n + (analysis.totals[e.id]?.[b] || 0), 0)])), [chars, view.uuids, analysis]);
  const suggestions = useMemo(() => suggestionsFrom(pairs(view, analysis)), [view, analysis]);

  // With nothing picked, the first relationship is shown (and highlighted).
  const sel = chosen || (view.rels.length ? { kind: 'rel', id: view.rels[0].id } : null);
  let panel = null;
  const rel = sel?.kind === 'rel' ? view.rels.find((r) => r.id === sel.id) : null;
  const node = sel?.kind === 'node' ? chars.find((e) => e.id === sel.id) : null;
  const sug = sel?.kind === 'sug' ? suggestions.find((p) => p.key === sel.id) : null;
  if (rel) panel = <RelPanel r={rel} ctx={ctx} scope={scope} analysis={analysis} />;
  else if (node) panel = <NodePanel e={node} ctx={ctx} view={view} scope={scope} />;
  else if (sug) panel = <SuggestionPanel p={sug} smartGuess={guesses[pairKey(sug.a.id, sug.b.id)]} />;
  else if (view.rels.length) panel = <RelPanel r={view.rels[0]} ctx={ctx} scope={scope} analysis={analysis} />;
  else
    panel = (
      <p className="bg-text muted">
        No relationships yet. Click a character, then <b>Connect to…</b>, or click an empty square in the grid.
      </p>
    );

  return (
    <div className="bg">
      <div className="bg-toolbar">
        <Segmented
          value={mode}
          onChange={(m) => setBible({ graphMode: m })}
          options={[
            { value: 'graph', label: 'Graph' },
            { value: 'grid', label: 'Grid' },
          ]}
        />
        <div className="bg-legend">
          <span>
            <span className="bg-avatar mini" />
            Series entry
          </span>
          {ctx.inSeries && (
            <span>
              <span className="bg-avatar mini book" />
              One book only
            </span>
          )}
          <span>
            <span className="bg-dash" />
            Often together, no relationship yet
          </span>
        </div>
      </div>
      <div className="bg-body">
        <div className="bg-stage">
          {mode === 'grid' ? (
            <Grid chars={chars} rels={view.rels} sel={sel} scope={scope} ctx={ctx} />
          ) : (
            <Graph chars={chars} rels={view.rels} suggestions={suggestions} mentions={mentions} sel={sel} scope={scope} ctx={ctx} />
          )}
        </div>
        <aside className="bg-panel" key={sel ? `${sel.kind}:${sel.id}` : 'none'}>
          {panel}
        </aside>
      </div>
    </div>
  );
}
