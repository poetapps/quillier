// End-to-end check of dictation inside Electron: starts the utilityProcess worker through the same
// DictationManager the app uses, transcribes a spoken sentence made with macOS `say`, a stretch of
// silence, and quits (exit code 0 on success).
//
//   npx electron electron/dictation/selftest.js                        # Standard model from the app's folder
//   DICTATION_MODEL=whisper-small-en DICTATION_MODELS_DIR=/path npx electron electron/dictation/selftest.js
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, utilityProcess } = require('electron');
const { DictationManager } = require('./manager.js');

const modelId = process.env.DICTATION_MODEL || 'whisper-turbo';
const SENTENCE = 'The lighthouse keeper climbed the stairs, new paragraph, and lit the lamp.';

function spokenPcm() {
  const wav = path.join(os.tmpdir(), `quillier-dictation-${process.pid}.wav`);
  execFileSync('say', ['-o', wav, '--data-format=LEI16@16000', SENTENCE]);
  const buf = fs.readFileSync(wav);
  fs.rmSync(wav, { force: true });
  const at = buf.indexOf('data') + 8;
  return new Uint8Array(buf.subarray(at));
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let code = 1;
  const manager = new DictationManager({
    userData: app.getPath('userData'),
    modelsDir: process.env.DICTATION_MODELS_DIR,
    utilityProcess,
    log: (m) => console.log('[worker]', m),
  });
  try {
    const before = manager.status();
    console.log('supported:', before.supported, '| recommended:', before.recommended,
      '| installed:', before.models.filter((m) => m.installed).map((m) => m.id).join(', ') || 'none', '| vad:', manager.vadPath);
    let t = Date.now();
    const warm = await manager.warm(modelId);
    if (!warm.ok) throw new Error(warm.error);
    console.log(`warm (spawn + load): ${Date.now() - t} ms`);
    t = Date.now();
    const res = await manager.transcribe(modelId, spokenPcm(), { prompt: 'Lighthouse.' });
    if (!res.ok) throw new Error(res.error);
    console.log(`speech: ${JSON.stringify(res.text)} (${res.speechMs} ms of speech, ${Date.now() - t} ms)`);
    const silence = await manager.transcribe(modelId, new Uint8Array(16000 * 2 * 2));
    console.log(`silence: ${JSON.stringify(silence.text)}`);
    const ok = /lighthouse keeper/i.test(res.text) && /lamp/i.test(res.text) && silence.ok && silence.text === '';
    await manager.unload();
    console.log(ok ? 'SELFTEST OK' : 'SELFTEST: unexpected result');
    code = ok ? 0 : 1;
  } catch (e) {
    console.error('SELFTEST FAILED:', (e && e.stack) || e);
  }
  manager.shutdown();
  app.exit(code);
});
