import { useEffect } from 'react';
import { useStore, getState, setState } from './store.js';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Page from './components/Page.jsx';
import RightPanel from './components/RightPanel.jsx';
import Modals from './components/Modals.jsx';
import { TrashView, StatusBar } from './components/Views.jsx';
import Library from './components/Library.jsx';
import Bible from './components/Bible.jsx';
import { MenuLayer, Toast } from './components/ui.jsx';

const FONTS = {
  sans: "'Instrument Sans Variable', -apple-system, system-ui, sans-serif",
  serif: "'Literata Variable', 'Iowan Old Style', Georgia, serif",
  mono: "'JetBrains Mono Variable', ui-monospace, Menlo, monospace",
};
const WIDTHS = { narrow: '600px', medium: '700px', wide: '860px' };

function useEditorVars(prefs) {
  useEffect(() => {
    if (!prefs) return;
    const s = document.documentElement.style;
    const mono = prefs.font === 'mono';
    s.setProperty('--editor-font', FONTS[prefs.font] || FONTS.sans);
    s.setProperty('--editor-size', `${mono ? prefs.fontSize - 2 : prefs.fontSize}px`);
    s.setProperty('--editor-lh', String(prefs.lineHeight));
    s.setProperty('--editor-width', WIDTHS[prefs.width] || WIDTHS.medium);
    document.documentElement.toggleAttribute('data-black', !!prefs.pureBlack);
  }, [prefs]);
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const prefs = useStore((s) => s.prefs);
  const project = useStore((s) => s.project);
  const path = useStore((s) => s.path);
  const saveStatus = useStore((s) => s.save.status);
  const sidebar = useStore((s) => s.sidebar);
  const panel = useStore((s) => s.panel);
  const focus = useStore((s) => s.focus);
  const view = useStore((s) => s.view);
  const title = project?.title;

  useEditorVars(prefs);

  useEffect(() => {
    window.api.setTitle(title || 'Quillier', path, saveStatus !== 'saved');
  }, [title, path, saveStatus]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && getState().focus && !getState().modal && !getState().menu) setState({ focus: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return null;

  return (
    <>
      {!project ? (
        <Library />
      ) : (
        <div className={`app ${focus ? 'focus' : ''}`}>
          {sidebar && !focus && <Sidebar />}
          <main className="main">
            <TopBar />
            {view === 'trash' ? <TrashView /> : view === 'bible' ? <Bible /> : <Page />}
            {!focus && <StatusBar />}
          </main>
          {panel && !focus && view !== 'bible' && <RightPanel />}
        </div>
      )}
      <Modals />
      <MenuLayer />
      <Toast />
    </>
  );
}
