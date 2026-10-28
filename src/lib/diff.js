// Comparing two versions of a page the way an editor marks up a manuscript: paragraph by paragraph,
// then word by word inside a paragraph that changed.
//
// It works on the Markdown, so any change can be put back exactly as it was ("use the old wording");
// display() hides the Markdown when the compare view draws it.
//
// compareTexts() returns rows in reading order, each { kind, block, parts }:
//   kind   'same' | 'changed' | 'cut' | 'added' | 'movedFrom' | 'movedTo'
//   block  'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'list' | 'break' (a scene break)
//   parts  [{ eq: text }] for text in both, and changes [{ id, key, del, ins, fmt }]: the older and
//          newer wording. `fmt` marks a change to formatting or spacing only, which isn't shown.
//          `key` names a change the same way each time the texts are compared.

const TOKEN = /[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}'’\s]/gu;
const WORD = /[\p{L}\p{N}'’]+/gu;
const MAX_CELLS = 4_000_000; // beyond this a paragraph (or chapter) is compared as one block
const SIMILAR = 0.45; // a paragraph this much like an old one is that paragraph, changed

export const paragraphsOf = (md) => {
  const t = (md || '').replace(/\r\n?/g, '\n').trim();
  return t ? t.split(/\n(?:[ \t]*\n)+/).map((s) => s.replace(/\s+$/, '')) : [];
};

// Longest common subsequence of a and b, as matched index pairs.
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  return pairs;
}

// Fold a short stretch of shared text into the changes around it, so a rewritten sentence reads as
// one change rather than a dozen word swaps.
function tidy(parts) {
  for (let k = 1; k < parts.length - 1; k++) {
    const [a, e, b] = [parts[k - 1], parts[k], parts[k + 1]];
    if (e.eq === undefined || a.eq !== undefined || b.eq !== undefined) continue;
    const n = e.eq.length;
    if (!e.eq.trim() || (n <= Math.max(a.del.length, a.ins.length) && n <= Math.max(b.del.length, b.ins.length))) {
      parts.splice(k - 1, 3, { del: a.del + e.eq + b.del, ins: a.ins + e.eq + b.ins });
      k = Math.max(0, k - 3);
    }
  }
  return parts;
}

function diffWords(a, b) {
  const x = a.match(TOKEN) || [];
  const y = b.match(TOKEN) || [];
  let pre = 0;
  while (pre < x.length && pre < y.length && x[pre] === y[pre]) pre++;
  let suf = 0;
  while (suf < x.length - pre && suf < y.length - pre && x[x.length - 1 - suf] === y[y.length - 1 - suf]) suf++;
  const parts = [];
  const add = (kind, t) => {
    const last = parts[parts.length - 1];
    if (kind === 'eq') {
      if (last?.eq !== undefined) last.eq += t;
      else parts.push({ eq: t });
    } else if (last && last.eq === undefined) last[kind] += t;
    else parts.push({ del: '', ins: '', [kind]: t });
  };
  x.slice(0, pre).forEach((t) => add('eq', t));
  const xm = x.slice(pre, x.length - suf);
  const ym = y.slice(pre, y.length - suf);
  if (xm.length * ym.length > MAX_CELLS) {
    add('del', xm.join(''));
    add('ins', ym.join(''));
  } else {
    let i = 0;
    let j = 0;
    for (const [pi, pj] of lcs(xm, ym)) {
      while (i < pi) add('del', xm[i++]);
      while (j < pj) add('ins', ym[j++]);
      add('eq', xm[i]);
      i++;
      j++;
    }
    while (i < xm.length) add('del', xm[i++]);
    while (j < ym.length) add('ins', ym[j++]);
  }
  x.slice(x.length - suf).forEach((t) => add('eq', t));
  return tidy(parts);
}

function similarity(bagA, bagB) {
  let common = 0;
  let na = 0;
  let nb = 0;
  for (const [w, c] of bagA) {
    na += c;
    common += Math.min(c, bagB.get(w) || 0);
  }
  for (const c of bagB.values()) nb += c;
  return na + nb ? (2 * common) / (na + nb) : 0;
}

export function blockOf(text) {
  if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(text)) return 'break';
  const h = /^(#{1,6})[ \t]/.exec(text);
  if (h) return `h${Math.min(3, h[1].length)}`;
  if (/^>/.test(text)) return 'quote';
  if (/^([-+*]|\d{1,9}[.)])[ \t]/.test(text)) return 'list';
  return 'p';
}

