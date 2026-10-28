// What Whisper heard → text for the page. Pure functions, no DOM.
//
//  - dialogue: Whisper quotes it by itself when its prompt shows it how (research/dictation-eval);
//    tidyHeard() and joinHeard() clean up after it, stretch by stretch
//  - spoken commands: "new paragraph", "new line", "scene break", "open quote" … "close quote"
//  - smart quotes and ellipses, when smart typography is on (pasted-in text skips the input rules)
//  - fitting the words to the cursor: a space before or after, no capital mid-sentence
//
// Text comes out as blocks: { type: 'p', text } (a '\n' in text is a line break) or { type: 'hr' }.
// A leading or trailing empty paragraph means "start a new paragraph here".

const COMMAND =
  /([,;:.!?…]*)[ \t]*\b(new paragraph|next paragraph|new lines?|next line|scene break|(?:open|begin|start) (?:the )?quotes?|(?:close|end) (?:the )?quotes?)\b([,;:.!?…]*)/gi;

const SPEECH_VERBS = new Set(
  'said says say asked asks replied replies answered answers whispered whispers shouted shouts yelled yells called calls cried cries muttered mutters murmured murmurs added adds continued continues began begins snapped snaps told tells exclaimed exclaims demanded demands insisted insists repeated repeats sighed sighs laughed laughs screamed screams breathed breathes hissed hisses growled growls admitted admits agreed agrees'.split(
    ' ',
  ),
);

// Words Whisper capitalizes because it thinks a sentence starts, that are almost never capitalized
// mid-sentence. Anything not listed (names, places, "I") keeps its capital.
const COMMON_WORDS = new Set(
  'a an the and but or nor so yet then he she it they we you him her them us me his hers its their our your my this that these those there here when where while as at in on of to with without for from after before because if just maybe still now not no all some every each which who whom whose what how why into onto over under up down out off again also even only too very really almost never always once until though although like than'.split(
    ' ',
  ),
);

const PRONOUN_TAGS = new Set(['he', 'she', 'they', 'we', 'you', 'it']);

const QUOTE_COMMAND = /\b(?:open|begin|start|close|end) (?:the )?quotes?\b/i;
const BREAK_COMMAND = /\b(?:new paragraph|next paragraph|new lines?|next line|scene break)\b/i;

// Shown to Whisper before what it hears, so it writes dialogue the way novels do. Pronouns only:
// names in an example leak into what it hears ("Tom said" came out as "Sam said").
export const DIALOGUE_EXAMPLE = `"I'm tired," she said. "Me too," he replied. He said, "Let's rest."`;

const lastChar = (s) => (s ? s[s.length - 1] : '');

