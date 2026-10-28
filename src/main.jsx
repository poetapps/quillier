import { createRoot } from 'react-dom/client';
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/instrument-sans/wght-italic.css';
import '@fontsource-variable/literata/wght.css';
import '@fontsource-variable/literata/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import './styles.css';
import App from './App.jsx';
import { init } from './store.js';
import { initSmart } from './smart.js';
import { initDictation } from './dictation.js';

document.documentElement.dataset.platform = window.api.platform;

init().then(() => {
  createRoot(document.getElementById('root')).render(<App />);
  initSmart();
  initDictation();
});