const unmarked = (s) => s.replace(/[*_~`#>\\]/g, '').replace(/\s+/g, ' ').trim();

// Scene breaks are written several ways (the editor saves *** as ---); they're all the same break.
const sameBreak = (p) => (blockOf(p) === 'break' ? '***' : p);

export function compareTexts(oldMd, newMd) {
  const a = paragraphsOf(oldMd).map(sameBreak);
  const b = paragraphsOf(newMd).map(sameBreak);
  const bags = new Map();
  const bag = (s) => {
    let m = bags.get(s);
    if (!m) {
      m = new Map();
      for (const w of s.toLowerCase().match(WORD) || []) m.set(w, (m.get(w) || 0) + 1);
      bags.set(s, m);
    }
    return m;
  };
  const rows = [];
  // Between two paragraphs that match exactly: pair each old paragraph with the most similar new one
  // still ahead of it; what's left was cut or added.
  const gap = (olds, news) => {
    let j = 0;
    for (const o of olds) {
      let best = -1;
      let score = SIMILAR;
      for (let k = j; k < news.length; k++) {
        const s = similarity(bag(o), bag(news[k]));
        if (s > score) [best, score] = [k, s];
      }
      if (best < 0) {
        rows.push({ kind: 'cut', parts: [{ del: o, ins: '' }] });
        continue;
      }
      while (j < best) rows.push({ kind: 'added', parts: [{ del: '', ins: news[j++] }] });
      rows.push({ kind: 'changed', parts: diffWords(o, news[j++]) });
    }
    while (j < news.length) rows.push({ kind: 'added', parts: [{ del: '', ins: news[j++] }] });
  };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of a.length * b.length > MAX_CELLS ? [] : lcs(a, b)) {
    gap(a.slice(i, pi), b.slice(j, pj));
    rows.push({ kind: 'same', parts: [{ eq: a[pi] }] });
    i = pi + 1;
    j = pj + 1;
  }
  gap(a.slice(i), b.slice(j));

  // A paragraph cut in one place and added word for word in another was moved.
  const added = new Map();
  for (const r of rows) if (r.kind === 'added' && (r.parts[0].ins.match(WORD) || []).length >= 4) added.set(r.parts[0].ins, r);
  for (const r of rows) {
    const to = r.kind === 'cut' && added.get(r.parts[0].del);
    if (!to) continue;
    added.delete(r.parts[0].del);
    Object.assign(r, { kind: 'movedFrom', text: r.parts[0].del, parts: [] });
    Object.assign(to, { kind: 'movedTo', parts: [{ eq: to.parts[0].ins }] });
  }

  const seen = new Map();
  rows.forEach((r, ri) => {
    r.block = blockOf(r.text || r.parts.map((p) => (p.eq ?? (p.ins || p.del))).join(''));
    r.parts.forEach((p, k) => {
      if (p.eq !== undefined) return;
      p.id = `${ri}.${k}`;
      const sig = `${p.del}\u0001${p.ins}`;
      const n = (seen.get(sig) || 0) + 1;
      seen.set(sig, n);
      p.key = `${sig}\u0001${n}`;
      p.fmt = r.block !== 'break' && unmarked(p.del) === unmarked(p.ins);
    });
  });
  return rows;
}

// The newer text with the changes in `ids` taken back to their older wording.
export function withOldWording(rows, ids) {
  const out = [];
  for (const r of rows) {
    const text = r.parts.map((p) => (p.eq !== undefined ? p.eq : ids.has(p.id) ? p.del : p.ins)).join('');
    if (text.trim()) out.push(text);
  }
  return out.join('\n\n');
}

// ---------- drawing ----------
// What a reader sees of Markdown: [{ t, mark, id, em, strong, strike, code } | { br }]. `st` carries
// open emphasis from one piece of a paragraph to the next.

const LINE_START = /^(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/;
const isWordChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
const freshState = () => ({ em: false, strong: false, strike: false, code: false, line: true });

function display(text, st, out, mark, id) {
  let buf = '';
  const flush = () => {
    if (buf && out) out.push({ t: buf, mark, id, em: st.em, strong: st.strong, strike: st.strike, code: st.code });
    buf = '';
  };
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    const next = text[i + 1];
    if (st.line) {
      const m = LINE_START.exec(text.slice(i));
      if (m) {
        i += m[0].length;
        if (/^[-+*]/.test(m[0])) buf += '• ';
        else if (/^\d/.test(m[0])) buf += m[0].trim() + ' ';
        if (m[0][0] !== '>') st.line = false;
        continue;
      }
      st.line = false;
    }
    if (st.code) {
      if (c === '`') {
        flush();
        st.code = false;
      } else buf += c;
      i++;
    } else if (c === '\\' && next === '\n') {
      i++;
    } else if (c === '\\' && next && /[!-/:-@[-`{-~]/.test(next)) {
      buf += next;
      i += 2;
    } else if (c === '\n') {
      flush();
      out?.push({ br: true });
      st.line = true;
      i++;
    } else if (c === '`') {
      flush();
      st.code = true;
      i++;
    } else if ((c === '*' || c === '_') && next === c) {
      flush();
      st.strong = !st.strong;
      i += 2;
    } else if (c === '*' || (c === '_' && (st.em ? !isWordChar(next) : !isWordChar(text[i - 1])))) {
      flush();
      st.em = !st.em;
      i++;
    } else if (c === '~' && next === '~') {
      flush();
      st.strike = !st.strike;
      i += 2;
    } else if (c === ']' && next === '(' && text.indexOf(')', i) > 0) {
      i = text.indexOf(')', i) + 1; // a link: keep its text, drop the address
    } else if (c === '[' || (c === '!' && next === '[')) {
      i++;
    } else if (c === '<' && /^<\/?[a-z][^>]*>/i.test(text.slice(i))) {
      i = text.indexOf('>', i) + 1;
    } else {
      buf += c;
      i++;
    }
  }
  flush();
}

// One row drawn three ways: 'inline' interleaves the older wording (struck) with the newer
// (tinted); 'old' and 'new' draw one side. Changes in `plain` are drawn as ordinary text.
export function drawRow(row, side, plain) {
  const before = freshState();
  const after = freshState();
  const out = [];
  for (const p of row.parts) {
    if (p.eq !== undefined) {
      display(p.eq, side === 'old' ? before : after, out, null);
      display(p.eq, side === 'old' ? after : before, null);
      continue;
    }
    const quiet = plain.has(p.id);
    if (side !== 'new') display(p.del, before, side === 'inline' && quiet ? null : out, quiet ? null : 'del', p.id);
    else display(p.del, before, null);
    if (side !== 'old') display(p.ins, after, out, quiet ? null : 'ins', p.id);
    else display(p.ins, after, null);
  }
  return out;
}

export function plainText(md) {
  const out = [];
  display(md, freshState(), out, null);
  return out.map((s) => (s.br ? ' ' : s.t)).join('');
}
