// Smart-features inference worker. Runs in an Electron utilityProcess (started by manager.js) so a
// native crash or out-of-memory in llama.cpp ends this process, not the app.
//
// Messages in:  { type: 'ask', id, model, path, items } | { type: 'unload', id } | { type: 'info', id }
// Messages out: { type: 'ready' } | { type: 'log', message } | { type: 'reply', id, ok, results?, error?, loaded, info? }
import { SmartEngine } from './engine.mjs';

const port = process.parentPort;
if (!port) {
  console.error('worker.mjs must be started with Electron utilityProcess.fork()');
  process.exit(1);
}

const post = (msg) => port.postMessage(msg);
const engine = new SmartEngine({ log: (message) => post({ type: 'log', message }) });

port.on('message', async ({ data: msg }) => {
  if (!msg || typeof msg !== 'object') return;
  const reply = (fields) => post({ type: 'reply', id: msg.id, loaded: engine.loadedId, ...fields });
  try {
    if (msg.type === 'ask') {
      const results = await engine.ask(msg.model, msg.path, msg.items);
      reply({ ok: true, results });
    } else if (msg.type === 'unload') {
      await engine.unload();
      reply({ ok: true });
    } else if (msg.type === 'info') {
      reply({ ok: true, info: { ...engine.info(), rssMB: Math.round(process.memoryUsage().rss / 1e6) } });
    }
  } catch (e) {
    reply({ ok: false, error: String((e && e.message) || e) });
  }
});

post({ type: 'ready' });
