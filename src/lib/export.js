import { marked } from 'marked';
import { activeDraft, manuscriptWords, chaptersOf } from './project.js';
import { matterItems } from './matter.js';
import { chapterTitle, bookItems, roundedWords } from './book.js';
import courierRegular from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?inline';
import courierItalic from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?inline';
import courierBold from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?inline';
import courierBoldItalic from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?inline';

const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const cssString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

// Exported pages never run scripts (imported Markdown can contain raw HTML).
const NO_SCRIPTS = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`;

// ---------- front and back matter (see lib/matter.js) ----------

// opts.matter says whether to include them; opts.series is the rest of the series, for "Also by".
const matterFor = (p, opts) => (opts?.matter ? matterItems(p, opts.series) : { front: [], back: [] });

// The inside of a front or back matter page. `md` turns Markdown into markup; `esc` escapes text.
function matterBody(it, { md, esc, br = '<br>' }) {
  if (it.type === 'copyright') return it.lines.map((l) => `<p>${l.map(esc).join(br)}</p>`).join('');
  if (it.type === 'epigraph') return `<blockquote>${md(it.md)}</blockquote>${it.source ? `<p class="source">— ${esc(it.source)}</p>` : ''}`;
  if (it.type === 'alsoBy') {
    return it.groups.map((g) => `${g.heading ? `<p class="also-group">${esc(g.heading)}</p>` : ''}${g.titles.map((t) => `<p class="also-title">${esc(t)}</p>`).join('')}`).join('');
  }
  return md(it.md);
}

const titled = (it) => it.type === 'section' || it.type === 'alsoBy';

function matterMarkdown(it, heading) {
  if (it.type === 'copyright') return it.lines.map((l) => l.join('  \n')).join('\n\n');
  if (it.type === 'epigraph') return `${it.md.trim().split('\n').map((l) => `> ${l}`).join('\n')}${it.source ? `\n\n— ${it.source}` : ''}`;
  if (it.type === 'alsoBy') return `${heading(it.title)}\n\n${it.groups.map((g) => [g.heading && `**${g.heading}**`, ...g.titles.map((t) => `*${t}*`)].filter(Boolean).join('  \n')).join('\n\n')}`;
  if (it.type === 'section') return `${heading(it.title)}\n\n${it.md.trim()}`;
  return it.md.trim();
}

// ---------- Markdown ----------

export function exportMarkdown(p, opts) {
  const { titles, titlePage } = opts;
  const parts = [];
  const base = titlePage ? 2 : 1;
  const heading = (depth, text) => `${'#'.repeat(Math.min(6, base + depth))} ${text}`;
  const { front, back } = matterFor(p, opts);
  if (titlePage) parts.push(`# ${p.title}`);
  for (const it of front) parts.push(matterMarkdown(it, (t) => heading(0, t)));
  for (const it of bookItems(p)) {
    if (it.type === 'part') parts.push(heading(it.depth, it.title));
    else {
      const body = it.chapter.content.trim();
      parts.push(titles ? `${heading(it.depth, it.title)}\n\n${body}` : body);
    }
  }
  for (const it of back) parts.push(matterMarkdown(it, (t) => heading(0, t)));
  return parts.filter(Boolean).join('\n\n') + '\n';
}

export function exportChapterFiles(p, { titles }) {
  return chaptersOf(activeDraft(p)).map((c, i) => ({
    name: `${pad(i + 1)} ${chapterTitle(c, i)}.md`,
    content: (titles ? `# ${chapterTitle(c, i)}\n\n` : '') + c.content.trim() + '\n',
  }));
}

// ---------- book-style HTML ----------

