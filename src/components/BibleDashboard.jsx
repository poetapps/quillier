import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useStore, setBible, smartActive } from '../store.js';
import { dismissNote } from '../bibleActions.js';
import { heatLevel, pairs, suggestionsFrom, chapterColumns, relLabel, pairKey, needsCheck } from '../lib/bible.js';
import { RELATION_LABELS } from '../lib/smartTasks.js';
import { bookScenes, povShares, timelineChecks, timelineMode } from '../lib/timeline.js';
import { SmartHint } from './Smart.jsx';
import { fmt, plural } from './bibleUi.jsx';

const CELL = 16;
const GAP = 3;

const openEntry = (e) => () => setBible({ tab: e.type === 'place' ? 'places' : 'characters', selected: e.id, noteTab: 'all' });

const colLabel = (view, c) => `${view.series ? `${c.book.label}, ` : ''}Ch. ${c.ch.index + 1}`;

function buildNotes({ ctx, view, analysis, cols, suggestions, dismissed, smartOn, guesses, scenes, povs, colOf }) {
  const out = [];

  // The timeline (only the open book's, which is the one that can be fixed from here).
  const mine = scenes.filter((s) => s.book.current);
  for (const c of timelineChecks(mine, ctx.byId, timelineMode(ctx.currentBook.bible))) {
    out.push({ ...c, tone: 'gap', action: 'Timeline', run: () => setBible({ tab: 'timeline' }) });
  }

  // A point-of-view character who hasn't had a scene for a while.
  const lastPov = Math.max(-1, ...povs.map((r) => r.last));
  for (const r of povs) {
    if (r.scenes < 2 || lastPov - r.last < 5) continue;
    const e = ctx.byId[r.id];
    const c = cols[r.last];
    out.push({
      key: `pov:${r.id}:${c.ch.id}`,
      tone: 'gap',
      text: `${e.name} hasn’t had a point-of-view scene since ${colLabel(view, c)}.`,
      sub: `Other points of view have carried the last ${plural(lastPov - r.last, 'chapter')}.`,
      action: 'Scenes',
      run: () => setBible({ tab: 'scenes' }),
    });
  }

  const total = (e) => view.uuids.reduce((n, b) => n + (analysis.totals[e.id]?.[b] || 0), 0);
  const chars = view.entries.filter((e) => e.type === 'character');

  let end = -1;
  cols.forEach((c, k) => {
    if (Object.values(c.ch.counts).some((n) => n > 0)) end = k;
  });
  for (const e of chars) {
    let last = -1;
    cols.forEach((c, k) => {
      if ((c.ch.counts[e.id] || 0) > 0) last = k;
    });
    if (last >= 0 && end - last >= 5) {
      const c = cols[last];
      out.push({
        key: `gap:${e.id}:${c.ch.id}`,
        tone: 'gap',
        text: `${e.name} hasn’t appeared since ${view.series ? `${c.book.label}, ` : ''}Ch. ${c.ch.index + 1}.`,
        sub: `Last seen ${plural(end - last, 'chapter')} ago.`,
        action: 'Open',
        run: openEntry(e),
      });
    }
  }

  for (const e of view.entries) {
    const n = total(e);
    const hasNotes = e.notes.trim() || Object.values(e.perBook || {}).some((v) => (v || '').trim());
    if (n > 0 && !hasNotes && !e.role.trim()) {
      out.push({ key: `nonotes:${e.id}`, tone: 'plain', text: `${e.name} is mentioned ${plural(n, 'time')} but has no notes yet.`, sub: e.type === 'place' ? 'Place' : 'Character', action: 'Write notes', run: openEntry(e) });
    }
  }

  for (const e of view.entries) {
    for (const a of e.aliases) {
      if (/\s/.test(a)) continue;
      for (const o of view.entries) {
        if (o.id !== e.id && o.name.split(/\s+/).includes(a)) {
          out.push({
            key: `alias:${e.id}:${o.id}:${a}`,
            tone: 'alias',
            text: `“${a}” could mean ${e.name} or ${o.name}.`,
            sub: `It’s an alias of ${e.name}, so on its own it counts toward that entry.`,
            action: 'Edit aliases',
            run: openEntry(e),
          });
        }
      }
    }
  }

  const shared = analysis.books[ctx.uuid]?.matcher.shared;
  for (const [name, ids] of shared || []) {
    const names = ids.map((id) => ctx.byId[id]?.name).filter(Boolean);
    out.push({ key: `dup:${name}`, tone: 'alias', text: `“${name}” is listed for ${names.join(' and ')}.`, sub: `Mentions count toward ${names[0]}.`, action: 'Edit aliases', run: openEntry(ctx.byId[ids[1]]) });
  }

  const needs = {};
  for (const h of analysis.ambiguous) {
    if (h.bookUuid !== ctx.uuid) continue;
    if (needsCheck(h)) {
      needs[h.entryId] = needs[h.entryId] || { n: 0, word: h.word };
      needs[h.entryId].n++;
    }
  }
  for (const [id, { n, word }] of Object.entries(needs)) {
    const e = ctx.byId[id];
    if (!e) continue;
    out.push({
      key: `amb:${id}`,
      tone: 'alias',
      text: `${plural(n, `use`)} of “${word}” might not mean ${e.name}.`,
      sub: smartOn ? 'Smart features weren’t sure about these.' : `“${word}” is also an everyday word, so they weren’t counted.`,
      action: 'Check',
      run: openEntry(e),
    });
  }

  for (const p of suggestions) {
    const guess = guesses[pairKey(p.a.id, p.b.id)];
    out.push({
      key: `pair:${p.key}`,
      tone: 'pair',
      text: `${p.a.name} and ${p.b.name} share ${plural(p.n, 'chapter')} but have no relationship yet.`,
      sub: guess && guess.key !== 'none' ? `Reads like: ${RELATION_LABELS[guess.key]}.` : 'Shown dashed on the relationship graph.',
      action: 'View',
      run: () => setBible({ tab: 'relationships', graphMode: 'graph', graphSel: { kind: 'sug', id: p.key } }),
    });
  }
  return out.filter((n) => !dismissed.has(n.key));
}

