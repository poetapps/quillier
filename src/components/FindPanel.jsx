import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, CaseSensitive, WholeWord } from 'lucide-react';
import { useStore, setFind, replaceInBook, jumpToMatch, getMainEditor } from '../store.js';
import { findRegex, searchProject, snippet } from '../lib/find.js';
import { countOf } from '../lib/project.js';

const SHOWN = 300; // matches listed at most; replacing still covers all of them

function Option({ on, onChange, icon: Icon, title }) {
  return (
    <button className={`find-opt ${on ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={on} onClick={() => onChange(!on)}>
      <Icon size={17} strokeWidth={1.7} />
    </button>
  );
}

// The Find tab: search the whole book (every chapter and take, the outline and the notes), jump to
// any match, and replace them all, leaving out any you untick.
export default function FindPanel() {
  const project = useStore((s) => s.project);
  const find = useStore((s) => s.find);
  const focusNonce = useStore((s) => s.findFocus);
  const inputRef = useRef(null);
  const [skip, setSkip] = useState(() => new Set());
  const [cursor, setCursor] = useState(-1);
  const re = useMemo(() => findRegex(find.query, find), [find.query, find.matchCase, find.wholeWord]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => searchProject(project, re), [project, re]);
  const flat = useMemo(() => groups.flatMap((g) => g.matches.map((m, i) => ({ g, m, i, key: `${g.key}:${m.start}` }))), [groups]);

  useEffect(() => {
    setSkip(new Set());
    setCursor(-1);
  }, [re]);
  useEffect(() => {
    if (!focusNonce) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusNonce]);

  const total = flat.length;
  const chosen = flat.filter((x) => !skip.has(x.key)).length;
  const go = (k) => {
    if (!flat.length) return;
    const n = (k + flat.length) % flat.length;
    const x = flat[n];
    setCursor(n);
    jumpToMatch(x.g.docId, x.g.takeId, x.i);
  };
  const toggle = (key) => {
    const next = new Set(skip);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSkip(next);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go(cursor + (e.shiftKey ? -1 : 1));
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      getMainEditor()?.commands.focus();
    }
  };

  let shown = 0;
  const pages = new Set(groups.map((g) => g.docId)).size;
  const chapters = new Set(groups.filter((g) => g.chapter).map((g) => g.docId)).size;

  return (
    <div className="panel-scroll find">
      <div className="find-fields">
        <label className="find-box">
          <Search size={15} strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={find.query}
            placeholder="Find in the book"
            aria-label="Find"
            spellCheck={false}
            onChange={(e) => setFind({ query: e.target.value })}
            onKeyDown={onKey}
          />
          {find.query && (
            <button className="find-x" aria-label="Clear" onClick={() => (setFind({ query: '' }), inputRef.current?.focus())}>
              <X size={13} strokeWidth={2} />
            </button>
          )}
          <Option on={find.matchCase} onChange={(matchCase) => setFind({ matchCase })} icon={CaseSensitive} title="Match case" />
          <Option on={find.wholeWord} onChange={(wholeWord) => setFind({ wholeWord })} icon={WholeWord} title="Whole words only" />
        </label>
        <label className="find-box">
          <input
            value={find.replace}
            placeholder="Replace with"
            aria-label="Replace with"
            spellCheck={false}
            onChange={(e) => setFind({ replace: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), getMainEditor()?.commands.focus())}
          />
        </label>
        <div className="find-bar">
          <span className="find-count">
            {!find.query
              ? 'Every chapter and take, the outline and the notes.'
              : total
                ? `${total.toLocaleString('en-US')} ${total === 1 ? 'match' : 'matches'} in ${chapters === pages ? countOf(project, chapters) : `${pages} ${pages === 1 ? 'page' : 'pages'}`}`
                : 'No matches.'}
          </span>
          <button className="btn small" disabled={!chosen} onClick={() => replaceInBook(skip)}>
            {chosen && chosen < total ? `Replace ${chosen.toLocaleString('en-US')}` : 'Replace all'}
          </button>
        </div>
      </div>

      {groups.map((g) => {
        if (shown >= SHOWN) return null;
        const rows = g.matches.slice(0, SHOWN - shown);
        shown += rows.length;
        return (
          <section key={g.key} className="find-group">
            <div className="find-group-head">
              <span className="find-group-title">{g.label}</span>
              <span className="find-group-sub">
                {g.sub} · {g.matches.length}
              </span>
            </div>
            {rows.map((m, i) => {
              const k = `${g.key}:${m.start}`;
              const s = snippet(g.content, m);
              const off = skip.has(k);
              const current = flat[cursor]?.key === k;
              return (
                <div key={k} className={`find-row ${off ? 'off' : ''} ${current ? 'current' : ''}`}>
                  <button
                    className={`find-check ${off ? '' : 'on'}`}
                    role="checkbox"
                    aria-checked={!off}
                    title={off ? 'Left out of Replace. Click to include it.' : 'Included in Replace. Click to leave it out.'}
                    onClick={() => toggle(k)}
                  >
                    {!off && <Check size={11} strokeWidth={2.6} />}
                  </button>
                  <button
                    className="find-snippet"
                    onClick={() => {
                      setCursor(flat.findIndex((x) => x.key === k));
                      jumpToMatch(g.docId, g.takeId, i);
                    }}
                  >
                    {s.before}
                    <mark>{s.text}</mark>
                    {s.after}
                  </button>
                </div>
              );
            })}
          </section>
        );
      })}
      {total > SHOWN && <p className="panel-hint">Showing the first {SHOWN}. Replace covers all {total.toLocaleString('en-US')}.</p>}
      {find.query && total > 0 && (
        <p className="panel-hint">Enter goes to the next match, ⇧Enter the one before. Each chapter keeps a saved version from before a replace.</p>
      )}
    </div>
  );
}
