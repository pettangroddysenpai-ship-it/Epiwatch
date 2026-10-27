import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { homeFor } from '../lib/ui.js';
import { IconShield, IconPulse, IconBell, IconMap } from '../components/Icons.jsx';

export function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(homeFor(user), { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const me = await login(identifier.trim(), password);
      navigate(homeFor(me), { replace: true });
    } catch (err) {
      setError(err.message || t('auth.invalid'));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        setError('Google Client ID not configured');
        setBusy(false);
        return;
      }

      // Load Google Identity Services
      const google = await loadGoogleScript();
      
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          try {
            const { token, user } = await api.googleSignIn(response.credential);
            setToken(token);
            setUser(user);
            navigate(homeFor(user), { replace: true });
          } catch (err) {
            setError(err.message || 'Google sign-in failed');
            setBusy(false);
          }
        },
      });

      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          setError('Google sign-in popup was blocked');
          setBusy(false);
        }
      });
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setBusy(false);
    }
  };

  const loadGoogleScript = () => {
    return new Promise((resolve, reject) => {
      if (window.google) {
        resolve(window.google);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => resolve(window.google);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 512 512" aria-hidden="true" className="brand-logo">
              <defs>
                <linearGradient id="lg-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#5363CA" />
                  <stop offset="100%" stopColor="#3d4bb5" />
                </linearGradient>
                <linearGradient id="lg-p" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="65%" stopColor="#dbeafe" />
                  <stop offset="100%" stopColor="#86efac" />
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="112" fill="url(#lg-bg)" />
              <circle cx="256" cy="240" r="112" fill="none" stroke="#ffffff" strokeWidth="8" opacity="0.35" />
              <path
                d="M120 240 H190 L214 196 L244 300 L272 168 L300 240 H392"
                fill="none"
                stroke="url(#lg-p)"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <strong style={{ fontSize: 21, display: 'block', letterSpacing: '-0.02em' }}>ÉpiWatch</strong>
              <span className="small faint">{t('app.org')}</span>
            </div>
          </div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
          >
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>

        <div>
          <h1>
            {lang === 'fr' ? 'Voir l\'épidémie' : 'See the outbreak'}{' '}
            <span style={{ color: 'var(--primary)' }}>
              {lang === 'fr' ? 'en temps réel' : 'in real time'}
            </span>
          </h1>
          <p className="lead">{t('app.tagline')}</p>

          <div className="features">
            {[
              {
                icon: IconPulse,
                title: lang === 'fr' ? 'Suivi instantané des cas' : 'Instant case tracking',
                text:
                  lang === 'fr'
                    ? 'Chaque déclaration hospitalière met à jour la carte immédiatement.'
                    : 'Every hospital report updates the map immediately.',
              },
              {
                icon: IconMap,
                title: lang === 'fr' ? 'Carte épidémiologique' : 'Epidemiological map',
                text:
                  lang === 'fr'
                    ? 'Les marqueurs grandissent et changent de couleur selon la gravité.'
                    : 'Markers grow and change colour with severity.',
              },
              {
                icon: IconBell,
                title: lang === 'fr' ? 'Alertes graduées' : 'Graded alerts',
                text:
                  lang === 'fr'
                    ? 'Notifications système, même lorsque l\'application est fermée.'
                    : 'System notifications, even when the app is closed.',
              },
              {
                icon: IconShield,
                title: lang === 'fr' ? 'Décision coordonnée' : 'Coordinated response',
                text:
                  lang === 'fr'
                    ? 'Escalade automatique du local vers le district et la région.'
                    : 'Automatic escalation from local to district and region.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div className="feature" key={title}>
                <div className="ico">
                  <Icon style={{ width: 17, height: 17 }} />
                </div>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tiny faint">{t('auth.secure')}</div>
      </div>

      <div className="auth-form">
        <div className="auth-box">
          <h2>{t('auth.signIn')}</h2>
          <p className="sub">
            {lang === 'fr' ? 'Entrez votre email et mot de passe' : 'Enter your email and password'}
          </p>

          {error && (
            <div className="banner warn" style={{ marginBottom: 14 }} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="identifier">{lang === 'fr' ? 'Email' : 'Email'}</label>
              <input
                id="identifier"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
              />
            </div>

            <div className="field">
              <label htmlFor="password">{t('auth.password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={6}
              />
            </div>

            <button className="btn primary block" type="submit" disabled={busy} style={{ marginTop: 6 }}>
              {busy && <span className="spinner" />}
              {t('auth.signIn')}
            </button>
          </form>

          <div className="divider" style={{ margin: '20px 0', textAlign: 'center' }}>
            <span className="small faint" style={{ background: 'var(--surface)', padding: '0 10px' }}>
              {lang === 'fr' ? 'ou' : 'or'}
            </span>
          </div>

          <button
            className="btn block google-btn"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            style={{
              background: '#5363CA',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#ffffff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#ffffff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#ffffff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#ffffff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {lang === 'fr' ? 'Continuer avec Google' : 'Continue with Google'}
          </button>
        </div>
      </div>
    </div>
  );
}
