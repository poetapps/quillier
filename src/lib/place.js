// Place postcards. A postcard is a small recipe of named layers ({ feature: 'cabin', time: 'dusk', … }),
// drawn here as a flat 3:2 scene with the same hand-drawn wobble as the portraits. Layers are stored
// by name, so redrawing one updates every place that uses it.

const INK = '#2A2421';
const GLASS = '#A9BDC9';
const LIT = '#F4CB6C';
const SKY = {
  dawn: ['#E3CFDC', '#F6DBC0'],
  day: ['#BDD5E6', '#DCE8EF'],
  dusk: ['#A797BF', '#EFB592'],
  night: ['#29304D', '#3C4568'],
};
const SEASON = {
  spring: { grass: '#A3C482', far: '#BCD3A2', leaf: '#86B46A', bloom: '#F3C9D2' },
  summer: { grass: '#8DAE68', far: '#A8C28B', leaf: '#6A9150' },
  autumn: { grass: '#B4AC6C', far: '#C8BA86', leaf: '#CD8942', leaf2: '#B4613B' },
  winter: { grass: '#ECEFF2', far: '#DCE3E9', leaf: '#5E7A62', bare: true },
};

// In the order the editor shows them. `labels` names the options whose key doesn't read well.
export const PLACE_PARTS = [
  {
    key: 'feature',
    label: 'Main feature',
    options: ['cottage', 'cabin', 'farm', 'townhouses', 'apartments', 'tavern', 'church', 'castle', 'lighthouse', 'ruins', 'none'],
    labels: { farm: 'Farmhouse', townhouses: 'Row houses', tavern: 'Inn or shop', none: 'Nothing' },
  },
  { key: 'backdrop', label: 'Backdrop', options: ['hills', 'mountains', 'forest', 'fields', 'city', 'sea', 'dunes', 'none'], labels: { city: 'City skyline', none: 'Open land' } },
  { key: 'ground', label: 'Ground', options: ['grass', 'path', 'road', 'cobbles', 'shore', 'sand', 'snow'], labels: { path: 'Dirt path' } },
  { key: 'time', label: 'Time of day', options: ['dawn', 'day', 'dusk', 'night'] },
  { key: 'weather', label: 'Weather', options: ['clear', 'clouds', 'rain', 'snow', 'fog'] },
  { key: 'season', label: 'Season', options: ['spring', 'summer', 'autumn', 'winter'] },
];

export const PLACE_EXTRAS = [
  { key: 'tree', label: 'Tree' },
  { key: 'lamp', label: 'Street lamp' },
  { key: 'fence', label: 'Fence' },
  { key: 'smoke', label: 'Chimney smoke' },
  { key: 'birds', label: 'Birds' },
  { key: 'lit', label: 'Lights on' },
];

const DEFAULT_PLACE = {
  v: 1,
  feature: 'cottage',
  backdrop: 'hills',
  ground: 'grass',
  time: 'day',
  weather: 'clear',
  season: 'summer',
  tree: false,
  lamp: false,
  fence: false,
  smoke: false,
  birds: false,
  lit: false,
};

const CHIMNEYS = { cottage: [86.5, 44], cabin: [87, 46], tavern: [88.5, 30] };
export const hasChimney = (place) => !!CHIMNEYS[place.feature];