export function exportHtml(p, opts) {
  const { titles, titlePage } = opts;
  const { front, back } = matterFor(p, opts);
  const matter = (it) =>
    `<section class="${titled(it) ? 'chapter' : 'matter'} ${it.id}">${titled(it) ? `<h1 class="chapter-title">${escapeHtml(it.title)}</h1>` : ''}${matterBody(it, { md: (m) => marked.parse(m), esc: escapeHtml })}</section>`;
  const chapters = bookItems(p)
    .map((it) => {
      if (it.type === 'part') {
        return `<section class="part"><p class="part-label">${escapeHtml(it.label)}</p>${it.subtitle ? `<h1 class="part-title">${escapeHtml(it.subtitle)}</h1>` : ''}</section>`;
      }
      const heading = titles ? `<h1 class="chapter-title">${escapeHtml(it.title)}</h1>` : '';
      return `<section class="chapter">${heading}${marked.parse(it.chapter.content || '')}</section>`;
    })
    .join('\n');
  const cover = titlePage
    ? `<section class="title-page"><h1>${escapeHtml(p.title)}</h1>${p.meta?.author ? `<p class="by">${escapeHtml(p.meta.author)}</p>` : ''}</section>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">${NO_SCRIPTS}<title>${escapeHtml(p.title)}</title>
<style>
  body { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: 12pt; line-height: 1.6; color: #111; max-width: 34em; margin: 3em auto; padding: 0 1.5em; }
  .title-page { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; break-after: page; }
  .title-page h1 { font-size: 2.4em; font-weight: 600; text-align: center; letter-spacing: -0.01em; margin: 0; }
  .title-page .by { text-indent: 0; margin-top: 1em; font-style: italic; }
  .chapter { break-before: page; page-break-before: always; }
  .chapter:first-of-type { break-before: auto; page-break-before: auto; }
  .chapter-title { font-size: 1.6em; font-weight: 600; margin: 3em 0 1.5em; text-align: center; }
  .part { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; break-before: page; page-break-before: always; break-after: page; page-break-after: always; }
  .part .part-label { text-indent: 0; text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.95em; }
  .part-title { font-size: 2em; font-weight: 600; text-align: center; margin: 0.6em 0 0; }
  p { margin: 0; text-indent: 1.5em; }
  h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, .chapter > p:first-child { text-indent: 0; }
  hr { border: 0; text-align: center; margin: 1.6em 0; }
  hr::after { content: '*   *   *'; white-space: pre; letter-spacing: 0.2em; color: #555; }
  blockquote { margin: 1em 2em; font-style: italic; }
  .matter { break-before: page; page-break-before: always; margin: 4em 0; }
  .matter p, .also-by p { text-indent: 0; }
  .copyright { font-size: 0.85em; line-height: 1.5; }
  .copyright p { margin-bottom: 1em; }
  .dedication, .epigraph { text-align: center; font-style: italic; }
  .epigraph blockquote { margin: 0 2em; }
  .epigraph .source { font-style: normal; margin-top: 0.8em; }
  .also-by { text-align: center; }
  .also-group { margin-top: 1.4em; font-variant: small-caps; letter-spacing: 0.04em; }
  .also-title { font-style: italic; }
  @media print { body { margin: 0; max-width: none; padding: 0; } }
</style></head>
<body>
${cover}
${front.map(matter).join('\n')}
${chapters}
${back.map(matter).join('\n')}
</body></html>`;
}

// ---------- print-ready book (PDF) ----------
// A trade paperback interior at one of the usual trim sizes: mirrored margins with the wider one
// at the spine, justified and hyphenated text, chapters sunk a third of the way down a new page,
// folios at the foot and running heads (the book's title on versos, the chapter's on rectos).
// The title page and part pages are rectos with a blank verso behind them; none of those, nor
// a chapter's opening page, carries a folio or running head.
//
// Chromium's @page rules can't pick out the first page of a chapter, so the book prints twice.
// The measuring print gives every other item (title page, part, chapter) pages 8px wider, and
// the page widths it comes back with say how many pages each item takes. The real print then
// knows what is on every page and takes its folios and heads from page-keyed counter styles.

// Sizes in inches, type in points. The text block is a whole number of lines deep.
export const TRIMS = {
  '5x8': { label: '5 × 8', w: 5, h: 8, pt: 10, lead: 14, lines: 34, top: 0.65, inside: 0.75, outside: 0.5 },
  '5.5x8.5': { label: '5.5 × 8.5', w: 5.5, h: 8.5, pt: 10.5, lead: 14.5, lines: 35, top: 0.7, inside: 0.8, outside: 0.55 },
  '6x9': { label: '6 × 9', w: 6, h: 9, pt: 11, lead: 15.5, lines: 34, top: 0.75, inside: 0.875, outside: 0.625 },
};
export const DEFAULT_TRIM = '6x9';

