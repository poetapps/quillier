// Typesetting the print-ready PDF. Chromium lays the book out in a hidden frame as one long
// column, and this takes over from there: it breaks every justified paragraph into lines itself
// (lib/linebreak.js), with the book language's hyphenation, checks the result for rivers and
// re-breaks the paragraph around any it finds, evening out the spaces on a river's lines where
// that can't (lib/rivers.js), then pages each chapter so no
// widow, orphan or uneven spread is left that a looser or tighter paragraph could fix
// (lib/paginate.js). What comes back is every page's markup, ready to print as it stands: each
// line is its own block, justified to the measure, and each page ends with a forced break.
//
// Anything it can't set (a paragraph with an image in it, a script without spaces between
// words) stays as Chromium laid it out and moves between pages whole. If a book won't go at all,
// this returns null and the export falls back to letting Chromium page it.

import { breakLines, box, glue, penalty, paragraphEnd, lineStarts, INFINITY } from './linebreak.js';
import { findRivers, riverScore, smoothRivers } from './rivers.js';
import { hyphenator } from './hyphenate.js';
import { paginate } from './paginate.js';

const STRETCH = 0.5; // a space can stretch by half its width before it counts as loose...
const SHRINK = 0.2; // ...and shrink to four fifths of it
const HYPHEN = 50; // the cost of a hyphen, as in TeX
const DASH = 30; // the cost of breaking after a dash
// Each paragraph tries the next pass only if the last found no breaking at all. The last takes
// anything short of a line that won't fit at all (a long URL, say).
const PASSES = [{ tolerance: 1.26 }, { tolerance: 2.15 }, { tolerance: 4.64, emergency: 1.5 }, { tolerance: 2 * INFINITY, emergency: 3 }];
const VARIANT_TOLERANCE = 1.8; // how loose a paragraph may set to make a page come out right
const RUNT = { share: 0.12, demerits: 4000 }; // a last line under an eighth of the measure
const RIVER_WEIGHT = 4000; // demerits per unit of river score
const VARIANT_SCALE = 0.03; // demerits to pagination cost: a paragraph set a line looser at
// half again its natural spacing costs about what a short spread does
const REPAIR_ROUNDS = 3;
const REPAIR_TOLERANCE = 1.6; // a re-break around a river may set this loose, if that costs less than the river

