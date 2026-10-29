// Breaking a paragraph into lines the way TeX does (Knuth and Plass, "Breaking Paragraphs into
// Lines", 1981). A browser fills each line as full as it'll go and then stretches its spaces, so
// one line can come out tight and the next one gappy. This weighs every way of breaking the
// whole paragraph and picks the one whose word spacing stays most even, which is also what keeps
// rivers of white from running down a justified page.
//
// A paragraph is a list of items: boxes (a word or piece of one, which can't stretch), glue (a
// space, which can stretch and shrink) and penalties (places to break that aren't spaces, like a
// hyphenation point, with a cost and, for a hyphen, the hyphen's width). It ends with
// paragraphEnd(): glue that can stretch as far as it likes, so the last line sets loose.

export const INFINITY = 10000; // a penalty this big forbids the break; minus this forces it
const FIL = 1e6; // stretch that makes everything else's look like nothing

export const box = (width, at) => ({ type: 'box', width, at });
export const glue = (width, stretch, shrink, at) => ({ type: 'glue', width, stretch, shrink, at });
export const penalty = (width, cost, flagged, at) => ({ type: 'penalty', width, cost, flagged, at });
// The end of a paragraph, or of a line that ends early (a <br>), at character `at`.
export const paragraphEnd = (at) => [penalty(0, INFINITY, false, at), glue(0, FIL, 0, at), penalty(0, -INFINITY, false, at)];

const DEFAULTS = {
  linePenalty: 10,
  hyphenDemerits: 3000, // two hyphenated lines in a row
  finalHyphenDemerits: 5000, // a hyphen on the line before the last
  fitnessDemerits: 3000, // a loose line next to a tight one
};

// How a line's spacing compares with its natural spacing: 0 tight, 1 decent, 2 loose, 3 very loose.
const fitness = (r) => (r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3);

const forcedBreak = (it) => it.type === 'penalty' && it.cost <= -INFINITY;

// The first item of a line that starts after a break at `b`: spaces and penalties at a break go.
function startAfter(items, b) {
  let i = b + 1;
  while (i < items.length && items[i].type !== 'box' && !forcedBreak(items[i])) i++;
  return i;
}

// The best way to break `items` into lines `width` wide, for every number of lines that can be
// set within `tolerance` (how far a line's spaces may stretch, as a multiple of their stretch):
// Map(lines → { breaks, ratios, demerits }), where breaks[i] is the item line i ends at and
// ratios[i] how far it stretched (negative when it shrank). Empty when no breaking fits.
//
// `forbid` is a Set of item indexes not to break at. `runt` ({ width, demerits }) is for a last
// line narrower than `width`. `emergencyStretch` is extra stretch every line gets, for a last try.
export function breakLines(items, width, { tolerance = 1.26, forbid, runt, emergencyStretch = 0, ...rest } = {}) {
  const o = { ...DEFAULTS, ...rest };
  const n = items.length;
  // Running totals before each item, so a line's width, stretch and shrink are differences.
  const sumW = new Float64Array(n + 1);
  const sumY = new Float64Array(n + 1);
  const sumZ = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    sumW[i + 1] = sumW[i] + (it.type === 'penalty' ? 0 : it.width);
    sumY[i + 1] = sumY[i] + (it.type === 'glue' ? it.stretch : 0);
    sumZ[i + 1] = sumZ[i] + (it.type === 'glue' ? it.shrink : 0);
  }
  const breakable = (i) => {
    const it = items[i];
    if (forbid?.has(i) && !forcedBreak(it)) return false;
    if (it.type === 'penalty') return it.cost < INFINITY;
    return it.type === 'glue' && i > 0 && items[i - 1].type === 'box';
  };

  let active = [{ pos: -1, start: startAfter(items, -1), line: 0, fit: 1, demerits: 0, flagged: false, prev: null, ratio: 0 }];
  for (let i = 0; i < n && active.length; i++) {
    if (!breakable(i)) continue;
    const it = items[i];
    const cost = it.type === 'penalty' ? it.cost : 0;
    const forced = cost <= -INFINITY;
    const last = i === n - 1;
    const flagged = it.type === 'penalty' && it.flagged;
    const best = new Map(); // `${line}:${fit}` → the best node ending a line here
    const keep = [];
    for (const a of active) {
      const natural = sumW[i] - sumW[a.start] + (it.type === 'penalty' ? it.width : 0);
      let r = 0;
      if (natural < width) {
        const y = sumY[i] - sumY[a.start] + emergencyStretch;
        r = y > 0 ? (width - natural) / y : INFINITY;
      } else if (natural > width) {
        const z = sumZ[i] - sumZ[a.start];
        r = z > 0 ? (width - natural) / z : -INFINITY;
      }
      if (r >= -1 && !forced) keep.push(a); // a longer line from `a` could still fit
      if (r < -1 || r > tolerance) continue;
      let d = (o.linePenalty + 100 * Math.abs(r) ** 3) ** 2;
      if (cost > 0) d += cost * cost;
      else if (cost > -INFINITY) d -= cost * cost;
      if (flagged && a.flagged) d += o.hyphenDemerits;
      const fit = fitness(r);
      if (Math.abs(fit - a.fit) > 1) d += o.fitnessDemerits;
      if (last && a.flagged) d += o.finalHyphenDemerits;
      if (last && runt && natural < runt.width) d += runt.demerits;
      const key = `${a.line + 1}:${fit}`;
      const total = a.demerits + d;
      const had = best.get(key);
      if (!had || total < had.demerits) best.set(key, { pos: i, line: a.line + 1, fit, demerits: total, flagged, prev: a, ratio: r });
    }
    active = keep;
    if (best.size) {
      const start = startAfter(items, i);
      for (const b of best.values()) active.push({ ...b, start });
    }
  }

  const out = new Map();
  for (const a of active) {
    if (a.pos !== n - 1) continue;
    const had = out.get(a.line);
    if (had && had.demerits <= a.demerits) continue;
    const breaks = [];
    const ratios = [];
    for (let b = a; b.prev; b = b.prev) {
      breaks.unshift(b.pos);
      ratios.unshift(b.ratio);
    }
    out.set(a.line, { breaks, ratios, demerits: a.demerits });
  }
  return out;
}

// Each line's first item, given where the lines end.
export function lineStarts(items, breaks) {
  return breaks.map((_, i) => startAfter(items, i ? breaks[i - 1] : -1));
}
