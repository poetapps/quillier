import { useEffect } from 'react';
import { Layers, Plus, FolderOpen, Book, Users, MoreHorizontal, Moon, Sun, SlidersHorizontal, ArrowUp, ArrowDown, Pencil, X, LogOut } from 'lucide-react';
import { useStore, openProjectAt, openProjectDialog, toggleTheme, openModal, openMenu } from '../store.js';
import {
  refreshLibrary,
  newBook,
  newSeries,
  newBookInSeries,
  openSeriesBible,
  renameSeries,
  moveBookInSeries,
  setBookKind,
  takeOutOfSeries,
  removeFromLibrary,
  startAddToSeries,
} from '../bibleActions.js';
import { statusLabel } from '../lib/project.js';
import { bookLabels } from '../lib/series.js';
import { IconButton, Wordmark } from './ui.jsx';

const fmt = (n) => (n || 0).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const reveal = (path) => window.api.reveal(path);

function seriesMenu(e, s) {
  openMenu(
    e.currentTarget.getBoundingClientRect(),
    [
      { label: 'Rename series…', icon: Pencil, onClick: () => renameSeries(s.path, s.title) },
      { label: 'New book in this series…', icon: Plus, onClick: () => newBookInSeries(s.path) },
      { label: 'Show in Finder', icon: FolderOpen, onClick: () => reveal(s.path) },
      { separator: true },
      { label: 'Remove from library', icon: X, onClick: () => removeFromLibrary(s.path) },
    ],
    { align: 'right', width: 230 }
  );
}

function bookMenu(e, s, b, i) {
  const kinds = [
    ['book', 'Numbered book'],
    ['prequel', 'Prequel'],
    ['companion', 'Companion, unnumbered'],
  ];
  openMenu(
    e.currentTarget.getBoundingClientRect(),
    [
      { label: 'Move up', icon: ArrowUp, disabled: i === 0, onClick: () => moveBookInSeries(s.path, b.uuid, -1) },
      { label: 'Move down', icon: ArrowDown, disabled: i === s.books.length - 1, onClick: () => moveBookInSeries(s.path, b.uuid, 1) },
      { separator: true },
      ...kinds.map(([kind, label]) => ({ label, checked: b.kind === kind, onClick: () => setBookKind(s.path, b.uuid, kind) })),
      { separator: true },
      b.exists && { label: 'Show in Finder', icon: FolderOpen, onClick: () => reveal(b.path) },
      b.exists && { label: 'Take out of series…', icon: LogOut, onClick: () => takeOutOfSeries(s.path, b.uuid, b.path) },
    ],
    { align: 'right', width: 230 }
  );
}

function standaloneMenu(e, b) {
  openMenu(
    e.currentTarget.getBoundingClientRect(),
    [
      { label: 'Show in Finder', icon: FolderOpen, onClick: () => reveal(b.path) },
      { label: 'Remove from library', icon: X, onClick: () => removeFromLibrary(b.path) },
    ],
    { align: 'right', width: 210 }
  );
}

