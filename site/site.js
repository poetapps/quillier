const REPO = 'poetapps/quillier';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- downloads ----------

// name: on the big button ("Download for …"); also: in the line under it ("Also for …").
const BUILDS = {
  mac: { name: 'Mac', also: 'Apple Silicon Macs', file: 'Quillier-mac-arm64.dmg' },
  macIntel: { name: 'Intel Mac', also: 'Intel Macs', file: 'Quillier-mac-x64.dmg' },
  win: { name: 'Windows', also: 'Windows', file: 'Quillier-Setup.exe' },
  linux: { name: 'Linux', also: 'Linux', file: 'Quillier-linux.AppImage' },
};
const fileUrl = (os) => `https://github.com/${REPO}/releases/latest/download/${BUILDS[os].file}`;
const link = (os) => `<a href="${fileUrl(os)}">${BUILDS[os].also}</a>`;
const list = (items) => `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const showFor = (os) => {
  const others = Object.keys(BUILDS).filter((k) => k !== os);
  for (const el of document.querySelectorAll('.download')) {
    const button = el.querySelector('[data-primary]');
    button.href = fileUrl(os);
    button.textContent = `Download for ${BUILDS[os].name}`;
    const version = el.querySelector('[data-version]');
    el.querySelector('.others').innerHTML = `Also for ${list(others.map(link))}. `;
    el.querySelector('.others').append(version);
    for (const d of el.querySelectorAll('.first-run')) d.hidden = d.dataset.for !== os;
  }
  for (const b of document.querySelectorAll('.build')) b.classList.toggle('you', b.dataset.os === os);
};

// Put the visitor's own system on the big button. Phones and anything unknown get the Mac build.
// Macs get Apple Silicon unless the browser says Intel: only Chromium browsers can tell (Safari and
// Firefox call every Mac Intel), and Intel Macs always have their own link under the button.
const ua = navigator.userAgent;
const os = /Windows/.test(ua) ? 'win' : /Linux|X11|CrOS/.test(ua) && !/Android/.test(ua) ? 'linux' : 'mac';
showFor(os);
if (os === 'mac' && navigator.userAgentData?.getHighEntropyValues) {
  navigator.userAgentData
    .getHighEntropyValues(['architecture'])
    .then(({ architecture }) => architecture === 'x86' && showFor('macIntel'))
    .catch(() => {});
}

// Show the current version. If nothing has been published yet, send buttons to the releases page.
fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((rel) => {
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (v) for (const el of document.querySelectorAll('[data-version]')) el.replaceChildren(Object.assign(document.createElement('a'), { href: '/changelog', textContent: `Version ${v}` }), '.');
    // The download page lists each file's size.
    for (const el of document.querySelectorAll('[data-size]')) {
      const a = (rel.assets || []).find((x) => x.name === el.dataset.size);
      if (a) el.textContent = `${Math.round(a.size / 1e6)} MB`;
    }
  })
  .catch((status) => {
    if (status !== 404) return;
    for (const el of document.querySelectorAll('.download a, .builds a')) el.href = `https://github.com/${REPO}/releases`;
  });

// The header grows an edge once the page scrolls. On the home page its small download button waits
// until the big one has scrolled away; elsewhere it's always there.
const header = document.querySelector('.top');
const mini = document.querySelector('[data-mini]');
const heroDownload = document.querySelector('.hero .download');
if (heroDownload) {
  new IntersectionObserver(([e]) => {
    const away = !e.isIntersecting && e.boundingClientRect.top < 0;
    header.classList.toggle('stuck', away);
    if (mini) mini.tabIndex = away ? 0 : -1;
  }).observe(heroDownload);
} else {
  const edge = () => header.classList.toggle('stuck', scrollY > 8);
  addEventListener('scroll', edge, { passive: true });
  edge();
}

