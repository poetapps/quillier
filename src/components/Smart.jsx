import { useEffect, useRef } from 'react';
import { Sparkles, X, Check, Download } from 'lucide-react';
import { useStore, setPrefs, openModal, smartActive } from '../store.js';
import { downloadModel, cancelDownload, removeModel } from '../smart.js';
import { Toggle } from './ui.jsx';

// Measured accuracy of the exact model files offered here (written by research/smart-eval).
const ACCURACY = Object.values(import.meta.glob('../lib/smartAccuracy.json', { eager: true, import: 'default' }))[0] || null;

const SHOWN_TASKS = ['names', 'presence', 'relation'];
const gb = (bytes) => `${(bytes / 1e9).toFixed(bytes < 1e9 ? 2 : 1)} GB`;
const pct = (v) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '—');
const time = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

function progressText(p) {
  if (p.warming) return 'Getting the model ready. The first time after installing can take half a minute.';
  return `Reading ${p.book}: ${p.done} of ${p.total} checks`;
}

// The dashboard's note about the optional smart features. Only with alpha features on, and never
// shown again once dismissed.
export function SmartHint() {
  const prefs = useStore((s) => s.prefs);
  const progress = useStore((s) => s.smart.progress);
  if (!prefs.alphaFeatures) return null;
  if (smartActive(prefs)) {
    if (!progress) return null;
    return (
      <div className="smart-progress">
        <Sparkles size={14} strokeWidth={1.7} />
        {progress.warming ? 'Smart features are getting ready…' : `Smart features are reading ${progress.book}: ${progress.done} of ${progress.total} checks`}
      </div>
    );
  }
  if (prefs.smartHintDismissed) return null;
  return (
    <section className="smart-hint">
      <span className="smart-hint-icon">
        <Sparkles size={17} strokeWidth={1.7} />
      </span>
      <div className="smart-hint-text">
        <div className="smart-hint-title">Optional: smart features</div>
        <p>
          A small model that runs on this computer can read your chapters more closely. It tells May the character from the month, sees who’s really in a
          scene, and suggests what a relationship is. Free, off unless you turn it on, and nothing leaves your computer.
        </p>
      </div>
      <button className="btn small" onClick={() => openModal('settings', { section: 'smart' })}>
        Learn more
      </button>
      <button className="smart-hint-x" title="Don’t show this again" aria-label="Dismiss" onClick={() => setPrefs({ smartHintDismissed: true })}>
        <X size={14} strokeWidth={1.8} />
      </button>
    </section>
  );
}

function ModelRow({ m, status, prefs }) {
  const dl = status.download && status.download.id === m.id ? status.download : null;
  const busyElsewhere = status.download && status.download.id !== m.id && status.download.state !== 'error';
  const inUse = prefs.smartEnabled && m.installed && (prefs.smartModel === m.id || (!prefs.smartModel && status.models.filter((x) => x.installed).pop()?.id === m.id));
  const speed = ACCURACY?.models.find((x) => x.id === m.id)?.msPerQuestion;
  return (
    <div className={`smart-model ${prefs.smartModel === m.id && m.installed ? 'on' : ''}`}>
      <button
        className="smart-model-pick"
        disabled={!m.installed}
        onClick={() => setPrefs({ smartModel: m.id })}
        title={m.installed ? 'Use this model' : 'Download it first'}
      >
        <span className={`smart-radio ${m.installed && prefs.smartModel === m.id ? 'on' : ''}`} />
        <span className="smart-model-text">
          <span className="smart-model-name">
            {m.label} model
            {status.recommended === m.id && <span className="smart-badge">Best for this computer</span>}
            {inUse && <span className="smart-badge solid">In use</span>}
          </span>
          <span className="smart-model-sub">
            {gb(m.bytes)} download · needs about {m.ramGB} GB of memory{speed ? ` · about ${time(speed)} per check` : ''}
          </span>
        </span>
      </button>
      <span className="smart-model-action">
        {dl && dl.state !== 'error' ? (
          <>
            <span className="smart-dl">
              <span className="smart-dl-bar">
                <span style={{ width: `${dl.total ? Math.round((dl.received / dl.total) * 100) : 0}%` }} />
              </span>
              <span className="smart-dl-text">{dl.state === 'verifying' ? 'Checking…' : `${dl.total ? Math.round((dl.received / dl.total) * 100) : 0}%`}</span>
            </span>
            <button className="btn small" onClick={cancelDownload}>
              Cancel
            </button>
          </>
        ) : m.installed ? (
          <>
            <span className="smart-installed">
              <Check size={14} strokeWidth={2} /> Downloaded
            </span>
            <button className="link-btn danger" onClick={() => removeModel(m.id)}>
              Delete
            </button>
          </>
        ) : (
          <button className="btn small" disabled={busyElsewhere} onClick={() => downloadModel(m.id)}>
            <Download size={14} strokeWidth={1.8} /> Download
          </button>
        )}
      </span>
      {dl?.state === 'error' && <span className="smart-error">Download failed: {dl.error || 'try again'}.</span>}
    </div>
  );
}

