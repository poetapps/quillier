import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Clock, Layers } from 'lucide-react';
import { useStore, setPrefs, closeCompare, takeOlderWording, restoreVersion, putTakeInBook } from '../store.js';
import { findDoc, countWords } from '../lib/project.js';
import { openText, resolveAgainst, versionWhen } from '../lib/versions.js';
import { compareTexts, withOldWording, drawRow, plainText } from '../lib/diff.js';
import { Segmented, Toggle } from './ui.jsx';

// A chapter's open take against a saved version or another take, marked up like a manuscript:
// cut words struck through, new words tinted. Each change has a card in the margin to take it back
// or keep it.

const n = (x) => x.toLocaleString();
const wordCount = (md) => `${n(countWords(md))} ${countWords(md) === 1 ? 'word' : 'words'}`;

function Spans({ spans, hover, setHover }) {
  return spans.map((s, i) => {
    if (s.br) return <br key={i} />;
    let el = s.t;
    if (s.code) el = <code>{el}</code>;
    if (s.em) el = <em>{el}</em>;
    if (s.strong) el = <strong>{el}</strong>;
    if (s.strike) el = <s>{el}</s>;
    if (!s.mark) return <span key={i}>{el}</span>;
    return (
      <span key={i} className={`cmp-${s.mark} ${hover === s.id ? 'hl' : ''}`} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
        {el}
      </span>
    );
  });
}

function Prose({ row, side, plain, hover, setHover, mark }) {
  if (row.block === 'break') return <div className={`cmp-break ${mark || ''}`} aria-label="Scene break" />;
  return (
    <div className={`cmp-text b-${row.block}`}>
      <Spans spans={drawRow(row, side, plain)} hover={hover} setHover={setHover} />
    </div>
  );
}