// ---------- the live editor ----------
// The same rules as the app: names and aliases are found as whole words, case-sensitive; a name
// is suggested after a capital and two letters; quotes curl and -- and ... turn into — and ….
if (document.getElementById('page')) {

  const ENTRIES = [
    { id: 'mara', type: 'character', name: 'Mara Lind', aliases: ['Mara'] },
    { id: 'edith', type: 'character', name: 'Edith Lind', aliases: ['Edith', 'Gran'] },
    { id: 'ingrid', type: 'character', name: 'Ingrid Lind', aliases: ['Ingrid'] },
    { id: 'tomas', type: 'character', name: 'Tomas Arve', aliases: ['Tomas'] },
    { id: 'pell', type: 'character', name: 'Pell', aliases: [] },
    { id: 'skarra', type: 'place', name: 'Skarra light', aliases: ['Skarra'] },
    { id: 'museum', type: 'place', name: 'Harbor museum', aliases: [] },
  ];
  const TERMS = ENTRIES.flatMap((e) => [e.name, ...e.aliases].map((text) => ({ text, e })));
  const byText = new Map(TERMS.map((t) => [t.text, t.e]));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const longestFirst = [...TERMS].sort((a, b) => b.text.length - a.text.length);
  const FIND = new RegExp(`(?<![\\p{L}\\p{N}])(?:${longestFirst.map((t) => escape(t.text)).join('|')})(?![\\p{L}\\p{N}])`, 'gu');

  const mentions = (text) => {
    const found = new Map();
    for (const m of text.matchAll(FIND)) {
      const e = byText.get(m[0]);
      const f = found.get(e.id) || { e, n: 0, at: m.index };
      f.n++;
      found.set(e.id, f);
    }
    return [...found.values()].sort((a, b) => b.n - a.n || a.at - b.at);
  };

  const suggest = (before) => {
    const m = before.match(/(?:^|[^\p{L}\p{N}'’-])(\p{Lu}[\p{L}'’-]{2,})$/u);
    if (!m) return null;
    const typed = m[1];
    const t = TERMS.find(({ text }) => text.length > typed.length && text.toLowerCase().startsWith(typed.toLowerCase()) && text[0] === typed[0]);
    return t ? t.text.slice(typed.length) : null;
  };

  // What the last keystroke turns into: [replacement, how many characters it replaces].
  const smart = (before) => {
    if (before.endsWith('--')) return ['—', 2];
    if (before.endsWith('...')) return ['…', 3];
    const ch = before.slice(-1);
    const opens = /^$|[\s([{“‘—–-]/.test(before.slice(-2, -1));
    if (ch === '"') return [opens ? '“' : '”', 1];
    if (ch === "'") return [opens ? '‘' : '’', 1];
    return null;
  };

  const START =
    'Mara found the ledger on the third morning, wedged behind the stove where the floorboards had swollen with salt. The handwriting was her grandmother’s: the long, impatient loops, every cross-stroke pressed so hard the pen had torn the paper.';
  // \t waits on the gray suggestion, then presses Tab.
  const SCRIPT = '\n\n"Gran never threw anything out," Ingrid said. "Tide tables, receipts, Christmas cards -- the lot."\n\nOn the last page, in pencil, one line: Ask Pell what he saw from Ska\t.';

  const ta = document.getElementById('page');
  const shadow = document.getElementById('shadow');
  const editor = document.getElementById('editor');
  const scroller = editor.closest('.page');
  const itc = document.getElementById('itc');
  const wordsEl = document.getElementById('words');
  const savedEl = document.getElementById('saved');
  const caret = Object.assign(document.createElement('span'), { className: 'caret' });
  const end = document.createElement('span');
  const tabKey = Object.assign(document.createElement('kbd'), { textContent: 'Tab' });
  let live = false; // the visitor has taken over
  let ghost = null;
  let timer = 0;
  let idleTimer = 0;
  let saveTimer = 0;

  const render = () => {
    const v = ta.value;
    const atEnd = ta.selectionStart === v.length && ta.selectionEnd === v.length;
    const writing = live ? document.activeElement === ta && atEnd : true;
    ghost = writing ? suggest(v) : null;
    shadow.textContent = v;
    shadow.append(end);
    if (!live) shadow.append(caret);
    if (ghost) shadow.append(Object.assign(document.createElement('span'), { className: 'ghost', textContent: ghost }), tabKey);
    shadow.append('\n​'); // keeps a trailing line break measured, plus a spare line of room
    // Keep the end of the text in view while it's being written there.
    const below = writing && end.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 20;
    if (below > 0) scroller.scrollTop += below;

    const shown = new Map([...itc.children].map((li) => [li.dataset.id, li]));
    mentions(v).forEach(({ e, n }, i) => {
      let li = shown.get(e.id);
      if (!li) {
        li = document.createElement('li');
        li.dataset.id = e.id;
        li.className = `${e.type} new`;
        li.innerHTML = `<span></span><span class="n"></span>`;
        li.firstChild.textContent = e.name;
        li.addEventListener('animationend', (ev) => ev.target.classList.remove('new', 'bump'));
      }
      const count = li.querySelector('.n');
      if (count.textContent !== String(n)) {
        if (count.textContent) count.classList.add('bump');
        count.textContent = n;
      }
      // Moving a row restarts its animations, so only move the ones that are out of place.
      if (itc.children[i] !== li) itc.insertBefore(li, itc.children[i] || null);
      shown.delete(e.id);
    });
    for (const li of shown.values()) li.remove();

    const words = v.trim() ? v.trim().split(/\s+/).length : 0;
    wordsEl.textContent = `${words} words`;
  };

  const touched = () => {
    savedEl.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => (savedEl.textContent = 'Saved'), 700);
    editor.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => editor.classList.add('idle'), 500);
  };

  const typeChar = (ch) => {
    let v = ta.value + ch;
    const s = smart(v);
    if (s) v = v.slice(0, -s[1]) + s[0];
    ta.value = v;
  };

  const play = () => {
    clearTimeout(timer);
    live = false;
    editor.classList.remove('live');
    ta.value = START;
    scroller.scrollTop = 0;
    render();
    let i = 0;
    const step = () => {
      if (i >= SCRIPT.length) return editor.classList.add('idle');
      const ch = SCRIPT[i++];
      if (ch === '\t') {
        tabKey.classList.add('down');
        timer = setTimeout(() => {
          tabKey.classList.remove('down');
          ta.value += ghost || '';
          render();
          touched();
          timer = setTimeout(step, 260);
        }, 160);
        return;
      }
      typeChar(ch);
      render();
      touched();
      let delay = 32 + Math.random() * 46;
      if (ch === ' ') delay += 24;
      if (ch === ',' || ch === '.') delay += 140;
      if (ch === '\n') delay = 420;
      if (ch === '-' && SCRIPT[i] === '-') delay = 380; // let the hyphen sit a beat before it becomes a dash
      if (SCRIPT[i] === '\t') delay = 1000; // time to read the suggestion
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 500);
  };

  const finish = () => {
    ta.value = START;
    for (const ch of SCRIPT) {
      if (ch === '\t') ta.value += suggest(ta.value) || '';
      else typeChar(ch);
    }
    editor.classList.add('idle');
    render();
  };

  const takeOver = () => {
    if (live) return;
    clearTimeout(timer);
    live = true;
    editor.classList.add('live');
    tabKey.classList.remove('down');
  };

  ta.addEventListener('focus', () => {
    takeOver();
    requestAnimationFrame(render);
  });
  ta.addEventListener('blur', render);
  ta.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && e.data) {
      const pos = ta.selectionStart;
      const s = smart(ta.value.slice(0, pos));
      if (s) ta.setRangeText(s[0], pos - s[1], pos, 'end');
    }
    render();
    touched();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && ghost) {
      e.preventDefault();
      ta.setRangeText(ghost, ta.selectionStart, ta.selectionEnd, 'end');
      render();
      touched();
    }
  });
  // Moving the caret off the end of the text hides the suggestion, as it does in the app.
  document.addEventListener('selectionchange', () => document.activeElement === ta && render());

  document.getElementById('replay').addEventListener('click', () => {
    ta.blur();
    if (reduced) {
      live = false;
      editor.classList.remove('live');
      finish();
    } else play();
  });

  if (reduced) finish();
  else {
    ta.value = START;
    render();
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (!live) play();
    }, { threshold: 0.45 });
    io.observe(document.getElementById('demo'));
  }
}

