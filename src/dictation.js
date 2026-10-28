// Dictation: say it, and the words go where the cursor is. Optional, and separate from the alpha
// smart features: a one-time download of a speech model, then everything runs on this computer
// (electron/dictation). It writes down what was said and nothing else.
//
// While listening, the microphone is cut into stretches at the writer's pauses and each stretch is
// transcribed as soon as it ends, so words show up in the dictation bar a sentence or so at a time.
// Nothing touches the page until Finish, which puts it all in as one undoable change. Discard
// throws it away.

import { Slice, Fragment } from '@tiptap/pm/model';
import { getState, setState, subscribe, getMainEditor, setPrefs, toast, registerCommand } from './store.js';
import { nameHintsFor } from './lib/nameHints.js';
import { formatDictation, fitToCursor, blocksToText, whisperPrompt, tidyHeard, joinHeard } from './lib/dictationText.js';
import { Segmenter } from './lib/dictationAudio.js';
import workletUrl from './lib/captureWorklet.js?url&no-inline';

const api = window.api;

let mic = null; // { stream, ctx, node }
let segmenter = null;
let queue = []; // PCM stretches waiting for the speech model
let busy = false;
let runId = 0; // bumps on Discard/close, so late answers are dropped
let target = null; // where the words go: { editor } | { el }
let drainWaiters = [];
const levelListeners = new Set();

const setDictation = (patch) => setState((s) => ({ dictation: { ...s.dictation, ...patch } }));
const setSession = (patch) => setState((s) => ({ dictation: { ...s.dictation, session: s.dictation.session ? { ...s.dictation.session, ...patch } : null } }));
const session = () => getState().dictation.session;

export const onLevel = (fn) => {
  levelListeners.add(fn);
  return () => levelListeners.delete(fn);
};

// The installed model to use: the one picked in Settings, else the one suggested for this computer.
export function activeDictationModel() {
  const { prefs, dictation } = getState();
  const installed = (dictation.status?.models || []).filter((m) => m.installed);
  return (installed.find((m) => m.id === prefs.dictationModel) || installed.find((m) => m.id === dictation.status?.recommended) || installed[0])?.id || null;
}

export function dictationPreview(raw) {
  return formatDictation(raw, { curly: getState().prefs.smartTypography !== false });
}

// ---------- start, finish, discard ----------

export function toggleDictation() {
  const s = session();
  if (!s) return startDictation();
  if (s.phase === 'listening' || s.phase === 'starting') return finishDictation();
  if (s.phase !== 'finishing') closeDictation();
}

export function startDictation() {
  if (session()) return;
  target = captureTarget();
  const status = getState().dictation.status;
  const base = { raw: '', pending: 0, error: null, ready: false };
  if (!status || !status.supported) {
    setDictation({ session: { ...base, phase: 'error', error: 'Dictation isn’t available on this computer.' } });
    return;
  }
  const model = activeDictationModel();
  if (!model) {
    setDictation({ session: { ...base, phase: 'setup' } });
    return;
  }
  begin(model);
}

async function begin(model) {
  const id = ++runId;
  setDictation({ session: { raw: '', pending: 0, error: null, ready: false, phase: 'starting', model } });
  const access = await api.dictationMic();
  if (id !== runId) return;
  if (access !== 'granted') {
    setSession({ phase: 'error', error: 'mic' });
    return;
  }
  try {
    await openMic();
  } catch (e) {
    if (id !== runId) return;
    stopMic();
    setSession({ phase: 'error', error: e?.name === 'NotAllowedError' ? 'mic' : `The microphone didn’t start (${e?.message || e}).` });
    return;
  }
  if (id !== runId) return stopMic();
  setSession({ phase: 'listening' });
  // Load the model while the writer starts talking; their first words wait in the queue.
  api.dictationWarm(model).then((r) => {
    if (id !== runId || !session()) return;
    if (r.ok) setSession({ ready: true });
    else fail(r.error);
  });
}