export default function Compare() {
  const project = useStore((s) => s.project);
  const compare = useStore((s) => s.compare);
  const prefs = useStore((s) => s.prefs);
  const [kept, setKept] = useState(() => new Set());
  const [hover, setHover] = useState(null);

  const found = findDoc(project, compare.docId);
  const doc = found?.kind === 'chapter' ? found.doc : null;
  const cur = doc && openText(project, doc);
  const other = doc && resolveAgainst(doc, compare.against);
  const gone = !cur || !other || (other.kind === 'take' && other.id === cur.id);
  const rows = useMemo(() => (gone ? [] : compareTexts(other.content, cur.content)), [gone, other?.content, cur?.content]);

  useEffect(() => {
    if (gone) closeCompare();
  }, [gone]);
  useEffect(() => setHover(null), [rows]);

  if (gone) return null;

  const isTake = other.kind === 'take';
  const view = prefs.compareView === 'side' ? 'side' : 'inline';
  const only = !!prefs.compareOnlyChanged;
  const open = (p) => p.id && !p.fmt && !kept.has(p.key);
  const plain = new Set();
  let added = 0;
  let removed = 0;
  let pending = 0;
  let cuts = 0;
  for (const r of rows) {
    r.open = r.parts.filter((p) => {
      if (!p.id) return false;
      if (!open(p)) plain.add(p.id);
      return open(p);
    });
    for (const p of r.open) {
      added += countWords(p.ins);
      removed += countWords(p.del);
    }
    pending += r.open.length;
    if (r.kind === 'cut' && r.open.length) cuts++;
    r.shown = r.open.length > 0 || r.kind === 'movedFrom' || r.kind === 'movedTo';
  }
  const differs = rows.some((r) => r.kind !== 'same' && (r.parts.some((p) => p.id && !p.fmt) || r.kind.startsWith('moved')));

  // Unchanged paragraphs fold into one line each run when "Only changed paragraphs" is on.
  const items = [];
  let run = 0;
  for (const r of rows) {
    if (only && !r.shown) {
      run++;
      continue;
    }
    if (run) items.push({ gap: run });
    run = 0;
    items.push({ row: r });
  }
  if (run) items.push({ gap: run });

  const takeBack = (ids, message) => takeOlderWording(doc.id, cur.id, withOldWording(rows, new Set(ids)), message);
  const keep = (key) => setKept((k) => new Set(k).add(key));
  const useOther = other.name.length <= 14 ? `Use ${other.name}’s` : 'Use other take';
  const labelFor = (p) => (isTake ? useOther : p.del && p.ins ? 'Use old' : p.del ? 'Bring back' : 'Remove');
  const titleFor = (p) =>
    isTake ? `Use the wording from “${other.name}”` : p.del && p.ins ? 'Go back to the older wording' : p.del ? 'Put the cut words back' : 'Take the new words out';
  const doneFor = (p) => (isTake ? `Used “${other.name}”’s wording` : p.ins && !p.del ? 'Took out the new words' : 'Brought back the older wording');

  const card = (p, r) => {
    const sceneBreak = r.block === 'break';
    const del = sceneBreak ? '' : plainText(p.del).trim().slice(0, 140);
    const ins = sceneBreak ? '' : plainText(p.ins).trim().slice(0, 140);
    return (
      <div key={p.id} className={`cmp-card ${hover === p.id ? 'hl' : ''}`} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
        <span className="cmp-quote">
          {del && <span className="cmp-del">{del}</span>}
          {del && ins && <span className="cmp-arrow">→</span>}
          {ins && <span className="cmp-ins">{ins}</span>}
          {!del && !ins && <span className={p.del ? 'cmp-del' : 'cmp-ins'}>Scene break</span>}
        </span>
        <button className="cmp-act" title={titleFor(p)} onClick={() => takeBack([p.id], doneFor(p))}>
          {labelFor(p)}
        </button>
        <button className="cmp-act" title="Keep this change and stop marking it" onClick={() => keep(p.key)}>
          Keep
        </button>
      </div>
    );
  };

  const inlineRow = (r, i) =>
    r.kind === 'movedFrom' ? (
      <div key={i} className="cmp-row">
        <p className="cmp-moved">Moved from here: “{plainText(r.text).slice(0, 90).trim()}…”</p>
        <div />
      </div>
    ) : (
      <div key={i} className="cmp-row">
        <Prose row={r} side="inline" plain={plain} hover={hover} setHover={setHover} mark={r.open.length ? (r.kind === 'cut' ? 'cmp-del' : r.kind === 'added' ? 'cmp-ins' : '') : ''} />
        <div className="cmp-margin">
          {r.kind === 'movedTo' && <span className="cmp-tag">Moved here</span>}
          {r.open.map((p) => card(p, r))}
        </div>
      </div>
    );

  const sideRow = (r, i) => {
    const paraLabel = isTake ? useOther : r.kind === 'cut' ? 'Bring it back' : r.kind === 'added' ? 'Take it out' : 'Use this paragraph';
    const paraDone = isTake ? `Used “${other.name}”’s paragraph` : r.kind === 'added' ? 'Took the paragraph out' : 'Brought back the older paragraph';
    const action = r.open.length > 0 && (
      <button className="cmp-act cmp-para-act" onClick={() => takeBack(r.open.map((p) => p.id), paraDone)}>
        {paraLabel}
      </button>
    );
    const empty = (label) => <div className="cmp-empty">{label}</div>;
    const mark = r.open.length ? (r.kind === 'cut' ? 'cmp-del' : r.kind === 'added' ? 'cmp-ins' : '') : '';
    const left =
      r.kind === 'added' ? null : r.kind === 'movedTo' ? empty('Moved here from elsewhere') : r.kind === 'movedFrom' ? (
        <div className="cmp-text cmp-faded">{plainText(r.text)}</div>
      ) : (
        <Prose row={r} side="old" plain={plain} hover={hover} setHover={setHover} mark={mark} />
      );
    const right =
      r.kind === 'cut' ? empty('Cut from this version') : r.kind === 'movedFrom' ? empty('Moved') : (
        <Prose row={r} side="new" plain={plain} hover={hover} setHover={setHover} mark={mark} />
      );
    return (
      <div key={i} className="cmp-side">
        <div>
          {left}
          {r.kind !== 'added' && action}
        </div>
        <div>
          {right}
          {r.kind === 'added' && action}
        </div>
      </div>
    );
  };

  const OtherIcon = isTake ? Layers : other.auto ? Clock : Bookmark;
  const otherWhen = isTake ? (other.inBook ? 'In the book' : wordCount(other.content)) : versionWhen(other);
  const curWhen = `${wordCount(cur.content)}${isTake && cur.inBook ? ' · In the book' : ''}`;
  const promote = isTake && (!cur.inBook ? cur : !other.inBook ? other : null);

  return (
    <div className="page-scroll cmp-scroll">
      <div className="cmp">
        <div className="cmp-head">
          <div className="cmp-which">
            <span>Comparing</span>
            <span className="cmp-chip">
              <OtherIcon size={14} strokeWidth={1.8} />
              <b>{other.name}</b>
              <span>{otherWhen}</span>
            </span>
            <ArrowRight size={15} strokeWidth={1.7} aria-label="with" />
            <span className="cmp-chip">
              <b>{isTake ? cur.name : 'Now'}</b>
              <span>{curWhen}</span>
            </span>
          </div>
          <div className="cmp-actions">
            {!isTake && (
              <button className="btn small" onClick={() => restoreVersion(doc.id, other.id)} title="What’s on the page now is saved as a version first">
                Restore this version
              </button>
            )}
            {promote && (
              <button className="btn small" onClick={() => putTakeInBook(doc.id, promote.id)}>
                Put “{promote.name}” in the book
              </button>
            )}
            <button className="btn small primary" onClick={closeCompare} title="Back to writing  Esc">
              Done
            </button>
          </div>
        </div>

        <div className="cmp-bar">
          <div>
            <p className="cmp-summary">
              {differs ? (
                <>
                  <span className="cmp-plus">+{n(added)} words</span> <span className="cmp-minus">−{n(removed)} words</span>
                  <span className="dot-sep">·</span>
                  {pending ? `${pending} ${pending === 1 ? 'change' : 'changes'} to look at` : 'Every change looked at'}
                  {cuts > 0 && (
                    <>
                      <span className="dot-sep">·</span>
                      {cuts} {cuts === 1 ? 'paragraph' : 'paragraphs'} cut
                    </>
                  )}
                </>
              ) : (
                'No differences'
              )}
            </p>
            {differs && (
              <p className="cmp-legend">
                {isTake
                  ? `Struck-through words are only in “${other.name}”. Tinted words are only in “${cur.name}”.`
                  : `Struck-through words were in “${other.name}”. Tinted words are new since then.`}
              </p>
            )}
          </div>
          <div className="cmp-controls">
            <label className="cmp-only">
              <Toggle checked={only} onChange={(on) => setPrefs({ compareOnlyChanged: on })} />
              Only changed paragraphs
            </label>
            <Segmented
              value={view}
              options={[
                { value: 'inline', label: 'Inline' },
                { value: 'side', label: 'Side by side' },
              ]}
              onChange={(v) => setPrefs({ compareView: v })}
            />
          </div>
        </div>

        {!differs ? (
          <p className="cmp-none">“{other.name}” matches what’s on the page.</p>
        ) : (
          <div className={`cmp-body ${view}`}>
            {view === 'side' && (
              <div className="cmp-side cmp-side-head">
                <span>{other.name}</span>
                <span>{isTake ? cur.name : 'Now'}</span>
              </div>
            )}
            {items.map((it, i) =>
              it.gap ? (
                <div key={i} className={view === 'side' ? 'cmp-gap' : 'cmp-row'}>
                  {view === 'side' ? (
                    `${it.gap} unchanged ${it.gap === 1 ? 'paragraph' : 'paragraphs'}`
                  ) : (
                    <>
                      <div className="cmp-gap">
                        {it.gap} unchanged {it.gap === 1 ? 'paragraph' : 'paragraphs'}
                      </div>
                      <div />
                    </>
                  )}
                </div>
              ) : view === 'side' ? (
                sideRow(it.row, i)
              ) : (
                inlineRow(it.row, i)
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