// ---------- story bible: the chart and the map point at each other ----------

const bible = document.getElementById('bible');
if (bible) {

  const links = [...bible.querySelectorAll('line[data-a]')];
  const linked = (el, id) => el.dataset.a === id || el.dataset.b === id;
  const focusOn = (id) => {
    const near = new Set([id]);
    for (const l of links) if (linked(l, id)) near.add(l.dataset.a === id ? l.dataset.b : l.dataset.a);
    bible.classList.add('focusing');
    for (const el of bible.querySelectorAll('.row[data-id], .node')) el.classList.toggle('on', near.has(el.dataset.id));
    for (const el of bible.querySelectorAll('.map [data-a]')) el.classList.toggle('on', linked(el, id));
  };
  const unfocus = () => bible.classList.remove('focusing');
  for (const el of bible.querySelectorAll('.row[data-id], .node')) {
    el.addEventListener('pointerenter', () => focusOn(el.dataset.id));
    el.addEventListener('pointerleave', unfocus);
    el.addEventListener('focus', () => focusOn(el.dataset.id));
    el.addEventListener('blur', unfocus);
  }
}

// ---------- whole book ----------

// Screenshot theme follows the system until someone picks one.
const shot = document.getElementById('shot');
if (shot) {
  const themeButtons = document.querySelectorAll('[data-theme]');
  const showTheme = (theme) => {
    shot.src = `/app-${theme}.png`;
    for (const b of themeButtons) b.setAttribute('aria-pressed', b.dataset.theme === theme);
  };
  if (matchMedia('(prefers-color-scheme: dark)').matches) showTheme('dark');
  for (const b of themeButtons) b.addEventListener('click', () => showTheme(b.dataset.theme));
}

