import { Plus } from 'lucide-react';
import { useStore, setBible, openMenu } from '../store.js';
import { addEntry, startAddToSeries } from '../bibleActions.js';
import { useBible } from '../lib/useBible.js';
import { Segmented } from './ui.jsx';
import BibleEntries from './BibleEntries.jsx';
import BibleScenes from './BibleScenes.jsx';
import BibleGraph from './BibleGraph.jsx';
import BibleDashboard from './BibleDashboard.jsx';

const TABS = [
  ['characters', 'Characters'],
  ['places', 'Places'],
  ['scenes', 'Scenes'],
  ['relationships', 'Relationships'],
  ['dashboard', 'Dashboard'],
];

export default function Bible() {
  const bible = useBible();
  const { ctx, analysis, view, scope } = bible;
  const tab = useStore((s) => s.bible.tab);

  const counts = {
    characters: view.entries.filter((e) => e.type === 'character').length,
    places: view.entries.filter((e) => e.type === 'place').length,
    scenes: view.books.reduce((n, b) => n + (analysis.books[b.uuid]?.chapters || []).reduce((m, c) => m + c.scenes.length, 0), 0),
    relationships: view.rels.length,
    dashboard: '',
  };

  const newEntry = (e) => {
    if (tab === 'characters' || tab === 'places') return addEntry(tab === 'places' ? 'place' : 'character');
    openMenu(e.currentTarget.getBoundingClientRect(), [
      { label: 'Character', onClick: () => addEntry('character') },
      { label: 'Place', onClick: () => addEntry('place') },
    ], { align: 'right', width: 160 });
  };

  return (
    <div className="page-scroll">
      <div className="bible">
        <div className="bible-head">
          <div className="bible-head-left">
            <h1 className="bible-title">Story bible</h1>
            {ctx.inSeries ? (
              <Segmented
                value={scope}
                onChange={(s) => setBible({ scope: s })}
                options={[
                  { value: 'book', label: `${ctx.currentBook.label} · ${ctx.currentBook.title}` },
                  { value: 'series', label: 'Whole series' },
                ]}
              />
            ) : (
              <div className="bible-standalone">
                <span>Standalone book. Every entry belongs to this book.</span>
                <button className="text-link" onClick={() => startAddToSeries()}>
                  Add to a series…
                </button>
              </div>
            )}
          </div>
          <button className="btn small" onClick={newEntry}>
            <Plus size={15} strokeWidth={1.8} /> New entry
          </button>
        </div>

        <div className="bible-tabs-wrap">
          <nav className="tabs bible-tabs" aria-label="Story bible sections">
            {TABS.map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setBible({ tab: id })}>
                {label}
                {counts[id] !== '' && <span className="bible-tab-count">{counts[id]}</span>}
              </button>
            ))}
          </nav>
          {ctx.inSeries && (
            <div className="bible-scope-hint">
              {scope === 'series'
                ? `Everything in ${ctx.seriesTitle}. Entries only one book uses are marked.`
                : `What appears in ${ctx.currentBook.title}, series entries included.`}
            </div>
          )}
        </div>

        {(tab === 'characters' || tab === 'places') && <BibleEntries {...bible} type={tab === 'places' ? 'place' : 'character'} />}
        {tab === 'scenes' && <BibleScenes {...bible} />}
        {tab === 'relationships' && <BibleGraph {...bible} />}
        {tab === 'dashboard' && <BibleDashboard {...bible} />}
      </div>
    </div>
  );
}
