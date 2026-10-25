import { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { canReport, canManage, isPublic } from '../lib/ui.js';
import {
  IconDashboard, IconMap, IconEntry, IconBell, IconSettings, IconPulse, IconMenu, IconClose,
} from './Icons.jsx';

const MenuContext = createContext({ onOpenMenu: null });

export function MenuProvider({ onOpenMenu, children }) {
  return <MenuContext.Provider value={{ onOpenMenu }}>{children}</MenuContext.Provider>;
}

export function useAppMenu() {
  return useContext(MenuContext);
}

export function MobileTop({ onOpenMenu, title }) {
  const { t, lang, setLang } = useI18n();
  const { isConnected } = useStore();

  return (
    <div className="mobile-top">
      <button className="icon-btn" onClick={onOpenMenu} aria-label={t('nav.dashboard')}>
        <IconMenu />
      </button>
      <strong style={{ fontSize: 15 }}>{title || 'ÉpiWatch'}</strong>
      <div className="spacer" style={{ flex: 1 }} />
      <button
        className="icon-btn"
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        title={lang === 'fr' ? 'English' : 'Français'}
      >
        <span style={{ fontSize: 12, fontWeight: 800 }}>{lang === 'fr' ? 'EN' : 'FR'}</span>
      </button>
      <span className={`live-dot${isConnected ? '' : ' off'}`} title={isConnected ? t('nav.online') : t('nav.offline')}>
        <span className="pulse-ring" />
      </span>
    </div>
  );
}

export function MobileNav() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { alertCounts } = useStore();
  const showEntry = canReport(user);
  const publicView = isPublic(user);

  const leftItems = [
    publicView
      ? { to: '/public', icon: IconDashboard, label: t('nav.public') }
      : { to: '/', end: true, icon: IconDashboard, label: t('nav.dashboard') },
  ];

  const centerItem = { to: '/map', icon: IconMap, label: t('nav.map'), center: true };

  const rightItems = [
    showEntry && { to: '/entry', icon: IconEntry, label: t('nav.entry') },
    { to: '/alerts', icon: IconBell, label: t('nav.alerts'), badge: alertCounts.active },
    canManage(user)
      ? { to: '/admin', icon: IconSettings, label: t('nav.admin') }
      : { to: '/notifications', icon: IconPulse, label: t('nav.notifications') },
  ].filter(Boolean);

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-left">
        {leftItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </div>
      <div className="mobile-nav-center">
        <NavLink to={centerItem.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span style={{ position: 'relative' }}>
            <centerItem.icon />
            {centerItem.badge > 0 && (
              <span
                style={{
                  position: 'absolute', top: -4, right: -8, background: 'var(--danger)', color: '#fff',
                  fontSize: 9, fontWeight: 800, minWidth: 15, height: 15, borderRadius: 8,
                  display: 'grid', placeItems: 'center', padding: '0 3px',
                }}
              >
                {centerItem.badge > 9 ? '9+' : centerItem.badge}
              </span>
            )}
          </span>
          {centerItem.label}
        </NavLink>
      </div>
      <div className="mobile-nav-right">
        {rightItems.map(({ to, icon: Icon, label, badge, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span style={{ position: 'relative' }}>
              <Icon />
              {badge > 0 && (
                <span
                  style={{
                    position: 'absolute', top: -4, right: -8, background: 'var(--danger)', color: '#fff',
                    fontSize: 9, fontWeight: 800, minWidth: 15, height: 15, borderRadius: 8,
                    display: 'grid', placeItems: 'center', padding: '0 3px',
                  }}
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Topbar({ title, subtitle, actions, onOpenMenu }) {
  const { t, lang, setLang } = useI18n();
  const { isConnected, alertCounts } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const menu = useAppMenu();
  const openMenu = onOpenMenu || menu.onOpenMenu;

  return (
    <header className="topbar">
      <button
        className="icon-btn menu-btn"
        onClick={openMenu}
        aria-label="menu"
      >
        <IconMenu />
      </button>
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <div className="tiny faint topbar-sub">{subtitle}</div>}
      </div>
      <div className="spacer" />
      <span className={`live-dot${isConnected ? '' : ' off'}`}>
        <span className="pulse-ring" />
        <span className="hide-sm">{isConnected ? t('live.connected') : t('live.reconnecting')}</span>
      </span>
      <button
        className="btn sm ghost"
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
      >
        <span style={{ fontWeight: 800, fontSize: 12 }}>{lang === 'fr' ? 'EN' : 'FR'}</span>
      </button>
      <button
        className="icon-btn"
        onClick={() => navigate('/notifications')}
        title={t('notif.title')}
        aria-label={t('notif.title')}
      >
        <IconBell />
        {alertCounts.active > 0 && <span className="count">{alertCounts.active > 9 ? '9+' : alertCounts.active}</span>}
      </button>
      {actions}
      {!user && (
        <button className="btn sm primary" onClick={() => navigate('/login')}>
          {t('auth.signIn')}
        </button>
      )}
    </header>
  );
}

/** Enveloppe de page avec titre et actions. */
export function Page({ title, subtitle, actions, children }) {
  return (
    <div className="page">
      {(title || subtitle || actions) && (
        <div className="page-head row between wrap">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="row wrap">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Empilement de notifications éphémères. */
export function ToastStack() {
  const { toasts, dismissToast } = useStore();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.kind || 'info'}`} onClick={() => dismissToast(toast.id)}>
          <div className="toast-title">{toast.title}</div>
          <div className="toast-body">{toast.body}</div>
        </div>
      ))}
    </div>
  );
}

/** Affiche l'état de connexion temps réel. */
export function ConnectionBanner() {
  const { t } = useI18n();
  const { isConnected, realtimeStatus } = useStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      const id = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(id);
    }
    setVisible(false);
    return undefined;
  }, [isConnected]);

  if (!visible) return null;
  return (
    <div className="banner warn" style={{ margin: '0 22px 14px', marginTop: 16 }}>
      <span className="spinner" />
      <div>
        <strong>{t('live.disconnected')}</strong>
        <div className="tiny faint">
          {realtimeStatus === 'reconnecting' ? t('live.reconnecting') : ''}
        </div>
      </div>
    </div>
  );
}