const STATUSES = [
  ['idea', 'Not started'],
  ['progress', 'In progress'],
  ['drafted', 'Drafted'],
  ['revised', 'Revised'],
  ['done', 'Done'],
];
for (const b of document.querySelectorAll('#chapters .fold')) {
  b.addEventListener('click', () => {
    const open = b.parentElement.classList.toggle('open');
    b.setAttribute('aria-expanded', open);
    b.nextElementSibling.inert = !open;
  });
}
for (const b of document.querySelectorAll('#chapters .status')) {
  b.addEventListener('click', () => {
    const i = STATUSES.findIndex(([id]) => id === b.dataset.s);
    const [id, label] = STATUSES[(i + 1) % STATUSES.length];
    b.dataset.s = id;
    b.textContent = label;
  });
}

// The five structures, act by act, as the app's new-project templates lay them out.
const STRUCTURES = {
  'Three-Act': [
    ['Act One: Setup', ['The Hook', 'Setup', 'Inciting Incident', 'Plot Point One']],
    ['Act Two: Confrontation', ['Rising Action', 'Midpoint', 'Complications', 'Plot Point Two']],
    ['Act Three: Resolution', ['Climax', 'Resolution']],
  ],
  'Save the Cat!': [
    ['Act One: Thesis', ['Opening Image', 'Theme Stated', 'Setup', 'Catalyst', 'Debate']],
    ['Act Two: Antithesis', ['Break into Two', 'B Story', 'Fun and Games', 'Midpoint', 'Bad Guys Close In', 'All Is Lost', 'Dark Night of the Soul']],
    ['Act Three: Synthesis', ['Break into Three', 'Finale', 'Final Image']],
  ],
  'Hero’s Journey': [
    ['Departure', ['The Ordinary World', 'The Call to Adventure', 'Refusal of the Call', 'Meeting the Mentor', 'Crossing the Threshold']],
    ['Initiation', ['Tests, Allies and Enemies', 'Approach to the Inmost Cave', 'The Ordeal', 'The Reward']],
    ['Return', ['The Road Back', 'The Resurrection', 'Return with the Elixir']],
  ],
  'Seven-Point': [
    ['Act One', ['Hook', 'Plot Turn One']],
    ['Act Two', ['Pinch Point One', 'Midpoint', 'Pinch Point Two']],
    ['Act Three', ['Plot Turn Two', 'Resolution']],
  ],
  'Story Circle': [
    ['The Familiar World', ['You', 'Need']],
    ['The Unfamiliar World', ['Go', 'Search', 'Find', 'Take']],
    ['Back Home', ['Return', 'Change']],
  ],
};
const FOLDER = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M1.5 4.5v8.5h13V5.5H8L6.5 3.5h-5z"/></svg>';
const structs = document.getElementById('structs');
if (structs) {
  const acts = document.getElementById('acts');
  const showStructure = (name, animate) => {
    acts.innerHTML = STRUCTURES[name]
      .map(([act, beats]) => `<div class="act"><b>${FOLDER}${act}</b><ol>${beats.map((b) => `<li>${b}</li>`).join('')}</ol></div>`)
      .join('');
    for (const b of structs.children) b.setAttribute('aria-pressed', b.textContent === name);
    if (animate) acts.classList.remove('swap'), void acts.offsetWidth, acts.classList.add('swap');
  };
  for (const name of Object.keys(STRUCTURES)) {
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
    b.addEventListener('click', () => showStructure(name, true));
    structs.append(b);
  }
  showStructure('Three-Act');
}

