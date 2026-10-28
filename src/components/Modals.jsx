import { useState, useEffect, useRef } from 'react';
import { FileText, Folder, Globe, FileDown, FileType2, BookOpen, Layers, Check, ArrowRight, FilePlus, LayoutTemplate, NotebookPen, NotebookText } from 'lucide-react';
import { useStore, closeModal, setPrefs, setTheme, exportManuscript, setProjectMeta, checkForUpdates } from '../store.js';
import { activeDraft, chaptersOf, isBook, wordsFor, countOf, todayKey, dayOf, monthLabel } from '../lib/project.js';
import { STRUCTURES } from '../lib/templates.js';
import { TRIMS, DEFAULT_TRIM } from '../lib/export.js';
import { Modal, Segmented, Toggle } from './ui.jsx';
import { readBookForMerge, readSeriesForMerge, chooseNewSeriesFor, confirmAddToSeries } from '../bibleActions.js';
import { planMerge, matchReason, numberedCount, bookLabels } from '../lib/series.js';
import { SmartSettings } from './Smart.jsx';
import { DictationSettings } from './Dictation.jsx';

function PromptModal({ modal }) {
  const [value, setValue] = useState(modal.value);
  const submit = (e) => {
    e.preventDefault();
    closeModal(value);
  };
  return (
    <Modal
      title={modal.title}
      width={400}
      footer={
        <>
          <button className="btn" onClick={() => closeModal(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {modal.confirm}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {modal.label && <label className="field-label">{modal.label}</label>}
        <input className="text-input" autoFocus value={value} onFocus={(e) => e.target.select()} onChange={(e) => setValue(e.target.value)} />
      </form>
    </Modal>
  );
}

function Row({ label, hint, children }) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-label">{label}</div>
        {hint && <div className="setting-hint">{hint}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function updateLine(u) {
  switch (u.state) {
    case 'checking':
      return ['Checking…', null];
    case 'none':
      return ['You’re on the latest version.', ['Check now', checkForUpdates]];
    case 'available':
      return [`Version ${u.version} is out.`, ['Download', () => window.api.openDownloadPage()]];
    case 'downloading':
      return [`Downloading version ${u.version}… ${u.percent || 0}%`, null];
    case 'ready':
      return [`Version ${u.version} is ready. It installs when you quit.`, ['Restart now', () => window.api.installUpdate()]];
    case 'error':
      return [`Couldn’t check for updates. ${u.message}`, ['Try again', checkForUpdates]];
    case 'dev':
      return ['Updates work in the installed app.', null];
    default:
      return [null, ['Check now', checkForUpdates]];
  }
}

function UpdatesSection({ scrollTo }) {
  const prefs = useStore((s) => s.prefs);
  const update = useStore((s) => s.update) || { state: 'idle' };
  const ref = useRef(null);
  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [scrollTo]);
  const [line, action] = updateLine(update);
  return (
    <div ref={ref}>
      <div className="panel-label">Updates</div>
      <Row label={`Quillier ${update.current || ''}`.trim()} hint={line}>
        <button className="btn small" disabled={!action} onClick={action?.[1]}>
          {action?.[0] || 'Check now'}
        </button>
      </Row>
      <Row
        label="Check automatically"
        hint={
          update.canInstall
            ? 'Downloads new versions quietly and installs them when you quit. No pop-ups.'
            : 'Looks for new versions quietly and shows them here. No pop-ups.'
        }
      >
        <Toggle checked={prefs.autoUpdate !== false} onChange={(autoUpdate) => setPrefs({ autoUpdate })} />
      </Row>
    </div>
  );
}

function SettingsModal({ modal }) {
  const prefs = useStore((s) => s.prefs);
  return (
    <Modal title="Settings" width={520}>
      <div className="panel-label first">Appearance</div>
      <Row label="Theme">
        <Segmented
          value={prefs.theme}
          onChange={(theme) => setTheme({ theme })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </Row>
      <Row label="Dark style" hint="Black is for OLED screens: everything but the text is true black.">
        <Segmented
          value={prefs.darkStyle}
          onChange={(darkStyle) => setTheme({ darkStyle })}
          options={[
            { value: 'black', label: 'Black' },
            { value: 'dark', label: 'Dark' },
            { value: 'midnight', label: 'Midnight' },
          ]}
        />
      </Row>
      <Row label="Light style">
        <Segmented
          value={prefs.lightStyle}
          onChange={(lightStyle) => setTheme({ lightStyle })}
          options={[
            { value: 'sepia', label: 'Sepia' },
            { value: 'cream', label: 'Cream' },
            { value: 'white', label: 'White' },
          ]}
        />
      </Row>
      <Row label="Writing font">
        <Segmented
          value={prefs.font}
          onChange={(font) => setPrefs({ font })}
          options={[
            { value: 'sans', label: 'Sans' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Mono' },
          ]}
        />
      </Row>
      <Row label="Text size" hint="⌘+ and ⌘− also work">
        <input type="range" min="13" max="28" step="1" value={prefs.fontSize} onChange={(e) => setPrefs({ fontSize: +e.target.value })} />
        <span className="range-val">{prefs.fontSize}px</span>
      </Row>
      <Row label="Line spacing">
        <input type="range" min="1.3" max="2.4" step="0.05" value={prefs.lineHeight} onChange={(e) => setPrefs({ lineHeight: +e.target.value })} />
        <span className="range-val">{(+prefs.lineHeight).toFixed(2)}</span>
      </Row>
      <Row label="Page width">
        <Segmented
          value={prefs.width}
          onChange={(width) => setPrefs({ width })}
          options={[
            { value: 'narrow', label: 'Narrow' },
            { value: 'medium', label: 'Medium' },
            { value: 'wide', label: 'Wide' },
          ]}
        />
      </Row>

      <div className="panel-label">Writing</div>
      <Row label="Smart quotes & dashes" hint={'Turns " into “ ” and -- into —'}>
        <Toggle checked={prefs.smartTypography} onChange={(smartTypography) => setPrefs({ smartTypography })} />
      </Row>
      <Row label="Symbol suggestions" hint="Offers ½, ©, → and friends as you type. Tab to use, Space to skip.">
        <Toggle checked={prefs.symbolHints} onChange={(symbolHints) => setPrefs({ symbolHints })} />
      </Row>
      <Row label="Name suggestions" hint="Names from the story bible finish themselves after a capital and two letters. Tab to use.">
        <Toggle checked={prefs.nameHints !== false} onChange={(nameHints) => setPrefs({ nameHints })} />
      </Row>
      <Row label="Spell check">
        <Toggle checked={prefs.spellcheck} onChange={(spellcheck) => setPrefs({ spellcheck })} />
      </Row>
      <Row label="Daily word goal" hint="0 turns it off">
        <input
          className="text-input num"
          type="number"
          min="0"
          step="50"
          value={prefs.dailyGoal || 0}
          onChange={(e) => setPrefs({ dailyGoal: Math.max(0, parseInt(e.target.value || '0', 10)) })}
        />
      </Row>

      <DictationSettings scrollTo={modal.section === 'dictation'} />

      <div className="panel-label">Safety</div>
      <Row label="Backups" hint="A copy of each project is kept every 10 minutes while you write, and whenever it’s opened.">
        <button className="btn small" onClick={() => window.api.openBackups()}>
          Open folder
        </button>
      </Row>

      <UpdatesSection scrollTo={modal.section === 'updates'} />

      <div className="panel-label">Alpha</div>
      <Row label="Alpha features" hint="Shows features that aren’t finished yet. They may change, or go away.">
        <Toggle checked={!!prefs.alphaFeatures} onChange={(alphaFeatures) => setPrefs({ alphaFeatures })} />
      </Row>
      {prefs.alphaFeatures && <SmartSettings scrollTo={modal.section === 'smart'} />}
    </Modal>
  );
}

const FORMATS = [
  { id: 'manuscript', icon: FileType2, label: 'Manuscript', sub: 'Submission format: 8.5×11, Courier, double-spaced' },
  { id: 'epub', icon: BookOpen, label: 'EPUB ebook', sub: 'For Apple Books, Kobo, Kindle, any e-reader' },
  { id: 'pdf', icon: FileDown, label: 'Book PDF', sub: 'Print-ready at 5×8, 5.5×8.5 or 6×9' },
  { id: 'html', icon: Globe, label: 'HTML', sub: 'A clean web page, book styling' },
  { id: 'md', icon: FileText, label: 'Markdown', sub: 'One .md file with every chapter' },
  { id: 'folder', icon: Folder, label: 'Markdown folder', sub: 'One .md file per chapter' },
];

let lastFormat = 'manuscript';

function AuthorRow({ project }) {
  return (
    <Row label="Author">
      <input
        className="text-input"
        style={{ width: 240 }}
        placeholder="Your name or pen name"
        value={project.meta.author}
        onChange={(e) => setProjectMeta({ author: e.target.value })}
      />
    </Row>
  );
}

function ExportModal() {
  const project = useStore((s) => s.project);
  const formats = FORMATS.filter((f) => isBook(project) || f.id !== 'manuscript');
  const [format, setFormatState] = useState(formats.some((f) => f.id === lastFormat) ? lastFormat : 'pdf');
  const words = wordsFor(project);
  const titlesLabel = { book: 'Chapter titles', journal: 'Dates and titles', notebook: 'Page titles' }[project.kind] || 'Chapter titles';
  const [titles, setTitles] = useState(true);
  const [titlePage, setTitlePage] = useState(true);
  const [underlineItalics, setUnderlineItalics] = useState(false);
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const draft = activeDraft(project);
  const setFormat = (f) => {
    lastFormat = f;
    setFormatState(f);
  };
  const run = async () => {
    setBusy(true);
    try {
      const where = await exportManuscript(format, { titles, titlePage, underlineItalics, cover });
      if (where) closeModal(where);
    } finally {
      setBusy(false);
    }
  };
  const chooseCover = async () => {
    const picked = await window.api.chooseCover();
    if (picked) setCover(picked);
  };

  return (
    <Modal
      title={`Export ${words.whole.toLowerCase()}`}
      width={540}
      footer={
        <>
          <span className="foot-note">{isBook(project) ? `${draft.name} · ${chaptersOf(draft).length} chapters` : countOf(project, chaptersOf(draft).length)}</span>
          <button className="btn" onClick={() => closeModal(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={run}>
            {busy ? 'Exporting…' : 'Export…'}
          </button>
        </>
      }
    >
      <div className="format-grid">
        {formats.map((f) => (
          <button key={f.id} className={`format-card ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)}>
            <f.icon size={18} strokeWidth={1.6} />
            <span className="format-label">{f.label}</span>
            <span className="format-sub">{f.sub.replace('chapter', words.page)}</span>
          </button>
        ))}
      </div>

      {format === 'manuscript' && (
        <>
          <AuthorRow project={project} />
          <div className="setting-row stacked">
            <div>
              <div className="setting-label">Contact details</div>
              <div className="setting-hint">Printed top-left on the title page: address, phone, email, agent.</div>
            </div>
            <textarea
              className="text-input area"
              rows={3}
              placeholder={'123 Example Street\nCity, State 00000\nname@example.com'}
              value={project.meta.contact}
              onChange={(e) => setProjectMeta({ contact: e.target.value })}
            />
          </div>
          <Row label="Underline italics" hint="Old typewriter convention. Most editors now prefer real italics.">
            <Toggle checked={underlineItalics} onChange={setUnderlineItalics} />
          </Row>
        </>
      )}

      {format === 'epub' && (
        <>
          <AuthorRow project={project} />
          <Row label="Cover" hint={cover ? cover.name : 'A simple title cover is made for you, or use your own image.'}>
            {cover && (
              <button className="btn small" onClick={() => setCover(null)}>
                Use generated
              </button>
            )}
            <button className="btn small" onClick={chooseCover}>
              {cover ? 'Change…' : 'Choose image…'}
            </button>
          </Row>
          <Row label={titlesLabel}>
            <Toggle checked={titles} onChange={setTitles} />
          </Row>
        </>
      )}

      {format === 'pdf' && (
        <Row label="Trim size" hint="Inches, as printed and bound">
          <Segmented
            value={TRIMS[project.meta.trim] ? project.meta.trim : DEFAULT_TRIM}
            onChange={(trim) => setProjectMeta({ trim })}
            options={Object.entries(TRIMS).map(([value, t]) => ({ value, label: t.label }))}
          />
        </Row>
      )}
      {['pdf', 'html', 'md', 'folder'].includes(format) && (
        <Row label={titlesLabel}>
          <Toggle checked={titles} onChange={setTitles} />
        </Row>
      )}
      {['pdf', 'html', 'md'].includes(format) && (
        <Row label="Title page" hint={`“${project.title}”`}>
          <Toggle checked={titlePage} onChange={setTitlePage} />
        </Row>
      )}
    </Modal>
  );
}

// ---------- starting a project ----------
// The extra step in New project (mode 'new': a book, blank or from a story structure, or with `kinds`
// a journal or notebook) and the Outline's "Add a structure" (mode 'add'). Resolves with
// { kind, structure, mirror, chapters }.

const NOTEBOOKS = [
  {
    id: 'journal',
    name: 'Journal',
    icon: NotebookPen,
    summary: 'Dated entries, newest first and grouped by month. ⌘N starts today’s entry, and an entry can move to any other day.',
    more: 'No chapters, outline or story bible. Exports print each entry under its date.',
  },
  {
    id: 'notebook',
    name: 'Research & study',
    icon: NotebookText,
    summary: 'Pages in folders, as deep as you like, for research, study notes or a commonplace book.',
    more: 'No chapter numbers, statuses or story bible. Just pages, with side notes and notes on text like everywhere else.',
  },
];

// What the sidebar of a new journal looks like: a few days back from today.
function JournalSample() {
  const days = [0, 2, 5].map((back) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return todayKey(d);
  });
  const titles = ['Coffee before anyone was up', 'First cold morning', 'Notes from the train'];
  return (
    <div className="start-sample">
      {days.map((k, i) => (
        <div key={k}>
          {(i === 0 || k.slice(0, 7) !== days[i - 1].slice(0, 7)) && <div className="start-sample-month">{monthLabel(k)}</div>}
          <div className="start-sample-row">
            <span className="sb-day">
              <b>{dayOf(k).getDate()}</b>
              {dayOf(k).toLocaleDateString(undefined, { weekday: 'short' })}
            </span>
            {titles[i]}
          </div>
        </div>
      ))}
    </div>
  );
}

function NotebookSample() {
  const tree = [
    ['Research', ['Sources', 'Interview notes']],
    ['Study', ['Lecture 1', 'Lecture 2', 'Exam review']],
  ];
  return (
    <div className="start-sample">
      {tree.map(([folder, pages]) => (
        <div key={folder}>
          <div className="start-sample-row sample-folder">
            <Folder size={14} strokeWidth={1.7} />
            {folder}
          </div>
          {pages.map((t) => (
            <div key={t} className="start-sample-row sample-page">
              <FileText size={14} strokeWidth={1.6} />
              {t}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StructureModal({ modal }) {
  const adding = modal.mode === 'add';
  const kinds = !adding && modal.kinds;
  const [id, setId] = useState(adding ? STRUCTURES[0].id : 'blank');
  const [mirror, setMirror] = useState(true);
  const [chapters, setChapters] = useState(false);
  const structure = STRUCTURES.find((s) => s.id === id) || null;
  const notebook = NOTEBOOKS.find((n) => n.id === id) || null;
  const beats = structure ? structure.folders.reduce((n, f) => n + f.beats.length, 0) : 0;
  const options = [
    ...(adding ? [] : [{ id: 'blank', name: 'Blank', summary: 'An empty outline and one chapter. Add folders and structures whenever you like.' }]),
    ...STRUCTURES,
  ];
  const finish = (pick) =>
    closeModal(NOTEBOOKS.some((n) => n.id === pick) ? { kind: pick } : { kind: 'book', structure: STRUCTURES.find((s) => s.id === pick) || null, mirror, chapters });
  const option = (o, Icon) => (
    <button key={o.id} className={`start-option ${id === o.id ? 'on' : ''}`} onClick={() => setId(o.id)} onDoubleClick={() => finish(o.id)}>
      <Icon size={16} strokeWidth={1.6} />
      <span>{o.name}</span>
    </button>
  );
  return (
    <Modal
      title={adding ? 'Add a structure' : kinds ? 'Start something new' : 'Start your book'}
      width={760}
      footer={
        <>
          <span className="foot-note">
            {notebook
              ? 'Saved as a .quill file, like a book.'
              : structure
                ? `${structure.folders.length} folders · ${beats} beats, each with notes to write over`
                : 'You can add a structure to the Outline later.'}
          </span>
          <button className="btn" onClick={() => closeModal(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => finish(id)}>
            {adding ? 'Add to outline' : 'Continue…'}
          </button>
        </>
      }
    >
      <div className="start-grid">
        <div className="start-options">
          {kinds && <div className="start-heading">Book</div>}
          {options.map((o) => option(o, o.id === 'blank' ? FilePlus : LayoutTemplate))}
          {kinds && (
            <>
              <div className="start-heading">Notebook</div>
              {NOTEBOOKS.map((o) => option(o, o.icon))}
            </>
          )}
        </div>
        <div className="start-preview">
          <p className="start-summary">{(notebook || options.find((o) => o.id === id))?.summary}</p>
          {notebook ? (
            <>
              {notebook.id === 'journal' ? <JournalSample /> : <NotebookSample />}
              <p className="start-blank">{notebook.more}</p>
            </>
          ) : structure ? (
            <>
              <div className="start-folders">
                {structure.folders.map((f) => (
                  <div key={f.title} className="start-folder">
                    <div className="start-folder-title">
                      <Folder size={14} strokeWidth={1.7} />
                      {f.title}
                    </div>
                    <ol>
                      {f.beats.map((b) => (
                        <li key={b.title}>{b.title}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
              <Row label="Show the folders in the manuscript" hint="Your chapters get matching folders to live in. Change this per folder any time.">
                <Toggle checked={mirror} onChange={setMirror} />
              </Row>
              <Row label="Start a chapter for each beat" hint="Empty chapters named after the beats, each linked to its outline page.">
                <Toggle checked={chapters} onChange={setChapters} />
              </Row>
            </>
          ) : (
            <p className="start-blank">Folders, story structures and links between the outline and your chapters are all there when you want them.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- adding a book to a series ----------

const plural = (n, one, many = `${one}s`) => `${(n || 0).toLocaleString('en-US')} ${n === 1 ? one : many}`;

function SegChoice({ value, options, onChange }) {
  return <Segmented value={value} onChange={onChange} options={options.map(([v, label]) => ({ value: v, label }))} />;
}

function AddToSeriesModal({ modal }) {
  const library = useStore((s) => s.library);
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('where');
  const [pick, setPick] = useState(null); // series path
  const [fresh, setFresh] = useState(null); // { path, series } for a new series
  const [position, setPosition] = useState('after');
  const [series, setSeries] = useState(null);
  const [choices, setChoices] = useState({});
  const [busy, setBusy] = useState(false);
  const known = library?.series || [];

  useEffect(() => {
    readBookForMerge(modal.bookPath).then(setBook, (e) => setError(String(e.message || e)));
  }, [modal.bookPath]);
  useEffect(() => {
    if (!pick && !fresh && known.length) setPick(known[0].path);
  }, [known.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = fresh && pick === fresh.path ? null : known.find((k) => k.path === pick);
  const target = fresh && pick === fresh.path ? fresh.series : null;

  const startNew = async () => {
    const made = await chooseNewSeriesFor(book, modal.bookPath);
    if (!made) return;
    setFresh(made);
    setPick(made.path);
    setPosition('after');
  };

  const next = async () => {
    setBusy(true);
    try {
      setSeries(target || (await readSeriesForMerge(pick)));
      setChoices({});
      setStep('review');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    const ok = await confirmAddToSeries({ book, bookPath: modal.bookPath, series, seriesPath: pick, position: target ? 'after' : position, choices });
    setBusy(false);
    if (ok) closeModal(true);
  };

  const title = step === 'review' ? 'Combine story bibles' : `Add “${book?.title || '…'}” to a series`;
  const plan = series && book ? planMerge(book, series) : null;
  const lastLabel = chosen ? bookLabels(chosen.books.map((b) => ({ uuid: b.uuid, kind: b.kind })))[chosen.books[chosen.books.length - 1]?.uuid]?.long : null;
  const nextNumber = chosen ? numberedCount(chosen.books.map((b) => ({ kind: b.kind }))) + 1 : 1;

  return (
    <Modal
      title={title}
      width={620}
      footer={
        step === 'where' ? (
          <>
            <span className="foot-note">Step 1 of 2</span>
            <button className="btn" onClick={() => closeModal(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!book || !pick || busy} onClick={next}>
              Next: combine story bibles
            </button>
          </>
        ) : (
          <>
            <span className="foot-note">Step 2 of 2</span>
            <button className="btn" onClick={() => setStep('where')}>
              Back
            </button>
            <button className="btn primary" disabled={busy} onClick={finish}>
              {busy ? 'Saving…' : `Add to ${series?.title}`}
            </button>
          </>
        )
      }
    >
      {error && <p className="ats-error">{error}</p>}
      {step === 'where' ? (
        <div className="ats">
          <p className="ats-sub">Its chapters stay in their own file. The series links the books and keeps one story bible for all of them.</p>
          <div className="field-label">Series</div>
          <div className="ats-options">
            {known.map((k) => (
              <button key={k.path} className={`ats-option ${pick === k.path ? 'on' : ''}`} onClick={() => setPick(k.path)}>
                <Layers size={18} strokeWidth={1.6} />
                <span className="ats-option-text">
                  <span>{k.title}</span>
                  <span className="muted">
                    {plural(k.books.length, 'book')} · {plural(k.characters, 'character')} · {plural(k.places, 'place')}
                  </span>
                </span>
                {pick === k.path && <Check size={16} strokeWidth={2} />}
              </button>
            ))}
            {fresh && (
              <button className={`ats-option ${pick === fresh.path ? 'on' : ''}`} onClick={() => setPick(fresh.path)}>
                <Layers size={18} strokeWidth={1.6} />
                <span className="ats-option-text">
                  <span>{fresh.series.title}</span>
                  <span className="muted">New series. This book becomes Book 1.</span>
                </span>
                {pick === fresh.path && <Check size={16} strokeWidth={2} />}
              </button>
            )}
            {!known.length && !fresh && <p className="muted ats-none">No series yet.</p>}
          </div>
          <button className="text-link ats-new" onClick={startNew} disabled={!book}>
            {known.length || fresh ? 'Or start a new series with this book' : 'Start a new series with this book'}
          </button>

          {chosen && (
            <>
              <div className="field-label">Where it goes</div>
              <div className="ats-options">
                {[
                  ['prequel', 'At the start', 'A prequel. The other books keep their numbers.'],
                  ['after', 'At the end', chosen.books.length ? `After ${lastLabel}. Becomes Book ${nextNumber}.` : 'Becomes Book 1.'],
                  ['companion', 'Alongside', 'A companion book, unnumbered.'],
                ].map(([id, label, sub]) => (
                  <button key={id} className={`ats-option radio ${position === id ? 'on' : ''}`} onClick={() => setPosition(id)}>
                    <span className="ats-radio" />
                    <span className="ats-option-text">
                      <span>{label}</span>
                      <span className="muted">{sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="ats">
          <p className="ats-sub">
            {!book.bible.entries.length
              ? `${book.title} has no story bible entries yet, so there’s nothing to combine.`
              : `${book.title} has ${plural(book.bible.entries.length, 'entry', 'entries')}. ${
                  plan.matches.length
                    ? `${plan.matches.length} ${plan.matches.length === 1 ? 'looks' : 'look'} like ${plan.matches.length === 1 ? 'one' : 'ones'} the series already has.`
                    : 'None match the series, so they’ll come in as new.'
                }`}
          </p>
          {plan.matches.length > 0 && (
            <>
              <div className="field-label">{plan.matches.length === 1 ? 'Looks like the same entry' : 'Looks like the same entries'}</div>
              {plan.matches.map(({ entry, match }) => (
                <div key={entry.id} className="ats-row">
                  <div className="ats-pair">
                    <span className="ats-who">
                      <span>{entry.name}</span>
                      <span className="muted">{entry.role || (entry.type === 'place' ? 'Place' : 'Character')}</span>
                    </span>
                    <ArrowRight size={15} strokeWidth={1.7} className="muted-icon" />
                    <span className="ats-who">
                      <span>{match.name}</span>
                      <span className="muted">{match.role ? `${match.role} · in the series` : 'In the series'}</span>
                    </span>
                  </div>
                  <SegChoice
                    value={choices[entry.id] || 'merge'}
                    onChange={(v) => setChoices({ ...choices, [entry.id]: v })}
                    options={[
                      ['merge', 'Merge'],
                      ['separate', 'Keep separate'],
                    ]}
                  />
                  <span className="ats-reason">{matchReason(entry, match)}</span>
                </div>
              ))}
            </>
          )}
          {plan.fresh.length > 0 && (
            <>
              <div className="field-label">New to the series</div>
              {plan.fresh.map(({ entry }) => (
                <div key={entry.id} className="ats-row">
                  <span className="ats-who grow">
                    <span>{entry.name || 'Untitled'}</span>
                    <span className="muted">
                      {entry.type === 'place' ? 'Place' : 'Character'}
                      {entry.role ? ` · ${entry.role}` : ''}
                    </span>
                  </span>
                  <SegChoice
                    value={choices[entry.id] || 'share'}
                    onChange={(v) => setChoices({ ...choices, [entry.id]: v })}
                    options={[
                      ['share', 'Share with series'],
                      ['keep', 'Only this book'],
                    ]}
                  />
                </div>
              ))}
            </>
          )}
          <p className="ats-foot">
            Nothing is deleted. A merged entry keeps both sets of notes: this book’s version becomes its own tab on the entry, and its names become aliases. Both
            files are backed up first, and you can take the book back out of the series later.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function Modals() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  if (modal.type === 'prompt') return <PromptModal modal={modal} />;
  if (modal.type === 'settings') return <SettingsModal modal={modal} />;
  if (modal.type === 'export') return <ExportModal />;
  if (modal.type === 'addToSeries') return <AddToSeriesModal modal={modal} />;
  if (modal.type === 'structure') return <StructureModal modal={modal} />;
  return null;
}
