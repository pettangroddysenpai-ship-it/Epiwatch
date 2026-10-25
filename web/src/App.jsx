import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { I18nProvider } from './i18n/index.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { StoreProvider } from './lib/store.jsx';
import { Sidebar } from './components/Layout.jsx';
import { MenuProvider, MobileNav, ToastStack } from './components/Shell.jsx';
import { canManage, canReport, homeFor, isPublic, isStaff } from './lib/ui.js';

import { LoginPage } from './pages/Login.jsx';
import { DashboardPage } from './pages/Dashboard.jsx';
import { MapPage } from './pages/MapView.jsx';
import { EntryPage } from './pages/Entry.jsx';
import { AlertsPage } from './pages/Alerts.jsx';
import { ReportsPage } from './pages/Reports.jsx';
import { NotificationsPage } from './pages/Notifications.jsx';
import { AdminPage } from './pages/Admin.jsx';
import { UsersPage } from './pages/Users.jsx';
import { PublicPage } from './pages/Public.jsx';
import { AboutPage } from './pages/About.jsx';

function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <MenuProvider onOpenMenu={() => setMenuOpen(true)}>
      <div className={`app-shell${menuOpen ? ' menu-open' : ''}`}>
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        {menuOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Fermer le menu"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <div className="main">
          <Routes>
          <Route
            path="/"
            element={
              isPublic(user) ? <Navigate to="/public" replace /> : <DashboardPage />
            }
          />
          <Route path="/map" element={<MapPage />} />
          <Route
            path="/entry"
            element={
              <Guard predicate={canReport}>
                <EntryPage />
              </Guard>
            }
          />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route
            path="/reports"
            element={
              <Guard predicate={isStaff}>
                <ReportsPage />
              </Guard>
            }
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/admin"
            element={
              <Guard predicate={canManage}>
                <AdminPage />
              </Guard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <Guard predicate={canManage}>
                <UsersPage />
              </Guard>
            }
          />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/public" element={<PublicPage />} />
          <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
        </Routes>
      </div>
      <MobileNav />
      <ToastStack />
    </div>
    </MenuProvider>
  );
}

/** Protège une route selon un prédicat de rôle. */
function Guard({ predicate, redirect, children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!predicate(user)) return <Navigate to={redirect || homeFor(user)} replace />;
  return children;
}

function LoadingScreen() {
  return (
    <div className="center-screen">
      <div className="spinner" style={{ width: 30, height: 30 }} />
      <div className="muted small">Chargement d’ÉpiWatch…</div>
    </div>
  );
}

function Router() {
  const { loading, user } = useAuth();

  if (loading) return <LoadingScreen />;

  // Application fermée aux visiteurs : toute page inconnue renvoie vers la connexion.
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={homeFor(user)} replace />} />
      <Route path="/welcome" element={<Navigate to="/public" replace />} />
      <Route path="/*" element={<AppLayout />} />
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <StoreProvider>
            <Router />
          </StoreProvider>
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  );
}