const rel = document.getElementById('rel');
if (rel) {
  const books = document.querySelectorAll('#books button');
  for (const b of books) {
    b.addEventListener('click', () => {
      for (const o of books) o.setAttribute('aria-pressed', o === b);
      rel.textContent = b.dataset.rel;
    });
  }
}

// ---------- versions: a working compare view ----------
// The chapter against an older version of itself, marked up the way the app does it: each change can
// be taken back or kept, and the two texts can sit side by side. A change is [id, older, newer].

const cmp = document.getElementById('cmp');
if (cmp) {
  const PARAS = [
    ['Mara found the ledger on ', ['c1', 'her', 'the'], ' third morning', ['c2', ' on the island', ''], ', wedged behind the stove where the floorboards had swollen with salt.'],
    ['The handwriting was her grandmother’s', ['c3', ', she was sure of it', ''], '. She knew it from birthday cards', ['c4', ' and', ','], ' from the recipe tin', ['c5', '', ', from the backs of photographs'], ': the long, impatient loops.'],
    [['c6', 'She remembered sitting on Gran’s kitchen floor at six or seven, watching her write in a book like this one. “The weather,” Gran had said, without looking up. “Somebody has to.”', '']],
    ['Every entry was like that. Weather, the time the lamp was lit, the ships that passed', ['c7', '', ' or didn’t'], '. Forty years of it, and not one word about the man who had rowed out to the island in the winter of 1961', ['c8', '', ' and never rowed back'], '.'],
    ['“She ', ['c9', 'never wrote anything', 'wasn’t the type to write things'], ' down,” her mother had said on the phone.'],
  ];
  const rev = {}; // id → 'old' (taken back) or 'kept'
  let view = 'inline';
  const body = document.getElementById('cmp-body');
  const summary = document.getElementById('cmp-summary');
  const reset = document.getElementById('cmp-reset');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const count = (s) => (s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;
  const span = (t, cls, id) => (t ? `<span class="${cls}"${id ? ` data-c="${id}"` : ''}>${esc(t)}</span>` : '');

  const render = () => {
    let added = 0;
    let removed = 0;
    let open = 0;
    const rows = PARAS.map((p) => {
      let inline = '';
      let older = '';
      let newer = '';
      const cards = [];
      for (const s of p) {
        if (typeof s === 'string') {
          inline += esc(s);
          older += esc(s);
          newer += esc(s);
          continue;
        }
        const [id, del, ins] = s;
        if (rev[id] === 'old') {
          inline += span(del, 'back');
          older += esc(del);
          newer += span(del, 'back');
        } else if (rev[id] === 'kept') {
          inline += esc(ins);
          older += esc(del);
          newer += esc(ins);
        } else {
          open++;
          added += count(ins);
          removed += count(del);
          inline += span(del, `del${ins ? ' pair' : ''}`, id) + span(ins, 'ins', id);
          older += span(del, 'del', id);
          newer += span(ins, 'ins', id);
          const label = del && ins ? 'Use old' : del ? 'Bring back' : 'Remove';
          const quote = (t, cls) => (t ? `<span class="${cls}">${esc(t.trim().replace(/^, /, ''))}</span>` : '');
          cards.push(
            `<div class="cmp-card" data-c="${id}"><span class="cmp-quote">${quote(del, 'del')}${del && ins ? '<span class="arrow">→</span>' : ''}${quote(ins, 'ins')}</span>` +
              `<button type="button" data-act="old" data-id="${id}">${label}</button><button type="button" data-act="kept" data-id="${id}">Keep</button></div>`
          );
        }
      }
      if (view === 'side') {
        const right = newer.replace(/<[^>]+>/g, '').trim() ? `<p>${newer}</p>` : '<p class="cut">Cut from this version</p>';
        return `<div class="cmp-side"><p>${older}</p>${right}</div>`;
      }
      if (!inline.replace(/<[^>]+>/g, '').trim()) return '';
      return `<div class="cmp-row"><p>${inline}</p><div class="cmp-margin">${cards.join('')}</div></div>`;
    });
    const head = view === 'side' ? '<div class="cmp-side cmp-side-head"><span>Before cutting the flashback</span><span>Now</span></div>' : '';
    body.innerHTML = head + rows.join('');
    body.classList.toggle('side', view === 'side');
    summary.innerHTML = open
      ? `<span class="plus">+${added} words</span> <span class="minus">−${removed} words</span> · ${open} ${open === 1 ? 'change' : 'changes'} to look at`
      : 'Every change looked at';
    reset.hidden = !Object.keys(rev).length;
  };

  cmp.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act) rev[b.dataset.id] = b.dataset.act;
    if (b.dataset.view) {
      view = b.dataset.view;
      for (const o of cmp.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', o === b);
    }
    if (b === reset) for (const k of Object.keys(rev)) delete rev[k];
    render();
  });
  // Pointing at a change lights up its card, and the other way round.
  const light = (id, on) => {
    for (const el of cmp.querySelectorAll(`[data-c="${id}"]`)) el.classList.toggle('hl', on);
  };
  cmp.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-c]');
    if (el) light(el.dataset.c, true);
  });
  cmp.addEventListener('pointerout', (e) => {
    const el = e.target.closest('[data-c]');
    if (el) light(el.dataset.c, false);
  });
  render();
}

