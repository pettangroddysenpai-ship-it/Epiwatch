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
  const { user, logout } = useAuth();
  const { alertCounts } = useStore();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const showEntry = canReport(user);
  const publicView = isPublic(user);
  const showProfile = !!user && publicView;

  const navItems = [
    publicView
      ? { to: '/public', icon: IconDashboard, label: t('nav.public') }
      : { to: '/', end: true, icon: IconDashboard, label: t('nav.dashboard') },
    { to: '/map', icon: IconMap, label: t('nav.map') },
    ...(showEntry ? [{ to: '/entry', icon: IconEntry, label: t('nav.entry') }] : []),
    { to: '/alerts', icon: IconBell, label: t('nav.alerts'), badge: alertCounts.active },
    canManage(user)
      ? { to: '/admin', icon: IconSettings, label: t('nav.admin') }
      : { to: '/notifications', icon: IconPulse, label: t('nav.notifications') },
  ];

  const closeProfileMenu = () => {
    setShowProfileMenu(false);
    setConfirmLogout(false);
  };

  const toggleProfileMenu = () => {
    if (showProfileMenu) {
      closeProfileMenu();
      return;
    }
    setConfirmLogout(false);
    setShowProfileMenu(true);
  };

  const handleLogout = () => {
    closeProfileMenu();
    logout();
    navigate('/login', { replace: true });
  };

  const getInitialLetter = (name) => {
    if (!name) return '?';
    return name.trim().charAt(0).toUpperCase();
  };

  return (
    <>
      <nav className="mobile-nav" aria-label="Navigation">
        {navItems.map(({ to, icon: Icon, label, badge, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="mobile-nav-ico">
              <Icon />
              {badge > 0 && (
                <span className="mobile-nav-badge">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span className="mobile-nav-label">{label}</span>
          </NavLink>
        ))}
        {showProfile && (
          <button
            type="button"
            className={`mobile-nav-profile${showProfileMenu ? ' open' : ''}`}
            onClick={toggleProfileMenu}
            aria-label={t('nav.profile')}
            aria-haspopup="dialog"
            aria-expanded={showProfileMenu}
          >
            <span className="profile-avatar">{getInitialLetter(user.full_name)}</span>
            <span className="profile-label">{t('nav.profile')}</span>
          </button>
        )}
      </nav>
      {showProfileMenu && showProfile && (
        <>
          <button
            type="button"
            className="profile-menu-backdrop"
            aria-label={t('common.close')}
            onClick={closeProfileMenu}
          />
          <div className="mobile-nav-profile-menu" role="dialog" aria-modal="true" aria-label={t('nav.profile')}>
            <div className="profile-menu-header">
              <span className="profile-avatar-large">{getInitialLetter(user.full_name)}</span>
              <div className="profile-menu-who">
                <div className="profile-name">{user.full_name}</div>
                {user.email && <div className="profile-email">{user.email}</div>}
              </div>
            </div>
            {confirmLogout ? (
              <div className="profile-menu-confirm">
                <p>{t('auth.logoutConfirm')}</p>
                <div className="profile-menu-actions">
                  <button
                    type="button"
                    className="profile-menu-item"
                    onClick={() => setConfirmLogout(false)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="profile-menu-item danger" onClick={handleLogout}>
                    {t('auth.logout')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="profile-menu-item danger"
                onClick={() => setConfirmLogout(true)}
              >
                {t('auth.logout')}
              </button>
            )}
          </div>
        </>
      )}
    </>
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
        <span className="hide-sm">{isConnected ? t('live.now') : t('live.reconnecting')}</span>
      </span>
      <button
        className="btn sm ghost lang-btn"
        onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
        title={lang === 'fr' ? 'Switch to English' : 'Passer en français'}
      >
        <span className="lang-code">{lang === 'fr' ? 'EN' : 'FR'}</span>
      </button>
      <button
        className="icon-btn bell-btn"
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
