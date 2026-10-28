// Standard manuscript format as a Word document (.docx), the file most agents and editors ask for.
// The same rules as the manuscript PDF: letter paper, 1" margins, 12pt type, double-spaced, ½"
// indents, ragged right; a title page with the contact block top left, the word count top right
// and the title and byline centered; every later page headed "Surname / TITLE / n"; chapters a
// third of the way down a new page, scene breaks as #, END at the end.
//
// A .docx is a zip of XML parts. This builds the parts; the main process zips them.

import { marked } from 'marked';
import { manuscriptWords } from './project.js';
import { bookItems, roundedWords } from './book.js';

export const DOCX_FONTS = { courier: 'Courier New', times: 'Times New Roman' };

const TWIP = 1440; // per inch
const TEXT_WIDTH = 6.5 * TWIP;

const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m));

// ---------- formatting ----------
// Each paragraph style's settings. They go into styles.xml, so Word shows named styles, and onto
// every paragraph and run as well, so apps that skip styles (Quick Look, some phone and web
// readers) still lay the manuscript out properly.

const FORMATS = {
  Normal: { widowControl: true, spacing: { line: 480 }, ind: { firstLine: 720 } },
  // Word drops the space above a paragraph that starts a page, so a chapter or part starts with an
  // empty paragraph of exact height instead, which it always keeps.
  ChapterDrop: { keepNext: true, pageBreakBefore: true, spacing: { line: 3240, lineRule: 'exact' }, ind: { firstLine: 0 } },
  PartDrop: { keepNext: true, pageBreakBefore: true, spacing: { line: 4320, lineRule: 'exact' }, ind: { firstLine: 0 } },
  ChapterTitle: { keepNext: true, spacing: { after: 480, line: 480 }, ind: { firstLine: 0 }, jc: 'center', outlineLvl: 0 },
  PartTitle: { keepNext: true, spacing: { line: 480 }, ind: { firstLine: 0 }, jc: 'center', outlineLvl: 0 },
  Centered: { spacing: { line: 480 }, ind: { firstLine: 0 }, jc: 'center' },
  Quote: { spacing: { line: 480 }, ind: { left: 720, firstLine: 0 } },
  ListItem: { tabs: [['left', 1080]], spacing: { line: 480 }, ind: { left: 1080, hanging: 360 } },
  Contact: { tabs: [['right', TEXT_WIDTH]], spacing: { line: 240 }, ind: { firstLine: 0 } },
  TitleBlock: { spacing: { line: 480 }, ind: { firstLine: 0 }, jc: 'center' },
  Header: { spacing: { line: 240 }, ind: { firstLine: 0 }, jc: 'right' },
};
const STYLE_NAMES = { ChapterDrop: 'Chapter Opening', PartDrop: 'Part Opening', ChapterTitle: 'Chapter Title', PartTitle: 'Part Title', Centered: 'Centered', Quote: 'Block Quote', ListItem: 'List Item', Contact: 'Contact', TitleBlock: 'Manuscript Title' };

const attrs = (o) => Object.entries(o).map(([k, v]) => ` w:${k}="${v}"`).join('');

// Paragraph properties, in the order Word's schema wants them.
function pPr(f) {
  return [
    f.keepNext && '<w:keepNext/>',
    f.pageBreakBefore && '<w:pageBreakBefore/>',
    f.widowControl && '<w:widowControl/>',
    f.tabs && `<w:tabs>${f.tabs.map(([val, pos]) => `<w:tab w:val="${val}" w:pos="${pos}"/>`).join('')}</w:tabs>`,
    f.spacing && `<w:spacing${attrs({ after: 0, ...(f.spacing.line ? { lineRule: 'auto' } : {}), ...f.spacing })}/>`,
    f.ind && `<w:ind${attrs(f.ind)}/>`,
    f.jc && `<w:jc w:val="${f.jc}"/>`,
    f.outlineLvl !== undefined && `<w:outlineLvl w:val="${f.outlineLvl}"/>`,
  ]
    .filter(Boolean)
    .join('');
}

