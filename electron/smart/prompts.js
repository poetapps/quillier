// Prompt builders for the optional smart features. Shared by the inference worker and the
// eval harness (research/smart-eval), so what we measure is exactly what the app asks.
//
// Ported verbatim from research/julia-1/llm.py + llm_fewshot.py: every question is a lettered
// multiple choice, preceded by 2-4 worked examples for its task as earlier user/assistant turns,
// and the answer is read from the probability of the first generated token over the letters.
'use strict';

const SYSTEM = 'You are a careful reader helping a novelist keep track of their story. ' +
  'Read the passage and answer the question by choosing exactly one option. ' +
  'Base your answer only on the text you are given.';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const OTHER = 'someone else (not one of these characters)';

// Order matters: it is the option order the model sees (A..K).
const RELATIONS = {
  siblings: 'siblings (brother or sister)',
  parent: 'parent and child (including step-parents)',
  spouses: 'married to each other',
  romance: 'romantic interest or lovers (not married)',
  former: 'former romantic partners or ex-spouses',
  relative: 'other relatives (cousins, grandparents, in-laws, aunts, uncles)',
  friends: 'friends',
  rivals: 'enemies or rivals',
  work: 'boss and worker, or commander and subordinate',
  mentor: 'teacher or mentor and student',
  none: 'no relationship is stated in this passage',
};
const RELATION_KEYS = Object.keys(RELATIONS);

const SAME_OPTIONS = ['No, they are two different people', 'Yes, both names refer to the same person'];

// Worked examples, one list per task: [state, question, options, answer].
// options === null means "the test's own option list" (relationships), and the answer is then a
// relation key rather than a letter. Names and sentences do not appear in the test cases.
const EXAMPLES = {
  names: [
    ['June knelt beside the fire and fed it another log.', 'In this passage, what does the word "June" refer to?',
      ['June, a character in the story (a person)', 'the month of June'], 'A'],
    ['The wedding is set for the second week of June.', 'In this passage, what does the word "June" refer to?',
      ['June, a character in the story (a person)', 'the month of June'], 'B'],
    ['"Faith is all we have left now," the priest said.', 'In this passage, what does the word "Faith" refer to?',
      ['Faith, a character in the story (a person)', 'the ordinary word "faith" (belief or trust)'], 'B'],
    ['Faith slammed the door behind her and ran.', 'In this passage, what does the word "Faith" refer to?',
      ['Faith, a character in the story (a person)', 'the ordinary word "faith" (belief or trust)'], 'A'],
  ],
  resolve: [
    ['Characters in this story:\n- Ada Lowe: a lighthouse keeper.\n- Ben Lowe: Ada\'s grown son, a fisherman.\n- Clara Finch: the village schoolteacher.\n\n' +
      'Passage:\nThe keeper climbed the stairs at dusk to light the lamp.', 'In the passage, who does "The keeper" refer to?',
    ['Ada Lowe', 'Ben Lowe', 'Clara Finch', OTHER], 'A'],
    ['Characters in this story:\n- Ada Lowe: a lighthouse keeper.\n- Ben Lowe: Ada\'s grown son, a fisherman.\n- Clara Finch: the village schoolteacher.\n\n' +
      'Passage:\nClara waved to Ada. She was carrying a basket of eggs up the cliff path.', 'In the passage, who does "She" refer to?',
    ['Ada Lowe', 'Ben Lowe', 'Clara Finch', OTHER], 'C'],
  ],
  same: [
    ['Clara and the teacher walked home together.', 'Based on this passage, are "Clara" and "the teacher" the same person?',
      SAME_OPTIONS, 'A'],
    ['Benjamin, whom everyone called Ben, mended nets on the quay.', 'Based on this passage, are "Ben" and "Benjamin" the same person?',
      SAME_OPTIONS, 'B'],
  ],
  relation: [
    ["Ada's son Ben wrote home every Sunday.", 'What is the relationship between Ada and Ben in this passage?', null, 'parent'],
    ['Clara and Ben had grown up in the same orphanage and trusted each other completely.',
      'What is the relationship between Clara and Ben in this passage?', null, 'friends'],
    ['Ben had loved Clara once, but she left him for a sailor years ago.',
      'What is the relationship between Ben and Clara in this passage?', null, 'former'],
    ['Ada and Clara passed each other on the cliff path without a word.',
      'What is the relationship between Ada and Clara in this passage?', null, 'none'],
  ],
  speaker: [
    ['Ada set down the lamp.\n"Is it him?" Clara asked.\n"I can\'t tell from here."\n"Then go and look."',
      'Who speaks the line "I can\'t tell from here."?', ['Ada', 'Clara'], 'A'],
    ['Ada set down the lamp.\n"Is it him?" Clara asked.\n"I can\'t tell from here."\n"Then go and look."',
      'Who speaks the line "Then go and look."?', ['Ada', 'Clara'], 'B'],
  ],
  presence: [
    ['Ada wondered what Ben was doing in the city tonight.',
      'Is Ben physically present in this scene (not just mentioned, remembered, or imagined)?',
      ['Ben is only mentioned, remembered, or imagined', 'Ben is physically there in the scene'], 'A'],
    ['Ben poured Ada a cup of tea and sat down across from her.',
      'Is Ada physically present in this scene (not just mentioned, remembered, or imagined)?',
      ['Ada is only mentioned, remembered, or imagined', 'Ada is physically there in the scene'], 'B'],
  ],
  // 'direction' (who is the parent / boss?) had no examples in the research: asked zero-shot.
};

