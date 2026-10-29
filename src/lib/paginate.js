// Laying a chapter out on pages. Good books don't strand a paragraph's first line at the foot
// of a page (an orphan) or its last line at the head of the next (a widow), don't end a page
// on a hyphen the reader has to turn over, and keep the two pages of a spread the same depth.
// A browser only knows to push a line over, which leaves pages short and spreads uneven. The fix
// a typesetter makes by hand is to set one paragraph a line longer or shorter, so the breaks
// land somewhere better: here every paragraph comes in variants (its best setting, and a line
// tighter or looser if that sets decently), and this picks the variants and page breaks that
// cost least overall.
//
// blocks: { kind: 'lines', lh, gap, variants: [{ n, cost, hyphen: [bool per line] }] } for a
// paragraph, or { kind: 'box', height, gap, keep, rule } for anything else (`keep`: it mustn't
// end a page, like a heading; `rule`: a scene break). `gap` is the space above it, which goes at
// the top of a page. Heights are in the same units as `lead`, the body text's line height.

export const COSTS = {
  widow: 5000,
  orphan: 4000,
  shortPage: 800, // a page a line short of full (fine if the page facing it is too)
  uneven: 8000, // per line the two pages of a spread differ by
  hyphen: 300, // a page ending on a hyphen
  hyphenTurn: 1500, // ...on a recto, so the word goes over the leaf
  keep: 100000, // a heading at the foot of a page
  rule: 200, // a scene break at the head or foot of a page
  lastPage: 2500, // per line a chapter's last page has under `minLast`
  minLast: 4,
};
const MAX_EMPTY = 3; // a page can end this many lines short when that's the least bad option

// Binary heap of page starts, earliest first (`at` orders them).
function heap() {
  const a = [];
  const up = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].at <= a[i].at) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  };
  const down = (i) => {
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < a.length && a[l].at < a[m].at) m = l;
      if (r < a.length && a[r].at < a[m].at) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i], a[m]];
      i = m;
    }
  };
  return {
    get size() {
      return a.length;
    },
    push(x) {
      a.push(x);
      up(a.length - 1);
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        down(0);
      }
      return top;
    },
  };
}