export async function finishDictation() {
  const s = session();
  if (!s) return;
  if (s.phase !== 'listening' && s.phase !== 'starting') return closeDictation();
  const id = runId;
  segmenter?.flush();
  stopMic();
  setSession({ phase: 'finishing' });
  await drained();
  if (id !== runId || !session()) return;
  const raw = session().raw;
  closeDictation();
  if (raw.trim()) insert(dictationPreview(raw));
}

export function discardDictation() {
  closeDictation();
}

export function closeDictation() {
  runId++;
  stopMic();
  queue = [];
  const waiters = drainWaiters;
  drainWaiters = [];
  waiters.forEach((w) => w());
  setDictation({ session: null });
}

function fail(error) {
  stopMic();
  queue = [];
  setSession({ phase: 'error', error: error === 'not-installed' ? 'The speech model is missing. Download it again in Settings.' : error });
}

// ---------- microphone ----------

async function openMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  let ctx;
  let source;
  try {
    ctx = new AudioContext({ sampleRate: 16000 });
    source = ctx.createMediaStreamSource(stream);
  } catch {
    ctx?.close();
    ctx = new AudioContext();
    source = ctx.createMediaStreamSource(stream);
  }
  mic = { stream, ctx, node: null };
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, 'quillier-capture');
  mic.node = node;
  segmenter = new Segmenter({
    onSegment: (pcm) => {
      queue.push(pcm);
      setSession({ pending: queue.length + (busy ? 1 : 0) });
      pump();
    },
    onLevel: (level, speech) => levelListeners.forEach((fn) => fn(level, speech)),
  });
  node.port.onmessage = (e) => segmenter?.push(e.data);
  source.connect(node);
  node.connect(ctx.destination); // the node outputs silence; this just keeps it running
  if (ctx.state === 'suspended') await ctx.resume();
}

function stopMic() {
  if (!mic) return;
  const { stream, ctx, node } = mic;
  mic = null;
  segmenter = null;
  try { node && (node.port.onmessage = null); node?.disconnect(); } catch { /* already gone */ }
  stream.getTracks().forEach((t) => t.stop());
  ctx.close().catch(() => {});
  levelListeners.forEach((fn) => fn(0, false));
}

// ---------- transcription ----------

function names() {
  const { project, series } = getState();
  if (!project) return [];
  return nameHintsFor(project, series).map((n) => n.text);
}

async function pump() {
  if (busy) return;
  busy = true;
  const id = runId;
  while (queue.length && id === runId) {
    const pcm = queue.shift();
    const s = session();
    if (!s) break;
    setSession({ pending: queue.length + 1 });
    const dialogue = getState().prefs.dictationDialogue !== false;
    const r = await api.dictationTranscribe({ model: s.model, pcm, prompt: whisperPrompt({ names: names(), previous: s.raw, dialogue }) });
    if (id !== runId || !session()) break;
    if (!r.ok) {
      fail(r.error);
      break;
    }
    setSession({ raw: joinHeard(session().raw, tidyHeard(r.text), { dialogue }), pending: queue.length, ready: true });
  }
  busy = false;
  if (!queue.length) {
    const waiters = drainWaiters;
    drainWaiters = [];
    waiters.forEach((w) => w());
  } else if (id !== runId) {
    queue = [];
  }
}

function drained() {
  if (!busy && !queue.length) return Promise.resolve();
  return new Promise((resolve) => drainWaiters.push(resolve));
}

// ---------- putting the words in ----------

// Where the words should go: the editor or text box that had the cursor when dictation started.
// Falls back to the chapter editor at Finish.
function captureTarget() {
  const el = document.activeElement;
  const pm = el?.closest?.('.ProseMirror');
  if (pm?.editor && !pm.editor.isDestroyed) return { editor: pm.editor };
  if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search)$/.test(el.type)))) return { el };
  return { editor: null };
}

function insert(blocks) {
  const editor = target?.editor && !target.editor.isDestroyed ? target.editor : target?.el && document.contains(target.el) ? null : getMainEditor();
  if (editor) return insertIntoEditor(editor, blocks);
  if (target?.el && document.contains(target.el)) return insertIntoField(target.el, blocks);
  navigator.clipboard.writeText(blocksToText(blocks)).then(
    () => toast('There was nowhere to put it, so what you said is on the clipboard'),
    () => toast('There was nowhere to put what you said'),
  );
}

