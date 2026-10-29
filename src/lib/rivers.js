// Rivers: the spaces between words lining up from one line to the next, so a channel of white
// runs down through a justified paragraph. Wide spaces make them, but so does plain bad luck,
// which is why even good line breaking needs checking.
//
// Each line is the list of its word spaces as [left, right] in the same units as `space`, the
// width of a normal word space. A space joins the one below it when they overlap by at least
// `overlap` spaces; a river is a run of joined spaces down `minLines` lines or more.

// [{ line, lines, score, path }] for each river, where `line` is the first line it touches,
// `path` the [line, space] pairs it runs through, and `score` grows with how long it runs and
// how wide its spaces are.
export function findRivers(lines, { space, overlap = 0.4, minLines = 4 }) {
  const min = overlap * space;
  const chains = []; // per line, per space: { len, score, line, from }
  const ends = [];
  lines.forEach((gaps, li) => {
    const above = lines[li - 1] || [];
    const prev = chains[li - 1] || [];
    const cur = gaps.map(([l, r]) => {
      let best = null;
      above.forEach(([al, ar], k) => {
        const o = Math.min(r, ar) - Math.max(l, al);
        if (o < min) return;
        const c = prev[k];
        const score = c.score + o / space;
        if (!best || c.len + 1 > best.len || (c.len + 1 === best.len && score > best.score)) best = { len: c.len + 1, score, line: c.line, from: k };
      });
      return best || { len: 1, score: 0, line: li, from: -1 };
    });
    // A river ends where no space on this line carries it on.
    const carried = new Set(cur.filter((c) => c.from >= 0).map((c) => c.from));
    prev.forEach((c, k) => !carried.has(k) && c.len >= minLines && ends.push([li - 1, k]));
    chains.push(cur);
  });
  (chains[chains.length - 1] || []).forEach((c, k) => c.len >= minLines && ends.push([lines.length - 1, k]));
  return ends.map(([li, k]) => {
    const c = chains[li][k];
    const path = [];
    for (let l = li, g = k; g >= 0 && l >= 0; g = chains[l][g].from, l--) path.unshift([l, g]);
    return { line: c.line, lines: c.len, score: c.score, path };
  });
}

export const riverScore = (rivers) => rivers.reduce((s, r) => s + r.score, 0);

// Where each line's spaces fall once `adjust` (per line, per space) is added to their widths.
const adjusted = (lines, adjust) =>
  lines.map((gaps, li) => {
    let shift = 0;
    return gaps.map(([l, r], j) => {
      const a = adjust[li][j];
      const g = [l + shift, r + shift + a];
      shift += a;
      return g;
    });
  });

// Break up rivers that re-breaking the paragraph couldn't, by evening out a line's spaces a
// little differently: narrowing a space a river runs through, or sliding it left or right by
// taking from the spaces on one side and giving to the other. Each line keeps its width (its
// adjustments sum to zero) and no space changes by more than `limit`. Returns { adjust, rivers }:
// adjust[line][space] is what to add to that space.
export function smoothRivers(lines, { space, limit = 0.25 * space, rounds = 4 }) {
  const adjust = lines.map((gaps) => gaps.map(() => 0));
  const score = () => riverScore(findRivers(adjusted(lines, adjust), { space }));
  let best = score();
  const steps = [0.5 * limit, limit];
  for (let round = 0; round < rounds && best > 0; round++) {
    const before = best;
    for (const river of findRivers(adjusted(lines, adjust), { space })) {
      for (const [li, g] of river.path) {
        const n = lines[li].length;
        const row = adjust[li];
        const tries = [];
        for (const d of steps) {
          // Narrow this space, widening the rest.
          if (n > 1) tries.push(row.map((a, j) => a + (j === g ? -d : d / (n - 1))));
          // Slide it left (the spaces before it narrow) or right.
          if (g > 0 && g < n - 1) {
            const left = (s) => row.map((a, j) => a + (j < g ? (-s * d) / g : j > g ? (s * d) / (n - 1 - g) : 0));
            tries.push(left(1), left(-1));
          }
        }
        let pick = null;
        for (const t of tries) {
          if (t.some((a) => Math.abs(a) > limit + 1e-9)) continue;
          adjust[li] = t;
          const s = score();
          if (s < best - 1e-9) {
            best = s;
            pick = t;
          }
        }
        adjust[li] = pick || row;
      }
    }
    if (best >= before) break;
  }
  return { adjust, rivers: findRivers(adjusted(lines, adjust), { space }) };
}