// Keep whatever is still a valid layer; anything renamed or removed falls back to the default.
export function normalizePlace(p) {
  if (!p || typeof p !== 'object') return null;
  const out = { ...DEFAULT_PLACE };
  for (const part of PLACE_PARTS) if (part.options.includes(p[part.key])) out[part.key] = p[part.key];
  for (const x of PLACE_EXTRAS) out[x.key] = p[x.key] === true;
  return out;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Ready-made postcards whose layers go together, tagged with the kinds of place they suit.
// New postcards and Shuffle pick from these, so a place starts from something believable.
const PRESETS = [
  { kinds: ['city'], place: { feature: 'apartments', backdrop: 'city', ground: 'road', time: 'night', season: 'summer', lamp: true, lit: true } },
  { kinds: ['city'], place: { feature: 'apartments', backdrop: 'city', ground: 'road', weather: 'rain', season: 'spring', lamp: true } },
  { kinds: ['town'], place: { feature: 'townhouses', backdrop: 'hills', ground: 'cobbles', weather: 'rain', season: 'spring', lamp: true } },
  { kinds: ['town', 'city'], place: { feature: 'townhouses', backdrop: 'hills', ground: 'cobbles', weather: 'clouds', season: 'summer', lamp: true, birds: true } },
  { kinds: ['town', 'building'], place: { feature: 'tavern', backdrop: 'forest', ground: 'cobbles', time: 'dusk', season: 'autumn', lamp: true, lit: true, smoke: true } },
  { kinds: ['building'], place: { feature: 'castle', backdrop: 'hills', ground: 'path', weather: 'clouds', season: 'summer', birds: true } },
  { kinds: ['building', 'town'], place: { feature: 'church', backdrop: 'hills', ground: 'grass', time: 'dawn', season: 'spring', tree: true, fence: true, birds: true } },
  { kinds: ['building', 'coast'], place: { feature: 'lighthouse', backdrop: 'sea', ground: 'shore', weather: 'fog', season: 'autumn', birds: true } },
  { kinds: ['coast', 'building'], place: { feature: 'lighthouse', backdrop: 'sea', ground: 'shore', time: 'night', season: 'summer', lit: true } },
  { kinds: ['home', 'countryside'], place: { feature: 'cottage', backdrop: 'hills', ground: 'path', weather: 'clouds', season: 'summer', tree: true, smoke: true, birds: true } },
  { kinds: ['home', 'wilderness'], place: { feature: 'cabin', backdrop: 'mountains', ground: 'snow', time: 'dusk', weather: 'snow', season: 'winter', tree: true, smoke: true, lit: true } },
  { kinds: ['home', 'countryside'], place: { feature: 'farm', backdrop: 'fields', ground: 'path', weather: 'clouds', season: 'autumn', tree: true, fence: true } },
  { kinds: ['countryside'], place: { feature: 'none', backdrop: 'fields', ground: 'path', time: 'dawn', season: 'summer', tree: true, fence: true, birds: true } },
  { kinds: ['wilderness'], place: { feature: 'none', backdrop: 'forest', ground: 'path', season: 'spring', tree: true, birds: true } },
  { kinds: ['wilderness'], place: { feature: 'ruins', backdrop: 'dunes', ground: 'sand', season: 'summer', birds: true } },
  { kinds: ['wilderness'], place: { feature: 'none', backdrop: 'mountains', ground: 'grass', weather: 'clouds', season: 'autumn', birds: true } },
  { kinds: ['coast'], place: { feature: 'none', backdrop: 'sea', ground: 'shore', season: 'summer', birds: true } },
];

// Until there are rooms to draw, a room is shown as the building it's in, with the lights on.
const KIND_LOOK = { room: ['home', 'building', 'town'] };

// A preset that suits the place's kind (when set), other than the postcard it has now.
export function presetPlace(entry, current) {
  const looks = KIND_LOOK[entry.kind] || (entry.kind ? [entry.kind] : null);
  const fits = (p) => !looks || p.kinds.some((k) => looks.includes(k));
  const same = (p) => current && Object.entries(p.place).every(([k, v]) => current[k] === v);
  const pools = [PRESETS.filter(fits), PRESETS];
  const pool = pools.find((list) => list.some((p) => !same(p)));
  const chosen = pick(pool.filter((p) => !same(p)));
  return { ...DEFAULT_PLACE, ...chosen.place, ...(entry.kind === 'room' ? { lit: true } : {}) };
}

// ---------- drawing ----------

const hx = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (h, k) => toHex(hx(h).map((v) => v * k));
const mix = (a, b, t) => {
  const A = hx(a);
  const B = hx(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};

// The whole postcard as an SVG string on a 150×100 canvas. `id` keeps the filter id unique on the
// page; `detail` adds the wobble and fine texture, which are only worth it at larger sizes.
export function placeSvg(place, { id = 'place', detail = true } = {}) {
  const p = normalizePlace(place) || DEFAULT_PLACE;
  const s = SEASON[p.season];
  const night = p.time === 'night';
  const dim = night || p.time === 'dusk';
  const winter = !!s.bare;
  const clear = !['rain', 'fog', 'snow'].includes(p.weather);
  const lights = [];

  const b = (d, fill, w = 1.1, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"${extra}/>`;
  const r = (x, y, w, h, fill, rx = 0, sw = 1.1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
  const line = (d, w = 0.8, op = 1, c = INK) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const fine = (svg) => (detail ? svg : '');
  // Overlapping circles with one outline around the group: a thick outline under, the fills over.
  const blob = (list, fill, w = 2.4) =>
    list.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${fill}" stroke="${INK}" stroke-width="${w}"/>`).join('') +
    list.map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="${fill}"/>`).join('');
  // Lit windows are drawn again over the dusk and night tint, so they glow through it.
  const win = (x, y, w, h, bars = true) => {
    const pane = r(x, y, w, h, p.lit ? LIT : GLASS, 0.4, 0.8) + (bars ? fine(line(`M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}`, 0.5, 0.55)) : '');
    if (p.lit && dim) lights.push(pane + `<rect x="${x - 1.5}" y="${y - 1.5}" width="${w + 3}" height="${h + 3}" rx="2" fill="${LIT}" fill-opacity=".22"/>`);
    return pane;
  };
  const snowRoof = (d) => (winter ? line(d, 2.4, 1, '#F7F9FA') : '');

  // ---------- sky ----------
  const gray = { rain: 0.5, fog: 0.45, snow: 0.3, clouds: 0.12 }[p.weather] || 0;
  const [hi0, lo0] = SKY[p.time];
  const hi = gray ? mix(hi0, night ? '#30343F' : '#B8BEC4', gray) : hi0;
  const lo = gray ? mix(lo0, night ? '#3A3E4A' : '#C9CDD0', gray) : lo0;
  const sky =
    `<rect width="150" height="100" fill="${hi}"/>` +
    `<path d="M0 26 C40 23 100 29 150 25 V100 H0Z" fill="${mix(hi, lo, 0.5)}"/>` +
    `<path d="M0 42 C50 39 90 44 150 41 V100 H0Z" fill="${lo}"/>`;

  let back = '';
  const sun = { day: [125, 22, 7, '#F6E2A0'], dawn: [40, 53, 8, '#F8D49C'], dusk: [112, 54, 9, '#F2A574'] }[p.time];
  if (clear && sun) back += `<circle cx="${sun[0]}" cy="${sun[1]}" r="${sun[2]}" fill="${sun[3]}" stroke="${INK}" stroke-width=".9"/>`;
  if (p.weather !== 'clear') {
    const cf = night ? '#4C5372' : p.weather === 'rain' ? '#9EA6AE' : '#F5F4F0';
    back += blob([[28, 22, 6], [36, 18, 8], [45, 22, 6], [36, 24, 6]], cf);
    back += blob([[86, 16, 5], [93, 13, 6.5], [100, 17, 5]], cf);
    if (p.weather === 'rain' || p.weather === 'snow') back += blob([[60, 10, 6], [69, 7, 8], [78, 11, 6]], cf);
  }

  // ---------- backdrop (horizon around y=64) ----------
  const BACK = {
    hills: () =>
      b('M-2 58 C22 47 44 49 68 56 C92 62 118 45 152 51 V80 H-2Z', s.far) + b('M-2 66 C28 58 58 62 88 66 C112 69 134 59 152 61 V80 H-2Z', mix(s.grass, s.far, 0.5)),
    mountains: () =>
      b('M-2 64 L18 41 L28 49 L46 24 L62 44 L74 36 L92 58 L104 46 L121 29 L137 45 L152 38 V70 H-2Z', winter ? '#AEB9C6' : '#97A4B4') +
      b('M40.5 31.5 L46 24 L52 32 L49 34.5 L46 31 L43 34.5Z', '#F5F7F9', 0.8) +
      b('M115.5 36.5 L121 29 L127 38 L124 39.5 L121 36 L118 39.5Z', '#F5F7F9', 0.8) +
      b('M-2 68 C30 60 60 63 90 67 C115 70 135 62 152 64 V80 H-2Z', s.far),
    forest: () => {
      const pine = (x, base, h, fill) => {
        const w = h * 0.62;
        return b(`M${x} ${base - h} L${x + w * 0.42} ${base - h * 0.42} L${x + w * 0.22} ${base - h * 0.42} L${x + w * 0.5} ${base} L${x - w * 0.5} ${base} L${x - w * 0.22} ${base - h * 0.42} L${x - w * 0.42} ${base - h * 0.42}Z`, fill, 1);
      };
      const ever = winter ? '#557060' : '#5B7B56';
      const far = mix(ever, lo, 0.4);
      let out = '';
      for (let x = -4; x < 156; x += 9) out += pine(x, 66, 18 + ((x * 7) % 9), far);
      for (let i = 0, x = 2; x < 156; x += 12, i++) {
        if (s.bare || i % 2 === 0) out += pine(x, 72, 22 + ((x * 5) % 7), ever) + (winter ? line(`M${x - 2} 54 L${x} 51 L${x + 2} 54`, 1.6, 1, '#F7F9FA') : '');
        else out += blob([[x, 60, 6], [x - 4, 64, 5], [x + 4, 64, 5]], i % 4 === 1 ? s.leaf : s.leaf2 || s.leaf, 2) + `<path d="M${x} 68 V72" stroke="${INK}" stroke-width="1.6"/>`;
      }
      return out + b('M-2 71 C40 69 110 69 152 71 V80 H-2Z', s.far, 0.9);
    },
    city: () => {
      const towers = [[-2, 14, 22], [12, 10, 32], [22, 16, 18], [38, 12, 40], [50, 14, 26], [64, 10, 34], [74, 18, 20], [92, 12, 44], [104, 14, 28], [118, 10, 36], [128, 16, 24], [144, 10, 30]];
      let out = '';
      towers.forEach(([x, w, h], i) => {
        const top = 68 - h;
        out += r(x, top, w, h + 4, i % 2 ? '#B4BCC6' : '#A3ADB9', 0, 0.9);
        if (!detail) return;
        for (let yy = top + 3; yy < 64; yy += 4)
          for (let xx = x + 2; xx < x + w - 2; xx += 3.2) {
            const on = night && (xx * 3 + yy * 7) % 5 < 2;
            const dot = `<rect x="${xx}" y="${yy}" width="1.4" height="1.8" fill="${on ? LIT : '#8D97A4'}" fill-opacity="${on ? 1 : 0.6}"/>`;
            if (on) lights.push(dot);
            else out += dot;
          }
      });
      return out + line('M98 24 V18', 0.9);
    },
    sea: () => {
      let out = b('M-2 60 H152 V82 H-2Z', '#86A9BD', 1);
      out += fine([[14, 64], [40, 67], [62, 63], [96, 66], [124, 63], [138, 69], [24, 72]].map(([x, y]) => line(`M${x} ${y} q2 -1.4 4 0 q2 1.4 4 0`, 0.7, 0.6, '#E9F1F5')).join(''));
      if (clear && (p.time === 'dusk' || p.time === 'dawn')) {
        const sx = sun[0];
        out += [[62, 10], [65, 7], [68, 5]].map(([y, w]) => line(`M${sx - w / 2} ${y} H${sx + w / 2}`, 1.2, 0.9, '#F6C79C')).join('');
      }
      return out;
    },
    dunes: () =>
      b('M-2 64 C20 53 40 53 62 62 C80 56 100 50 124 58 C136 54 146 54 152 56 V80 H-2Z', '#D8B37C') +
      b('M-2 70 C30 64 52 66 76 70 C100 66 126 63 152 67 V80 H-2Z', '#E5C78F') +
      fine(line('M62 62 C70 60 78 59 84 60', 0.6, 0.5) + line('M110 54 C116 55 120 57 124 58', 0.6, 0.5)),
    fields: () => {
      const rows = [[62, '#C9BB72'], [65.5, s.far], [69.5, winter ? '#E2E7EC' : '#B9A66A'], [74, s.grass]];
      let out = b('M-2 62 H152 V80 H-2Z', s.far, 1);
      for (const [y, c] of rows) out += `<path d="M-2 ${y} C50 ${y - 1} 100 ${y + 1} 152 ${y} V80 H-2Z" fill="${c}"/>` + line(`M-2 ${y} C50 ${y - 1} 100 ${y + 1} 152 ${y}`, 0.6, 0.6);
      return out + fine(line('M30 62 L18 80 M60 62 L56 80 M98 62 L104 80 M128 62 L140 80', 0.5, 0.35));
    },
    none: () => b('M-2 64 C40 63 110 65 152 64 V80 H-2Z', s.far, 1),
  };

  // ---------- ground (from y=76 to the bottom edge) ----------
  const groundTop = 'M-2 77 C40 75 110 75 152 77 V102 H-2Z';
  const tufts = () =>
    winter ? '' : fine([[12, 90], [34, 96], [52, 86], [104, 92], [126, 85], [140, 97]].map(([x, y]) => line(`M${x - 1.5} ${y} l1 -2.2 M${x} ${y} l0 -2.8 M${x + 1.5} ${y} l-1 -2.2`, 0.6, 0.5, shade(s.grass, 0.7))).join(''));
  const GROUND = {
    grass: () => b(groundTop, s.grass) + tufts(),
    path: () => b(groundTop, s.grass) + b('M71 78 C67 84 58 88 56 92 C54 96 57 100 59 102 L93 102 C89 98 83 94 83 90 C83 86 80.5 82 79 78Z', winter ? '#E2E3E2' : '#C9A87C') + tufts(),
    road: () =>
      b(groundTop, s.grass) + b('M68 76.5 L82 76.5 L120 102 L30 102Z', '#8E8B87') + `<path d="M75 79 L75 101" stroke="#EFE8D8" stroke-width="1" stroke-dasharray="3 3.5"/>`,
    cobbles: () => {
      let out = b(groundTop, '#BBB1A4');
      if (detail)
        for (let row = 0, y = 80; y < 101; y += 3.6, row++)
          for (let x = -2 + (row % 2) * 2.5; x < 152; x += 5) out += `<rect x="${x}" y="${y}" width="4" height="2.6" rx="1.2" fill="none" stroke="${INK}" stroke-width=".4" stroke-opacity=".35"/>`;
      return out;
    },
    shore: () => b(groundTop, '#E7D3A8') + line('M-2 77.6 C40 75.6 110 75.6 152 77.6', 1.4, 0.8, '#FFFFFF') + fine(line('M20 88 q3 -1 6 0 M110 94 q3 -1 6 0', 0.6, 0.5)),
    sand: () => b(groundTop, '#E2C48E') + fine(line('M10 86 C30 84 50 86 70 85 M80 93 C100 91 120 93 145 91', 0.6, 0.45)),
    snow: () => b(groundTop, '#EEF2F5') + `<path d="M8 90 C30 86 50 92 70 89 C60 95 30 96 8 90Z M96 86 C116 83 136 87 146 85 C136 92 112 92 96 86Z" fill="#D9E2EB"/>`,
  };

  // ---------- main feature (centred on x=75, standing on y=80) ----------
  const FEATURE = {
    cottage: () =>
      r(84, 44, 5, 12, '#8C7A6E') +
      r(56, 60, 38, 20, '#EADFC9') +
      b('M51 61.5 L75 42 L99 61.5Z', '#9E5A44') +
      snowRoof('M53 60 L75 43 L97 60') +
      r(71.5, 68, 7, 12, '#6E4B3A', 1) +
      win(60, 65, 7, 6) +
      win(83, 65, 7, 6),
    cabin: () => {
      let logs = '';
      if (detail) for (let yy = 65; yy < 80; yy += 3) logs += line(`M57 ${yy} H93`, 0.5, 0.45);
      return (
        r(84, 46, 6, 16, '#8F8A84') +
        r(57, 62, 36, 18, '#9A6A45') +
        logs +
        b('M52 63.5 L75 44 L98 63.5Z', '#4E5B4B') +
        snowRoof('M54 62 L75 45 L96 62') +
        r(70.5, 68, 8, 12, '#5C3D2C', 0.8) +
        win(60, 67, 7, 6) +
        win(83, 67, 7, 6)
      );
    },
    farm: () =>
      r(98, 46, 11, 34, '#BDB7AC') +
      fine(line('M98 56 H109 M98 66 H109', 0.6, 0.5)) +
      b('M98 46 C98 39 109 39 109 46Z', '#7D8A94') +
      b('M53 80 V58 L57 48.5 L75 41 L93 48.5 L97 58 V80Z', '#A8493E') +
      line('M51 59.5 L55.6 48 L75 39.6 L94.4 48 L99 59.5', 3, 1, '#4A332F') +
      snowRoof('M51.5 58.6 L55.9 47.6 L75 39.3 L94.1 47.6 L98.5 58.6') +
      r(71.5, 48, 7, 6, '#3E2A26', 0.4, 0.9) +
      r(66, 64, 18, 16, '#A8493E') +
      line('M66.6 64.6 L83.4 79.4 M83.4 64.6 L66.6 79.4 M66.6 64.6 H83.4 V79.4 H66.6Z', 1, 1, '#F2EADC') +
      win(57, 63, 5, 5, false) +
      win(88, 63, 5, 5, false),
    townhouses: () => {
      let out = '';
      [[50, 17, 32, '#C98F6B'], [67, 16, 38, '#E4D5B6'], [83, 17, 28, '#9DB2AA']].forEach(([x, w, h, c], i) => {
        const t = 80 - h;
        const stepped = i === 1;
        const top = stepped ? `V${t} H${x + 3} V${t - 3} H${x + 5.5} V${t - 6} H${x + w - 5.5} V${t - 3} H${x + w - 3} V${t}` : `V${t} L${x + w / 2} ${t - 8} L${x + w} ${t}`;
        out += b(`M${x} 80 ${top} V80Z`, c);
        out += snowRoof(stepped ? `M${x + 5.5} ${t - 6.4} H${x + w - 5.5}` : `M${x + 1} ${t - 0.6} L${x + w / 2} ${t - 7.6} L${x + w - 1} ${t - 0.6}`);
        for (let yy = t + 4; yy < 68; yy += 9) out += win(x + 2.8, yy, 4.4, 5.4) + win(x + w - 7.2, yy, 4.4, 5.4);
        out += r(x + w / 2 - 2.6, 71, 5.2, 9, '#5E4A40', 1);
      });
      return out;
    },
    apartments: () => {
      let out = r(40, 54, 20, 26, '#B8AA9B');
      for (let yy = 58; yy < 74; yy += 7) out += win(43.5, yy, 4.5, 4.5, false) + win(51.5, yy, 4.5, 4.5, false);
      out += r(92, 46, 17, 34, '#A9B3B9');
      for (let yy = 50; yy < 74; yy += 7) out += win(95.5, yy, 4.5, 4.5, false) + win(102, yy, 4.5, 4.5, false);
      out += line('M82 30 V22 M88 30 V22', 0.8) + r(80, 16, 10, 7, '#8C7A6E', 0.8, 0.9) + b('M79.5 16.5 L85 12 L90.5 16.5Z', '#6E5E58', 0.9);
      out += r(59, 30, 34, 50, '#C7A48A') + r(58, 28.5, 36, 2.5, '#A98A72', 0, 0.9);
      for (let yy = 34; yy < 68; yy += 7) for (const x of [63, 73.5, 84]) out += win(x, yy, 5, 4.6, false);
      return out + r(72, 71, 8, 9, '#5E4A40', 0.6);
    },
    tavern: () =>
      r(86, 30, 5, 10, '#8C7A6E') +
      r(54, 46, 42, 34, '#DDCEAF') +
      b('M50 47 L60 36 L90 36 L100 47Z', '#5D4B45') +
      snowRoof('M52 46 L60.5 37 L89.5 37 L98 46') +
      fine(line('M54 62 H96', 0.9, 0.8) + line('M54 46 L62 62 M96 46 L88 62', 0.7, 0.45)) +
      win(59, 51, 7, 6) +
      win(71.5, 51, 7, 6) +
      win(84, 51, 7, 6) +
      win(57, 69, 15, 8, false) +
      b('M55.5 63.5 H73.5 L75.5 68 H53.5Z', '#8A3F48', 0.9) +
      fine([0, 1, 2, 3].map((i) => `<path d="M${57.6 + i * 4.4} 63.5 h2.2 l.5 4.5 h-2.4Z" fill="#F0E6D4"/>`).join('')) +
      r(78, 67, 8, 13, '#6E4B3A', 1) +
      line('M96 53 H104.5', 1) +
      line('M99 53 V56 M104 53 V56', 0.5) +
      r(97.5, 56, 8, 6, '#C9A06A', 0.8, 0.9),
    church: () =>
      r(68, 60, 30, 20, '#E7DFD1') +
      b('M65 61 L83 47 L101 61Z', '#6E5E58') +
      snowRoof('M67 59.6 L83 48 L99 59.6') +
      r(52, 44, 16, 36, '#E7DFD1') +
      b('M50.5 44.5 L60 20 L69.5 44.5Z', '#5E6F80') +
      snowRoof('M52.5 43.6 L60 23 L67.5 43.6') +
      line('M60 20 V13.5 M57.6 16 H62.4', 0.9) +
      b('M56.5 80 V72.5 C56.5 67.5 63.5 67.5 63.5 72.5 V80Z', '#6E4B3A') +
      `<circle cx="60" cy="53" r="3" fill="${p.lit ? LIT : GLASS}" stroke="${INK}" stroke-width=".8"/>` +
      win(74, 66, 4, 8) +
      win(86, 66, 4, 8),
    castle: () => {
      let out = r(59, 50, 32, 30, '#C3BAAD');
      for (let x = 59; x < 91; x += 6.4) out += r(x, 45.5, 3.6, 5, '#C3BAAD', 0, 0.9);
      out += b('M70 80 V71 C70 64.5 80 64.5 80 71 V80Z', '#5A463A') + win(66, 56, 2.4, 5, false) + win(81.6, 56, 2.4, 5, false);
      for (const x of [48, 89]) out += r(x, 40, 13, 40, '#B5ACA0') + b(`M${x - 1.5} 40.5 L${x + 6.5} 25 L${x + 14.5} 40.5Z`, '#56688A') + win(x + 5.3, 48, 2.4, 5, false) + snowRoof(`M${x} 39.5 L${x + 6.5} 26.5 L${x + 13} 39.5`);
      return out + line('M54.5 25 V18', 0.9) + b('M54.5 18 L62 20 L54.5 22Z', '#A33F3A', 0.8);
    },
    lighthouse: () => {
      const xl = (y) => 67 + (80 - y) * (3.5 / 44);
      const xr = (y) => 83 - (80 - y) * (3.5 / 44);
      const band = (y1, y2) => `<path d="M${xl(y2)} ${y2} L${xl(y1)} ${y1} L${xr(y1)} ${y1} L${xr(y2)} ${y2}Z" fill="#B0443C"/>`;
      const tower = 'M67 80 L70.5 36 L79.5 36 L83 80Z';
      const lamp = r(70.5, 26, 9, 7, '#F4D57E', 0, 0.9);
      if (dim) lights.push(`<path d="M75 29.5 L-4 18 L-4 40Z M75 29.5 L154 20 L154 38Z" fill="#F8E8AC" fill-opacity=".2"/>` + lamp);
      return (
        r(86, 67, 18, 13, '#EADFC9') +
        b('M84 68 L95 60 L106 68Z', '#9E5A44') +
        snowRoof('M86 67 L95 61 L104 67') +
        win(89, 71, 5, 4, false) +
        `<path d="${tower}" fill="#F3EFE7"/>` +
        band(44, 52) +
        band(60, 68) +
        `<path d="${tower}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>` +
        r(68, 33, 14, 3, '#3E3A38', 0.5, 0.9) +
        lamp +
        b('M70 26.5 C70 20.5 80 20.5 80 26.5Z', '#B0443C', 0.9) +
        line('M75 21.6 V19', 0.9) +
        r(72.5, 72, 5, 8, '#6E4B3A', 1, 0.9)
      );
    },
    ruins: () =>
      b(
        'M46 80 L46 60 L49 57 L52 59 L52 50 L57 47 L60 51 L64 49 L64 56 L70 54 L74 58 L80 55 L84 46 L88 44 L92 49 L92 54 L97 53 L100 58 L104 57 L104 80 Z M56 80 V67 C56 60.5 66 60.5 66 67 V80Z M74 80 V69 C74 62.5 84 62.5 84 69 V80Z M93 71 V65 C93 61.5 98 61.5 98 65 V71Z',
        '#C6BBA8',
        1.1,
        ' fill-rule="evenodd"'
      ) +
      fine(line('M48 70 h3 M68 62 h3 M88 60 h3 M99 76 h3 M68 74 h2', 0.6, 0.45)) +
      (s.bare ? '' : blob([[47, 62, 2], [49, 66, 2.2], [47.5, 70, 1.8]], s.leaf, 1.4)) +
      r(108, 75.5, 7, 4.5, '#C6BBA8', 0.8) +
      r(112, 72, 5, 3.5, '#C6BBA8', 0.8),
    none: () => '',
  };

  // ---------- extras ----------
  const tree = () => {
    let out = b('M27 82 L28.6 62 L31.4 62 L33 82Z', '#6B5141');
    if (s.bare) return out + line('M30 64 L22 54 M30 62 L38 52 M30 60 L30 46 M25 57 L20 57 M35 55 L40 56', 1.3);
    out += blob([[30, 52, 11], [21, 58, 8], [39, 58, 8], [30, 61, 9]], s.leaf);
    if (s.bloom) out += fine([[24, 50], [33, 47], [37, 55], [26, 59], [31, 56], [20, 56]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="${s.bloom}"/>`).join(''));
    if (s.leaf2) out += fine([[25, 52], [35, 50], [38, 60], [27, 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${s.leaf2}"/>`).join(''));
    return out;
  };
  const fence = () => {
    let out = '';
    for (const [a, z] of [[4, 48], [102, 146]]) {
      out += line(`M${a} 82.5 H${z} M${a} 86 H${z}`, 2.2) + line(`M${a} 82.5 H${z} M${a} 86 H${z}`, 1, 1, '#EFE9DE');
      if (detail) for (let x = a + 1; x < z; x += 5.4) out += b(`M${x} 89 V80.5 L${x + 1.1} 79 L${x + 2.2} 80.5 V89Z`, '#F1ECE2', 0.7);
    }
    return out;
  };
  const lamp = () => {
    const head = b('M113 55 L119 55 L118 61.5 L114 61.5Z', dim ? LIT : '#E9E5DC', 0.9) + b('M112.4 55.4 L116 52.4 L119.6 55.4Z', '#3E3A38', 0.8);
    if (dim) lights.push(`<circle cx="116" cy="58.5" r="9" fill="${LIT}" fill-opacity=".18"/>` + head);
    return line('M116 86 V61', 1.8) + line('M113 86 H119', 1.6) + head;
  };
  const smoke = ([x, y]) => blob([[x + 1, y - 4, 2], [x + 4, y - 9, 2.8], [x + 8.5, y - 15, 3.6]], dim ? '#B9B6B8' : '#ECE9E4', 1.2);
  const birds = () => [[110, 38], [117, 34], [123, 39]].map(([x, y]) => line(`M${x - 2.4} ${y - 1} Q${x - 1.1} ${y - 1.8} ${x} ${y} Q${x + 1.1} ${y - 1.8} ${x + 2.4} ${y - 1}`, 0.7)).join('');

  let land = back + BACK[p.backdrop]() + GROUND[p.ground]();
  if (p.tree) land += tree();
  land += FEATURE[p.feature]();
  if (p.fence) land += fence();
  if (p.lamp) land += lamp();
  if (p.smoke && CHIMNEYS[p.feature]) land += smoke(CHIMNEYS[p.feature]);
  if (p.birds && !night) land += birds();

  let veil = '';
  if (p.weather === 'fog')
    veil += [[50, 7], [64, 6], [78, 7]].map(([y, h]) => `<path d="M-2 ${y} C40 ${y - 2} 100 ${y + 2} 152 ${y} V${y + h} C100 ${y + h + 2} 40 ${y + h - 2} -2 ${y + h}Z" fill="#F3F3EF" fill-opacity=".55"/>`).join('');
  const tint = { night: ['#1A2040', 0.42], dusk: ['#5B3558', 0.12], dawn: ['#F0B39C', 0.08] }[p.time];
  if (tint) veil += `<rect width="150" height="100" fill="${tint[0]}" fill-opacity="${tint[1]}"/>`;

  // Rain and snow on an even grid with a fixed jitter, so a recipe always draws the same.
  const drops = (dx, dy) => {
    const out = [];
    let n = 7;
    const rnd = () => (n = (n * 9301 + 49297) % 233280) / 233280;
    for (let y = 2; y < 98; y += dy) for (let x = 2; x < 150; x += dx) out.push([x + rnd() * dx * 0.8, y + rnd() * dy * 0.8]);
    return out;
  };
  let over = '';
  if (night && clear) {
    over += fine([[12, 8], [22, 16], [48, 6], [58, 18], [76, 9], [104, 6], [138, 12], [142, 30], [8, 30], [66, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".7" fill="#F4EFD9"/>`).join(''));
    over += `<path d="M122 14 a7 7 0 1 0 6 11 a5.6 5.6 0 1 1 -6 -11Z" fill="#F2ECD6" stroke="${INK}" stroke-width=".8"/>`;
  }
  if (p.weather === 'rain') over += (detail ? drops(8, 9) : drops(16, 14)).map(([x, y]) => line(`M${x} ${y} l-2 6`, detail ? 0.6 : 1.2, 0.55, night ? '#9AA9C2' : '#5D6E80')).join('');
  if (p.weather === 'snow') over += (detail ? drops(9, 8) : drops(18, 15)).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${detail ? 0.9 : 1.8}" fill="#FFFFFF" fill-opacity=".95"/>`).join('');

  // The lights share the land's wobble filter, so they land exactly on their windows.
  const wob = detail ? ` filter="url(#w-${id})"` : '';
  const filter = detail
    ? `<filter id="w-${id}" filterUnits="userSpaceOnUse" x="-5" y="-5" width="160" height="110"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>`
    : '';
  return `<svg viewBox="0 0 150 100" width="100%" height="100%" aria-hidden="true">${filter}${sky}<g${wob}>${land}</g>${veil}<g${wob}>${lights.join('')}</g>${over}</svg>`;
}
