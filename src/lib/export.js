import { marked } from 'marked';
import { activeDraft, manuscriptWords } from './project.js';
import courierRegular from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?inline';
import courierItalic from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?inline';
import courierBold from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?inline';
import courierBoldItalic from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?inline';

const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

const cssString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

// Chapters still called "Untitled chapter" export as "Chapter 3" etc.
export function chapterTitle(c, i) {
  const t = (c.title || '').trim();
  return !t || /^untitled chapter$/i.test(t) ? `Chapter ${i + 1}` : t;
}

// Exported pages never run scripts (imported Markdown can contain raw HTML).
const NO_SCRIPTS = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`;

// ---------- Markdown ----------

export function exportMarkdown(p, { titles, titlePage }) {
  const parts = [];
  const level = titlePage ? '##' : '#';
  if (titlePage) parts.push(`# ${p.title}`);
  activeDraft(p).chapters.forEach((c, i) => {
    const body = c.content.trim();
    parts.push(titles ? `${level} ${chapterTitle(c, i)}\n\n${body}` : body);
  });
  return parts.filter(Boolean).join('\n\n') + '\n';
}

export function exportChapterFiles(p, { titles }) {
  return activeDraft(p).chapters.map((c, i) => ({
    name: `${pad(i + 1)} ${chapterTitle(c, i)}.md`,
    content: (titles ? `# ${chapterTitle(c, i)}\n\n` : '') + c.content.trim() + '\n',
  }));
}

// ---------- book-style HTML / PDF ----------

export function exportHtml(p, { titles, titlePage }) {
  const chapters = activeDraft(p)
    .chapters.map((c, i) => {
      const heading = titles ? `<h1 class="chapter-title">${escapeHtml(chapterTitle(c, i))}</h1>` : '';
      return `<section class="chapter">${heading}${marked.parse(c.content || '')}</section>`;
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
  p { margin: 0; text-indent: 1.5em; }
  h1 + p, h2 + p, h3 + p, hr + p, blockquote + p, .chapter > p:first-child { text-indent: 0; }
  hr { border: 0; text-align: center; margin: 1.6em 0; }
  hr::after { content: '*   *   *'; white-space: pre; letter-spacing: 0.2em; color: #555; }
  blockquote { margin: 1em 2em; font-style: italic; }
  @media print { body { margin: 0; max-width: none; padding: 0; } }
</style></head>
<body>
${cover}
${chapters}
</body></html>`;
}

// ---------- standard manuscript format (PDF) ----------
// Letter paper, 1" margins, 12pt Courier, double-spaced, ½" paragraph indents, ragged right.
// Title page: contact block top left, word count top right, title and byline centered.
// Every later page: "Surname / TITLE / n" top right; chapters start a third of the way down.

function roundedWords(n) {
  if (n < 100) return n;
  const step = n >= 10000 ? 1000 : 100;
  return Math.round(n / step) * step;
}

export function exportManuscriptHtml(p, { underlineItalics }) {
  const author = (p.meta?.author || '').trim();
  const contact = (p.meta?.contact || '').trim();
  const surname = author.split(/\s+/).filter(Boolean).pop() || '';
  const keyword = p.title.toUpperCase().slice(0, 40);
  const header = `${surname ? `${surname} / ` : ''}${keyword} / `;
  const words = roundedWords(manuscriptWords(p));

  const chapters = activeDraft(p)
    .chapters.map((c, i) => {
      const body = marked.parse(c.content || '').replace(/<hr\s*\/?>/g, '<p class="scene-break">#</p>');
      return `<section class="chapter"><h1 class="chapter-title">${escapeHtml(chapterTitle(c, i))}</h1>${body}</section>`;
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
nav ol { list-style: none; padding: 0; }
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

export async function buildEpub(p, { titles, cover: chosenCover }) {
  const author = (p.meta?.author || '').trim();
  const lang = (p.meta?.language || navigator.language || 'en').trim();
  const uid = `urn:uuid:${p.meta.uuid}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const chapters = activeDraft(p).chapters.map((c, i) => ({
    id: `ch${pad(i + 1)}`,
    file: `chapter-${pad(i + 1)}.xhtml`,
    title: chapterTitle(c, i),
    content: c.content,
  }));

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
  for (const c of chapters) {
    const heading = titles ? `<h1 class="chapter-title">${xml(c.title)}</h1>` : '';
    add(c.file, xhtmlPage(lang, c.title, `<section epub:type="chapter">${heading}${toXhtml(c.content)}</section>`));
  }

  const tocItems = chapters.map((c) => `<li><a href="${c.file}">${xml(c.title)}</a></li>`).join('\n      ');
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
      ${tocItems}
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
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xml(p.title)}</text></docTitle>
  <navMap>
    ${chapters
      .map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(c.title)}</text></navLabel><content src="${c.file}"/></navPoint>`)
      .join('\n    ')}
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
    ${chapters.map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="cover"/>
    <itemref idref="titlepage"/>
    ${chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>
`
  );

  return files;
}