const MEASURE_STEP = 8; // px: a whole number of 1/300 in, which is how finely Chromium sizes pages

// How many pages each item took in the measuring print, or null if the widths don't add up.
function pageCounts(widths, trim, n) {
  if (!Array.isArray(widths)) return null;
  const counts = [];
  let last = null;
  for (const w of widths) {
    const wide = w > trim.w * 72 + (MEASURE_STEP * 0.75) / 2;
    if (wide === last) counts[counts.length - 1]++;
    else counts.push(1);
    last = wide;
  }
  return counts.length === n && widths[0] < trim.w * 72 + 1 ? counts : null;
}

// Pages that stand alone and start on a recto: the title page, part pages, dedication and epigraph.
const DISPLAY = new Set(['title', 'part', 'dedication', 'epigraph']);

// What goes on each page of the book: blank versos where a recto has to come next, and for each
// page whether it shows a folio and which running head. The copyright page goes on the verso
// behind the title page; whatever follows a display page or the copyright page starts on a recto.
function pagePlan(items, counts, bookTitle) {
  const pages = [];
  const blanks = [];
  const display = (it) => DISPLAY.has(it?.type);
  items.forEach((it, i) => {
    const onVerso = pages.length % 2 === 1;
    const prev = items[i - 1];
    blanks[i] = it.type === 'copyright' ? pages.length > 0 && !onVerso : (display(it) || display(prev) || prev?.type === 'copyright') && onVerso;
    if (blanks[i]) pages.push({ folio: false, head: '' });
    for (let j = 0; j < counts[i]; j++) {
      const verso = pages.length % 2 === 1;
      const plain = display(it) || it.type === 'copyright' || j === 0;
      pages.push({ folio: !plain, head: plain ? '' : verso ? bookTitle : it.head });
    }
  });
  return { pages, blanks };
}

