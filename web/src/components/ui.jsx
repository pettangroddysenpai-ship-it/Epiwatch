import { useEffect, useRef, useState } from 'react';
import { levelInfo } from '../lib/ui.js';

/** Pastille de niveau d'alerte. */
export function LevelBadge({ level, withLabel = false, lang = 'fr', size = 'md' }) {
  const info = levelInfo(level);
  const label = lang === 'en' ? info.labelEn : info.labelFr;
  return (
    <span className={`badge lvl-${level}`} style={size === 'sm' ? { fontSize: 10.5, padding: '2px 7px' } : undefined}>
      <span style={{ opacity: 0.85 }}>{info.level}</span>
      {withLabel && <span style={{ fontWeight: 650 }}>{label}</span>}
    </span>
  );
}

/** Carte statistique. */
export function StatCard({ label, value, sub, tone = 'default', accent, icon: Icon }) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <div className="stat-label">
        {Icon && <Icon style={{ width: 15, height: 15 }} />}
        {label}
      </div>
      <div className="stat-value" style={tone !== 'default' ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Barre de progression colorée. */
export function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress">
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** État vide. */
export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="empty">
      {Icon && <Icon />}
      <div className="bold">{title}</div>
      {hint && <div className="small" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/** Fenêtre modale accessible. */
export function Modal({ open, onClose, title, children, footer, width = 520 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose?.();
      }}
      ref={ref}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(3, 8, 18, 0.72)', zIndex: 8000,
        display: 'grid', placeItems: 'center', padding: 18, backdropFilter: 'blur(3px)',
      }}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto', margin: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="card-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">✕</button>
        </div>
        {children}
        {footer && <div className="row wrap" style={{ marginTop: 18, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

/** Onglets simples. */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null && <span className="faint"> · {tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Notification temporaire gérée localement (retour d'action). */
export function InlineAlert({ kind = 'info', children, onClose }) {
  return (
    <div className={`banner ${kind}`} style={{ marginBottom: 14 }}>
      <div style={{ flex: 1 }}>{children}</div>
      {onClose && (
        <button className="icon-btn" onClick={onClose} aria-label="close" style={{ width: 28, height: 28 }}>
          ✕
        </button>
      )}
    </div>
  );
}

/** Bouton de confirmation en deux temps. */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmer ?', className = 'btn danger' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <button
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