function capFirst(s) {
  return s.replace(/^([\s"“‘'(]*)(\p{Ll})/u, (_, pre, ch) => pre + ch.toUpperCase());
}

function firstWord(s) {
  return (/^[\s"“‘'(]*([\p{L}’']+)/u.exec(s)?.[1] || '').replace(/[’']s$/, '');
}

function lowerFirstIf(s, words) {
  const w = firstWord(s);
  if (!w || !words.has(w.toLowerCase()) || w === w.toUpperCase()) return s;
  return s.replace(/^([\s"“‘'(]*)(\p{Lu})/u, (_, pre, ch) => pre + ch.toLowerCase());
}

// Straight quotes and three dots → typographer's ones, the way typing them would.
export function smarten(text) {
  return text
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s([{—–‘])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{—–“])'(?=\p{L})/gu, '$1‘')
    .replace(/'/g, '’');
}

// One string of everything Whisper heard this time (segments joined with spaces) → blocks.
export function formatDictation(raw, { curly = true } = {}) {
  const OPEN = curly ? '“' : '"';
  const CLOSE = curly ? '”' : '"';
  const blocks = [];
  let cur = '';
  let capNext = false;
  let lowerPronoun = false;
  let lowerTag = false;
  let lastWasBreak = false;

  const pushText = (t) => {
    t = t.replace(/\s+/g, ' ');
    if (!t.trim()) return;
    if (!cur || /[\n“"‘(]$/.test(cur)) t = t.replace(/^\s+/, '');
    else if (!/^\s/.test(t) && !/^[,.;:!?…)”’]/.test(t)) t = ' ' + t;
    if (capNext) t = capFirst(t);
    if (lowerPronoun) t = lowerFirstIf(t, PRONOUN_TAGS);
    if (lowerTag) t = lowerFirstIf(t, SPEECH_VERBS);
    capNext = false;
    lowerPronoun = false;
    lowerTag = false;
    lastWasBreak = false;
    cur += t;
  };
  const endSentence = (before) => {
    cur = cur.trimEnd();
    const terminal = [...before].reverse().find((c) => '.?!…'.includes(c));
    if (terminal) cur += terminal;
    else if (/[\p{L}\p{N}]$/u.test(cur)) cur += '.';
    else cur = cur.replace(/[,;:]+$/, '.');
  };
  const endParagraph = () => {
    if (cur || (!blocks.length && !lastWasBreak)) blocks.push({ type: 'p', text: cur });
    cur = '';
  };

  let at = 0;
  for (const m of String(raw || '').matchAll(COMMAND)) {
    pushText(raw.slice(at, m.index));
    at = m.index + m[0].length;
    const [, before, word, after] = m;
    const w = word.toLowerCase();
    if (w.endsWith('paragraph') || w === 'scene break') {
      if (cur) endSentence(before);
      if (!lastWasBreak || w === 'scene break') endParagraph();
      if (w === 'scene break') blocks.push({ type: 'hr' });
      lastWasBreak = true;
      capNext = true;
    } else if (/lines?$/.test(w)) {
      cur = cur.trimEnd() + before + '\n';
    } else if (/^(open|begin|start)/.test(w)) {
      cur = cur.trimEnd();
      let b = before;
      const prev = /([\p{L}]+)$/u.exec(cur)?.[1];
      if (!b && prev && SPEECH_VERBS.has(prev.toLowerCase())) b = ',';
      cur += b;
      if (cur && !cur.endsWith('\n')) cur += ' ';
      cur += OPEN;
      capNext = true;
      lastWasBreak = false;
    } else {
      // Which punctuation goes inside the closing quote: a spoken ? or ! wins; before a dialogue
      // tag ("he said", "said John") a comma, however Whisper punctuated it; otherwise the end of
      // a sentence, then a comma. "go, close quote. He said." → go,” he said.
      const b = lastChar(before);
      const a = lastChar(after);
      const [w1, w2] = (/^\s*([\p{L}’']+)(?:\s+([\p{L}’']+))?/u.exec(String(raw).slice(at)) || []).slice(1).map((x) => (x || '').toLowerCase());
      const tag = SPEECH_VERBS.has(w1) || (SPEECH_VERBS.has(w2) && (PRONOUN_TAGS.has(w1) || /^\p{Lu}/u.test(String(raw).slice(at).trim())));
      const inner = '?!'.includes(b) && b ? b : tag ? ',' : '.?!…'.includes(a) && a ? a : ',.…'.includes(b) && b ? b : a === ',' ? ',' : '';
      cur = cur.trimEnd() + inner + CLOSE;
      if (inner && inner !== '.' && inner !== '…') lowerPronoun = true;
      if (tag) lowerTag = true;
      lastWasBreak = false;
    }
  }
  pushText(String(raw || '').slice(at));
  if (cur || lastWasBreak) blocks.push({ type: 'p', text: cur });

  return blocks.map((b) => (b.type === 'p' ? { type: 'p', text: tidy(b.text, curly) } : b));
}

function tidy(text, curly) {
  let t = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
  t = t.replace(/\s+([,.;:!?…])/g, '$1');
  return curly ? smarten(t) : t;
}

// Fits blocks to the cursor. before/after: the text of the cursor's paragraph on either side.
export function fitToCursor(blocks, { before = '', after = '' } = {}) {
  if (!blocks.length) return blocks;
  const out = blocks.map((b) => ({ ...b }));
  const first = out[0];
  const last = out[out.length - 1];
  if (first.type === 'p' && first.text) {
    const prev = before.replace(/[ \t]+$/, '');
    const midSentence = /[\p{L}\p{N},;:—–-]$/u.test(prev);
    if (midSentence) first.text = lowerFirstIf(first.text, COMMON_WORDS);
    if (before && !/[\s“‘"'(\[—–/]$/.test(before) && !/^[,.;:!?…)”’]/.test(first.text)) first.text = ' ' + first.text;
  }
  if (last.type === 'p' && last.text && after) {
    if (/^\p{Ll}/u.test(after)) last.text = last.text.replace(/\.$/, '') + ' ';
    else if (!/^[\s,.;:!?…)”’\]—–]/.test(after)) last.text += ' ';
  }
  return out;
}

// For the preview and for plain text fields.
export function blocksToText(blocks, { paragraph = '\n\n', scene = '* * *' } = {}) {
  return blocks.map((b) => (b.type === 'hr' ? scene : b.text)).join(paragraph);
}

// What Whisper is told came just before: the writer's story-bible names (so it spells them), an
// example of dialogue when it should quote, and the last words it heard this time (so sentences
// carry on). Whisper keeps only the last ~220 tokens of a prompt, so all of it stays well short.
export function whisperPrompt({ names = [], previous = '', dialogue = false } = {}) {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  let list = '';
  for (const n of uniq) {
    if (list.length + n.length > 240) break;
    list += (list ? ', ' : '') + n;
  }
  const tail = previous.length > 300 ? previous.slice(previous.indexOf(' ', previous.length - 300) + 1) : previous;
  return [list && `${list}.`, dialogue && DIALOGUE_EXAMPLE, tail].filter(Boolean).join(' ');
}

// One stretch as Whisper wrote it → what to keep. A stretch with "open quote" or "close quote" in
// it is the writer placing quotes themselves, so Whisper's own guesses there go. (Whisper's quotes
// are otherwise kept, even unasked: sometimes it turns a spoken "open quote" into the mark itself,
// and the words are gone.) And Whisper sometimes treats a spoken break as the start of a quote
// ("New paragraph. Morning came."): that quote and its partner go.
export function tidyHeard(text) {
  let t = String(text || '');
  if (QUOTE_COMMAND.test(t)) return t.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  const opener = new RegExp(`["“]\\s*(?=${BREAK_COMMAND.source})`, 'i');
  for (let m = opener.exec(t); m; m = opener.exec(t)) {
    const rest = t.slice(m.index + m[0].length);
    const close = rest.search(/["”]/);
    t = t.slice(0, m.index) + (close < 0 ? rest : rest.slice(0, close) + rest.slice(close + 1));
  }
  // A quote closed just after a spoken break belongs before it: Wait. New paragraph." → Wait." New paragraph.
  t = t.replace(new RegExp(`(\\s*)(${BREAK_COMMAND.source})([,;:.!?…]*)\\s*["”]`, 'gi'), '"$1$2$3');
  return t.trim();
}

// A stretch that is only a dialogue tag: "John said.", "she replied quietly.", "said the old man."
// Stricter than formatting's verbs ("Mara laughed." and "Nobody answered." are narration), and
// pronoun subjects are he, she and they only ("I said nothing" is narration too).
const TAG_VERBS = new Set(
  'said says asked asks replied replies answered answers whispered whispers shouted shouts yelled yells muttered mutters murmured murmurs snapped snaps exclaimed exclaims demanded demands insisted insists hissed hisses'.split(' '),
);
const NOT_SUBJECTS = new Set('nobody everyone everybody someone somebody anyone anybody none all one no each'.split(' '));

function isBareTag(text) {
  if (!/[.!?]$/.test(text)) return false;
  const words = text.replace(/[.!?]$/, '').split(/\s+/);
  const lower = words.map((w) => w.toLowerCase());
  if (words.length > 7) return false;
  const capitalized = (i) => /^\p{Lu}/u.test(words[i]) && !COMMON_WORDS.has(lower[i]) && !NOT_SUBJECTS.has(lower[i]);
  if ((['he', 'she', 'they'].includes(lower[0]) || capitalized(0)) && TAG_VERBS.has(lower[1])) {
    const rest = lower.slice(2);
    return rest.length === 0 || (rest.length === 1 && (/ly$/.test(rest[0]) || rest[0] === 'again')) || rest[0] === 'with' || (rest[0] === 'to' && rest.length === 2);
  }
  if (TAG_VERBS.has(lower[0]) && words.length <= 4) return capitalized(1) || ['the', 'his', 'her', 'their'].includes(lower[1]);
  return false;
}

// Adds a stretch to what was heard so far. With dialogue on, a stretch that's only a tag ("John
// said.") makes the sentence before it dialogue: the writer paused between the two, so Whisper
// heard them apart and couldn't tell. "Let's go." + "John said." → "Let's go," John said.
export function joinHeard(raw, text, { dialogue = false } = {}) {
  const heard = String(text || '').trim();
  if (!heard) return raw;
  if (!raw) return heard;
  if (dialogue && isBareTag(heard)) {
    const m = /(^|[.?!…]["”]?\s+|\n)([^.?!…\n"“”]+)([.?!…])$/u.exec(raw);
    if (m && !QUOTE_COMMAND.test(m[2]) && !BREAK_COMMAND.test(m[2])) {
      const start = m.index + m[1].length;
      const tag = lowerFirstIf(lowerFirstIf(heard, PRONOUN_TAGS), SPEECH_VERBS);
      return `${raw.slice(0, start)}"${m[2]}${m[3] === '.' ? ',' : m[3]}" ${tag}`;
    }
  }
  return `${raw} ${heard}`;
}