// ---------- versions: takes ----------

const takes = document.getElementById('takes');
if (takes) {
  const TEXT = {
    orig: 'But she had written this down, every day, for forty years. Mara turned the pages slowly, the way you would walk through a house you used to live in, and somewhere in November the dates began to skip.',
    dark: 'But she had written this down, every day, for forty years. Mara turned to December 1961 and found three pages cut out close to the spine, so cleanly she almost missed it.',
  };
  let open = 'orig';
  let inBook = 'orig';
  const text = document.getElementById('take-text');
  const put = document.getElementById('take-put');
  const show = () => {
    for (const b of takes.querySelectorAll('[data-take]')) {
      b.setAttribute('aria-pressed', b.dataset.take === open);
      b.querySelector('.where').textContent = b.dataset.take === inBook ? 'In the book' : 'Another take';
    }
    text.textContent = TEXT[open];
    put.hidden = open === inBook;
  };
  for (const b of takes.querySelectorAll('[data-take]')) {
    b.addEventListener('click', () => {
      open = b.dataset.take;
      show();
    });
  }
  put.addEventListener('click', () => {
    inBook = open;
    show();
  });
  show();
}

// ---------- changelog ----------
// Each release's notes as GitHub renders them, under its version and date. The notes' "Full
// Changelog" line becomes the link to that release's commits.

