// Inference engine for the smart features: node-llama-cpp + the shared prompt builders.
// Used by worker.mjs (inside an Electron utilityProcess) and directly by the eval harness.
//
// Each question is answered with one forward pass: we evaluate the prompt and read the logits of
// the first token the model would generate, summing probability over the tokens that spell each
// option letter ("A", " A", "A)", ...). No text is generated.
//
// Questions of the same task share a long prefix (system prompt + worked examples). That prefix
// is evaluated once and checkpointed; each question then only evaluates its own tail. Qwen 3.5 is
// a hybrid (recurrent + attention) model, so plain KV-cache truncation is not possible and
// node-llama-cpp's sequence checkpoints are what make the reuse work.
import { getLlama, LlamaLogLevel } from 'node-llama-cpp';
import prompts from './prompts.js';

const { buildPrompt, shapeResult, letterOfTokenText, LETTERS } = prompts;

let llamaPromise = null;
function llamaInstance(log) {
  if (!llamaPromise) {
    llamaPromise = getLlama({
      gpu: 'auto',
      build: 'never', // never try to compile llama.cpp on a user's machine
      progressLogs: false,
      logLevel: LlamaLogLevel.error,
      logger: (level, message) => log(`[llama.cpp ${level}] ${String(message).trim()}`),
    }).catch((e) => { llamaPromise = null; throw e; });
  }
  return llamaPromise;
}

export class SmartEngine {
  // contextSize: a question's prompt (examples + passage) must fit; ~4096 tokens leaves room for
  // passages of ~2500 words. batchSize 256 instead of 512 saves ~250 MB of GPU memory with no
  // measurable slowdown on these short prompts.
  constructor({ contextSize = 4096, batchSize = 256, log = () => {} } = {}) {
    this.contextSize = contextSize;
    this.batchSize = batchSize;
    this.log = log;
    this.llama = null;
    this.model = null;
    this.context = null;
    this.sequence = null;
    this.loadedId = null;
    this.loadedPath = null;
    this.letterTokens = null; // letter -> token ids
    this.specialCache = new Map();
    this.prefixCache = new Map(); // prefixKey -> tokens
    this.currentPrefixKey = null; // prefix the sequence holds right now
    this.queue = Promise.resolve();
    this.stats = { prefixEvals: 0, prefixReuses: 0 };
  }

  // Serialize every operation on the engine.
  _run(fn) {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }

  load(id, modelPath) {
    return this._run(() => this._load(id, modelPath));
  }

  unload() {
    return this._run(() => this._unload());
  }

  ask(modelId, modelPath, items, options) {
    return this._run(async () => {
      await this._load(modelId, modelPath);
      return this._ask(items, options || {});
    });
  }

  async _load(id, modelPath) {
    if (this.model && this.loadedId === id && this.loadedPath === modelPath) return;
    await this._unload();
    const t0 = Date.now();
    this.llama = await llamaInstance(this.log);
    this.model = await this.llama.loadModel({ modelPath, gpuLayers: 'auto' });
    try {
      this.context = await this.model.createContext({ contextSize: this.contextSize, batchSize: this.batchSize, sequences: 1 });
      this.sequence = this.context.getSequence({ checkpoints: { max: 4, interval: false } });
      this.letterTokens = this._findLetterTokens();
    } catch (e) {
      await this._unload();
      throw e;
    }
    this.loadedId = id;
    this.loadedPath = modelPath;
    this.log(`loaded ${id} in ${Date.now() - t0} ms (gpu: ${this.llama.gpu || 'none'}, context ${this.context.contextSize})`);
  }

  async _unload() {
    const { sequence, context, model } = this;
    this.sequence = this.context = this.model = null;
    this.loadedId = this.loadedPath = null;
    this.letterTokens = null;
    this.specialCache.clear();
    this.prefixCache.clear();
    this.currentPrefixKey = null;
    try { if (sequence && !sequence.disposed) await sequence.dispose(); } catch { /* ignore */ }
    try { if (context && !context.disposed) await context.dispose(); } catch { /* ignore */ }
    try { if (model && !model.disposed) await model.dispose(); } catch { /* ignore */ }
  }

  // Every vocabulary token that reads as a single option letter, the same rule llm.py applied to
  // Ollama's top tokens: strip, drop trailing ")", strip. (Qwen 3.5: "A", " A", "\tA".)
  _findLetterTokens() {
    const map = Object.fromEntries(LETTERS.map((l) => [l, []]));
    const vocab = this.model.fileInfo?.metadata?.tokenizer?.ggml?.tokens;
    if (Array.isArray(vocab) && vocab.length) {
      for (let id = 0; id < vocab.length; id++) {
        const text = this.model.detokenize([id], false);
        if (!text || text.length > 8) continue;
        const letter = letterOfTokenText(text);
        if (letter) map[letter].push(id);
      }
    } else { // no vocabulary in the metadata: try the usual spellings
      for (const l of LETTERS) {
        for (const text of [l, ` ${l}`, `\t${l}`, `${l})`, ` ${l})`]) {
          const t = this.model.tokenize(text, false);
          if (t.length === 1 && !map[l].includes(t[0])) map[l].push(t[0]);
        }
      }
    }
    return map;
  }

  _special(text) {
    let tok = this.specialCache.get(text);
    if (!tok) {
      tok = this.model.tokenize(text, true);
      if (tok.length !== 1) throw new Error(`expected ${text} to be a single control token`);
      this.specialCache.set(text, tok);
    }
    return tok;
  }

