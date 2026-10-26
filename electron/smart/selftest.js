// End-to-end check of the smart features inside Electron: starts the utilityProcess worker through
// the same SmartManager the app uses, loads a model, asks one question of each task, prints the
// answers and timings, and quits (exit code 0 on success).
//
//   npx electron electron/smart/selftest.js                  # 0.8B from ./models/smart
//   SMART_MODEL=qwen3.5-4b npx electron electron/smart/selftest.js
//   SMART_MODELS_DIR=/path/to/ggufs <packaged app binary>     # see research/smart-eval/RESULTS.md
'use strict';

const path = require('node:path');
const { app, utilityProcess } = require('electron');
const { SmartManager } = require('./manager.js');

const modelId = process.env.SMART_MODEL || 'qwen3.5-0.8b';
const modelsDir = process.env.SMART_MODELS_DIR || path.join(__dirname, '..', '..', 'models', 'smart');

const items = [
  { task: 'names', passage: 'May pushed the door open and stepped into the rain.', word: 'May',
    senses: ['May, a character in the story (a person)', 'the month of May', 'the ordinary word "may" (might, or is allowed to)'] },
  { task: 'names', passage: 'We married in May, just before the floods.', word: 'May',
    senses: ['May, a character in the story (a person)', 'the month of May', 'the ordinary word "may" (might, or is allowed to)'] },
  { task: 'presence', passage: 'Eleanor thought about her mother all through the long night watch.', person: 'Margaret' },
  { task: 'relation', a: 'Margaret', b: 'Tom', passage: 'Margaret had raised Tom alone since his father drowned.' },
  { task: 'speaker', passage: 'Eleanor set her bag down on the table.\n"You\'re late," Reed said.\n"The tide was against us."', line: 'The tide was against us.', names: ['Eleanor', 'Reed'] },
  { task: 'resolve', cast: [{ name: 'Eleanor Ashby', aliases: ['Nell'], note: "ship's surgeon." }, { name: 'Thomas Ashby', aliases: ['Tom'], note: "Eleanor's younger brother." }],
    passage: 'Nell checked the bandage again.', mention: 'Nell' },
  { task: 'same', passage: 'Tom (Tommy, to his mother) was seventeen that spring.', alias: 'Tommy', person: 'Tom' },
];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  let code = 1;
  const manager = new SmartManager({ userData: app.getPath('userData'), modelsDir, utilityProcess, log: (m) => console.log('[worker]', m) });
  try {
    const before = manager.status();
    console.log('supported:', before.supported, '| totalMemGB:', before.totalMemGB, '| recommended:', before.recommended,
      '| installed:', before.models.filter((m) => m.installed).map((m) => m.id).join(', ') || 'none');
    console.log('app packaged:', app.isPackaged, '| worker:', manager.workerPath);
    const t0 = Date.now();
    const res = await manager.ask(modelId, items);
    console.log(`first ask (spawn + load + ${items.length} questions): ${Date.now() - t0} ms`);
    if (!res.ok) throw new Error(res.error);
    res.results.forEach((r, i) => console.log(' ', items[i].task.padEnd(8), JSON.stringify(r)));
    const t1 = Date.now();
    const again = await manager.ask(modelId, items.slice(0, 2));
    console.log(`second ask (2 questions, model warm): ${Date.now() - t1} ms`, again.ok ? '' : again.error);
    const ok = res.results[0].probs[0] > 0.5 && res.results[1].probs[1] > 0.5;
    console.log('status:', JSON.stringify({ ...manager.status(), relations: '…', models: '…' }));
    await manager.unload();
    console.log('after unload, loaded =', manager.status().loaded);
    console.log(ok ? 'SELFTEST OK' : 'SELFTEST: unexpected answers');
    code = ok ? 0 : 1;
  } catch (e) {
    console.error('SELFTEST FAILED:', e && e.stack || e);
  }
  manager.shutdown();
  app.exit(code);
});