const releases = document.getElementById('releases');
if (releases) {
  const day = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  // Shortcuts written as symbols (⇧⌘D, ⌘N, ↵, Esc in brackets) become keys.
  const KEYS = /[⌃⌥⇧⌘]+[^\s),.;:]+|↵|(?<=\()Esc(?=\))/gu;

  const notes = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html || '';
    const page = t.content;
    let changes = null;
    for (const p of page.querySelectorAll('p')) {
      if (!/^Full Changelog/.test(p.textContent.trim())) continue;
      changes = p.querySelector('a')?.href || null;
      p.remove();
    }
    // The page's own headings are the versions, so the notes' headings step down one.
    for (const h of page.querySelectorAll('h2, h3')) {
      const to = document.createElement(h.tagName === 'H2' ? 'h3' : 'h4');
      to.append(...h.childNodes);
      h.replaceWith(to);
    }
    const walk = document.createTreeWalker(page, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('code, pre, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const texts = [];
    while (walk.nextNode()) texts.push(walk.currentNode);
    for (const n of texts) {
      const parts = n.data.split(KEYS);
      const keys = n.data.match(KEYS);
      if (!keys) continue;
      n.replaceWith(...parts.flatMap((s, i) => (i < keys.length ? [s, Object.assign(document.createElement('kbd'), { textContent: keys[i] })] : [s])));
    }
    // A shortcut that was in bold on its own is just the key.
    for (const b of page.querySelectorAll('strong')) {
      if (b.childNodes.length === 1 && b.firstChild.nodeName === 'KBD') b.replaceWith(b.firstChild);
    }
    return { page, changes };
  };

  const show = (list) => {
    const latest = list.find((r) => !r.prerelease);
    releases.replaceChildren(
      ...list.map((r, i) => {
        const v = r.tag_name.replace(/^v/, '');
        const { page, changes } = notes(r.body_html);
        const empty = !page.children.length;
        const el = document.createElement('article');
        el.className = `release${empty ? ' quiet' : ''}`;
        el.id = r.tag_name;
        const label = r === latest ? '<span class="pill">Latest</span>' : r.prerelease ? '<span class="pill pre">Pre-release</span>' : '';
        el.innerHTML =
          `<div class="release-head"><h2><a href="#${esc(r.tag_name)}"><span>Version</span> ${esc(v)}</a></h2>` +
          `<p class="release-date"><time datetime="${esc(r.published_at)}">${day.format(new Date(r.published_at))}</time>${label}</p></div>` +
          '<div class="notes"></div>';
        const body = el.querySelector('.notes');
        if (empty) body.innerHTML = `<p class="none">${i === list.length - 1 ? 'The first release.' : 'No notes for this update.'}</p>`;
        else body.append(page);
        const more = [changes && `<a href="${esc(changes)}">Every change in ${esc(v)}</a>`, `<a href="${esc(r.html_url)}">Downloads</a>`];
        body.insertAdjacentHTML('beforeend', `<p class="release-more">${more.filter(Boolean).join('<span aria-hidden="true">·</span>')}</p>`);
        return el;
      })
    );
    // The browser looked for #v0.6.0 before the releases were here.
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  };

  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github.html+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list) => show(list.filter((r) => !r.draft)))
    .catch(() => {
      releases.innerHTML = `<p class="releases-note">The notes didn’t load just now. Every release and its notes are also on <a href="https://github.com/${REPO}/releases">GitHub</a>.</p>`;
    });
}