  // Tokenize prompt pieces: control tokens parsed, user text never parsed for control tokens.
  // Adjacent text pieces are joined first, so this equals tokenizing the whole prompt string.
  tokenizePieces(pieces) {
    const out = [];
    let text = '';
    const flush = () => { if (text) out.push(...this.model.tokenize(text, false)); text = ''; };
    for (const p of pieces) {
      if (typeof p === 'string') text += p;
      else { flush(); out.push(...this._special(p.special)); }
    }
    flush();
    return out;
  }

  _cachedTokens(key, pieces) {
    let tokens = this.prefixCache.get(key);
    if (!tokens) {
      tokens = this.tokenizePieces(pieces);
      if (this.prefixCache.size > 32) this.prefixCache.clear();
      this.prefixCache.set(key, tokens);
    }
    return tokens;
  }

  // The prompt's tokens split into the cached shared prefix and this question's own tail.
  _split(built) {
    const full = this.tokenizePieces(built.pieces);
    const startsWith = (p) => p.length <= full.length && p.every((t, i) => full[i] === t);
    let key = built.prefixKey;
    let prefix = this._cachedTokens(key, built.pieces.slice(0, built.prefixLength));
    if (!startsWith(prefix)) { // the extended prefix tokenized differently at its edge
      key = built.basePrefixKey;
      prefix = this._cachedTokens(key, built.pieces.slice(0, built.basePrefixLength));
    }
    return { key, prefix, suffix: full.slice(prefix.length) };
  }

  // Make the sequence hold exactly `prefix` (reusing the checkpointed evaluation when possible).
  async _setPrefix(prefix, reuse) {
    const seq = this.sequence;
    const current = seq.contextTokens;
    const holdsPrefix = reuse && current.length >= prefix.length && prefix.every((t, i) => current[i] === t);
    if (holdsPrefix) {
      if (seq.nextTokenIndex > prefix.length) await seq.eraseContextTokenRanges([{ start: prefix.length, end: seq.nextTokenIndex }]);
      this.stats.prefixReuses++;
      return;
    }
    await seq.clearHistory();
    await seq.evaluateWithoutGeneratingNewTokens(prefix);
    if (seq.needsCheckpoints) await seq.takeCheckpoint();
    this.stats.prefixEvals++;
  }

  // options.reusePrefix (default true): set false to evaluate every prompt from scratch (for measuring).
  async _ask(items, options) {
    const reuse = options.reusePrefix !== false;
    const results = new Array(items.length);
    const built = items.map((item, i) => {
      try { return buildPrompt(item); } catch (e) { results[i] = { error: e.message }; return null; }
    });
    // Group by shared prefix, keeping first-seen order.
    const groups = new Map();
    built.forEach((b, i) => {
      if (!b) return;
      if (!groups.has(b.prefixKey)) groups.set(b.prefixKey, []);
      groups.get(b.prefixKey).push(i);
    });
    // Start with the task whose prefix the sequence already holds (left over from the last call).
    const ordered = [...groups.entries()].sort(([a], [b]) => (b === this.currentPrefixKey) - (a === this.currentPrefixKey));
    for (const [, indexes] of ordered) {
      for (const i of indexes) {
        const t0 = performance.now();
        try {
          const b = built[i];
          const { key, prefix, suffix } = this._split(b);
          if (prefix.length + suffix.length + 1 > this.sequence.contextSize) {
            results[i] = { error: 'too-long', ms: 0 };
            continue;
          }
          await this._setPrefix(prefix, reuse);
          this.currentPrefixKey = key;
          const answer = await this._firstToken(suffix, b.letters);
          const ms = Math.round(performance.now() - t0);
          results[i] = shapeResult(items[i], b, answer.probs, ms);
          if (options.debug) results[i].debug = answer.debug;
        } catch (e) {
          results[i] = { error: String(e && e.message || e), ms: Math.round(performance.now() - t0) };
        }
      }
    }
    return results;
  }

  async _firstToken(suffix, letters) {
    const filter = [];
    const owner = new Map();
    for (const l of letters) for (const id of this.letterTokens[l]) { filter.push(id); owner.set(id, l); }
    const input = suffix.slice(0, -1);
    input.push([suffix[suffix.length - 1], {
      generateNext: { token: true, totalLogitWeight: true, logits: { filter: { tokens: filter, includeSelected: true } } },
    }]);
    const out = await this.sequence.controlledEvaluate(input);
    const next = out[input.length - 1]?.next;
    if (!next || !next.logits) throw new Error('no logits returned');
    // Greedy sampling: the selected token is the argmax, so its logit is the max logit.
    const maxLogit = next.token != null && next.logits.has(next.token)
      ? next.logits.get(next.token)
      : Math.max(...next.logits.values());
    const mass = Object.fromEntries(letters.map((l) => [l, 0]));
    for (const [id, logit] of next.logits) {
      const l = owner.get(id);
      if (l) mass[l] += Math.exp(logit - maxLogit) / next.totalLogitWeight;
    }
    const total = letters.reduce((s, l) => s + mass[l], 0);
    let probs;
    if (total > 0) probs = letters.map((l) => mass[l] / total);
    else { // no letter has any probability: fall back to the greedy token
      const pick = letters.indexOf(letterOfTokenText(this.model.detokenize([next.token], false)));
      probs = letters.map((_, i) => (i === Math.max(0, pick) ? 1 : 0));
    }
    return {
      probs,
      debug: {
        top: next.token != null ? this.model.detokenize([next.token], false) : null,
        topP: next.token != null && next.logits.has(next.token) ? 1 / next.totalLogitWeight : null,
        letterMass: total,
      },
    };
  }

  info() {
    return {
      loaded: this.loadedId,
      gpu: this.llama ? this.llama.gpu : null,
      contextSize: this.context ? this.context.contextSize : null,
      stats: { ...this.stats },
    };
  }
}