// Without `pageWidths` this is the measuring print; with the page widths (in points) that
// print came back with, it's the book.
export function exportBookHtml(p, opts, pageWidths) {
  const { titles, titlePage } = opts;
  const trim = TRIMS[p.meta?.trim] || TRIMS[DEFAULT_TRIM];
  const lang = (p.meta?.language || navigator.language || 'en').trim();
  const author = (p.meta?.author || '').trim();
  const { front, back } = matterFor(p, opts);
  const items = [
    ...(titlePage ? [{ type: 'title' }] : []),
    ...front,
    ...bookItems(p).map((it) => (it.type === 'chapter' ? { ...it, head: titles ? it.title : p.title } : it)),
    ...back.map((it) => ({ ...it, head: it.title })),
  ];
  const measuring = pageWidths === undefined;
  const counts = measuring ? null : pageCounts(pageWidths, trim, items.length);
  const plan = counts && pagePlan(items, counts, p.title);

  const sections = items
    .map((it, i) => {
      const cls = measuring && i % 2 ? ' wide' : '';
      const blank = plan?.blanks[i] ? '<div class="blank"></div>\n' : '';
      if (it.type === 'title') {
        return `${blank}<section class="title-page${cls}"><h1>${escapeHtml(p.title)}</h1>${author ? `<p class="by">${escapeHtml(author)}</p>` : ''}</section>`;
      }
      if (it.type === 'part') {
        return `${blank}<section class="part${cls}"><p class="part-label">${escapeHtml(it.label)}</p>${it.subtitle ? `<h1 class="part-title">${escapeHtml(it.subtitle)}</h1>` : ''}</section>`;
      }
      if (it.type !== 'chapter') {
        const body = matterBody(it, { md: (m) => marked.parse(m), esc: escapeHtml });
        if (titled(it)) return `${blank}<section class="chapter ${it.id}${cls}"><h1 class="chapter-title">${escapeHtml(it.title)}</h1>${body}</section>`;
        return `${blank}<section class="${it.id}${cls}">${body}</section>`;
      }
      const heading = titles ? `<h1 class="chapter-title">${escapeHtml(it.title)}</h1>` : '';
      return `${blank}<section class="chapter${cls}">${heading}${marked.parse(it.chapter.content || '')}</section>`;
    })
    .join('\n');

  const inch = (n) => `${+n.toFixed(4)}in`;
  const bottom = trim.h - trim.top - (trim.lines * trim.lead) / 72;
  const margin = (left, right) => `margin: ${inch(trim.top)} ${right} ${inch(bottom)} ${left};`;
  const sink = inch(trim.h / 3 - trim.top);
  const furniture = `font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; color: #000;`;
  const pageKeyed = (name, f) => `@counter-style ${name} { system: fixed; symbols: ${plan.pages.map((pg, i) => cssString(f(pg, i + 1))).join(' ')}; }`;

  let pageCss;
  if (measuring) {
    pageCss = `@page { size: ${inch(trim.w)} ${inch(trim.h)}; ${margin(inch(trim.inside), inch(trim.outside))} }
  @page wide { size: calc(${inch(trim.w)} + ${MEASURE_STEP}px) ${inch(trim.h)}; margin-right: calc(${inch(trim.outside)} + ${MEASURE_STEP}px); }
  .wide { page: wide; }`;
  } else {
    // Without a page plan (the measuring print didn't add up) every page but the first gets a folio.
    const head = `@top-center { content: counter(page, head); ${furniture} font-size: ${trim.pt * 0.75}pt; letter-spacing: 0.16em; text-transform: uppercase; vertical-align: bottom; padding-bottom: 0.24in; }`;
    const folio = `@bottom-center { content: ${plan ? 'counter(page, folio)' : 'counter(page)'}; ${furniture} font-size: ${trim.pt * 0.85}pt; vertical-align: top; padding-top: 0.26in; }`;
    pageCss = `${plan ? pageKeyed('folio', (pg, n) => (pg.folio ? String(n) : '')) : ''}
  ${plan ? pageKeyed('head', (pg) => pg.head) : ''}
  @page { size: ${inch(trim.w)} ${inch(trim.h)}; ${folio} ${plan ? head : ''} }
  @page :right { ${margin(inch(trim.inside), inch(trim.outside))} }
  @page :left { ${margin(inch(trim.outside), inch(trim.inside))} }
  @page :first { @bottom-center { content: none; } }`;
  }

  return `<!doctype html>
<html lang="${escapeHtml(lang)}"><head><meta charset="utf-8">${NO_SCRIPTS}<title>${escapeHtml(p.title)}</title>
<style>
  ${pageCss}
  html { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-size: ${trim.pt}pt; line-height: ${trim.lead}pt; color: #000; }
  body { margin: 0; }
  p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; hyphenate-limit-chars: 6 3 3; orphans: 2; widows: 2; }
  h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, ul + p, ol + p, .chapter > p:first-child { text-indent: 0; }
  h1, h2, h3, h4 { font-weight: 600; text-align: center; hyphens: manual; break-after: avoid; }
  h2, h3, h4 { font-size: 1em; margin: 1.4em 0 0.7em; }
  em, i { font-style: italic; }
  a { color: inherit; text-decoration: none; }
  code { font-family: inherit; }
  img { max-width: 100%; }
  hr { border: 0; margin: ${trim.lead / 2}pt 0; color: inherit; text-align: center; break-after: avoid; }
  hr::after { content: '*   *   *'; white-space: pre; }
  blockquote { margin: ${trim.lead / 2}pt 1.5em; font-style: italic; }
  ul, ol { margin: ${trim.lead / 2}pt 0; padding-left: 1.5em; }

  .title-page { padding-top: ${inch(trim.h * 0.3 - trim.top)}; text-align: center; }
  .title-page h1 { font-size: 2.4em; line-height: 1.15; letter-spacing: -0.01em; margin: 0; }
  .title-page .by { margin-top: 1.4em; text-indent: 0; text-align: center; font-style: italic; }
  .part { break-before: page; padding-top: ${sink}; text-align: center; }
  .part .part-label { text-indent: 0; text-align: center; text-transform: uppercase; letter-spacing: 0.2em; }
  .part-title { font-size: 2em; line-height: 1.2; margin: 0.6em 0 0; }
  .chapter { break-before: page; padding-top: ${sink}; }
  .chapter-title { font-size: 1.6em; line-height: 1.25; margin: 0 0 2em; }
  .blank { break-before: page; height: 1px; }
  .copyright { break-before: page; height: ${(trim.lines - 2) * trim.lead}pt; display: flex; flex-direction: column; justify-content: flex-end; font-size: 0.8em; line-height: 1.4; }
  .copyright p { text-indent: 0; text-align: left; hyphens: manual; margin: 0 0 0.9em; }
  .dedication, .epigraph { break-before: page; padding-top: ${inch(trim.h * 0.3 - trim.top)}; text-align: center; }
  .dedication p, .epigraph p { text-indent: 0; text-align: center; hyphens: manual; }
  .dedication { font-style: italic; }
  .epigraph blockquote { margin: 0 1em; }
  .epigraph .source { margin-top: 0.9em; font-style: normal; }
  .also-by p { text-indent: 0; text-align: center; }
  .also-group { margin-top: ${trim.lead}pt; font-variant: small-caps; letter-spacing: 0.05em; }
  .also-title { font-style: italic; }
</style></head>
<body>
${sections}
</body></html>`;
}