// The cheapest way to page `blocks`: { pages: [{ rows, empty, flags }], variants, cost }, where
// each row is { block, variant, line, snap } for a paragraph's line (`snap`: space added above
// it to bring it back onto the grid) or { block } for anything else,
// `variants[i]` is the variant block i was set in, and `flags` lists what's wrong at the foot
// of that page ('widow', 'orphan', 'uneven', 'short', 'hyphen'). Null when something is too
// tall for a page.
//
// `capacity` is the depth of a page, `first` the depth left on the chapter's opening page under
// its sink, `recto` whether that page is a right-hand one.
export function paginate(blocks, { capacity, first, lead, recto, costs }) {
  const c = { ...COSTS, ...costs };
  const n = blocks.length;
  const eps = 0.5;
  const starts = new Map();
  const queue = heap();
  const relax = (st) => {
    const key = `${st.j}:${st.v}:${st.k}:${st.page % 2}:${st.prevEmpty}`;
    const had = starts.get(key);
    if (had && had.cost <= st.cost) return;
    starts.set(key, st);
    queue.push({ at: st.j * 1e5 + st.k, st, key });
  };
  relax({ j: 0, v: -1, k: 0, page: 0, prevEmpty: -1, cost: 0, back: null });
  let best = null;
  let tooTall = false;

  while (queue.size) {
    const { st: s, key } = queue.pop();
    if (starts.get(key) !== s || s.done) continue;
    s.done = true;
    const cap = s.page === 0 ? first : capacity;
    const isRecto = (s.page % 2 === 0) === recto;

    // Every way of filling this page, merged where they reach the same place at the same depth.
    const fills = [{ j: s.j, v: s.v, k: s.k, used: 0, vcost: 0, parent: null, row: null }];
    const seen = new Map();
    const add = (t) => {
      const k = `${t.j}:${t.v}:${t.k}:${Math.round(t.used * 4)}`;
      const had = seen.get(k);
      if (had) {
        if (!had.done && t.vcost < had.vcost) Object.assign(had, t);
        return;
      }
      seen.set(k, t);
      fills.push(t);
    };
    for (let q = 0; q < fills.length; q++) {
      const t = fills[q];
      t.done = true;
      if (t.row) endPage(s, t, cap, isRecto);
      if (t.j >= n) continue;
      const b = blocks[t.j];
      if (b.kind === 'box') {
        const h = (t.used > 0 ? b.gap : 0) + b.height;
        if (t.used + h > cap + eps) {
          if (t.used === 0 && s.page > 0) tooTall = true;
          continue;
        }
        add({ j: t.j + 1, v: -1, k: 0, used: t.used + h, vcost: t.vcost, parent: t, row: { block: t.j } });
        continue;
      }
      // Text after a heading or anything else goes back onto the grid of lines, so it lines up
      // with the page facing it: `snap` is the space that takes.
      let top = t.used + (t.k === 0 && t.used > 0 ? b.gap : 0);
      let snap = 0;
      if (t.k === 0 && t.row && blocks[t.row.block].kind === 'box') {
        const origin = s.page === 0 ? capacity - first : 0;
        snap = Math.max(0, Math.ceil((origin + top) / lead - 0.01) * lead - (origin + top));
        top += snap;
      }
      const used = top + b.lh;
      if (used > cap + eps) {
        if (t.used === 0 && s.page > 0) tooTall = true;
        continue;
      }
      for (const vi of t.k === 0 ? b.variants.keys() : [t.v]) {
        const nv = b.variants[vi];
        const done = t.k + 1 === nv.n;
        add({
          j: done ? t.j + 1 : t.j,
          v: done ? -1 : vi,
          k: done ? 0 : t.k + 1,
          used,
          vcost: t.vcost + (t.k === 0 ? nv.cost : 0),
          parent: t,
          row: { block: t.j, variant: vi, line: t.k, snap },
        });
      }
    }
    if (tooTall) return null;
  }
  if (!best) return null;

  // Walk back from the end to read off each page.
  const pages = [];
  const variants = blocks.map(() => -1);
  for (let at = best; at; at = at.s.back) {
    const rows = [];
    for (let t = at.t; t.row; t = t.parent) rows.unshift(t.row);
    for (const r of rows) if (r.variant !== undefined) variants[r.block] = r.variant;
    pages.unshift({ rows, empty: at.empty, flags: at.flags });
  }
  return { pages, variants, cost: best.cost };

  function endPage(s, t, cap, isRecto) {
    let cost = s.cost + t.vcost;
    if (t.j >= n) {
      const lines = Math.round(t.used / lead);
      if (s.page > 0 && lines < c.minLast) cost += c.lastPage * (c.minLast - lines);
      if (!best || cost < best.cost) best = { cost, s, t, empty: 0, flags: [] };
      return;
    }
    const empty = Math.floor((cap - t.used) / lead + 0.01);
    const next = blocks[t.j];
    const nextTooBig = t.k === 0 && next.kind === 'box' && t.used + next.gap + next.height > cap + eps;
    if (empty > MAX_EMPTY && !nextTooBig) return;
    const flags = [];
    if (empty > 0 && !nextTooBig) {
      cost += c.shortPage + 4000 * (empty - 1) ** 2;
      flags.push('short');
    }
    const b = blocks[t.row.block];
    if (b.kind === 'lines' && t.k > 0) {
      const nv = b.variants[t.v];
      if (t.k === 1) {
        cost += c.orphan;
        flags.push('orphan');
      }
      if (nv.n - t.k === 1) {
        cost += c.widow;
        flags.push('widow');
      }
      if (nv.hyphen[t.k - 1]) {
        cost += isRecto ? c.hyphenTurn : c.hyphen;
        flags.push('hyphen');
      }
    }
    if (b.kind === 'box' && b.keep) cost += c.keep;
    if (b.rule) cost += c.rule;
    if (t.k === 0 && next.rule) cost += c.rule;
    if (isRecto && s.prevEmpty >= 0 && empty !== s.prevEmpty) {
      cost += c.uneven * Math.abs(empty - s.prevEmpty);
      flags.push('uneven');
    }
    relax({ j: t.j, v: t.v, k: t.k, page: s.page + 1, prevEmpty: isRecto ? -1 : empty, cost, back: { s, t, empty, flags } });
  }
}
