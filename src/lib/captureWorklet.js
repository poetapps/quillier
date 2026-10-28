// Audio worklet for dictation (loaded by src/dictation.js; a file of its own because the page's
// content security policy only runs scripts from the app itself). The microphone at 16 kHz mono,
// in 100 ms chunks, averaged down from the device's rate when the audio context isn't at 16 kHz.
class QuillierCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.acc = 0;
    this.n = 0;
    this.buf = new Float32Array(1600);
    this.len = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.n++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        this.buf[this.len++] = this.acc / this.n;
        this.acc = 0;
        this.n = 0;
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(1600);
          this.len = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('quillier-capture', QuillierCapture);
