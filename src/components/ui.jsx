import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useStore, closeMenu, setState, closeModal } from '../store.js';

export function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="15" rx="3.2" fill="currentColor" />
      <rect x="8.5" y="6.5" width="14" height="16" rx="3.4" fill="currentColor" stroke="var(--logo-gap)" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({ size = 22 }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <LogoMark size={size * 0.95} />
      <span>
        <b>quill</b>
        <i>ier</i>
      </span>
    </span>
  );
}

export function IconButton({ icon: Icon, size = 17, title, className = '', ...rest }) {
  return (
    <button className={`icon-btn ${className}`} title={title} aria-label={title} {...rest}>
      <Icon size={size} strokeWidth={1.7} />
    </button>
  );
}

// One global popover menu, opened via openMenu() in the store.
export function MenuLayer() {
  const menu = useStore((s) => s.menu);
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    let x = menu.align === 'right' ? menu.x - r.width : menu.x;
    let y = menu.y;
    x = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    if (y + r.height > window.innerHeight - 8) {
      y = menu.avoidY != null ? menu.avoidY - r.height - 4 : window.innerHeight - r.height - 8;
    }
    setPos({ x, y: Math.max(8, y) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => e.key === 'Escape' && closeMenu();
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', closeMenu);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div className="menu-backdrop" onMouseDown={closeMenu} onContextMenu={(e) => (e.preventDefault(), closeMenu())}>
      <div
        ref={ref}
        className="menu"
        style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, minWidth: menu.width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {menu.items.filter(Boolean).map((item, i) =>
          item.separator ? (
            <div key={i} className="menu-sep" />
          ) : item.heading ? (
            <div key={i} className="menu-heading">
              {item.heading}
            </div>
          ) : (
            <button
              key={i}
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                closeMenu();
                item.onClick?.();
              }}
            >
              <span className="menu-check">{item.checked ? <Check size={14} strokeWidth={2} /> : item.icon ? <item.icon size={15} strokeWidth={1.7} /> : null}</span>
              <span className="menu-label">
                {item.label}
                {item.sub && <span className="menu-sub">{item.sub}</span>}
              </span>
              {item.hint && <span className="menu-hint">{item.hint}</span>}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            setState({ toast: null });
            toast.action.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function Modal({ title, children, footer, onClose = () => closeModal(null), width = 460 }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange }) {
  return (
    <button role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