const fontProps = (font) => `<w:rFonts w:ascii="${x(font)}" w:hAnsi="${x(font)}" w:cs="${x(font)}" w:eastAsia="${x(font)}"/>`;

// ---------- text ----------

function run(text, f, opts) {
  // In the order Word's schema wants them.
  const u = f.i && opts.underlineItalics;
  const props = [fontProps(opts.fontName), f.b && '<w:b/>', f.i && !u && '<w:i/>', f.strike && '<w:strike/>', '<w:sz w:val="24"/><w:szCs w:val="24"/>', u && '<w:u w:val="single"/>'].filter(Boolean).join('');
  const rPr = `<w:rPr>${props}</w:rPr>`;
  return text
    .split('\n')
    .map((t, k) => `${k ? '<w:r><w:br/></w:r>' : ''}${t ? `<w:r>${rPr}<w:t xml:space="preserve">${x(t)}</w:t></w:r>` : ''}`)
    .join('');
}

function inline(tokens, f, opts) {
  let out = '';
  for (const t of tokens || []) {
    if (t.type === 'strong') out += inline(t.tokens, { ...f, b: true }, opts);
    else if (t.type === 'em') out += inline(t.tokens, { ...f, i: true }, opts);
    else if (t.type === 'del') out += inline(t.tokens, { ...f, strike: true }, opts);
    else if (t.type === 'link') out += inline(t.tokens, f, opts);
    else if (t.type === 'br') out += '<w:r><w:br/></w:r>';
    else if (t.type === 'html') out += /^<br\s*\/?>$/i.test(t.text.trim()) ? '<w:r><w:br/></w:r>' : '';
    else if (t.type === 'image') continue;
    else if (t.tokens) out += inline(t.tokens, f, opts);
    else if (typeof t.text === 'string') out += run(decode(t.text), f, opts);
  }
  return out;
}

// A paragraph in one of the FORMATS, with `extra` settings on top ({ spacing: { before } }).
function para(runs, style, extra = {}) {
  const f = FORMATS[style || 'Normal'];
  const merged = { ...f, ...extra, spacing: { ...f.spacing, ...extra.spacing } };
  return `<w:p><w:pPr>${style && style !== 'Normal' ? `<w:pStyle w:val="${style}"/>` : ''}${pPr(merged)}</w:pPr>${runs}</w:p>`;
}

// Markdown → paragraphs.
function blocks(tokens, opts, style = null) {
  const out = [];
  for (const t of tokens) {
    if (t.type === 'paragraph' || t.type === 'text') out.push(para(inline(t.tokens || [t], {}, opts), style));
    else if (t.type === 'heading') out.push(para(inline(t.tokens, {}, opts), 'Centered'));
    else if (t.type === 'hr') out.push(para(run('#', {}, opts), 'Centered'));
    else if (t.type === 'blockquote') out.push(...blocks(t.tokens, opts, 'Quote'));
    else if (t.type === 'list') {
      t.items.forEach((item, n) => {
        const mark = t.ordered ? `${(+t.start || 1) + n}.` : '•';
        const body = item.tokens.map((b) => inline(b.tokens || [b], {}, opts)).join('<w:r><w:br/></w:r>');
        out.push(para(`${run(mark, {}, opts)}<w:r><w:tab/></w:r>${body}`, 'ListItem'));
      });
    } else if (t.type === 'code') out.push(para(run(t.text, {}, opts), 'Quote'));
    else if (t.type === 'html') {
      const text = decode(t.text.replace(/<[^>]+>/g, '')).trim();
      if (text) out.push(para(run(text, {}, opts), style));
    }
  }
  return out;
}

const markdown = (md, opts) => blocks(marked.lexer(md || ''), opts);

