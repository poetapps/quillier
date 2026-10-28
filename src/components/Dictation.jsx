import { useEffect, useRef } from 'react';
import { Mic, Check, Download } from 'lucide-react';
import { useStore, setPrefs } from '../store.js';
import {
  toggleDictation,
  finishDictation,
  discardDictation,
  closeDictation,
  dictationPreview,
  onLevel,
  setUpDictation,
  downloadDictationModel,
  cancelDictationDownload,
  removeDictationModel,
  openMicSettings,
} from '../dictation.js';
import { IconButton, Toggle } from './ui.jsx';

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const pct = (d) => (d.total ? Math.round((d.received / d.total) * 100) : 0);
const keep = (e) => e.preventDefault(); // buttons that shouldn't take the cursor from the page

// The microphone in the top bar.
export function DictationButton() {
  const on = useStore((s) => !!s.dictation.session);
  const show = useStore((s) => s.prefs.dictationButton !== false);
  if (!show && !on) return null;
  return <IconButton icon={Mic} title={on ? 'Finish dictating  ⇧⌘D' : 'Dictate  ⇧⌘D'} className={on ? 'on dictate-btn' : 'dictate-btn'} onMouseDown={keep} onClick={toggleDictation} />;
}

function Level() {
  const ref = useRef(null);
  useEffect(
    () =>
      onLevel((level, speech) => {
        const el = ref.current;
        if (!el) return;
        el.style.setProperty('--level', level.toFixed(2));
        el.classList.toggle('speaking', speech);
      }),
    [],
  );
  return (
    <span ref={ref} className="dictation-level">
      <Mic size={15} strokeWidth={2} />
    </span>
  );
}

function Preview({ raw, pending }) {
  const ref = useRef(null);
  const blocks = raw ? dictationPreview(raw) : [];
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [raw, pending]);
  return (
    <div ref={ref} className="dictation-text">
      {blocks.length === 0 && !pending && (
        <span className="dictation-placeholder">Start talking. Say “new paragraph”, or “open quote” … “close quote”, as you go.</span>
      )}
      {blocks.map((b, i) =>
        b.type === 'hr' ? (
          <div key={i} className="dictation-hr">
            * * *
          </div>
        ) : (
          <p key={i}>
            {b.text}
            {pending > 0 && i === blocks.length - 1 && <span className="dictation-dots" />}
          </p>
        ),
      )}
      {pending > 0 && (blocks.length === 0 || blocks[blocks.length - 1].type === 'hr') && (
        <p>
          <span className="dictation-dots" />
        </p>
      )}
    </div>
  );
}

function SetupStep({ status, s }) {
  const rec = status.models.find((m) => m.id === status.recommended) || status.models[0];
  const dl = status.download;
  return (
    <>
      <div className="dictation-body">
        <div className="dictation-title">Dictation</div>
        <p className="dictation-note">
          Talk, and Quillier writes down exactly what you say. The speech model runs on this computer, so nothing you say leaves it. It needs a one-time
          download first.
        </p>
        {dl && dl.state !== 'error' ? (
          <div className="smart-dl dictation-dl">
            <span className="smart-dl-bar">
              <span style={{ width: `${pct(dl)}%` }} />
            </span>
            <span className="smart-dl-text">{dl.state === 'verifying' ? 'Checking…' : `${pct(dl)}%`}</span>
          </div>
        ) : (
          dl?.state === 'error' && <p className="smart-error">Download failed: {dl.error || 'try again'}.</p>
        )}
      </div>
      <div className="dictation-actions">
        <button className="btn small" onMouseDown={keep} onClick={closeDictation}>
          {dl && dl.state !== 'error' ? 'Hide' : 'Not now'}
        </button>
        {dl && dl.state !== 'error' ? (
          <button className="btn small" onMouseDown={keep} onClick={cancelDictationDownload}>
            Cancel download
          </button>
        ) : (
          <button className="btn small primary" onMouseDown={keep} onClick={() => setUpDictation(rec.id)}>
            <Download size={14} strokeWidth={1.8} /> Download ({mb(rec.bytes)})
          </button>
        )}
      </div>
    </>
  );
}

function ErrorStep({ error }) {
  const mic = error === 'mic';
  return (
    <>
      <div className="dictation-body">
        <div className="dictation-title">{mic ? 'Quillier can’t hear you' : 'Dictation stopped'}</div>
        <p className="dictation-note">
          {mic
            ? window.api.platform === 'darwin'
              ? 'Allow Quillier to use the microphone in System Settings → Privacy & Security → Microphone, then try again.'
              : 'Allow Quillier to use the microphone in your system’s privacy settings, then try again.'
            : error}
        </p>
      </div>
      <div className="dictation-actions">
        <button className="btn small" onMouseDown={keep} onClick={closeDictation}>
          Close
        </button>
        {mic && window.api.platform !== 'linux' && (
          <button className="btn small primary" onMouseDown={keep} onClick={openMicSettings}>
            Open Settings
          </button>
        )}
      </div>
    </>
  );
}

