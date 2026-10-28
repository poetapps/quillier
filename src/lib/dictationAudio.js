// Cuts microphone audio into spoken stretches at the writer's pauses, so each one can be
// transcribed while they carry on talking. Pure: feed it 16 kHz mono samples, it calls back with
// 16-bit PCM for each stretch. No DOM.
//
// Speech vs silence is a loudness test against the room's own noise level (the quietest tenth of
// the last five seconds), so it copes with a fan or a café. The speech worker double-checks every
// stretch with a real voice detector before Whisper hears it.

const RATE = 16000;
const FRAME = 320; // 20 ms
const FRAME_MS = (FRAME / RATE) * 1000;

const toDb = (rms) => 20 * Math.log10(rms + 1e-9);

export class Segmenter {
  constructor({ pauseMs = 1000, maxMs = 25000, preMs = 300, postMs = 250, minSpeechMs = 160, onSegment = () => {}, onLevel = () => {} } = {}) {
    this.pauseFrames = Math.round(pauseMs / FRAME_MS);
    this.maxFrames = Math.round(maxMs / FRAME_MS);
    this.preFrames = Math.round(preMs / FRAME_MS);
    this.postFrames = Math.round(postMs / FRAME_MS);
    this.minSpeechFrames = Math.round(minSpeechMs / FRAME_MS);
    this.onSegment = onSegment;
    this.onLevel = onLevel;
    this.reset();
  }

  reset() {
    this.partial = new Float32Array(FRAME);
    this.partialLen = 0;
    this.history = []; // dB of recent frames, for the noise floor
    this.pre = []; // frames kept from before speech starts
    this.frames = null; // current stretch: [{ samples, db, speech }]
    this.run = 0; // consecutive speech frames, to start a stretch
    this.silent = 0; // consecutive quiet frames inside a stretch
    this.speechFrames = 0;
  }

  noiseFloor() {
    if (this.history.length < 25) return -60;
    const sorted = [...this.history].sort((a, b) => a - b);
    return Math.min(-30, Math.max(-80, sorted[Math.floor(sorted.length * 0.1)]));
  }

  push(samples) {
    let i = 0;
    while (i < samples.length) {
      const n = Math.min(FRAME - this.partialLen, samples.length - i);
      this.partial.set(samples.subarray(i, i + n), this.partialLen);
      this.partialLen += n;
      i += n;
      if (this.partialLen === FRAME) {
        this._frame(this.partial);
        this.partial = new Float32Array(FRAME);
        this.partialLen = 0;
      }
    }
  }

  _frame(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const db = toDb(Math.sqrt(sum / samples.length));
    const speech = db > Math.max(this.noiseFloor() + 12, -58);
    this.history.push(db);
    if (this.history.length > 250) this.history.shift();
    this.onLevel(Math.min(1, Math.max(0, (db + 60) / 50)), speech);

    const frame = { samples, db, speech };
    if (!this.frames) {
      this.pre.push(frame);
      if (this.pre.length > this.preFrames + 3) this.pre.shift();
      this.run = speech ? this.run + 1 : 0;
      if (this.run >= 3) {
        // Three loud frames in a row (60 ms): someone is talking. Keep a little from before.
        this.frames = this.pre;
        this.pre = [];
        this.silent = 0;
        this.speechFrames = this.run;
        this.run = 0;
      }
      return;
    }
    this.frames.push(frame);
    if (speech) {
      this.speechFrames++;
      this.silent = 0;
    } else {
      this.silent++;
    }
    if (this.silent >= this.pauseFrames) this._end(this.frames.length - this.silent + this.postFrames);
    else if (this.frames.length >= this.maxFrames) this._cutLong();
  }

  // Too long without a pause: cut at the quietest moment of the last five seconds and keep going.
  _cutLong() {
    const from = Math.max(1, this.frames.length - 250);
    let at = this.frames.length - 1;
    for (let i = from; i < this.frames.length; i++) if (this.frames[i].db < this.frames[at].db) at = i;
    const rest = this.frames.slice(at);
    this._emit(this.frames.slice(0, at));
    this.frames = rest;
    this.speechFrames = rest.filter((f) => f.speech).length;
    this.silent = 0;
  }

  _end(keep) {
    const frames = this.frames.slice(0, Math.min(keep, this.frames.length));
    const enough = this.speechFrames >= this.minSpeechFrames;
    this.frames = null;
    this.pre = [];
    this.silent = 0;
    this.speechFrames = 0;
    if (enough) this._emit(frames);
  }

  _emit(frames) {
    if (!frames.length) return;
    const pcm = new Int16Array(frames.length * FRAME);
    frames.forEach((f, k) => {
      for (let i = 0; i < FRAME; i++) {
        const v = Math.max(-1, Math.min(1, f.samples[i]));
        pcm[k * FRAME + i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
    });
    this.onSegment(pcm);
  }

  // The writer is done: whatever they were saying counts, even without a pause after it.
  flush() {
    if (this.partialLen) {
      this.partial.fill(0, this.partialLen);
      this._frame(this.partial);
      this.partialLen = 0;
    }
    if (this.frames) this._end(this.frames.length - this.silent + this.postFrames);
  }
}