function SeriesCard({ s, highlight }) {
  const labels = bookLabels(s.books);
  const words = s.books.reduce((n, b) => n + (b.words || 0), 0);
  return (
    <div className="lib-card">
      <div className="lib-card-head">
        <span className="lib-card-icon">
          <Layers size={20} strokeWidth={1.6} />
        </span>
        <div className="lib-card-title">
          <div className="lib-series-name">{s.title}</div>
          <div className="lib-meta">
            {plural(s.books.length, 'book')} · {plural(words, 'word')}
          </div>
        </div>
        <button className="btn small" onClick={() => openSeriesBible(s)} disabled={!s.books.some((b) => b.exists)}>
          <Users size={15} strokeWidth={1.7} /> Open series bible
        </button>
        <IconButton icon={MoreHorizontal} title="More" onClick={(e) => seriesMenu(e, s)} />
      </div>
      <div className="lib-rows">
        {s.books.map((b, i) => (
          <div key={b.uuid} className={`lib-book-row ${b.exists ? '' : 'missing'}`}>
            <button className="lib-book-main" disabled={!b.exists} onClick={() => openProjectAt(b.path)} title={b.path || 'File not found'}>
              <span className="lib-book-label">{labels[b.uuid]?.long}</span>
              <span className="lib-book-title">
                {b.title}
                {highlight === b.uuid && <span className="lib-pill">Just added</span>}
              </span>
              {b.exists ? (
                <>
                  <span className="lib-book-status">
                    <span className={`status-dot s-${b.status}`} />
                    {statusLabel(b.status)}
                  </span>
                  <span className="lib-book-words">{plural(b.words, 'word')}</span>
                </>
              ) : (
                <span className="lib-book-status">File not found</span>
              )}
            </button>
            <IconButton icon={MoreHorizontal} size={16} title="More" className="lib-row-more" onClick={(e) => bookMenu(e, s, b, i)} />
          </div>
        ))}
        {!s.books.length && <div className="lib-empty-row">No books yet.</div>}
      </div>
      <div className="lib-card-foot">
        <span className="lib-foot-strong">One shared story bible</span>
        <span>{plural(s.characters, 'character')}</span>
        <span>{plural(s.places, 'place')}</span>
        <span>{plural(s.relationships, 'relationship')}</span>
        <button className="link-btn lib-foot-add" onClick={() => newBookInSeries(s.path)}>
          <Plus size={14} strokeWidth={1.8} /> New book in series
        </button>
      </div>
    </div>
  );
}

export default function Library() {
  const isDark = useStore((s) => s.isDark);
  const library = useStore((s) => s.library);
  const nonce = useStore((s) => s.libraryNonce);
  const highlight = useStore((s) => s.libraryHighlight);
  useEffect(() => {
    refreshLibrary();
  }, [nonce]);

  const series = library?.series || [];
  const standalone = library?.standalone || [];
  const empty = library && !series.length && !standalone.length;

  return (
    <div className="library">
      <div className="library-top drag">
        <Wordmark size={21} />
      </div>
      <main className="library-main">
        <div className="library-head">
          <div>
            <h1 className="library-title">Library</h1>
            <p className="library-sub">Standalone books and series, saved on this computer.</p>
          </div>
          <div className="library-actions">
            <button className="btn" onClick={openProjectDialog} title="Open a book or series file">
              <FolderOpen size={16} strokeWidth={1.7} /> Open…
            </button>
            <button className="btn" onClick={newSeries}>
              <Layers size={16} strokeWidth={1.7} /> New series
            </button>
            <button className="btn primary" onClick={newBook}>
              <Plus size={16} strokeWidth={1.8} /> New book
            </button>
          </div>
        </div>

        {empty && (
          <div className="library-empty">
            <p>A quiet place to write. Your books live in files on this computer and save as you type.</p>
            <p className="muted">Start a book on its own, or a series of books that share one story bible.</p>
          </div>
        )}

        {series.length > 0 && (
          <section className="library-section">
            <div className="library-section-label">Series</div>
            {series.map((s) => (
              <SeriesCard key={s.path} s={s} highlight={highlight} />
            ))}
          </section>
        )}

        {standalone.length > 0 && (
          <section className="library-section">
            <div className="library-section-label">Standalone books</div>
            <div className="lib-standalone">
              {standalone.map((b) => (
                <div key={b.path} className="lib-standalone-row">
                  <button className="lib-standalone-main" onClick={() => openProjectAt(b.path)} title={b.path}>
                    <Book size={18} strokeWidth={1.6} className="muted-icon" />
                    <span className="lib-standalone-text">
                      <span className="lib-standalone-title">{b.title}</span>
                      <span className="lib-meta">
                        {plural(b.words, 'word')} · {statusLabel(b.status)}
                        {b.characters > 0 && <> · {plural(b.characters, 'character')}</>}
                      </span>
                    </span>
                  </button>
                  <button className="btn small" onClick={() => startAddToSeries(b.path)}>
                    <Plus size={14} strokeWidth={1.8} /> Add to series…
                  </button>
                  <IconButton icon={MoreHorizontal} size={16} title="More" className="lib-row-more" onClick={(e) => standaloneMenu(e, b)} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <div className="welcome-foot">
        <IconButton icon={isDark ? Sun : Moon} title="Toggle dark mode" onClick={toggleTheme} />
        <IconButton icon={SlidersHorizontal} title="Settings" onClick={() => openModal('settings')} />
      </div>
    </div>
  );
}