const INLINE = new Set(['A', 'ABBR', 'B', 'CITE', 'CODE', 'DEL', 'DFN', 'EM', 'I', 'INS', 'KBD', 'MARK', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR']);
const CONTAINERS = new Set(['BLOCKQUOTE', 'DIV', 'UL', 'OL', 'LI', 'FIGURE', 'ASIDE']);
// Scripts that don't put spaces between words, or that justify by other means.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Tibetan}]/u;
const LETTER = /[\p{L}\p{M}]/u;
const SPACE = /[ \t\n\r\f]/;

const escapeText = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const escapeAttr = (s) => s.replace(/[&"]/g, (c) => ({ '&': '&amp;', '"': '&quot;' })[c]);
const px = (n) => `${+n.toFixed(3)}px`;
const tick = () => new Promise((r) => setTimeout(r));

function openTag(el, { addClass, attrs: extra } = {}) {
  let out = `<${el.tagName.toLowerCase()}`;
  const set = { ...Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])), ...extra };
  if (addClass) set.class = [set.class, addClass].filter(Boolean).join(' ');
  for (const [k, v] of Object.entries(set)) out += ` ${k}="${escapeAttr(String(v))}"`;
  return `${out}>`;
}
const closeTag = (el) => `</${el.tagName.toLowerCase()}>`;

// Markup that moves from the inline elements `open` sit in to the ones `chain` does.
function switchChain(open, chain) {
  let same = 0;
  while (same < open.length && same < chain.length && open[same] === chain[same]) same++;
  return open.slice(same).reverse().map(closeTag).join('') + chain.slice(same).map((el) => openTag(el)).join('');
}

// ---------- reading paragraphs ----------

// What a text node is set in, for measuring, or null if it's something this can't set.
function styler(win) {
  const cache = new WeakMap();
  return (el) => {
    if (cache.has(el)) return cache.get(el);
    const cs = win.getComputedStyle(el);
    const transform = cs.textTransform;
    let st = null;
    if ((transform === 'none' || transform === 'uppercase' || transform === 'lowercase') && cs.whiteSpace === 'normal' && cs.wordSpacing === '0px') {
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      st = { font, letterSpacing, caps: cs.fontVariantCaps, size: parseFloat(cs.fontSize), display: cs.display, transform, key: `${font}|${letterSpacing}|${cs.fontVariantCaps}` };
    }
    cache.set(el, st);
    return st;
  };
}

function measurer(doc) {
  const ctx = doc.createElement('canvas').getContext('2d');
  const cache = new Map();
  let current = null;
  return (st, text) => {
    const key = `${st.key}\u0000${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      if (current !== st.key) {
        ctx.font = st.font;
        ctx.letterSpacing = st.letterSpacing;
        ctx.fontVariantCaps = st.caps;
        current = st.key;
      }
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

// A paragraph's text as one string with whitespace collapsed (a <br> becomes "\n"), the inline
// elements each character sits in, and any soft hyphens the author put in. Null if it holds
// something other than text and inline markup.
function readParagraph(p, styleOf) {
  const base = styleOf(p);
  if (!base) return null;
  let T = '';
  const runOf = [];
  const runs = [];
  const soft = new Set();
  let space = -1; // the run a pending space belongs to
  const put = (ch, run) => {
    T += ch;
    for (let i = 0; i < ch.length; i++) runOf.push(run);
  };
  const walk = (node, chain) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        const st = styleOf(c.parentElement);
        if (!st || st.size > base.size + 0.01) return false;
        runs.push({ st, chain });
        const run = runs.length - 1;
        let text = c.data;
        if (st.transform === 'uppercase') text = text.toUpperCase();
        if (st.transform === 'lowercase') text = text.toLowerCase();
        for (const ch of text) {
          if (SPACE.test(ch)) {
            if (T && !T.endsWith('\n')) space = space < 0 ? run : space;
          } else if (ch === '\u00AD') {
            if (space < 0) soft.add(T.length);
          }
          else {
            if (space >= 0) put(' ', space);
            space = -1;
            put(ch, run);
          }
        }
      } else if (c.nodeType === 1) {
        if (c.tagName === 'BR') {
          runs.push({ st: styleOf(c.parentElement) || base, chain });
          put('\n', runs.length - 1);
          space = -1;
          continue;
        }
        const st = INLINE.has(c.tagName) && styleOf(c);
        if (!st || st.display !== 'inline') return false;
        if (walk(c, [...chain, c]) === false) return false;
      }
    }
  };
  if (walk(p, []) === false || !T.trim() || UNSPACED.test(T)) return null;
  return { T, runOf, runs, soft };
}

// The paragraph as boxes, glue and penalties (see lib/linebreak.js). Each box's `at` is the
// [start, end) of its text; glue and penalties sit `at` a character offset.
function itemsFor(par, measure, hyphenate, indent) {
  const { T, runOf, runs, soft } = par;
  const items = [];
  const width = (s, e) => {
    let w = 0;
    for (let i = s; i < e; ) {
      let j = i + 1;
      while (j < e && runOf[j] === runOf[i]) j++;
      w += measure(runs[runOf[i]].st, T.slice(i, j));
      i = j;
    }
    return w;
  };
  const word = (s, e) => {
    const points = [];
    for (let k = s + 1; k < e - 1; k++) {
      const ch = T[k];
      if ((ch === '-' || ch === '\u2010') && LETTER.test(T[k - 1]) && LETTER.test(T[k + 1])) points.push({ at: k + 1, width: 0, cost: HYPHEN, flagged: true });
      else if (ch === '\u2014' || ch === '\u2013') points.push({ at: k + 1, width: 0, cost: DASH, flagged: false });
      else if (ch === '\u200B') points.push({ at: k + 1, width: 0, cost: 0, flagged: false });
    }
    // Hyphenation points in each run of letters: the author's soft hyphens if there are any.
    for (let a = s; a < e; ) {
      if (!LETTER.test(T[a])) {
        a++;
        continue;
      }
      let b = a + 1;
      while (b < e && LETTER.test(T[b])) b++;
      const mine = [...soft].filter((k) => k > a && k < b);
      const offsets = mine.length ? mine.map((k) => k - a) : hyphenate ? hyphenate(T.slice(a, b)) : [];
      for (const off of offsets) points.push({ at: a + off, width: measure(runs[runOf[a + off - 1]].st, '-'), cost: HYPHEN, flagged: true, inserted: true });
      a = b;
    }
    points.sort((x, y) => x.at - y.at);
    let from = s;
    for (const pt of points) {
      if (pt.at <= from || pt.at >= e) continue;
      items.push(box(width(from, pt.at), [from, pt.at]));
      items.push({ ...penalty(pt.width, pt.cost, pt.flagged, pt.at), inserted: !!pt.inserted });
      from = pt.at;
    }
    items.push(box(width(from, e), [from, e]));
  };
  if (indent > 0) items.push(box(indent, [0, 0]));
  for (let i = 0; i < T.length; ) {
    if (T[i] === ' ') {
      const w = measure(runs[runOf[i]].st, ' ');
      items.push(glue(w, w * STRETCH, w * SHRINK, i));
      i++;
    } else if (T[i] === '\n') {
      items.push(...paragraphEnd(i));
      i++;
    } else {
      let e = i + 1;
      while (e < T.length && T[e] !== ' ' && T[e] !== '\n') e++;
      word(i, e);
      i = e;
    }
  }
  items.push(...paragraphEnd(T.length));
  return items;
}

const isFill = (it) => it.type === 'glue' && it.stretch >= 1e5;

// Each line of a breaking: its text range, whether it ends on a hyphen, how its spaces set, and
// where they fall (for finding rivers).
function linesOf(items, breaks, measure) {
  const starts = lineStarts(items, breaks);
  return breaks.map((b, li) => {
    const it = items[b];
    const end = it.type === 'penalty' && it.cost <= -INFINITY;
    let w = it.type === 'penalty' ? it.width : 0;
    let spaces = 0;
    for (let i = starts[li]; i < b; i++) {
      const x = items[i];
      if (x.type === 'box') w += x.width;
      else if (x.type === 'glue' && !isFill(x)) {
        w += x.width;
        spaces++;
      }
    }
    const extra = spaces && (!end || w > measure) ? (measure - w) / spaces : 0;
    const gaps = [];
    const spaceAt = [];
    let x = 0;
    for (let i = starts[li]; i < b; i++) {
      const g = items[i];
      if (g.type === 'box') x += g.width;
      else if (g.type === 'glue' && !isFill(g)) {
        gaps.push([x, x + g.width + extra]);
        spaceAt.push(g.at);
        x += g.width + extra;
      }
    }
    const first = items[starts[li]];
    return {
      from: first.type === 'box' ? first.at[0] : it.at,
      to: it.at,
      hyphen: it.type === 'penalty' && !!it.inserted,
      flagged: it.type === 'penalty' && it.flagged && !end,
      end,
      ws: w > measure && spaces ? (measure - w) / spaces - 0.01 : 0,
      gaps,
      spaceAt,
    };
  });
}

// Chromium's way: as many words on each line as fit, hyphenating the last one if that helps.
// Only used to count the rivers a plain export would have had.
function greedyBreaks(items, measure) {
  const breaks = [];
  let w = 0;
  let last = -1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'penalty' && it.cost <= -INFINITY) {
      breaks.push(i);
      w = 0;
      last = -1;
      continue;
    }
    const legal = (it.type === 'glue' && items[i - 1]?.type === 'box') || (it.type === 'penalty' && it.cost < INFINITY);
    if (legal && (last < 0 || w + (it.type === 'penalty' ? it.width : 0) <= measure)) last = i;
    if (it.type === 'box' || (it.type === 'glue' && !isFill(it))) w += it.width;
    if (w > measure && last >= 0) {
      breaks.push(last);
      i = last;
      while (items[i + 1]?.type === 'glue') i++;
      w = 0;
      last = -1;
    }
  }
  return breaks;
}

// ---------- setting a paragraph ----------

function setParagraph(items, measure, space) {
  const runt = { width: measure * RUNT.share, demerits: RUNT.demerits };
  let tolerance = 0;
  let found = null;
  for (const pass of PASSES) {
    found = breakLines(items, measure, { tolerance: pass.tolerance, emergencyStretch: (pass.emergency || 0) * space, runt });
    tolerance = pass.tolerance;
    if (found.size) break;
  }
  if (!found?.size) return null;
  const best = [...found.entries()].reduce((a, b) => (b[1].demerits < a[1].demerits ? b : a));
  const lines = best[0];
  let all = found;
  if (tolerance < VARIANT_TOLERANCE && (!found.has(lines - 1) || !found.has(lines + 1))) {
    all = new Map([...breakLines(items, measure, { tolerance: VARIANT_TOLERANCE, runt }), ...found]);
  }
  const out = [];
  for (const n of [lines, lines - 1, lines + 1]) {
    const sol = all.get(n);
    if (sol && n > 0) out.push({ n, sol, tolerance: Math.max(tolerance, n === lines ? tolerance : VARIANT_TOLERANCE) });
  }
  return { runt, variants: out };
}

const scoreOf = (lines, space) => riverScore(findRivers(lines.map((l) => l.gaps), { space }));

// Re-break around rivers: try forbidding each break down to the foot of a river (any of them
// moves the words on its lines), keep whichever change helps most, and go again while it keeps
// helping. The line count stays put so the paragraph still fills the space paging counts on.
function repairRivers(items, measure, space, v, runt) {
  let cur = { sol: v.sol, lines: linesOf(items, v.sol.breaks, measure), forbid: new Set() };
  cur.score = scoreOf(cur.lines, space);
  const cost = (c) => c.sol.demerits + RIVER_WEIGHT * c.score;
  for (let round = 0; round < REPAIR_ROUNDS && cur.score > 0; round++) {
    const rivers = findRivers(cur.lines.map((l) => l.gaps), { space });
    const tries = new Set();
    for (const r of rivers) for (let li = 0; li < Math.min(v.n - 1, r.line + r.lines); li++) tries.add(cur.sol.breaks[li]);
    let best = cur;
    for (const b of tries) {
      const forbid = new Set(cur.forbid).add(b);
      const sol = breakLines(items, measure, { tolerance: Math.max(v.tolerance, REPAIR_TOLERANCE), runt, forbid }).get(v.n);
      if (!sol) continue;
      const lines = linesOf(items, sol.breaks, measure);
      const c = { sol, lines, forbid, score: scoreOf(lines, space) };
      if (cost(c) < cost(best)) best = c;
    }
    if (best === cur) break;
    cur = best;
  }
  return cur;
}

// ---------- a chapter's blocks ----------

const isContainer = (el) =>
  CONTAINERS.has(el.tagName) && el.children.length > 0 && [...el.childNodes].every((c) => c.nodeType === 1 ? c.tagName !== 'BR' && !INLINE.has(c.tagName) : c.nodeType !== 3 || !c.data.trim());

// The section's leaf blocks in order, each with the containers it sits in.
function leavesOf(section) {
  const out = [];
  const walk = (el, chain) => {
    for (const c of el.children) {
      if (isContainer(c)) walk(c, [...chain, c]);
      else out.push({ el: c, chain });
    }
  };
  walk(section, []);
  return out;
}

function chapterBlocks(section, ctx) {
  const { win, styleOf, measure, hyphenate, report } = ctx;
  const leaves = leavesOf(section);
  let prevBottom = null;
  const blocks = leaves.map((leaf) => {
    const rect = leaf.el.getBoundingClientRect();
    const gap = prevBottom === null ? 0 : Math.max(0, rect.top - prevBottom);
    prevBottom = rect.bottom;
    const atomic = { kind: 'box', height: rect.height, gap, keep: /^H[1-6]$/.test(leaf.el.tagName), rule: leaf.el.tagName === 'HR', leaf };
    if (leaf.el.tagName !== 'P') return atomic;
    const cs = win.getComputedStyle(leaf.el);
    if (cs.textAlign !== 'justify' || parseFloat(cs.textIndent) < 0) return atomic;
    const par = readParagraph(leaf.el, styleOf);
    if (!par) return atomic;
    const measureWidth = rect.width;
    const space = measure(styleOf(leaf.el), ' ');
    const items = itemsFor(par, measure, hyphenate, parseFloat(cs.textIndent));
    const set = setParagraph(items, measureWidth, space);
    if (!set) return atomic;
    report.rivers.before += findRivers(linesOf(items, greedyBreaks(items, measureWidth), measureWidth).map((l) => l.gaps), { space }).length;
    const variants = set.variants.map((v) => {
      const fixed = repairRivers(items, measureWidth, space, v, set.runt);
      const { adjust, rivers } = fixed.score > 0 ? smoothRivers(fixed.lines.map((l) => l.gaps), { space }) : { adjust: null, rivers: [] };
      const lines = adjust ? fixed.lines.map((l, li) => ({ ...l, adjust: adjust[li] })) : fixed.lines;
      return { n: v.n, lines, rivers, merit: fixed.sol.demerits + RIVER_WEIGHT * riverScore(rivers) };
    });
    const base = Math.min(...variants.map((v) => v.merit));
    return {
      kind: 'lines',
      lh: parseFloat(cs.lineHeight),
      indent: parseFloat(cs.textIndent) || 0,
      gap,
      leaf,
      par,
      variants: variants.map((v) => ({ ...v, cost: (v.merit - base) * VARIANT_SCALE, hyphen: v.lines.map((l) => l.flagged) })),
    };
  });
  return blocks;
}

// ---------- writing pages ----------

function lineHtml(par, ln) {
  // Spaces evened out differently to break up a river (see smoothRivers), by character offset.
  const spaces = new Map((ln.adjust || []).map((a, j) => [ln.spaceAt[j], Math.abs(a) > 0.005 ? a : 0]));
  let html = '';
  let open = [];
  for (let i = ln.from; i < ln.to; ) {
    let j = i + 1;
    while (j < ln.to && par.runOf[j] === par.runOf[i]) j++;
    const chain = par.runs[par.runOf[i]].chain;
    let text = '';
    for (let k = i; k < j; k++) {
      const a = spaces.get(k);
      const ch = escapeText(par.T[k]);
      text += a ? `<span style="word-spacing:${px((ln.ws || 0) + a)}">${ch}</span>` : ch;
    }
    html += switchChain(open, chain) + text;
    open = chain;
    i = j;
  }
  if (ln.hyphen) html += '-';
  html += switchChain(open, []);
  const style = [ln.indent ? `text-indent:${px(ln.indent)}` : '', ln.ws ? `word-spacing:${px(ln.ws)}` : ''].filter(Boolean).join(';');
  return `<span class="ln${ln.end ? ' end' : ''}"${style ? ` style="${style}"` : ''}>${html || '\u00A0'}</span>`;
}

// One page's markup. `opened` holds the containers earlier pages opened, so one carried over
// knows it's a continuation (a list carries on counting; an item carries on without a marker).
function pageHtml(page, blocks, opened) {
  const segs = [];
  for (const r of page.rows) {
    const last = segs[segs.length - 1];
    if (r.variant !== undefined && last?.block === r.block) last.to = r.line + 1;
    else segs.push({ block: r.block, variant: r.variant, from: r.line ?? 0, to: (r.line ?? 0) + 1, snap: r.snap });
  }
  let html = '';
  let open = [];
  for (const seg of segs) {
    const b = blocks[seg.block];
    const chain = b.leaf.chain;
    let same = 0;
    while (same < open.length && same < chain.length && open[same] === chain[same]) same++;
    html += open.slice(same).reverse().map(closeTag).join('');
    for (const el of chain.slice(same)) {
      const attrs = {};
      let addClass;
      if (opened.has(el)) {
        if (el.tagName === 'OL') {
          const li = [...chain, b.leaf.el][chain.indexOf(el) + 1];
          attrs.start = (el.start || 1) + [...el.children].indexOf(li);
        }
        if (el.tagName === 'LI') addClass = 'cont';
      }
      opened.add(el);
      html += openTag(el, { attrs, addClass });
    }
    open = chain;
    if (b.kind === 'box') html += b.leaf.el.outerHTML;
    else {
      const v = b.variants[seg.variant];
      const lines = v.lines.slice(seg.from, seg.to).map((ln, i) => (seg.from + i === 0 ? { ...ln, indent: b.indent } : ln));
      const attrs = seg.snap > 0.01 ? { style: [b.leaf.el.getAttribute('style'), `padding-top:${px(seg.snap)}`].filter(Boolean).join(';') } : undefined;
      html += `${openTag(b.leaf.el, { addClass: seg.from > 0 ? 'ts cont' : 'ts', attrs })}${lines.map((ln) => lineHtml(b.par, ln)).join('')}</p>`;
    }
  }
  return html + open.slice().reverse().map(closeTag).join('');
}

// ---------- the book ----------

// `flowHtml` is the book as one column (exportBookHtml's flow mode). `kinds[i]` says what its
// i-th section is: 'flow' for a chapter or anything else that runs over pages, 'page' for a
// page on its own (the title page, a part, the copyright page). `startPage(i, counts)` is the
// index of the page section i starts on, given how many pages the sections before it took.
//
// Returns { counts, pages, report }: pages[i] is section i's pages' markup (null for a 'page'),
// report is what was found and fixed. Null when the book can't be set this way.
export async function typesetBook(flowHtml, { lang, kinds, startPage, capacity, lead }) {
  const hyphenate = await hyphenator(lang);
  if (!hyphenate) return null;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:2400px;height:1200px;border:0;visibility:hidden;pointer-events:none';
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
  frame.srcdoc = flowHtml;
  document.body.append(frame);
  try {
    await loaded;
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    await doc.fonts.ready;
    const ctx = {
      win,
      styleOf: styler(win),
      measure: measurer(doc),
      hyphenate,
      report: { rivers: { before: 0, after: 0 }, widows: { plain: 0, left: [] }, uneven: [], pages: 0 },
    };
    const sections = [...doc.body.children].filter((el) => el.tagName === 'SECTION');
    if (sections.length !== kinds.length) return null;
    const counts = [];
    const pages = [];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (kinds[i] === 'page') {
        if (section.getBoundingClientRect().height > capacity + 0.5) return null;
        counts.push(1);
        pages.push(null);
        continue;
      }
      await tick();
      const sink = parseFloat(win.getComputedStyle(section).paddingTop) || 0;
      const blocks = chapterBlocks(section, ctx);
      const start = startPage(i, counts);
      const laid = blocks.length ? paginate(blocks, { capacity, first: capacity - sink, lead, recto: start % 2 === 0 }) : { pages: [{ rows: [], flags: [] }], variants: [] };
      if (!laid) return null;
      const opened = new Set();
      pages.push(laid.pages.map((pg) => pageHtml(pg, blocks, opened)));
      counts.push(laid.pages.length);
      noteIssues(ctx.report, blocks, laid, start, capacity, lead, sink);
    }
    return { counts, pages, report: ctx.report };
  } finally {
    frame.remove();
  }
}

// Fill in the report: the rivers left, the widows and orphans a plain fill would have had, and
// the pages where any (or an uneven spread) were left after paging.
function noteIssues(report, blocks, laid, start, capacity, lead, sink) {
  const seen = new Set();
  laid.pages.forEach((pg, pi) => {
    const folio = start + pi + 1;
    report.pages++;
    for (const f of pg.flags) {
      if (f === 'widow' || f === 'orphan') report.widows.left.push(folio);
      if (f === 'uneven') report.uneven.push(folio);
    }
    for (const r of pg.rows) {
      const b = blocks[r.block];
      if (b.kind !== 'lines' || seen.has(r.block)) continue;
      seen.add(r.block);
      report.rivers.after += b.variants[laid.variants[r.block]].rivers.length;
    }
  });
  report.widows.plain += plainWidows(blocks, capacity, capacity - sink, lead);
}

// How many widows and orphans filling each page to the brim would leave.
function plainWidows(blocks, capacity, first, lead) {
  let count = 0;
  let used = 0;
  let cap = first;
  blocks.forEach((b) => {
    const gap = used > 0 ? b.gap : 0;
    if (b.kind === 'box') {
      if (used + gap + b.height > cap + 0.5) {
        used = 0;
        cap = capacity;
      }
      used += (used > 0 ? b.gap : 0) + b.height;
      return;
    }
    const n = b.variants[0].n;
    for (let k = 0; k < n; k++) {
      const h = (k === 0 && used > 0 ? b.gap : 0) + b.lh;
      if (used + h > cap + 0.5) {
        if (k === 1 || n - k === 1) count++;
        used = 0;
        cap = capacity;
      }
      used += (k === 0 && used > 0 ? b.gap : 0) + b.lh;
    }
  });
  return count;
}

const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// One line for the export toast: what typesetting fixed, and where anything was left.
export function typesetSummary(report) {
  const rivers = Math.max(0, report.rivers.before - report.rivers.after);
  const widows = Math.max(0, report.widows.plain - report.widows.left.length);
  const fixed = [rivers && `smoothed ${plural(rivers, 'river', 'rivers')}`, widows && `fixed ${plural(widows, 'widow or orphan', 'widows and orphans')}`].filter(Boolean);
  const left = [...new Set([...report.widows.left, ...report.uneven])].sort((a, b) => a - b);
  let out = `Exported ${plural(report.total ?? report.pages, 'page', 'pages')}`;
  if (fixed.length) out += `: ${fixed.join(', ')}`;
  if (left.length === 1) out += `; 1 left on page ${left[0]}`;
  else if (left.length) out += `; ${left.length} left (pages ${left.slice(0, 3).join(', ')}${left.length > 3 ? '…' : ''})`;
  return out;
}