// Settings → Smart features.
export function SmartSettings({ scrollTo }) {
  const prefs = useStore((s) => s.prefs);
  const status = useStore((s) => s.smart.status);
  const progress = useStore((s) => s.smart.progress);
  const error = useStore((s) => s.smart.error);
  const ref = useRef(null);
  useEffect(() => {
    if (scrollTo) ref.current?.scrollIntoView({ block: 'start' });
  }, [scrollTo]);

  const models = status?.models || [];
  const anyInstalled = models.some((m) => m.installed);
  const rows = (ACCURACY?.rows || []).filter((r) => SHOWN_TASKS.includes(r.task)).sort((a, b) => SHOWN_TASKS.indexOf(a.task) - SHOWN_TASKS.indexOf(b.task));

  return (
    <div ref={ref} className="smart-settings">
      <div className="panel-label">Smart features</div>
      <p className="smart-intro">
        Optional, free, and never needed. A small language model runs on this computer to read your chapters more closely. Your writing never leaves your
        computer: the only time the internet is used is the one-time model download.
      </p>
      <ul className="smart-list">
        <li>
          <b>Tells a name from a word.</b> “May” the character or the month, “Will” or will. Sure answers count straight away; unsure ones wait for you to check.
        </li>
        <li>
          <b>Sees who’s really in a scene.</b> Characters who are only mentioned or remembered fade in the scene list.
        </li>
        <li>
          <b>Suggests what a relationship is</b> when two characters keep turning up together.
        </li>
      </ul>

      {!status ? (
        <p className="setting-hint">Smart features aren’t available in this build.</p>
      ) : !status.supported ? (
        <p className="setting-hint">{status.error || 'This computer can’t run the local model.'}</p>
      ) : (
        <>
          <div className="smart-models">
            {models.map((m) => (
              <ModelRow key={m.id} m={m} status={status} prefs={prefs} />
            ))}
          </div>

          {rows.length > 0 && (
            <div className="smart-table-wrap">
              <table className="smart-table">
                <thead>
                  <tr>
                    <th>How often it gets it right</th>
                    {ACCURACY.models.map((m) => (
                      <th key={m.id}>{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.task}>
                      <td>
                        {r.label}
                        <span className="smart-cases">{r.cases} test passages</span>
                      </td>
                      {ACCURACY.models.map((m) => (
                        <td key={m.id} className="num">
                          {pct(r.results[m.id])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>Time per check</td>
                    {ACCURACY.models.map((m) => (
                      <td key={m.id} className="num">
                        {time(m.msPerQuestion)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Download</td>
                    {ACCURACY.models.map((m) => (
                      <td key={m.id} className="num">
                        {m.sizeGB.toFixed(1)} GB
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="smart-note">
                {ACCURACY.note ||
                  `Measured on ${ACCURACY.caseCount} short passages written for testing, on an ${ACCURACY.machine}. Real chapters are longer and messier, so expect somewhat lower.`}
              </p>
            </div>
          )}

          <div className="setting-row">
            <div>
              <div className="setting-label">Use smart features</div>
              <div className="setting-hint">
                {anyInstalled ? 'Reads the open book in the background when you pause. Turn it off any time.' : 'Download a model above to turn this on.'}
              </div>
            </div>
            <div className="setting-control">
              <Toggle
                checked={!!prefs.smartEnabled && anyInstalled}
                onChange={(on) => anyInstalled && setPrefs({ smartEnabled: on, ...(on && !prefs.smartModel ? { smartModel: models.filter((m) => m.installed).pop().id } : {}) })}
              />
            </div>
          </div>
          {prefs.smartEnabled && (progress || error) && (
            <p className="setting-hint smart-status">{error ? `Smart features stopped: ${error}` : progressText(progress)}</p>
          )}
          <p className="smart-fine">Models are Qwen 3.5 by Alibaba, Apache 2.0 licensed, downloaded from Hugging Face and stored in Quillier’s own folder.</p>
        </>
      )}
    </div>
  );
}
