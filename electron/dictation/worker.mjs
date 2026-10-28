// Dictation worker. Runs in an Electron utilityProcess (started by manager.js) so a native crash or
// out-of-memory in whisper.cpp ends this process, not the app.
//
// Messages in:  { type: 'load', id, model, path } | { type: 'transcribe', id, model, path, pcm, prompt, language } | { type: 'unload', id }
// Messages out: { type: 'ready' } | { type: 'log', message } | { type: 'reply', id, ok, text?, speechMs?, ms?, error?, loaded }
import { DictationEngine } from './engine.mjs';

const port = process.parentPort;
if (!port) {
  console.error('worker.mjs must be started with Electron utilityProcess.fork()');
  process.exit(1);
}

const post = (msg) => port.postMessage(msg);
const vadPath = process.argv.find((a) => a.startsWith('--vad='))?.slice(6);
const engine = new DictationEngine({ vadPath, log: (message) => post({ type: 'log', message }) });

const asArrayBuffer = (pcm) => (pcm instanceof ArrayBuffer ? pcm : pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));

port.on('message', async ({ data: msg }) => {
  if (!msg || typeof msg !== 'object') return;
  const reply = (fields) => post({ type: 'reply', id: msg.id, loaded: engine.loadedId, ...fields });
  try {
    if (msg.type === 'load') {
      await engine.load(msg.model, msg.path);
      reply({ ok: true });
    } else if (msg.type === 'transcribe') {
      const result = await engine.transcribe(msg.model, msg.path, asArrayBuffer(msg.pcm), { prompt: msg.prompt, language: msg.language });
      reply({ ok: true, ...result });
    } else if (msg.type === 'unload') {
      await engine.unload();
      reply({ ok: true });
    }
  } catch (e) {
    reply({ ok: false, error: String((e && e.message) || e) });
  }
});

post({ type: 'ready' });