// ---------- standard manuscript format (PDF) ----------
// Letter paper, 1" margins, 12pt Courier, double-spaced, ½" paragraph indents, ragged right.
// Title page: contact block top left, word count top right, title and byline centered.
// Every later page: "Surname / TITLE / n" top right; chapters start a third of the way down.

export function exportManuscriptHtml(p, { underlineItalics }) {
  const author = (p.meta?.author || '').trim();
  const contact = (p.meta?.contact || '').trim();
  const surname = author.split(/\s+/).filter(Boolean).pop() || '';
  const keyword = p.title.toUpperCase().slice(0, 40);
  const header = `${surname ? `${surname} / ` : ''}${keyword} / `;
  const words = roundedWords(manuscriptWords(p));

  const chapters = bookItems(p)
    .map((it) => {
      if (it.type === 'part') {
        return `<section class="part-page"><p>${escapeHtml(it.label.toUpperCase())}</p>${it.subtitle ? `<p>${escapeHtml(it.subtitle)}</p>` : ''}</section>`;
      }
      const body = marked.parse(it.chapter.content || '').replace(/<hr\s*\/?>/g, '<p class="scene-break">#</p>');
      return `<section class="chapter"><h1 class="chapter-title">${escapeHtml(it.title)}</h1>${body}</section>`;
    })
    .join('\n');

  const face = (src, weight, style) =>
    `@font-face { font-family: 'Manuscript Courier'; src: url(${src}) format('woff2'); font-weight: ${weight}; font-style: ${style}; }`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">${NO_SCRIPTS}<title>${escapeHtml(p.title)}</title>
<style>
  ${face(courierRegular, 400, 'normal')}
  ${face(courierItalic, 400, 'italic')}
  ${face(courierBold, 700, 'normal')}
  ${face(courierBoldItalic, 700, 'italic')}
  @page {
    size: 8.5in 11in;
    margin: 1in;
    @top-right {
      content: ${cssString(header)} counter(page);
      font-family: 'Manuscript Courier', 'Courier New', Courier, monospace;
      font-size: 12pt;
      vertical-align: middle;
    }
  }
  @page :first {
    counter-increment: page 0;
    @top-right { content: none; }
  }
  html { font-family: 'Manuscript Courier', 'Courier New', Courier, monospace; font-size: 12pt; line-height: 2; color: #000; }
  body { margin: 0; }
  p { margin: 0; text-indent: 0.5in; text-align: left; hyphens: none; orphans: 2; widows: 2; }
  em, i { font-style: ${underlineItalics ? 'normal' : 'italic'}; ${underlineItalics ? 'text-decoration: underline;' : ''} }
  strong, b { font-weight: 700; }
  h1, h2, h3, h4 { font-size: 12pt; font-weight: 400; text-align: center; margin: 0; }
  blockquote { margin: 0 0 0 0.5in; }
  ul, ol { margin: 0; padding-left: 0.5in; }
  a { color: inherit; text-decoration: none; }
  code { font-family: inherit; }

  .title-page { position: relative; height: 8.9in; line-height: 1.2; }
  .contact { position: absolute; top: 0; left: 0; white-space: pre-line; }
  .count { position: absolute; top: 0; right: 0; }
  .title-block { position: absolute; top: 3.6in; left: 0; right: 0; text-align: center; line-height: 2; }
  .title-block p { text-indent: 0; text-align: center; }

  .chapter { break-before: page; padding-top: 2.25in; }
  .part-page { break-before: page; padding-top: 3.6in; }
  .part-page p { text-indent: 0; text-align: center; }
  .chapter-title { margin-bottom: 24pt; }
  .scene-break { text-indent: 0; text-align: center; }
  .end { text-indent: 0; text-align: center; margin-top: 24pt; }
</style></head>
<body>
<section class="title-page">
  <div class="contact">${escapeHtml([author, contact].filter(Boolean).join('\n'))}</div>
  <div class="count">about ${words.toLocaleString('en-US')} words</div>
  <div class="title-block">
    <p>${escapeHtml(p.title)}</p>
    ${author ? `<p>by ${escapeHtml(author)}</p>` : ''}
  </div>
</section>
${chapters}
<p class="end">END</p>
</body></html>`;
}

// ---------- EPUB 3 ----------

const xml = (s) => escapeHtml(s).replace(/'/g, '&#39;');

// Markdown → XHTML fragment. Scene breaks become a centered "* * *"; anything the reader
// can't use (scripts, local images, forms) is dropped.
function toXhtml(md) {
  const tpl = document.createElement('template');
  tpl.innerHTML = marked.parse(md || '');
  tpl.content.querySelectorAll('script, style, iframe, object, embed, img, form, input, button, video, audio').forEach((el) => el.remove());
  tpl.content.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name) || a.name === 'id') el.removeAttribute(a.name);
  });
  tpl.content.querySelectorAll('hr').forEach((hr) => {
    const p = document.createElement('p');
    p.className = 'scene-break';
    p.textContent = '*   *   *';
    hr.replaceWith(p);
  });
  const s = new XMLSerializer();
  return [...tpl.content.childNodes]
    .map((n) => s.serializeToString(n))
    .join('')
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}

const xhtmlPage = (lang, title, body, bodyClass = '') => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(lang)}" xml:lang="${xml(lang)}">
<head>
<meta charset="utf-8"/>
<title>${xml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>
`;

const EPUB_CSS = `body { margin: 0 5%; line-height: 1.5; }
p { margin: 0; text-indent: 1.4em; }
h1 + p, h2 + p, h3 + p, .scene-break + p, blockquote + p, ul + p, ol + p { text-indent: 0; }
.chapter-title { text-align: center; font-weight: normal; font-size: 1.5em; margin: 2.5em 0 1.8em; page-break-before: always; }
h2, h3 { text-align: center; font-weight: normal; margin: 1.5em 0 1em; }
.scene-break { text-indent: 0; text-align: center; margin: 1.2em 0; white-space: pre; }
blockquote { margin: 1em 1.5em; }
.title-page { text-align: center; margin-top: 35%; }
.title-page h1 { font-size: 2em; font-weight: normal; margin: 0; }
.title-page .author { text-indent: 0; margin-top: 1.2em; font-style: italic; }
body.cover { margin: 0; padding: 0; text-align: center; }
body.cover div { height: 100vh; }
body.cover svg { height: 100%; width: 100%; }
.part-page { text-align: center; margin-top: 30%; page-break-before: always; }
.copyright { margin-top: 20%; font-size: 0.85em; }
.copyright p, .dedication p, .epigraph p, .also-by p { text-indent: 0; }
.copyright p { margin-bottom: 1em; }
.dedication, .epigraph { text-align: center; margin-top: 30%; }
.dedication { font-style: italic; }
.epigraph blockquote { margin: 0 1em; font-style: italic; }
.epigraph .source { margin-top: 0.8em; }
.also-by { text-align: center; }
.also-group { margin-top: 1.4em; font-variant: small-caps; letter-spacing: 0.05em; }
.also-title { font-style: italic; }
.part-page .part-label { text-indent: 0; text-transform: uppercase; letter-spacing: 0.15em; }
.part-title { font-weight: normal; font-size: 1.6em; margin: 0.6em 0 0; }
nav ol { list-style: none; padding: 0; }
nav ol ol { padding-left: 1.2em; }
nav li { margin: 0.4em 0; }
`;

function wrapText(g, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// A plain typographic cover, drawn with the app's own fonts.
async function generateCover(title, author) {
  const W = 1600;
  const H = 2560;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  await Promise.all([document.fonts.load('600 160px "Literata Variable"'), document.fonts.load('500 56px "Instrument Sans Variable"')]);

  g.fillStyle = '#f3f0e8';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1b1b1b';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  let size = 180;
  let lines;
  do {
    g.font = `600 ${size}px "Literata Variable", Georgia, serif`;
    lines = wrapText(g, title, W - 340);
    size -= 10;
  } while ((lines.length > 4 || lines.some((l) => g.measureText(l).width > W - 340)) && size > 60);
  const lh = (size + 10) * 1.15;
  let y = H * 0.42 - ((lines.length - 1) * lh) / 2;
  for (const l of lines) {
    g.fillText(l, W / 2, y);
    y += lh;
  }

  g.fillRect(W / 2 - 60, y + 30, 120, 5);
  if (author) {
    g.font = '500 58px "Instrument Sans Variable", system-ui, sans-serif';
    g.letterSpacing = '10px';
    g.fillText(author.toUpperCase(), W / 2 + 5, y + 170);
  }

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  return { ext: 'jpg', data: new Uint8Array(await blob.arrayBuffer()), width: W, height: H };
}

async function imageSize(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes]));
  const size = { width: bmp.width, height: bmp.height };
  bmp.close();
  return size;
}

