// Speech-to-text for dictation: whisper.cpp through @fugood/whisper.node, with Silero VAD in front.
// Used by worker.mjs (inside an Electron utilityProcess) and directly by selftest.js.
//
// Audio is 16 kHz mono signed 16-bit PCM, one spoken stretch at a time (the renderer cuts at pauses).
import { initWhisper, initWhisperVad } from '@fugood/whisper.node';

const MIN_SPEECH_MS = 200; // less than this is a click or a breath, not words

// Whisper's notes about the audio rather than words in it: [BLANK_AUDIO], (music), ♪, and the
// subtitle credits it learned from its training data.
const NOISE = [
  /\[[^\]]*\]/g,
  /\((?:[^)]*\b(?:music|applause|laugh\w*|sigh\w*|silence|inaudible|cough\w*|nois\w*|blank|static)\b[^)]*)\)/gi,
  /\*[^*\n]{1,30}\*/g,
  /♪+/g,
  /\b(?:subtitles|captions|transcription)\s+by\b[^.!?]*[.!?]?/gi,
  /\bamara\.org\b[^.!?]*[.!?]?/gi,
];

export function cleanTranscript(text) {
  let t = String(text || '');
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

export class DictationEngine {
  constructor({ vadPath, log = () => {} }) {
    this.vadPath = vadPath;
    this.log = log;
    this.ctx = null;
    this.vad = null;
    this.loadedId = null;
    this.loadedPath = null;
    this.queue = Promise.resolve();
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

  transcribe(id, modelPath, pcm, { prompt, language } = {}) {
    return this._run(async () => {
      await this._load(id, modelPath);
      return this._transcribe(pcm, { prompt, language });
    });
  }

  async _load(id, modelPath) {
    if (!this.vad) {
      const t0 = Date.now();
      this.vad = await initWhisperVad({ filePath: this.vadPath, useGpu: false, nThreads: 4 });
      this.log(`voice detector ready in ${Date.now() - t0} ms`);
    }
    if (this.ctx && this.loadedId === id && this.loadedPath === modelPath) return;
    if (this.ctx) await this._releaseModel();
    const t0 = Date.now();
    this.ctx = await initWhisper({ filePath: modelPath, useGpu: true, useFlashAttn: true });
    this.loadedId = id;
    this.loadedPath = modelPath;
    this.log(`loaded ${id} in ${Date.now() - t0} ms`);
  }

  async _releaseModel() {
    const ctx = this.ctx;
    this.ctx = null;
    this.loadedId = null;
    this.loadedPath = null;
    if (ctx) await ctx.release();
  }

  async _unload() {
    await this._releaseModel();
    if (this.vad) {
      const vad = this.vad;
      this.vad = null;
      await vad.release();
    }
  }

  async _transcribe(pcm, { prompt, language }) {
    const t0 = Date.now();
    const speech = await this.vad.detectSpeechData(pcm, {});
    // Segment times come back in centiseconds, like whisper.cpp's own timestamps.
    const speechMs = speech.reduce((sum, s) => sum + (s.t1 - s.t0) * 10, 0);
    if (speechMs < MIN_SPEECH_MS) return { text: '', speechMs, ms: Date.now() - t0 };
    const { promise } = this.ctx.transcribeData(pcm, {
      language: language || 'en',
      temperature: 0,
      ...(prompt ? { prompt } : {}),
    });
    const result = await promise;
    return { text: cleanTranscript(result.result), speechMs, ms: Date.now() - t0 };
  }
}
