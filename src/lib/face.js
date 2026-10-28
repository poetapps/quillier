// Character portraits. A face is a small recipe of named parts ({ hair: 'bob', skin: 'tan', … }),
// drawn here as flat SVG with a light hand-drawn wobble on the outline. Parts are stored by name,
// so redrawing one updates every character that uses it.

const INK = '#2A2421';
const GOLD = '#D9B34A';

export const FACE_COLORS = {
  skin: { pale: '#F6DCCB', fair: '#EDC3A2', light: '#D9A27A', tan: '#C08457', brown: '#9A6440', dark: '#764A2E', deep: '#55331F' },
  hairColor: { black: '#1F1A17', darkBrown: '#3B2A20', brown: '#5E3F2B', chestnut: '#8A5A36', honey: '#B98B53', blond: '#D8C08E', gray: '#9C9893', white: '#D9D6D0', auburn: '#7C3B26' },
  scarf: { blue: '#3F5E8C', wine: '#7A3E4A', green: '#4D6E5A', ochre: '#A9824A', violet: '#5E5478', charcoal: '#2F2F33' },
  iris: { brown: '#4A3527', hazel: '#6B4B2E', blue: '#3E5F7A', green: '#5C6B45', dark: '#2B2522' },
  bg: { sky: '#DDE4EC', blush: '#EEE2DA', sage: '#E1E8DB', lilac: '#E6E1EC', sand: '#F1E9D8', mint: '#DAE8E5' },
  shirt: { navy: '#4C5F7A', brick: '#8C5245', pine: '#55705E', plum: '#6D6283', mustard: '#B08A4E', charcoal: '#3C3A38', linen: '#D6D0C4', slate: '#7C8A93' },
};

// The editor shows each option drawn on the character itself; `crop` zooms its tiles in on the part.
export const FACE_PARTS = [
  { key: 'hair', label: 'Hair', options: ['short', 'crop', 'shaggy', 'bob', 'long', 'bun', 'ponytail', 'curly', 'coily', 'locs', 'receding', 'scarf', 'bald'] },
  { key: 'jaw', label: 'Face', options: ['oval', 'square', 'narrow', 'round'] },
  { key: 'eyes', label: 'Eyes', options: ['almond', 'round', 'hooded'], crop: '30 27 40 40' },
  { key: 'brows', label: 'Brows', options: ['straight', 'stern', 'heavy'], crop: '30 25 40 40' },
  { key: 'nose', label: 'Nose', options: ['straight', 'broad', 'aquiline', 'button'], crop: '36 38 28 28' },
  { key: 'mouth', label: 'Mouth', options: ['neutral', 'full', 'firm', 'smile'], crop: '35 48 30 30' },
  { key: 'facialHair', label: 'Facial hair', options: ['none', 'stubble', 'mustache', 'beard', 'goatee'], crop: '28 40 44 44' },
  { key: 'glasses', label: 'Glasses', options: ['none', 'round', 'rect'], crop: '27 26 46 46' },
  { key: 'earrings', label: 'Earrings', options: ['none', 'studs', 'hoops'], crop: '50 28 44 44' },
];

export const FACE_EXTRAS = [
  { key: 'age', label: 'Age lines', crop: '30 32 40 40' },
  { key: 'freckles', label: 'Freckles', crop: '30 32 40 40' },
];

const DEFAULT_FACE = {
  v: 1,
  jaw: 'oval',
  skin: 'light',
  hair: 'short',
  hairColor: 'darkBrown',
  scarf: 'blue',
  iris: 'brown',
  eyes: 'almond',
  brows: 'straight',
  nose: 'straight',
  mouth: 'neutral',
  facialHair: 'none',
  glasses: 'none',
  earrings: 'none',
  age: false,
  freckles: false,
  bg: 'sage',
  shirt: 'navy',
};