function inline(schema, text) {
  const nodes = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) nodes.push(schema.nodes.hardBreak.create());
    if (line) nodes.push(schema.text(line));
  });
  return nodes;
}

function insertIntoEditor(editor, blocks) {
  const { state, view } = editor;
  const { schema, selection } = state;
  const { $from, $to } = selection;
  const before = $from.parent.isTextblock ? $from.parent.textBetween(0, $from.parentOffset, '', '\n') : '';
  const after = $to.parent.isTextblock ? $to.parent.textBetween($to.parentOffset, $to.parent.content.size, '', '\n') : '';
  const fitted = fitToCursor(blocks, { before, after });
  const nodes = fitted.map((b) => (b.type === 'hr' ? schema.nodes.horizontalRule.create() : schema.nodes.paragraph.create(null, inline(schema, b.text))));
  const openStart = nodes[0].type.name === 'paragraph' ? 1 : 0;
  const openEnd = nodes[nodes.length - 1].type.name === 'paragraph' ? 1 : 0;
  const tr = state.tr.replaceSelection(new Slice(Fragment.from(nodes), openStart, openEnd)).scrollIntoView();
  view.dispatch(tr);
  editor.commands.focus();
}

function insertIntoField(el, blocks) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const lineStart = el.value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = el.value.indexOf('\n', end);
  const fitted = fitToCursor(blocks, { before: el.value.slice(lineStart, start), after: el.value.slice(end, lineEnd < 0 ? undefined : lineEnd) });
  const text = el.tagName === 'INPUT' ? blocksToText(fitted, { paragraph: ' ', scene: '' }).replace(/\s+/g, ' ') : blocksToText(fitted);
  el.focus();
  // execCommand keeps the field's own undo working and fires the input event React listens for.
  if (!document.execCommand('insertText', false, text)) {
    el.setRangeText(text, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ---------- keys while the bar is up ----------

function onKeyDown(e) {
  const s = session();
  if (!s || e.isComposing) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    if (s.phase !== 'finishing') closeDictation();
  } else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (s.phase === 'listening' || s.phase === 'starting')) {
    e.preventDefault();
    e.stopPropagation();
    finishDictation();
  }
}

// ---------- settings actions ----------

export const downloadDictationModel = (id) => api.dictationDownload(id).then((status) => setDictation({ status }));
export const cancelDictationDownload = () => api.dictationCancel().then((status) => setDictation({ status }));
export async function removeDictationModel(id) {
  const ok = await api.confirm({ type: 'question', message: 'Delete this speech model?', detail: 'You can download it again any time.', buttons: ['Delete', 'Cancel'] });
  if (ok !== 0) return;
  const status = await api.dictationRemove(id);
  setDictation({ status });
  if (getState().prefs.dictationModel === id) setPrefs({ dictationModel: null });
}
export const openMicSettings = () => api.dictationMicSettings();

// From the bar's setup step: download the suggested model, then start listening once it's in.
export function setUpDictation(id) {
  setSession({ downloading: id });
  downloadDictationModel(id);
}

export async function initDictation() {
  if (!api.dictationStatus) return;
  try {
    setDictation({ status: await api.dictationStatus() });
  } catch {
    return;
  }
  api.onDictationStatus((status) => {
    setDictation({ status });
    const s = session();
    if (s?.phase === 'setup' && s.downloading && status.models.some((m) => m.id === s.downloading && m.installed)) begin(s.downloading);
  });
  registerCommand('dictate', toggleDictation);
  window.addEventListener('keydown', onKeyDown, true);
  // A closed project takes its editors with it: stop listening, and keep what was said.
  let project = getState().project;
  subscribe(() => {
    const now = getState().project;
    if (now === project) return;
    project = now;
    if (now || !session()) return;
    const raw = session().raw;
    closeDictation();
    if (raw.trim()) navigator.clipboard.writeText(blocksToText(dictationPreview(raw))).then(() => toast('What you said is on the clipboard'), () => {});
  });
}
