import { useStore, setMatter, setProjectMeta, otherBooksInSeries } from '../store.js';
import { matterOf, copyrightLines, copyrightAsText, alsoByTitle, alsoByGroups } from '../lib/matter.js';
import MarkdownEditor from './MarkdownEditor.jsx';
import { Toggle } from './ui.jsx';

function Card({ title, sub, state, children, control }) {
  return (
    <section className="mt-card">
      <div className="mt-head">
        <div>
          <div className="mt-title">{title}</div>
          <div className="mt-sub">{sub}</div>
        </div>
        {control || <span className={`mt-state ${state ? 'on' : ''}`}>{state ? 'In the book' : 'Left out while empty'}</span>}
      </div>
      {children}
    </section>
  );
}

function Writing({ id, value, placeholder }) {
  const prefs = useStore((s) => s.prefs);
  return (
    <div className="mt-editor">
      <MarkdownEditor
        key={`${id}:${prefs.smartTypography}:${prefs.spellcheck}`}
        value={value}
        onChange={(md) => setMatter(id, { text: md })}
        placeholder={placeholder}
        typography={prefs.smartTypography}
        symbolHints={prefs.symbolHints}
        spellcheck={prefs.spellcheck}
        className="notes-editor"
      />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, span = '' }) {
  return (
    <label className={`mt-field ${span}`}>
      <span>{label}</span>
      <input className="text-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Copyright({ project, c }) {
  const set = (patch) => setMatter('copyright', patch);
  return (
    <Card
      title="Copyright page"
      sub="On the back of the title page"
      control={<Toggle checked={c.on} onChange={(on) => set({ on })} />}
    >
      {c.on &&
        (c.custom ? (
          <>
            <textarea className="text-input area mt-custom" rows={8} value={c.text} onChange={(e) => set({ text: e.target.value })} />
            <div className="mt-row">
              <span className="mt-hint">A blank line starts a new paragraph. Each line prints as you see it.</span>
              <button className="text-link" onClick={() => set({ custom: false })}>
                Use the standard page
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-fields">
              <Field label="Year" value={c.year} placeholder={String(new Date().getFullYear())} onChange={(year) => set({ year })} />
              <Field label="Copyright holder" value={c.holder} placeholder={project.meta.author || 'Your name'} onChange={(holder) => set({ holder })} span="wide" />
              <Field label="ISBN" value={c.isbn} placeholder="Optional" onChange={(isbn) => set({ isbn })} span="half" />
              <Field label="Edition" value={c.edition} placeholder="First edition" onChange={(edition) => set({ edition })} span="half" />
              <Field label="Published by" value={c.publisher} placeholder="Optional, your imprint" onChange={(publisher) => set({ publisher })} span="full" />
            </div>
            <label className="mt-check">
              <Toggle checked={c.fiction} onChange={(fiction) => set({ fiction })} />
              Work of fiction notice
            </label>
            <div className="mt-preview copyright">
              {copyrightLines(project).map((lines, i) => (
                <p key={i}>
                  {lines.map((l, j) => (
                    <span key={j}>
                      {l}
                      <br />
                    </span>
                  ))}
                </p>
              ))}
            </div>
            <div className="mt-row">
              <span className="mt-hint">Not legal advice. Change anything you like.</span>
              <button className="text-link" onClick={() => set({ custom: true, text: c.text.trim() ? c.text : copyrightAsText(project) })}>
                Write my own
              </button>
            </div>
          </>
        ))}
    </Card>
  );
}

function AlsoBy({ project, a }) {
  useStore((s) => s.series);
  const series = otherBooksInSeries();
  const groups = alsoByGroups(project, series);
  return (
    <Card
      title={alsoByTitle(project)}
      sub="Your other books, on the last page"
      control={<Toggle checked={a.on} onChange={(on) => setMatter('alsoBy', { on })} />}
    >
      {a.on && (
        <>
          {series?.books.length > 0 && (
            <p className="mt-hint">
              The rest of {series.title} is listed for you, in series order: {series.books.join(', ')}.
            </p>
          )}
          <textarea
            className="text-input area"
            rows={3}
            placeholder={'Other books, one title per line'}
            value={a.extra}
            onChange={(e) => setMatter('alsoBy', { extra: e.target.value })}
          />
          {!groups.length && <p className="mt-hint">Nothing to list yet, so this page is left out.</p>}
        </>
      )}
    </Card>
  );
}

// Front and back matter: the pages around the chapters in a finished book.
export default function MatterView() {
  const project = useStore((s) => s.project);
  const m = matterOf(project);
  return (
    <div className="page-scroll">
      <article className="page mt">
        <h1 className="page-title static">Front &amp; back matter</h1>
        <p className="mt-intro">
          The pages around your chapters in the Book PDF, EPUB, HTML and Markdown exports. A page with nothing on it is left out. The submission manuscript never
          includes them, and they don’t count toward your word count.
        </p>

        <label className="mt-author">
          <span>Author</span>
          <input
            className="text-input"
            placeholder="Your name or pen name"
            value={project.meta.author}
            onChange={(e) => setProjectMeta({ author: e.target.value })}
          />
        </label>

        <div className="mt-label">Before chapter one</div>
        <Copyright project={project} c={m.copyright} />
        <Card title="Dedication" sub="Its own page, centered" state={!!m.dedication.text.trim()}>
          <Writing id="dedication" value={m.dedication.text} placeholder="For…" />
        </Card>
        <Card title="Epigraph" sub="A quotation to open the book" state={!!m.epigraph.text.trim()}>
          <Writing id="epigraph" value={m.epigraph.text} placeholder="The quotation" />
          <input
            className="text-input mt-source"
            placeholder="Who said it, and where (optional)"
            value={m.epigraph.source}
            onChange={(e) => setMatter('epigraph', { source: e.target.value })}
          />
        </Card>

        <div className="mt-label">After the last chapter</div>
        <Card title="Acknowledgments" sub="With its own heading, like a chapter" state={!!m.acknowledgments.text.trim()}>
          <Writing id="acknowledgments" value={m.acknowledgments.text} placeholder="The people who helped…" />
        </Card>
        <Card title="About the author" sub="A short bio, in the third person if you like" state={!!m.about.text.trim()}>
          <Writing id="about" value={m.about.text} placeholder={`${project.meta.author || 'The author'} lives in…`} />
        </Card>
        <AlsoBy project={project} a={m.alsoBy} />
      </article>
    </div>
  );
}