function HeatRow({ e, view, analysis }) {
  return (
    <div className="bd-heat-row">
      <button className="bd-heat-name" onClick={openEntry(e)} title={e.role || e.name}>
        {e.name || 'Untitled'}
      </button>
      {view.books.map((b) => (
        <span key={b.uuid} className="strip">
          {(analysis.books[b.uuid]?.chapters || []).map((ch, i) => {
            const n = ch.counts[e.id] || 0;
            return <span key={ch.id} className={`heat heat-${heatLevel(n)}`} title={`${e.name}, ${view.series ? `${b.label} ` : ''}Ch. ${i + 1}${n ? `: ${plural(n, 'mention')}` : ''}`} />;
          })}
        </span>
      ))}
    </div>
  );
}

// Who tells the story: each point-of-view character's share of the words, and where they last had a turn.
function PovCard({ ctx, view, cols, scenes, povs }) {
  const told = povs.reduce((n, r) => n + r.words, 0);
  const set = scenes.filter((s) => s.pov).length;
  return (
    <section className="bd-card">
      <div className="bd-card-head">
        <div>
          <div className="bd-card-title">Point of view</div>
          <div className="bd-card-sub">
            {set ? `Set for ${set} of ${plural(scenes.length, 'scene')}. Share of the words in those scenes.` : 'Whose eyes each scene is seen through, set on the Scenes tab.'}
          </div>
        </div>
        <button className="btn small" onClick={() => setBible({ tab: 'scenes' })}>
          {set ? 'Scenes' : 'Set points of view'}
        </button>
      </div>
      {povs.length > 0 && (
        <div className="bd-pov">
          {povs.map((r) => {
            const e = ctx.byId[r.id];
            const pct = Math.round((r.words / Math.max(1, told)) * 100);
            return (
              <div key={r.id} className="bd-pov-row">
                <button className="bd-heat-name" onClick={openEntry(e)}>
                  {e.name}
                </button>
                <div className="bd-bar">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <span className="bd-pov-n">{pct}%</span>
                <span className="bd-pair-sub">
                  {plural(r.scenes, 'scene')} · {plural(r.chapters.size, 'chapter')} · last {colLabel(view, cols[r.last])}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function BibleDashboard({ ctx, analysis, view, scope }) {
  const dismissedList = useStore((s) => s.project.bible.dismissed);
  const smartOn = useStore((s) => smartActive(s.prefs));
  const guesses = useStore((s) => s.smart.relations);
  const chars = view.entries.filter((e) => e.type === 'character');
  const places = view.entries.filter((e) => e.type === 'place');
  const cols = useMemo(() => chapterColumns(view, analysis), [view, analysis]);
  const pairList = useMemo(() => pairs(view, analysis), [view, analysis]);
  const { scenes, povs, colOf } = useMemo(() => {
    const at = new Map(cols.map((c, k) => [`${c.book.uuid}:${c.ch.id}`, k]));
    const colOf = (s) => at.get(`${s.book.uuid}:${s.ch.id}`) ?? -1;
    const scenes = view.books.flatMap((b) => bookScenes(b, analysis.books[b.uuid]?.chapters || [], ctx.byId));
    return { scenes, povs: povShares(scenes, colOf), colOf };
  }, [view, analysis, cols, ctx.byId]);
  const suggestions = useMemo(() => suggestionsFrom(pairList), [pairList]);
  const notes = useMemo(
    () => buildNotes({ ctx, view, analysis, cols, suggestions, dismissed: new Set(dismissedList), smartOn, guesses, scenes, povs, colOf }),
    [ctx, view, analysis, cols, suggestions, dismissedList, smartOn, guesses, scenes, povs, colOf]
  );
  const top = pairList.slice(0, 5);
  const maxN = top[0]?.n || 1;

  const groupLabel = (b) => {
    const n = analysis.books[b.uuid]?.chapters.length || 0;
    if (!view.series) return 'Chapters';
    return n >= 8 ? `${b.label} · ${b.title}` : n >= 4 ? b.label : b.short;
  };

  return (
    <div className="bd">
      <SmartHint />
      <div className="bd-stats">
        {[
          [chars.length, 'Characters'],
          [places.length, 'Places'],
          [scenes.length, 'Scenes'],
          [view.rels.length, 'Relationships'],
        ].map(([v, label]) => (
          <div key={label} className="bd-stat">
            <b>{fmt(v)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="bd-card">
        <div className="bd-card-head">
          <div>
            <div className="bd-card-title">Who and what shows up where</div>
            <div className="bd-card-sub">One square per chapter. Brighter means mentioned more.</div>
          </div>
          <div className="bd-legend">
            Fewer
            <span className="heat heat-1" />
            <span className="heat heat-2" />
            <span className="heat heat-3" />
            More
          </div>
        </div>
        {chars.length + places.length === 0 ? (
          <p className="muted bd-none">Add characters and places to see where they show up.</p>
        ) : (
          <div className="bd-heat-scroll">
            <div className="bd-heat">
              <div className="bd-heat-row bd-heat-groups">
                <span className="bd-heat-name" />
                {view.books.map((b) => {
                  const n = analysis.books[b.uuid]?.chapters.length || 0;
                  return (
                    <span key={b.uuid} className="bd-heat-group" style={{ width: Math.max(CELL, n * CELL + (n - 1) * GAP) }} title={`${b.label} · ${b.title}`}>
                      {groupLabel(b)}
                    </span>
                  );
                })}
              </div>
              {chars.map((e) => (
                <HeatRow key={e.id} e={e} view={view} analysis={analysis} />
              ))}
              {places.length > 0 && <div className="bd-heat-sub">Places</div>}
              {places.map((e) => (
                <HeatRow key={e.id} e={e} view={view} analysis={analysis} />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="bd-two">
        <section className="bd-card bd-notes">
          <div className="bd-card-title">Worth a look</div>
          {notes.map((n) => (
            <div key={n.key} className="bd-note">
              <span className={`bd-dot ${n.tone}`} />
              <span className="bd-note-text">
                <span>{n.text}</span>
                <span className="bd-note-sub">{n.sub}</span>
              </span>
              <button className="btn small" onClick={n.run}>
                {n.action}
              </button>
              <button className="bd-note-x" title="Dismiss" aria-label="Dismiss" onClick={() => dismissNote(n.key)}>
                <X size={13} strokeWidth={1.8} />
              </button>
            </div>
          ))}
          {!notes.length && <div className="bd-note muted">Nothing stands out.</div>}
        </section>
        <section className="bd-card bd-together">
          <div className="bd-card-title">Often in the same chapters</div>
          {top.map((p) => (
            <div key={p.key} className="bd-pair">
              <div className="bd-pair-top">
                <span>
                  {p.a.name} &amp; {p.b.name}
                </span>
                <span className="muted">{p.n} ch.</span>
              </div>
              <div className="bd-bar">
                <div style={{ width: `${Math.round((p.n / maxN) * 100)}%` }} />
              </div>
              <span className="bd-pair-sub">{p.rel ? relLabel(p.rel, scope, ctx.uuid) || 'Unlabeled relationship' : 'No relationship yet'}</span>
            </div>
          ))}
          {!top.length && <div className="bd-pair muted">Characters who share chapters show up here.</div>}
        </section>
      </div>

      {chars.length > 0 && <PovCard ctx={ctx} view={view} cols={cols} scenes={scenes} povs={povs} />}
    </div>
  );
}