// "darkBrown" → "Dark brown"
export const partLabel = (key) => {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

// Keep whatever is still a valid part; anything renamed or removed falls back to the default.
export function normalizeFace(f) {
  if (!f || typeof f !== 'object') return null;
  const out = { ...DEFAULT_FACE };
  for (const p of FACE_PARTS) if (p.options.includes(f[p.key])) out[p.key] = f[p.key];
  for (const k of Object.keys(FACE_COLORS)) if (Object.hasOwn(FACE_COLORS[k], f[k])) out[k] = f[k];
  for (const x of FACE_EXTRAS) out[x.key] = f[x.key] === true;
  return out;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Ready-made faces whose parts go together, tagged with who they suit (g) and how old they look (a).
// New portraits and Shuffle pick from these, so a character starts from something believable.
const PRESETS = [
  { g: 'female', a: 'young', face: { hair: 'long', hairColor: 'honey', skin: 'fair', iris: 'blue', nose: 'button' } },
  { g: 'female', a: 'young', face: { hair: 'ponytail', hairColor: 'auburn', skin: 'pale', iris: 'green', eyes: 'round', nose: 'button', mouth: 'smile', freckles: true } },
  { g: 'female', a: 'young', face: { hair: 'curly', hairColor: 'black', skin: 'brown', iris: 'dark', nose: 'broad', mouth: 'full', earrings: 'hoops', jaw: 'round' } },
  { g: 'female', a: 'adult', face: { hair: 'bob', hairColor: 'darkBrown', skin: 'light', iris: 'hazel', glasses: 'round', jaw: 'narrow' } },
  { g: 'female', a: 'adult', face: { hair: 'scarf', scarf: 'wine', skin: 'tan', eyes: 'hooded' } },
  { g: 'female', a: 'adult', face: { hair: 'locs', hairColor: 'black', skin: 'deep', iris: 'dark', nose: 'broad', mouth: 'full', earrings: 'studs' } },
  { g: 'female', a: 'older', face: { hair: 'bun', hairColor: 'white', skin: 'fair', iris: 'blue', eyes: 'hooded', nose: 'aquiline', mouth: 'firm', glasses: 'rect', age: true, jaw: 'narrow' } },
  { g: 'male', a: 'young', face: { hair: 'shaggy', hairColor: 'chestnut', skin: 'light', iris: 'hazel', mouth: 'smile' } },
  { g: 'male', a: 'young', face: { hair: 'coily', hairColor: 'black', skin: 'dark', eyes: 'round', nose: 'broad' } },
  { g: 'male', a: 'adult', face: { hair: 'short', hairColor: 'black', skin: 'tan', brows: 'heavy', mouth: 'firm', facialHair: 'stubble', jaw: 'square' } },
  { g: 'male', a: 'adult', face: { hair: 'crop', hairColor: 'darkBrown', skin: 'brown', eyes: 'hooded', brows: 'stern', nose: 'broad', facialHair: 'beard', jaw: 'square' } },
  { g: 'male', a: 'adult', face: { hair: 'crop', hairColor: 'blond', skin: 'fair', iris: 'blue', nose: 'aquiline', glasses: 'rect', jaw: 'narrow' } },
  { g: 'male', a: 'older', face: { hair: 'receding', hairColor: 'gray', skin: 'light', eyes: 'hooded', brows: 'heavy', nose: 'aquiline', mouth: 'firm', facialHair: 'mustache', glasses: 'round', age: true } },
  { g: 'male', a: 'older', face: { hair: 'bald', hairColor: 'white', skin: 'deep', brows: 'heavy', nose: 'broad', mouth: 'smile', facialHair: 'beard', age: true, jaw: 'round' } },
  { g: 'any', a: 'young', face: { hair: 'crop', hairColor: 'auburn', skin: 'light', eyes: 'round', nose: 'button', glasses: 'rect', earrings: 'studs' } },
];

// The character's age range, as the presets see it.
const AGE_LOOK = { child: ['young'], teen: ['young'], young: ['young'], adult: ['adult'], middle: ['adult', 'older'], older: ['older'] };

// A preset that suits the character's gender and age (when set), other than the face they have now.
export function presetFace(entry, current) {
  const fitsGender = (p) => !['female', 'male'].includes(entry.gender) || p.g === entry.gender || p.g === 'any';
  const fitsAge = (p) => !AGE_LOOK[entry.age] || AGE_LOOK[entry.age].includes(p.a);
  const same = (p) => current && Object.entries(p.face).every(([k, v]) => current[k] === v);
  const pools = [PRESETS.filter((p) => fitsGender(p) && fitsAge(p)), PRESETS.filter(fitsGender), PRESETS];
  const pool = pools.find((list) => list.some((p) => !same(p)));
  const chosen = pick(pool.filter((p) => !same(p)));
  return { ...DEFAULT_FACE, ...chosen.face, bg: pick(Object.keys(FACE_COLORS.bg)), shirt: pick(Object.keys(FACE_COLORS.shirt)) };
}

// ---------- drawing ----------

const hx = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const rgb = (a) => `rgb(${a.map((v) => Math.max(0, Math.min(255, Math.round(v)))).join(',')})`;
const shade = (h, k) => rgb(hx(h).map((v) => v * k));
const mix = (a, b, t) => {
  const A = hx(a);
  const B = hx(b);
  return rgb(A.map((v, i) => v + (B[i] - v) * t));
};
const lum = (h) => {
  const [r, g, b] = hx(h);
  return 0.3 * r + 0.59 * g + 0.11 * b;
};

// Head proportions. hw: half-width at the temples, jw/jy: jaw corner, cw: chin width, ch: chin height.
const JAWS = {
  oval: { hw: 20.5, jw: 16.5, jy: 60, cw: 5, ch: 72.5 },
  square: { hw: 21, jw: 19.5, jy: 63, cw: 9, ch: 73 },
  narrow: { hw: 18.6, jw: 14.2, jy: 62, cw: 4, ch: 75.5 },
  round: { hw: 22, jw: 19.5, jy: 57, cw: 9, ch: 71.5 },
};

const SLICK = 'M29 38 C28 20 38 12 50 12 C62 12 72 20 71 38 C69 30 65 26 58 24.5 C53 23.5 47 23.5 42 24.5 C35 26 31 30 29 38 Z';
const SLICK_STRANDS = ['M42 24.5 C44 19 47 15 50 13', 'M58 24.5 C56 19 53 15 50 13'];
const COILY = 'M28.5 38 C27.5 19 37.5 10.5 50 10.5 C62.5 10.5 72.5 19 71.5 38 C69 30 64 26 58 25 C53 24 47 24 42 25 C36 26 31 30 28.5 38 Z';
const LOCS = [[22.5, 52], [26.8, 56], [31, 50], [69, 50], [73.2, 56], [77.5, 52]];

const CURL_BACK = [];
for (let i = 0; i <= 18; i++) {
  const a = ((150 + (i * 240) / 18) * Math.PI) / 180;
  CURL_BACK.push(`cx="${(50 + 23 * Math.cos(a)).toFixed(1)}" cy="${(28 + 18 * Math.sin(a)).toFixed(1)}" r="5.5"`);
}
CURL_BACK.push('cx="50" cy="29" r="20"', 'cx="28.5" cy="40" r="5.5"', 'cx="27.8" cy="46" r="5"', 'cx="71.5" cy="40" r="5.5"', 'cx="72.2" cy="46" r="5"');
const CURL_FRONT = [[31.5, 33], [35, 28.5], [40, 25.5], [45.5, 24], [51, 23.6], [56.5, 24.2], [61.5, 26], [65.5, 29], [68.5, 33]].map(([x, y]) => `cx="${x}" cy="${y}" r="3.6"`);
const CURL_TEXTURE = ['M38 13 q1.6 -2 3.2 0', 'M47 9.5 q1.6 -2 3.2 0', 'M57 11 q1.6 -2 3.2 0', 'M33 20 q1.6 -2 3.2 0', 'M64 18 q1.6 -2 3.2 0', 'M43 17 q1.6 -2 3.2 0', 'M53 16 q1.6 -2 3.2 0'];

// Fixed scatter of tight coils inside the coily cap.
const COIL_DOTS = [];
for (let k = 0, y = 13; y <= 34; y += 2.6) {
  for (let x = 30; x <= 70; x += 2.8) {
    k++;
    const jx = x + ((k * 37) % 10) / 10 - 0.5;
    const jy = y + ((k * 53) % 10) / 10 - 0.5;
    const top = 10.5 + ((jx - 50) / 21) ** 2 * 20;
    const hairline = 24.5 + ((jx - 50) / 21) ** 2 * 14;
    if (jy > top + 1.5 && jy < hairline - 1) COIL_DOTS.push([jx.toFixed(1), jy.toFixed(1)]);
  }
}

// Each style draws a back layer (behind the head) and a front layer (over it), in head units where
// the temples are 20.5 from center; narrower and wider heads scale it sideways.
const HAIR = {
  short: { front: (c, h) => h.b('path', 'd="M28 40 C26 22 36 9 52 10 C66 11 74 20 72.5 40 C71.5 33 70 28 67 25 C60 27 50 26 42 22 C38 27 32 30 29.5 40 Z"', c) + h.s('M42 22 C47 17 55 14.5 63 16') + h.s('M47 13 C53 11.5 60 12.5 66 16.5') },
  crop: { front: (c, h) => h.b('path', 'd="M29.5 36 C29 20 38 12.5 50 12.5 C62 12.5 71 20 70.5 36 C68 29 64 25.5 58 24.5 C53 23.5 47 23.5 42 24.5 C36 25.5 32 29 29.5 36 Z"', c) },
  shaggy: {
    noEars: true,
    back: (c, h) => h.b('path', 'd="M25 40 C23 18 36 7 50 7 C64 7 77 18 75 40 L76.5 51 L73.5 47.5 L74.5 55 L71 50.5 L70 52 L30 52 L29 50.5 L25.5 55 L26.5 47.5 L23.5 51 Z"', c),
    front: (c, h) => h.b('path', 'd="M27.5 46 C25 22 37 9 52 9.5 C66 10 76 22 72.5 46 L70.5 38 L68.5 41 L67 32.5 L63 35.5 L61 29.5 L56.5 33.5 L54 28.5 L49.5 32.5 L46.5 28 L42 32.5 L40 28.5 L36 33 L34.5 31 L31.5 38.5 L29.5 36 Z"', c) + h.s('M46.5 28 C47 21 50 15 55 12') + h.s('M56.5 33.5 C58 25 60 19 64 16') + h.s('M36 33 C37 25 40 19 44 15'),
  },
  bob: {
    noEars: true,
    back: (c, h) => h.b('path', 'd="M25.5 38 C24 18 36 8 50 8 C64 8 76 18 74.5 38 L76 64 C72 67 66 66 63 63 L37 63 C34 66 28 67 24 64 Z"', c),
    front: (c, h) => h.b('path', 'd="M28.5 46 C26 24 36 11 52 11 C66 11 74 22 72 46 C70 36 68 30 64 26 C56 29 46 29 38 24 C34 30 31 36 28.5 46 Z"', c) + h.s('M38 24 C44 18 52 15 60 16'),
  },
  long: {
    noEars: true,
    back: (c, h) => h.b('path', 'd="M25 38 C23 17 36 7 50 7 C64 7 77 17 75 38 L79 90 C68 95 32 95 21 90 Z"', c),
    front: (c, h) => h.b('path', 'd="M28.5 50 C26 24 37 11 50 11 C63 11 74 24 71.5 50 C70 38 66 30 60 26 C56 24 52 22 50 20 C48 22 44 24 40 26 C34 30 30 38 28.5 50 Z"', c) + h.s('M50 20 C47 24 41 27 35 33') + h.s('M50 20 C53 24 59 27 65 33'),
  },
  bun: { back: (c, h) => h.b('circle', 'cx="50" cy="9" r="7.5"', c), front: (c, h) => h.b('path', `d="${SLICK}"`, c) + SLICK_STRANDS.map(h.s).join('') },
  ponytail: { back: (c, h) => h.b('path', 'd="M63 20 C80 16 86 36 80 60 C78 66 73 66 74 58 C76 44 72 32 63 26 Z"', c), front: (c, h) => h.b('path', `d="${SLICK}"`, c) + SLICK_STRANDS.map(h.s).join('') },
  curly: {
    back: (c, h) => h.u(CURL_BACK, c) + CURL_TEXTURE.map(h.s).join(''),
    front: (c, h) => `<path d="M29 34 C28 18 38 10.5 50 10.5 C62 10.5 72 18 71 34 L71 30 L29 30 Z" fill="${c}"/>` + h.u(CURL_FRONT, c),
  },
  coily: { front: (c, h) => h.b('path', `d="${COILY}"`, c) + (h.detail ? COIL_DOTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75" fill="${h.sc}"/>`).join('') : '') },
  locs: {
    noEars: true,
    back: (c, h) =>
      h.b('path', 'd="M25 38 C23 17 36 8 50 8 C64 8 77 17 75 38 L76 46 L24 46 Z"', c) +
      LOCS.map(([x, l]) => `<rect x="${x - 2.3}" y="30" width="4.6" height="${l}" rx="2.3" fill="${c}" stroke="${INK}" stroke-width=".9"/>` + Array.from({ length: Math.floor(l / 5) }, (_, i) => h.s(`M${x - 1.4} ${36 + i * 5} q1.4 1.2 2.8 0`)).join('')).join(''),
    front: (c, h) => h.b('path', 'd="M28 44 C26 22 37 11 50 11 C63 11 74 22 72 44 C70 34 64 27 56 25 C52 27 48 27 44 25 C36 27 30 34 28 44 Z"', c) + h.s('M50 12 C46 16 41 21 37 28') + h.s('M50 12 C54 16 59 21 63 28') + h.s('M50 12 C49 17 47 21 44 25') + h.s('M50 12 C51 17 53 21 56 25'),
  },
  receding: { front: (c, h) => h.b('path', 'd="M29.2 46 C28.4 38 29 31 32.5 26 C34 31 33.4 38 32.4 46 Z"', c) + h.b('path', 'd="M70.8 46 C71.6 38 71 31 67.5 26 C66 31 66.6 38 67.6 46 Z"', c) },
  scarf: {
    overNeck: true,
    noEars: true,
    back: (c, h) => h.b('path', 'd="M22 42 C20 18 35 6 50 6 C65 6 80 18 78 42 C78 56 74 66 67 72 L88 102 L12 102 L33 72 C26 66 22 56 22 42 Z"', c),
    front: (c, h) => h.b('path', 'd="M29 40 C29 23 38 16 50 16 C62 16 71 23 71 40 C69 30 61 23.5 50 23.5 C39 23.5 31 30 29 40 Z"', shade(c, 1.15)),
  },
  bald: {},
};

const EYES = { almond: { w: 4, t: 38.8, b: 46.4 }, round: { w: 4, t: 37.4, b: 48 }, hooded: { w: 4.3, t: 41, b: 45.6, crease: true, lid: 1.7 } };
const BROWS = {
  straight: 'M45.8 38.4 C42.8 37.2 39.6 37.1 36.8 38.2 C39.6 38.6 42.6 39 45.6 40.2 Z',
  stern: 'M45.8 39.6 C43.2 37.8 40 36.8 36.8 37.2 C39.8 37.9 42.8 39.2 45.4 41.2 Z',
  heavy: 'M46 38 C42.8 36.3 39.2 36.3 36.6 37.8 C39.2 38.8 42.6 39.4 45.8 40.8 Z',
};
const NOSES = {
  straight: ['M51.4 44.5 C51.8 48 52.8 50.4 52.6 52', 'M47 52.2 C47.6 53.6 49 53.4 50 53.7 C51 53.4 52.4 53.6 53 52.2'],
  broad: ['M51.8 46.5 C52.8 49 54.6 50.2 54.8 52.2', 'M45 52 C45.6 54.6 48.4 54.2 50 54.6 C51.6 54.2 54.4 54.6 55 52', 'M45 52 C44.4 51 44.8 50 45.8 49.8', 'M55 52 C55.6 51 55.2 50 54.2 49.8'],
  aquiline: ['M50.8 43.8 C51.8 45.2 53.6 46.2 53.6 48.4 C53.6 50.6 55 52 52.9 53.6', 'M47.2 52.6 C48 54.3 50.8 54.8 52.9 53.6'],
  button: ['M51.2 48.4 C51.6 50.2 52.4 51.2 52 52.2', 'M48 52.6 C48.8 53.4 51.2 53.4 52 52.4'],
};
// Upper lip, lower lip, the line between them.
const MOUTHS = {
  neutral: ['M45 59.6 C46.8 58.4 48.6 57.9 50 58.6 C51.4 57.9 53.2 58.4 55 59.6 C52.5 60.1 47.5 60.1 45 59.6 Z', 'M45.8 59.9 C47.6 62.4 52.4 62.4 54.2 59.9 C52 60.4 48 60.4 45.8 59.9 Z', 'M44.8 59.6 C47.5 60.3 52.5 60.3 55.2 59.6'],
  full: ['M44.6 59.6 C46.6 57.8 48.6 57.4 50 58.2 C51.4 57.4 53.4 57.8 55.4 59.6 C52.6 60.2 47.4 60.2 44.6 59.6 Z', 'M45.4 60 C47.4 63.6 52.6 63.6 54.6 60 C52 60.6 48 60.6 45.4 60 Z', 'M44.4 59.6 C47.4 60.4 52.6 60.4 55.6 59.6'],
  firm: ['M45.2 59.9 C47 59.4 48.8 59.3 50 59.6 C51.2 59.3 53 59.4 54.8 59.9 C52.4 60.1 47.6 60.1 45.2 59.9 Z', 'M46.4 60.1 C48 61.2 52 61.2 53.6 60.1 C51.8 60.3 48.2 60.3 46.4 60.1 Z', 'M45 60.4 C46.4 60 47.8 59.9 50 59.9 C52.2 59.9 53.6 60 55 60.4'],
  smile: ['M44.8 58.9 C46.8 58.2 48.6 57.9 50 58.6 C51.4 57.9 53.2 58.2 55.2 58.9 C52.6 60.5 47.4 60.5 44.8 58.9 Z', 'M45.8 59.6 C47.6 62.6 52.4 62.6 54.2 59.6 C52 60.6 48 60.6 45.8 59.6 Z', 'M44.6 58.8 C47.4 60.8 52.6 60.8 55.4 58.8'],
};
const MUSTACHE = 'M44.2 58 C46 55.8 48.8 55.8 50 56.6 C51.2 55.8 54 55.8 55.8 58 C54 57.8 52 58 50 58.5 C48 58 46 57.8 44.2 58 Z';
const GOATEE = 'M46 62.4 C46.6 67 53.4 67 54 62.4 C52 63.4 48 63.4 46 62.4 Z';
const FRECKLES = [[36.5, 49.5], [38.8, 51.2], [40.6, 49.3], [42.4, 50.8], [37.8, 47.8], [39.6, 52.8]];
const EYE_X = [41.2, 58.8];

export const hidesEars = (face) => !!HAIR[face.hair]?.noEars;

// The whole portrait as an SVG string. `id` keeps the filter and clip ids unique on the page;
// `detail` adds the outline wobble and fine lines, which are only worth it at larger sizes.
export function faceSvg(face, { id = 'face', detail = true, viewBox = '6.5 2.5 87 87' } = {}) {
  const f = normalizeFace(face) || DEFAULT_FACE;
  const C = (k) => FACE_COLORS[k][f[k]];
  const skin = C('skin');
  const hairColor = C('hairColor');
  const { hw, jw, jy, cw, ch } = JAWS[f.jaw];
  const sx = hw / 20.5;
  const Lx = 50 - hw;
  const Rx = 50 + hw;
  const style = HAIR[f.hair];
  const hc = f.hair === 'scarf' ? C('scarf') : hairColor;

  const outline = ` stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"`;
  const b = (tag, attrs, fill) => `<${tag} ${attrs} fill="${fill}"${outline}/>`;
  const line = (d, w = 1, o = 1) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sc = lum(hc) < 80 ? mix(hc, '#FFFFFF', 0.2) : shade(hc, 0.72);
  const h = {
    b,
    sc,
    detail,
    s: (d) => (detail ? `<path d="${d}" fill="none" stroke="${sc}" stroke-width=".8" stroke-linecap="round"/>` : ''),
    // Overlapping circles with one outline around the group: a thick outline under, the fills over.
    u: (list, fill) => list.map((a) => `<circle ${a} fill="${fill}" stroke="${INK}" stroke-width="2.8"/>`).join('') + list.map((a) => `<circle ${a} fill="${fill}"/>`).join(''),
  };
  const scaled = (svg) => `<g transform="translate(50 0) scale(${sx} 1) translate(-50 0)">${svg}</g>`;
  const mirrored = (svg) => svg + `<g transform="translate(100 0) scale(-1 1)">${svg}</g>`;

  const head = `M50 14 C${50 + hw * 0.6} 14 ${Rx} 22 ${Rx} 34 C${Rx} 42 ${Rx + 0.5} 48 ${50 + jw} ${jy} C${50 + jw - 2} ${jy + 6} ${50 + cw + 4} ${ch - 0.5} 50 ${ch} C${50 - cw - 4} ${ch - 0.5} ${50 - jw + 2} ${jy + 6} ${50 - jw} ${jy} C${Lx - 0.5} 48 ${Lx} 42 ${Lx} 34 C${Lx} 22 ${50 - hw * 0.6} 14 50 14 Z`;
  const beard = `M${Lx} 42 C${Lx} 50 ${50 - jw - 0.5} ${jy - 4} ${50 - jw} ${jy} C${50 - jw + 2} ${jy + 7} ${50 - cw - 4} ${ch + 2.5} 50 ${ch + 3} C${50 + cw + 4} ${ch + 2.5} ${50 + jw - 2} ${jy + 7} ${50 + jw} ${jy} C${50 + jw + 0.5} ${jy - 4} ${Rx} 50 ${Rx} 42 C${Rx - 2.5} 49 ${Rx - 5} 54 62 56 C57 54.5 43 54.5 38 56 C${Lx + 5} 54 ${Lx + 2.5} 49 ${Lx} 42 Z`;

  // Silhouette: shoulders, hair, ears, head. This layer gets the wobble.
  let body = '';
  if (style.back && !style.overNeck) body += scaled(style.back(hc, h));
  body += b('rect', 'x="42" y="56" width="16" height="36"', shade(skin, 0.86));
  body += b('path', 'd="M8 102 C10 88 22 82 40 79 L50 89 L60 79 C78 82 90 88 92 102 Z"', C('shirt'));
  if (style.back && style.overNeck) body += scaled(style.back(hc, h));
  if (!style.noEars) {
    const ear = b('path', `d="M${Rx - 1} 39 C${Rx + 4.5} 36.5 ${Rx + 6} 45 ${Rx + 3.2} 51 C${Rx + 2} 53.5 ${Rx - 0.5} 54 ${Rx - 1} 52 Z"`, skin);
    body += mirrored(ear + (detail ? line(`M${Rx + 0.8} 41.5 C${Rx + 3.6} 41 ${Rx + 3.8} 46.5 ${Rx + 1.4} 48.8`, 0.8, 0.7) : ''));
  }
  body += b('path', `d="${head}"`, skin);
  if (f.facialHair === 'beard') body += b('path', `d="${beard}"`, hairColor);
  if (style.front) body += scaled(style.front(hc, h));

  // Features stay crisp.
  let feat = '';
  if (!style.noEars && f.earrings === 'studs') feat += mirrored(`<circle cx="${Rx + 2.4}" cy="52.4" r="1.2" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/>`);
  if (!style.noEars && f.earrings === 'hoops') feat += mirrored(`<circle cx="${Rx + 2.2}" cy="55.2" r="2.6" fill="none" stroke="${INK}" stroke-width="1.7"/><circle cx="${Rx + 2.2}" cy="55.2" r="2.6" fill="none" stroke="${GOLD}" stroke-width="1"/>`);
  if (f.facialHair === 'stubble') feat += `<path d="${beard}" fill="${hairColor}" fill-opacity=".22"/>`;
  if (f.age) feat += line('M45.8 53.8 C44.2 55.6 43.6 57.6 44 59.6', 0.7, 0.45) + line('M54.2 53.8 C55.8 55.6 56.4 57.6 56 59.6', 0.7, 0.45) + line('M37.6 46.6 Q40.8 47.8 44 46.6', 0.6, 0.4) + line('M62.4 46.6 Q59.2 47.8 56 46.6', 0.6, 0.4);
  if (f.freckles) feat += mirrored(FRECKLES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75" fill="${shade(skin, 0.6)}" fill-opacity=".85"/>`).join(''));

  const browColor = ['scarf', 'bald', 'receding'].includes(f.hair) ? shade(hairColor, 0.9) : hairColor;
  feat += mirrored(`<path d="${BROWS[f.brows]}" fill="${lum(hairColor) > 170 ? shade(hairColor, 0.75) : browColor}" stroke="${INK}" stroke-width=".5" stroke-opacity=".6"/>`);

  const E = EYES[f.eyes];
  const eyeShape = (x) => `M${x - E.w} 43 Q${x} ${E.t} ${x + E.w} 43 Q${x} ${E.b} ${x - E.w} 43 Z`;
  feat += `<clipPath id="c-${id}"><path d="${eyeShape(EYE_X[0])} ${eyeShape(EYE_X[1])}"/></clipPath>`;
  for (const x of EYE_X) {
    feat += `<path d="${eyeShape(x)}" fill="#FBF8F3"/>`;
    feat += `<g clip-path="url(#c-${id})"><circle cx="${x}" cy="43" r="2.1" fill="${C('iris')}"/><circle cx="${x}" cy="43" r=".85" fill="${INK}"/><circle cx="${x + 0.6}" cy="42.3" r=".45" fill="#fff"/></g>`;
    feat += line(`M${x - E.w - 0.3} 43.2 Q${x} ${E.t - 0.3} ${x + E.w + 0.3} 42.8`, E.lid || 1.3);
    if (detail) feat += line(`M${x - E.w + 0.6} 43.4 Q${x} ${E.b} ${x + E.w - 0.6} 43.3`, 0.6, 0.5);
    if (E.crease) feat += line(`M${x - E.w + 0.3} 41.2 Q${x} 38.6 ${x + E.w + 0.4} 40.6`, 0.8, 0.85);
  }
  for (const d of NOSES[f.nose]) feat += line(d, 1, 0.8);
  const [upper, lower, parting] = MOUTHS[f.mouth];
  feat += `<path d="${upper}" fill="${mix(skin, '#7E2F3A', 0.45)}"/><path d="${lower}" fill="${mix(skin, '#A24B55', 0.38)}"/>` + line(parting, 1, 0.85);
  const thin = (svg) => svg.replace('stroke-width="1.4"', 'stroke-width=".8"');
  if (['mustache', 'beard', 'goatee'].includes(f.facialHair)) feat += thin(b('path', `d="${MUSTACHE}"`, hairColor));
  if (f.facialHair === 'goatee') feat += thin(b('path', `d="${GOATEE}"`, hairColor));
  if (f.glasses !== 'none') {
    const round = f.glasses === 'round';
    const o = round ? 5 : 5.4;
    EYE_X.forEach((x, i) => {
      feat += round
        ? `<circle cx="${x}" cy="43" r="5" fill="#fff" fill-opacity=".2" stroke="${INK}" stroke-width="1.1"/>`
        : `<rect x="${x - 5.4}" y="39.6" width="10.8" height="6.8" rx="1.6" fill="#fff" fill-opacity=".2" stroke="${INK}" stroke-width="1.1"/>`;
      feat += line(i ? `M${x + o} 42.6 L${Rx - 0.5} 44` : `M${x - o} 42.6 L${Lx + 0.5} 44`);
    });
    feat += line(`M${EYE_X[0] + o} 42.6 Q50 41.4 ${EYE_X[1] - o} 42.6`, 1.1);
  }

  const wobble = detail
    ? `<filter id="w-${id}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G"/></filter>`
    : '';
  return `<svg viewBox="${viewBox}" width="100%" height="100%" aria-hidden="true">${wobble}<rect width="100" height="100" fill="${C('bg')}"/><g${detail ? ` filter="url(#w-${id})"` : ''}>${body}</g>${feat}</svg>`;
}