// ---------- parts ----------

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CONTENT_TYPES = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOC_RELS = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/>
<Relationship Id="rId3" Type="${REL}/header" Target="header1.xml"/>
<Relationship Id="rId4" Type="${REL}/header" Target="header2.xml"/>
</Relationships>`;

const SETTINGS = `${XML}<w:settings ${W}>
<w:defaultTabStop w:val="720"/>
<w:characterSpacingControl w:val="doNotCompress"/>
<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>
</w:settings>`;

function styles(font, lang) {
  const style = (id) =>
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${STYLE_NAMES[id]}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${pPr(FORMATS[id])}</w:pPr></w:style>`;
  return `${XML}<w:styles ${W}>
<w:docDefaults>
<w:rPrDefault><w:rPr>${fontProps(font)}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="${x(lang)}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="480" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr>${pPr(FORMATS.Normal)}</w:pPr></w:style>
${Object.keys(STYLE_NAMES).map(style).join('\n')}
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr>${pPr(FORMATS.Header)}</w:pPr></w:style>
</w:styles>`;
}

const header = (text, font) => {
  const rPr = `<w:rPr>${fontProps(font)}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  return `${XML}<w:hdr ${W}>
<w:p><w:pPr><w:pStyle w:val="Header"/>${pPr(FORMATS.Header)}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${x(text)}</w:t></w:r><w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rPr}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rPr}<w:t>1</w:t></w:r><w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r></w:p>
</w:hdr>`;
};

const EMPTY_HEADER = `${XML}<w:hdr ${W}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr></w:p></w:hdr>`;

function core(title, author) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${x(title)}</dc:title>
<dc:creator>${x(author)}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

const APP = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Quillier</Application></Properties>`;

// ---------- the document ----------

// opts: { underlineItalics, font: 'courier' | 'times' }. Returns [{ name, data }] for the zip.
export function buildDocx(p, opts = {}) {
  const author = (p.meta?.author || '').trim();
  const contact = (p.meta?.contact || '').trim();
  const surname = author.split(/\s+/).filter(Boolean).pop() || '';
  const keyword = p.title.toUpperCase().slice(0, 40);
  const words = roundedWords(manuscriptWords(p));
  const font = DOCX_FONTS[opts.font] || DOCX_FONTS.courier;
  const lang = (p.meta?.language || 'en-US').trim();
  opts = { ...opts, fontName: font };
  const r = (text) => run(text, {}, opts);

  const body = [];
  // Title page: contact block top left with the word count at the right margin, then the title and
  // byline about halfway down.
  const contactLines = contact.split('\n').map((l) => l.trim()).filter(Boolean);
  body.push(para(`${r(author)}<w:r><w:tab/></w:r>${r(`about ${words.toLocaleString('en-US')} words`)}`, 'Contact'));
  for (const line of contactLines) body.push(para(r(line), 'Contact'));
  const down = Math.max(720, 4.6 * TWIP - (contactLines.length + 1) * 280);
  body.push(para(r(p.title), 'TitleBlock', { spacing: { before: Math.round(down) } }));
  if (author) body.push(para(r(`by ${author}`), 'TitleBlock'));

  for (const it of bookItems(p)) {
    if (it.type === 'part') {
      body.push(para('', 'PartDrop'));
      body.push(para(r(it.label.toUpperCase()), 'PartTitle'));
      if (it.subtitle) body.push(para(r(it.subtitle), 'Centered'));
      continue;
    }
    body.push(para('', 'ChapterDrop'));
    body.push(para(r(it.title), 'ChapterTitle'));
    body.push(...markdown(it.chapter.content, opts));
  }
  body.push(para(r('END'), 'Centered', { spacing: { before: 480 } }));

  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:headerReference w:type="first" r:id="rId4"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/><w:pgNumType w:start="0"/><w:titlePg/></w:sectPr>`;
  const document = `${XML}<w:document ${W}><w:body>\n${body.join('\n')}\n${sect}</w:body></w:document>`;

  return [
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'docProps/core.xml', data: core(p.title, author) },
    { name: 'docProps/app.xml', data: APP },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: styles(font, lang) },
    { name: 'word/settings.xml', data: SETTINGS },
    { name: 'word/header1.xml', data: header(`${surname ? `${surname} / ` : ''}${keyword} / `, font) },
    { name: 'word/header2.xml', data: EMPTY_HEADER },
  ];
}
