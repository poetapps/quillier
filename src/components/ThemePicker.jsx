import { useEffect, useRef, useState } from 'react';
import { MoonStar, Moon, Orbit, Coffee, SunDim, Sun } from 'lucide-react';
import { useStore, getState, setTheme, wantsDark, openPopover } from '../store.js';
import { IconButton } from './ui.jsx';

// Darkest to lightest. The first three are dark styles and the last three light ones, so a stop is
// a light/dark choice plus which palette that side uses.
export const THEMES = [
  { name: 'Black', icon: MoonStar, theme: 'dark', darkStyle: 'black' },
  { name: 'Dark', icon: Moon, theme: 'dark', darkStyle: 'dark' },
  { name: 'Midnight', icon: Orbit, theme: 'dark', darkStyle: 'midnight' },
  { name: 'Sepia', icon: Coffee, theme: 'light', lightStyle: 'sepia' },
  { name: 'Cream', icon: SunDim, theme: 'light', lightStyle: 'cream' },
  { name: 'White', icon: Sun, theme: 'light', lightStyle: 'white' },
];
const LAST = THEMES.length - 1;

export function themeIndex(s) {
  const i = wantsDark(s)
    ? THEMES.findIndex((t) => t.darkStyle === (s.prefs?.darkStyle || 'dark'))
    : THEMES.findIndex((t) => t.lightStyle === (s.prefs?.lightStyle || 'white'));
  return Math.max(0, i);
}

function pick(i) {
  if (i === themeIndex(getState())) return;
  const { name, icon, ...patch } = THEMES[i];
  setTheme(patch);
}

// Half the thumb's width: its center stops this far in from each end of the track.
const INSET = 23;
const stopLeft = (i) => `calc(${INSET}px + ${i} * (100% - ${2 * INSET}px) / ${LAST})`;

export function ThemePicker() {
  const index = useStore(themeIndex);
  const following = useStore((s) => s.prefs.theme === 'system');
  const track = useRef(null);
  // While the thumb is held: where it is (px), and whether it has moved since it was pressed.
  const [held, setHeld] = useState(null);
  const before = useRef(null);

  useEffect(() => track.current.focus(), []);

  // A drag previews every stop it passes. When it ends on the other side, the side it left keeps the
  // style it had, not the one the drag happened to cross last, so ⇧⌘L goes back to what you chose.
  function release() {
    setHeld(null);
    const s = getState();
    const keep = THEMES[themeIndex(s)].theme === 'light' ? { darkStyle: before.current.darkStyle } : { lightStyle: before.current.lightStyle };
    if (Object.entries(keep).some(([k, v]) => s.prefs[k] !== v)) setTheme(keep);
  }

  function follow(e, moved) {
    const r = track.current.getBoundingClientRect();
    const step = (r.width - 2 * INSET) / LAST;
    const x = Math.max(INSET, Math.min(r.width - INSET, e.clientX - r.left));
    const near = Math.round((x - INSET) / step);
    pick(near);
    // Magnetic: the thumb leans halfway toward the nearest dot.
    setHeld({ x: x + (INSET + near * step - x) * 0.5, moved });
  }

  function onKeyDown(e) {
    const to = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: LAST }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    pick(Math.max(0, Math.min(LAST, to)));
  }

  const left = held ? `${held.x}px` : stopLeft(index);
  const Icon = THEMES[index].icon;
  return (
    <div className="theme-picker">
      <div
        ref={track}
        className={`tp-track ${held?.moved ? 'moving' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Theme"
        aria-valuemin={0}
        aria-valuemax={LAST}
        aria-valuenow={index}
        aria-valuetext={THEMES[index].name}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          before.current = getState().prefs;
          follow(e, false);
        }}
        onPointerMove={(e) => held && follow(e, true)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="tp-fill" style={{ width: `calc(${left} + ${INSET}px)` }} />
        {THEMES.map((t, i) => (
          <span key={t.name} className="tp-dot" style={{ left: stopLeft(i) }} />
        ))}
        <div className="tp-thumb" style={{ left }}>
          <Icon size={17} strokeWidth={1.8} />
        </div>
      </div>
      <div className="tp-foot">
        <span className="tp-name">{THEMES[index].name}</span>
        {following ? (
          <span className="tp-note">Following system</span>
        ) : (
          <button className="link-btn" onClick={() => setTheme({ theme: 'system' })}>
            Match system
          </button>
        )}
      </div>
    </div>
  );
}

// The sun/moon button: shows the current theme's icon and opens the slider.
export function ThemeButton({ size, title = 'Theme' }) {
  const icon = useStore((s) => THEMES[themeIndex(s)].icon);
  return (
    <IconButton
      icon={icon}
      size={size}
      title={title}
      onClick={(e) => openPopover(e.currentTarget.getBoundingClientRect(), <ThemePicker />, { className: 'theme-menu' })}
    />
  );
}