// The floating bar while dictating: what's been heard so far, then Discard or Finish.
export function DictationBar() {
  const s = useStore((st) => st.dictation.session);
  const status = useStore((st) => st.dictation.status);
  useStore((st) => st.prefs.smartTypography); // the preview's quotes follow it
  if (!s) return null;

  if (s.phase === 'setup' && status) {
    return (
      <div className="dictation-bar setup" role="dialog" aria-label="Dictation">
        <SetupStep status={status} s={s} />
      </div>
    );
  }
  if (s.phase === 'error') {
    return (
      <div className="dictation-bar setup" role="dialog" aria-label="Dictation">
        <ErrorStep error={s.error} />
      </div>
    );
  }

  const finishing = s.phase === 'finishing';
  const label = finishing ? 'Writing it down…' : s.phase === 'starting' ? 'Starting the microphone…' : !s.ready ? 'Listening · getting the speech model ready…' : 'Listening';
  return (
    <div className={`dictation-bar ${finishing ? 'finishing' : ''}`} role="dialog" aria-label="Dictation">
      <div className="dictation-main">
        <Level />
        <Preview raw={s.raw} pending={s.pending} />
      </div>
      <div className="dictation-actions">
        <span className="dictation-status">{label}</span>
        <button className="btn small" onMouseDown={keep} onClick={discardDictation} disabled={finishing} title="Throw away what you said  esc">
          Discard
        </button>
        <button className="btn small primary" onMouseDown={keep} onClick={finishDictation} disabled={finishing} title="Put it on the page  ↵">
          Finish
        </button>
      </div>
    </div>
  );
}

function ModelRow({ m, status, chosen }) {
  const dl = status.download && status.download.id === m.id ? status.download : null;
  const busyElsewhere = status.download && status.download.id !== m.id && status.download.state !== 'error';
  return (
    <div className={`smart-model ${chosen ? 'on' : ''}`}>
      <button className="smart-model-pick" disabled={!m.installed} onClick={() => setPrefs({ dictationModel: m.id })} title={m.installed ? 'Use this model' : 'Download it first'}>
        <span className={`smart-radio ${chosen ? 'on' : ''}`} />
        <span className="smart-model-text">
          <span className="smart-model-name">
            {m.label}
            {status.recommended === m.id && <span className="smart-badge">Best for this computer</span>}
          </span>
          <span className="smart-model-sub">
            {mb(m.bytes)} download · {m.sub}
          </span>
        </span>
      </button>
      <span className="smart-model-action">
        {dl && dl.state !== 'error' ? (
          <>
            <span className="smart-dl">
              <span className="smart-dl-bar">
                <span style={{ width: `${pct(dl)}%` }} />
              </span>
              <span className="smart-dl-text">{dl.state === 'verifying' ? 'Checking…' : `${pct(dl)}%`}</span>
            </span>
            <button className="btn small" onClick={cancelDictationDownload}>
              Cancel
            </button>
          </>
        ) : m.installed ? (
          <>
            <span className="smart-installed">
              <Check size={14} strokeWidth={2} /> Downloaded
            </span>
            <button className="link-btn danger" onClick={() => removeDictationModel(m.id)}>
              Delete
            </button>
          </>
        ) : (
          <button className="btn small" disabled={busyElsewhere} onClick={() => downloadDictationModel(m.id)}>
            <Download size={14} strokeWidth={1.8} /> Download
          </button>
        )}
      </span>
      {dl?.state === 'error' && <span className="smart-error">Download failed: {dl.error || 'try again'}.</span>}
    </div>
  );
}

// Settings → Dictation.
export function DictationSettings({ scrollTo }) {
  const prefs = useStore((s) => s.prefs);
  const status = useStore((s) => s.dictation.status);
  const ref = useRef(null);
  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: 'start' });
  }, [scrollTo]);

  const installed = (status?.models || []).filter((m) => m.installed);
  const chosen = (installed.find((m) => m.id === prefs.dictationModel) || installed.find((m) => m.id === status?.recommended) || installed[0])?.id;

  return (
    <div ref={ref}>
      <div className="panel-label">Dictation</div>
      <p className="smart-intro">
        Talk instead of typing. Press ⇧⌘D or the microphone at the top of the page, say what you want to write, then Finish. It writes down exactly what you
        say. Say “new paragraph”, “new line”, “scene break”, or “open quote” … “close quote” as you go. The speech model runs on this computer, so nothing you
        say leaves it.
      </p>
      {!status ? (
        <p className="setting-hint">Dictation isn’t available in this build.</p>
      ) : !status.supported ? (
        <p className="setting-hint">This computer can’t run the speech model.</p>
      ) : (
        <div className="smart-models">
          {status.models.map((m) => (
            <ModelRow key={m.id} m={m} status={status} chosen={m.id === chosen} />
          ))}
        </div>
      )}
      <div className="setting-row">
        <div>
          <div className="setting-label">Put dialogue in quotation marks</div>
          <div className="setting-hint">
            Quotes what characters say as it writes it down: “Let’s go,” John said. It gets about four lines in five right, so read it over. Off, quotes mostly go
            only where you say “open quote”.
          </div>
        </div>
        <div className="setting-control">
          <Toggle checked={prefs.dictationDialogue !== false} onChange={(dictationDialogue) => setPrefs({ dictationDialogue })} />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-label">Microphone button</div>
          <div className="setting-hint">Shows a microphone at the top of the page. ⇧⌘D works either way.</div>
        </div>
        <div className="setting-control">
          <Toggle checked={prefs.dictationButton !== false} onChange={(dictationButton) => setPrefs({ dictationButton })} />
        </div>
      </div>
      {status?.supported && (
        <p className="smart-fine">Speech models are OpenAI Whisper (MIT licensed) in whisper.cpp’s format, downloaded from Hugging Face and stored in Quillier’s own folder.</p>
      )}
    </div>
  );
}