function userPrompt(state, question, options) {
  const opts = options.map((d, i) => `${LETTERS[i]}) ${d}`).join('\n');
  return `${state}\n\nQuestion: ${question}\n\nOptions:\n${opts}\n\nAnswer with only the letter of the best option.`;
}

// "Characters in this story:" block, as in cases.py CODEX / CODEX_ALIASES.
function renderCast(cast) {
  const lines = cast.map((c) => {
    const aliases = Array.isArray(c.aliases) ? c.aliases.filter(Boolean) : [];
    const head = aliases.length ? `${c.name} (also called ${aliases.join(', ')})` : c.name;
    return c.note ? `- ${head}: ${c.note}` : `- ${head}`;
  });
  return 'Characters in this story:\n' + lines.join('\n');
}

// Turn one API item into the multiple-choice question it asks.
// Returns { task, state, question, options, relationKeys? } plus how to read the answer.
function questionFor(item) {
  const s = (v) => (v == null ? '' : String(v));
  switch (item && item.task) {
    case 'names':
      if (!Array.isArray(item.senses) || item.senses.length < 2) throw new Error('names: needs at least 2 senses');
      return { task: 'names', state: s(item.passage), question: `In this passage, what does the word "${s(item.word)}" refer to?`,
        options: item.senses.map(s) };
    case 'presence': {
      const person = s(item.person);
      return { task: 'presence', state: s(item.passage),
        question: `Is ${person} physically present in this scene (not just mentioned, remembered, or imagined)?`,
        options: [`${person} is only mentioned, remembered, or imagined`, `${person} is physically there in the scene`] };
    }
    case 'relation': {
      // `order` is for the eval harness (options reversed); the app always uses RELATIONS order.
      const keys = Array.isArray(item.order) ? item.order : RELATION_KEYS;
      if (keys.length !== RELATION_KEYS.length || !RELATION_KEYS.every((k) => keys.includes(k))) throw new Error('relation: bad order');
      return { task: 'relation', state: s(item.passage), question: `What is the relationship between ${s(item.a)} and ${s(item.b)} in this passage?`,
        options: keys.map((k) => RELATIONS[k]), relationKeys: keys };
    }
    case 'speaker':
      if (!Array.isArray(item.names) || item.names.length < 2) throw new Error('speaker: needs at least 2 names');
      return { task: 'speaker', state: s(item.passage), question: `Who speaks the line "${s(item.line)}"?`, options: item.names.map(s) };
    case 'resolve': {
      if (!Array.isArray(item.cast) || item.cast.length < 1) throw new Error('resolve: needs a cast');
      const names = item.cast.map((c) => s(c.name));
      const head = renderCast(item.cast) + '\n\nPassage:\n';
      // The cast list is the same for every mention, so it can join the shared, cached prefix.
      return { task: 'resolve', state: head + s(item.passage), sharedHead: head,
        question: `In the passage, who does "${s(item.mention)}" refer to?`, options: [...names, OTHER] };
    }
    case 'same':
      return { task: 'same', state: s(item.passage), question: `Based on this passage, are "${s(item.alias)}" and "${s(item.person)}" the same person?`,
        options: SAME_OPTIONS.slice() };
    case 'direction':
      if (!Array.isArray(item.names) || item.names.length < 2) throw new Error('direction: needs at least 2 names');
      return { task: 'direction', state: s(item.passage), question: s(item.question), options: item.names.map(s) };
    default:
      throw new Error(`unknown task: ${item && item.task}`);
  }
}