const EPUB_TYPES = { copyright: 'copyright-page', dedication: 'dedication', epigraph: 'epigraph', acknowledgments: 'acknowledgments' };

export async function buildEpub(p, opts) {
  const { titles, cover: chosenCover } = opts;
  const author = (p.meta?.author || '').trim();
  const lang = (p.meta?.language || navigator.language || 'en').trim();
  const uid = `urn:uuid:${p.meta.uuid}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  // Chapters and part pages, one file each, in reading order.
  const chapters = bookItems(p).map((it) =>
    it.type === 'part'
      ? { ...it, ref: `part${pad(it.n)}`, file: `part-${pad(it.n)}.xhtml` }
      : { ...it, ref: `ch${pad(it.index + 1)}`, file: `chapter-${pad(it.index + 1)}.xhtml`, content: it.chapter.content }
  );
  const { front, back } = matterFor(p, opts);
  const asFile = (it) => ({ ...it, ref: `m-${it.id}`, file: `${it.id}.xhtml` });
  const frontFiles = front.map(asFile);
  const backFiles = back.map(asFile);
  const within = new Map();
  for (const c of chapters) within.set(c.parent, [...(within.get(c.parent) || []), c]);
  // The contents end with the back matter pages that have a heading.
  within.set(null, [...(within.get(null) || []), ...backFiles.filter(titled)]);

  const cover = chosenCover
    ? { ext: chosenCover.ext === 'jpeg' ? 'jpg' : chosenCover.ext, data: chosenCover.data, ...(await imageSize(chosenCover.data)) }
    : await generateCover(p.title, author);
  const coverFile = `images/cover.${cover.ext}`;
  const coverType = cover.ext === 'png' ? 'image/png' : 'image/jpeg';

  const files = [];
  const add = (name, data) => files.push({ name: `OEBPS/${name}`, data });

  files.push({
    name: 'META-INF/container.xml',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  });

  add('style.css', EPUB_CSS);
  add(coverFile, cover.data);
  add(
    'cover.xhtml',
    xhtmlPage(
      lang,
      'Cover',
      `<div><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${cover.width} ${cover.height}" preserveAspectRatio="xMidYMid meet"><image width="${cover.width}" height="${cover.height}" xlink:href="${coverFile}"/></svg></div>`,
      'cover'
    )
  );
  add(
    'title.xhtml',
    xhtmlPage(
      lang,
      p.title,
      `<section class="title-page" epub:type="titlepage"><h1>${xml(p.title)}</h1>${author ? `<p class="author">${xml(author)}</p>` : ''}</section>`
    )
  );
  for (const m of [...frontFiles, ...backFiles]) {
    const body = matterBody(m, { md: toXhtml, esc: xml, br: '<br/>' });
    const type = EPUB_TYPES[m.id] ? ` epub:type="${EPUB_TYPES[m.id]}"` : '';
    const heading = titled(m) ? `<h1 class="chapter-title">${xml(m.title)}</h1>` : '';
    add(m.file, xhtmlPage(lang, m.title, `<section${type} class="${m.id}">${heading}${body}</section>`));
  }
  for (const c of chapters) {
    if (c.type === 'part') {
      const title = c.subtitle ? `<h1 class="part-title">${xml(c.subtitle)}</h1>` : '';
      add(c.file, xhtmlPage(lang, c.title, `<section epub:type="part" class="part-page"><p class="part-label">${xml(c.label)}</p>${title}</section>`));
      continue;
    }
    const heading = titles ? `<h1 class="chapter-title">${xml(c.title)}</h1>` : '';
    add(c.file, xhtmlPage(lang, c.title, `<section epub:type="chapter">${heading}${toXhtml(c.content)}</section>`));
  }

  // Contents nest chapters under their parts.
  const tocList = (parent, indent) =>
    (within.get(parent) || [])
      .map((c) => {
        const sub = within.has(c.id) ? `\n${indent}  <ol>\n${tocList(c.id, `${indent}    `)}\n${indent}  </ol>\n${indent}` : '';
        return `${indent}<li><a href="${c.file}">${xml(c.title)}</a>${sub}</li>`;
      })
      .join('\n');
  let order = 0;
  const navPoints = (parent, indent) =>
    (within.get(parent) || [])
      .map((c) => {
        const n = ++order;
        const sub = within.has(c.id) ? `\n${navPoints(c.id, `${indent}  `)}\n${indent}` : '';
        return `${indent}<navPoint id="np${n}" playOrder="${n}"><navLabel><text>${xml(c.title)}</text></navLabel><content src="${c.file}"/>${sub}</navPoint>`;
      })
      .join('\n');
  add(
    'nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(lang)}" xml:lang="${xml(lang)}">
<head>
<meta charset="utf-8"/>
<title>Contents</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${tocList(null, '      ')}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="">
    <ol>
      <li><a epub:type="cover" href="cover.xhtml">Cover</a></li>
      <li><a epub:type="titlepage" href="title.xhtml">Title Page</a></li>
      <li><a epub:type="bodymatter" href="${chapters[0]?.file || 'title.xhtml'}">Start</a></li>
    </ol>
  </nav>
</body>
</html>
`
  );

  add(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${xml(uid)}"/>
    <meta name="dtb:depth" content="${1 + Math.max(0, ...chapters.map((c) => c.depth))}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xml(p.title)}</text></docTitle>
  <navMap>
${navPoints(null, '    ')}
  </navMap>
</ncx>
`
  );

  add(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xml(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${xml(uid)}</dc:identifier>
    <dc:title>${xml(p.title)}</dc:title>
    ${author ? `<dc:creator id="author">${xml(author)}</dc:creator>` : ''}
    <dc:language>${xml(lang)}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover-image" href="${coverFile}" media-type="${coverType}" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" properties="svg"/>
    <item id="titlepage" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${[...frontFiles, ...chapters, ...backFiles].map((c) => `<item id="${c.ref}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover"/>
    <itemref idref="titlepage"/>
    ${[...frontFiles, ...chapters, ...backFiles].map((c) => `<itemref idref="${c.ref}"/>`).join('\n    ')}
  </spine>
</package>
`
  );

  return files;
}
