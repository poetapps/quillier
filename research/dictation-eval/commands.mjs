// Do spoken commands ("open quote", "new paragraph", …) still work when Whisper's prompt shows it
// dialogue? Speaks each line, transcribes it with the app's prompt with dialogue off and on, runs
// the result through the app's own cleanup and formatting (src/lib/dictationText.js) and compares.
//
//   DICTATION_MODELS_DIR=/path/to/ggml/models node research/dictation-eval/commands.mjs [model id]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { initWhisper } from '@fugood/whisper.node';
import { cleanTranscript } from '../../electron/dictation/engine.mjs';
import { formatDictation, blocksToText, whisperPrompt, tidyHeard } from '../../src/lib/dictationText.js';

const { MODELS } = createRequire(import.meta.url)('../../electron/dictation/catalog.js');
const MODELS_DIR = process.env.DICTATION_MODELS_DIR || path.join(os.homedir(), 'Library/Application Support/Quillier/models');
const AUDIO = path.join(os.tmpdir(), 'quillier-dictation-eval');
const NAMES = ['Aelwyn', 'Brannoc', 'Mara'];
const PROMPTS = { off: whisperPrompt({ names: NAMES }), dialogue: whisperPrompt({ names: NAMES, dialogue: true }) };
const VOICES = ['', 'Daniel', 'Flo (English (US))'];

const CASES = [
  ["John said, open quote, let's go to the movies, close quote, with an excited smile.", 'John said, “Let’s go to the movies,” with an excited smile.'],
  ['Open quote, stand back, close quote, he said.', '“Stand back,” he said.'],
  ['Open quote, are you coming? Close quote, she asked.', '“Are you coming?” she asked.'],
  ['She left the room. New paragraph. Morning came slowly.', 'She left the room.\n\nMorning came slowly.'],
  ['He closed the book. Scene break. Three years later, the house was empty.', 'He closed the book.\n\n* * *\n\nThree years later, the house was empty.'],
  ['The rain fell, new line, on the hills.', 'The rain fell,\non the hills.'],
];

function clip(text, voice) {
  fs.mkdirSync(AUDIO, { recursive: true });
  const wav = path.join(AUDIO, `${Buffer.from(`${voice}:${text}`).toString('base64url').slice(0, 80)}.wav`);
  if (!fs.existsSync(wav)) execFileSync('say', [...(voice ? ['-v', voice] : []), '-o', wav, '--data-format=LEI16@16000', text]);
  const buf = fs.readFileSync(wav);
  const at = buf.indexOf('data') + 8;
  return buf.buffer.slice(buf.byteOffset + at, buf.byteOffset + buf.length);
}

const id = process.argv[2] || 'whisper-turbo';
const model = MODELS.find((m) => m.id === id);
const ctx = await initWhisper({ filePath: path.join(MODELS_DIR, model.file), useGpu: true, useFlashAttn: true });
const score = Object.fromEntries(Object.keys(PROMPTS).map((k) => [k, 0]));
for (const [said, want] of CASES) {
  for (const voice of VOICES) {
    const pcm = clip(said, voice);
    for (const [name, prompt] of Object.entries(PROMPTS)) {
      const heard = cleanTranscript((await ctx.transcribeData(pcm, { language: 'en', temperature: 0, prompt }).promise).result);
      const got = blocksToText(formatDictation(tidyHeard(heard)));
      if (got === want) score[name]++;
      else console.log(`${name} [${voice || 'system'}]\n   heard: ${heard}\n   got:   ${JSON.stringify(got)}\n   want:  ${JSON.stringify(want)}`);
    }
  }
}
await ctx.release();
const total = CASES.length * VOICES.length;
console.log(`\n${model.label}: ${Object.entries(score).map(([k, v]) => `${k} ${v}/${total}`).join(', ')}`);
