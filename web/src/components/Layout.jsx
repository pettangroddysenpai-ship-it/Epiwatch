import { NavLink, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { canReport, canManage, isPublic, initials } from '../lib/ui.js';
import {
  IconDashboard, IconMap, IconEntry, IconBell, IconChart, IconSettings,
  IconLogout, IconPulse, IconUsers, IconShield, IconClose, IconGlobe,
} from './Icons.jsx';

export function Brand({ compact = false }) {
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
        <defs>
          <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5363CA" />
            <stop offset="100%" stopColor="#3d4bb5" />
          </linearGradient>
          <linearGradient id="bm-pulse" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="65%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="112" fill="url(#bm-bg)" />
        <circle cx="256" cy="240" r="150" fill="none" stroke="#ffffff" strokeWidth="10" opacity="0.18" />
        <circle cx="256" cy="240" r="100" fill="none" stroke="#ffffff" strokeWidth="6" opacity="0.4" />
        <path
          d="M120 240 H190 L214 196 L244 300 L272 168 L300 240 H392"
          fill="none"
          stroke="url(#bm-pulse)"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="brand-text">
        <strong>ÉpiWatch</strong>
        {!compact && <span>Surveillance sanitaire</span>}
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, badge, end, onClick }) {
  return (
    <NavLink to={to} end={end} onClick={onClick} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon />
      <span>{label}</span>
      {badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  );
}

export function Sidebar({ open, onClose }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { alertCounts } = useStore();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const showEntry = canReport(user);
  const publicView = isPublic(user);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="row between" style={{ alignItems: 'stretch' }}>
        <Brand />
        <button className="icon-btn" onClick={onClose} style={{ margin: '14px 12px 0 0' }} aria-label={t('common.close')}>
          <IconClose />
        </button>
      </div>

      <nav className="nav" onClick={onClose}>
        {publicView ? (
          <NavItem to="/public" icon={IconGlobe} label={t('nav.public')} />
        ) : (
          <NavItem to="/" end icon={IconDashboard} label={t('nav.dashboard')} />
        )}
        <NavItem to="/map" icon={IconMap} label={t('nav.map')} />
        {showEntry && <NavItem to="/entry" icon={IconEntry} label={t('nav.entry')} />}
        <NavItem
          to="/alerts"
          icon={IconBell}
          label={t('nav.alerts')}
          badge={alertCounts.active}
        />
        {!publicView && (
          <NavItem to="/reports" icon={IconChart} label={t('nav.reports')} />
        )}

        <div className="nav-section">{t('nav.notifications')}</div>
        <NavItem to="/notifications" icon={IconPulse} label={t('nav.notifications')} />

        {canManage(user) && (
          <>
            <div className="nav-section">{t('nav.admin')}</div>
            <NavItem to="/admin" icon={IconSettings} label={t('nav.admin')} />
            <NavItem to="/admin/users" icon={IconUsers} label={t('admin.users')} />
          </>
        )}

        <div className="nav-section">{t('nav.about')}</div>
        <NavItem to="/about" icon={IconShield} label={t('nav.about')} />
      </nav>

      <div className="sidebar-foot">
        {user ? (
          <div className="row between">
            <div className="row" style={{ minWidth: 0 }}>
              <div className="avatar">{initials(user.full_name)}</div>
              <div className="col" style={{ minWidth: 0, gap: 0 }}>
                <span className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.full_name}
                </span>
                <span className="tiny faint">
                  {user.rank || t(`role.${user.role}`)}
                  {user.username ? ` · ${user.username}` : ''}
                </span>
              </div>
            </div>
            <button
              className="icon-btn"
              title={t('auth.logout')}
              aria-label={t('auth.logout')}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <IconLogout />
            </button>
          </div>
        ) : (
          <button className="btn primary block" onClick={() => navigate('/login')}>
            {t('auth.signIn')}
          </button>
        )}
      </div>
    </aside>
  );
}