// Chat messages exactly as llm_fewshot.messages_for builds them.
function messagesFor(q) {
  if (q.options.length > LETTERS.length) throw new Error('too many options');
  const msgs = [{ role: 'system', content: SYSTEM }];
  for (const [exState, exQuestion, exOptions, exAnswer] of EXAMPLES[q.task] || []) {
    let opts = exOptions;
    let answer = exAnswer;
    if (opts === null) { // relationship examples share the test's option list
      opts = q.options;
      answer = LETTERS[q.relationKeys.indexOf(exAnswer)];
    }
    msgs.push({ role: 'user', content: userPrompt(exState, exQuestion, opts) }, { role: 'assistant', content: answer });
  }
  msgs.push({ role: 'user', content: userPrompt(q.state, q.question, q.options) });
  return msgs;
}

// The prompt as text pieces for the Qwen 3.5 chat template with thinking disabled (the GGUF's
// template with enable_thinking=false, which is also what Ollama renders for think:false):
//   <|im_start|>system\n…<|im_end|>\n<|im_start|>user\n…<|im_end|>\n<|im_start|>assistant\nA<|im_end|>\n
//   … <|im_start|>user\n…<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n
// Earlier assistant turns get no think block (they come before the last user turn). Contents are
// trimmed, as both templates do. Pieces are { special } (a control token) or plain strings, so
// user text is never parsed for control tokens. `basePrefixLength` = number of pieces shared by
// every question of the task (everything up to and including the final <|im_start|>).
// `prefixLength` may go further, into the final user turn, when the question starts with text
// shared by a batch (`sharedHead`, e.g. the cast list); the engine checks that this split
// tokenizes exactly like the whole prompt and otherwise falls back to `basePrefixLength`.
const IM_START = { special: '<|im_start|>' };
const IM_END = { special: '<|im_end|>' };

function chatPieces(messages, sharedHead) {
  const pieces = [];
  let basePrefixLength = 0;
  let prefixLength = 0;
  messages.forEach((m, i) => {
    const content = String(m.content).trim();
    if (i === messages.length - 1) {
      basePrefixLength = prefixLength = pieces.length + 1;
      if (sharedHead && content.startsWith(sharedHead) && content.length > sharedHead.length) {
        pieces.push(IM_START, `${m.role}\n${sharedHead}`, content.slice(sharedHead.length), IM_END, '\n');
        prefixLength = basePrefixLength + 1;
        return;
      }
    }
    pieces.push(IM_START, `${m.role}\n${content}`, IM_END, '\n');
  });
  pieces.push(IM_START, 'assistant\n<think>\n\n</think>\n\n');
  return { pieces, prefixLength, basePrefixLength };
}

function piecesToString(pieces) {
  return pieces.map((p) => (typeof p === 'string' ? p : p.special)).join('');
}

// Everything the runtime needs for one item.
function buildPrompt(item) {
  const q = questionFor(item);
  const messages = messagesFor(q);
  const { pieces, prefixLength, basePrefixLength } = chatPieces(messages, q.sharedHead);
  return {
    task: q.task,
    options: q.options,
    letters: LETTERS.slice(0, q.options.length),
    relationKeys: q.relationKeys,
    messages,
    pieces,
    prefixLength,
    basePrefixLength,
    prefixKey: piecesToString(pieces.slice(0, prefixLength)),
    basePrefixKey: piecesToString(pieces.slice(0, basePrefixLength)),
  };
}

// Shape the per-option probabilities into the API result for the item.
function shapeResult(item, built, probs, ms) {
  const round = (x) => Math.round(x * 1e6) / 1e6;
  const p = probs.map(round);
  switch (built.task) {
    case 'presence':
    case 'same':
      return { p: p[1], ms };
    case 'relation':
      return { keys: built.relationKeys.slice(), probs: p, ms };
    case 'resolve':
      return { options: [...item.cast.map((c) => String(c.name)), 'other'], probs: p, ms };
    default:
      return { probs: p, ms };
  }
}

// Which option letter a generated token stands for, like llm.py: strip, drop a trailing ")",
// strip again ("A", " A", "A)", " A)" all count as A).
function letterOfTokenText(text) {
  const t = String(text).trim().replace(/\)+$/, '').trim();
  return t.length === 1 && t >= 'A' && t <= 'Z' ? t : null;
}

module.exports = {
  SYSTEM,
  LETTERS,
  OTHER,
  RELATIONS,
  RELATION_KEYS,
  EXAMPLES,
  userPrompt,
  renderCast,
  questionFor,
  messagesFor,
  chatPieces,
  piecesToString,
  buildPrompt,
  shapeResult,
  letterOfTokenText,
};
