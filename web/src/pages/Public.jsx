import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n, diseaseName } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api, formatNumber, timeAgo } from '../lib/api.js';
import { useBrowserNotifications } from '../lib/hooks.js';
import { InlineAlert, LevelBadge, Empty } from '../components/ui.jsx';
import { levelInfo, levelColor, severityClass } from '../lib/ui.js';
import { Brand } from '../components/Layout.jsx';
import {
  IconBell, IconGlobe, IconShield, IconPulse, IconMap, IconInfo, IconAlert,
} from '../components/Icons.jsx';

/**
 * Vue publique mobile-first : niveau d'alerte local, conseils de prévention,
 * abonnement aux alertes et liste des établissements proches.
 */
export function PublicPage({ standalone = false }) {
  const { t, lang, setLang } = useI18n();
  const { user } = useAuth();
  const { zones, situation, hospitals, diseases, alertCounts } = useStore();
  const { permission, request, notify, supported } = useBrowserNotifications();
  const navigate = useNavigate();

  const [zoneId, setZoneId] = useState(() => {
    const stored = localStorage.getItem('epiwatch.zone');
    return stored ? Number(stored) : user?.zone_id ?? null;
  });
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (zoneId) localStorage.setItem('epiwatch.zone', String(zoneId));
  }, [zoneId]);

  const selectedZone = zones.find((z) => z.id === zoneId) || null;

  /* Agrège la situation pour la zone sélectionnée */
  const zoneState = useMemo(() => {
    if (!zoneId) return null;
    const rows = situation.filter((s) => s.region_id === zoneId || s.zone_id === zoneId);
    if (!rows.length) return { level: 0, totalActive: 0, byDisease: [], hospitals: [] };

    const byDisease = new Map();
    let level = 0;
    let totalActive = 0;
    const hospitalSet = new Map();

    for (const s of rows) {
      totalActive += s.active;
      level = Math.max(level, s.level);
      const d = byDisease.get(s.disease_id) || {
        disease_id: s.disease_id,
        name: s.disease_name,
        name_en: s.disease_name_en,
        color: s.disease_color,
        active: 0,
        level: 0,
      };
      d.active += s.active;
      d.level = Math.max(d.level, s.level);
      byDisease.set(s.disease_id, d);
      hospitalSet.set(s.hospital_id, s.hospital_id);
    }

    const zoneHospitals = hospitals.filter((h) => hospitalSet.has(h.id));
    return {
      level,
      totalActive,
      byDisease: [...byDisease.values()].sort((a, b) => b.level - a.level),
      hospitals: zoneHospitals,
    };
  }, [zoneId, situation, hospitals]);

  const topDisease = zoneState?.byDisease?.[0];
  const topDiseaseEntity = topDisease
    ? diseases.find((d) => d.id === topDisease.disease_id) || { name: topDisease.name, name_en: topDisease.name_en }
    : null;

  const advice = topDiseaseEntity?.advice || topDiseaseEntity?.advice_en;
  const adviceText =
    lang === 'en' ? topDiseaseEntity?.advice_en || advice : topDiseaseEntity?.advice || advice;

  const enableNotifications = async () => {
    if (!zoneId) {
      setFeedback({ kind: 'warn', message: lang === 'fr' ? 'Veuillez sélectionner une région avant d’activer les alertes.' : 'Please select a region before enabling alerts.' });
      return;
    }
    const result = await request();
    if (result === 'granted') {
      setFeedback({ kind: 'info', message: t('notif.enabled') });
      try {
        notify('ÉpiWatch', lang === 'fr' ? 'Vous recevrez désormais les alertes de votre zone.' : 'You will now receive your area’s alerts.', { level: 3 });
      } catch {}
      if (user) {
        api.setSubscription({ zone_id: zoneId, min_level: 3, enabled: true }).catch(() => undefined);
      } else {
        api.setSubscription({ zone_id: zoneId, min_level: 3, enabled: true }).catch(() => undefined);
      }
    } else if (result === 'denied') {
      setFeedback({ kind: 'warn', message: t('notif.blocked') });
    }
  };

  const info = zoneState ? levelInfo(zoneState.level) : levelInfo(0);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${severityMix(zoneState?.level ?? 0)} 0%, var(--bg) 340px)`,
        paddingBottom: 90,
      }}
    >
      {/* ── En-tête ── */}
      <header
        style={{
          padding: '18px 18px 0',
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link to={standalone ? '/welcome' : '/'} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="38" height="38" viewBox="0 0 512 512" aria-hidden="true">
              <defs>
                <linearGradient id="pb" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#5363CA" />
                  <stop offset="100%" stopColor="#3f4db8" />
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="112" fill="url(#pb)" />
              <path d="M120 240 H190 L214 196 L244 300 L272 168 L300 240 H392" fill="none"
                stroke="#ffffff" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          <div>
            <strong style={{ fontSize: 18, display: 'block', letterSpacing: '-0.02em' }}>ÉpiWatch</strong>
            <span className="tiny faint">{t('app.org')}</span>
          </div>
        </Link>
        <div style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
          {lang === 'fr' ? 'EN' : 'FR'}
        </button>
        {!user && (
          <button className="btn sm primary" onClick={() => navigate('/login')}>
            {t('auth.signIn')}
          </button>
        )}
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '18px 18px 0' }}>
        {/* ── Titre + sélecteur de zone ── */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 25, letterSpacing: '-0.03em', marginBottom: 6 }}>{t('public.title')}</h1>
          <p className="small muted" style={{ margin: 0 }}>{t('public.subtitle')}</p>
        </div>

        <div className="field">
          <label htmlFor="zone">{t('public.selectZone')}</label>
          <select id="zone" value={zoneId ?? ''} onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{lang === 'fr' ? 'Sélectionner une zone' : 'Select a zone'}</option>
            {zones
              .filter((z) => z.type === 'region')
              .map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
          </select>
        </div>

        {feedback && (
          <InlineAlert kind={feedback.kind} onClose={() => setFeedback(null)}>
            {feedback.message}
          </InlineAlert>
        )}

        {/* ── Carte de statut ── */}
        {zoneState && (
          <div
            className="card"
            style={{
              borderColor: info.color,
              borderLeftWidth: 5,
              marginBottom: 16,
              background: `linear-gradient(135deg, ${severityMix(zoneState.level, 0.28)}, var(--surface))`,
            }}
          >
            <div className="row between wrap" style={{ gap: 12 }}>
              <div>
                <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {t('public.zoneAlert')} · {selectedZone?.name ?? (lang === 'fr' ? 'Non sélectionné' : 'Not selected')}
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: info.color }}>
                    {zoneState.level}
                  </span>
                  <div>
                    <div className="bold" style={{ fontSize: 16 }}>
                      {lang === 'en' ? info.labelEn : info.labelFr}
                    </div>
                    <div className="small faint">
                      {formatNumber(zoneState.totalActive, lang)} {t('common.patients').toLowerCase()}
                    </div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: 74, height: 74, borderRadius: '50%',
                  border: `3px solid ${info.color}`,
                  display: 'grid', placeItems: 'center',
                  boxShadow: zoneState.level >= 4 ? `0 0 26px ${info.color}` : undefined,
                  position: 'relative',
                }}
              >
                {zoneState.level >= 3 && (
                  <span
                    className="pulse"
                    style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: `2px solid ${info.color}`, color: info.color,
                      animation: 'epi-pulse 2.2s ease-out infinite',
                    }}
                  />
                )}
                <IconPulse style={{ width: 30, height: 30, color: info.color }} />
              </div>
            </div>

            {zoneState.level >= 3 && (
              <div
                className="row"
                style={{ gap: 9, marginTop: 14, padding: '10px 12px', borderRadius: 9, background: 'rgba(0,0,0,0.22)' }}
              >
                <IconAlert style={{ width: 17, height: 17, color: info.color, flexShrink: 0 }} />
                <span className="small">
                  {lang === 'fr'
                    ? `Attention : une hausse significative de cas${topDisease ? ` de ${diseaseName(topDiseaseEntity, lang).toLowerCase()}` : ''} a été remarquée. Appliquez les mesures barrières.`
                    : `Warning: a significant rise in cases${topDisease ? ` of ${diseaseName(topDiseaseEntity, lang).toLowerCase()}` : ''} has been noticed. Apply barrier measures.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Bouton notifications ── */}
        <button
          className={`btn block ${permission === 'granted' ? '' : 'primary'}`}
          onClick={enableNotifications}
          disabled={permission === 'granted'}
          style={{ marginBottom: 16 }}
        >
          <IconBell style={{ width: 17, height: 17 }} />
          {permission === 'granted' ? t('notif.enabled') : t('notif.enable')}
        </button>

        {/* ── Maladies de la zone ── */}
        {zoneState && zoneState.byDisease.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3>{t('dash.byDisease')}</h3>
            </div>
            <div className="col" style={{ gap: 10 }}>
              {zoneState.byDisease.map((d) => {
                const dInfo = levelInfo(d.level);
                return (
                  <div key={d.disease_id} className="row between wrap" style={{ gap: 10 }}>
                    <div className="row" style={{ gap: 9 }}>
                      <span className="dot" style={{ background: d.color }} />
                      <span className="bold small">{diseaseName(d, lang)}</span>
                    </div>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="small faint">{formatNumber(d.active, lang)} {t('common.patients').toLowerCase()}</span>
                      <LevelBadge level={d.level} lang={lang} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Conseils de prévention ── */}
        {topDiseaseEntity && adviceText && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h3>{t('public.advice')}</h3>
                <p>{diseaseName(topDiseaseEntity, lang)}</p>
              </div>
              <IconShield style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            </div>
            <p className="small" style={{ margin: 0, color: 'var(--text-dim)', lineHeight: 1.65 }}>
              {adviceText}
            </p>
          </div>
        )}

        {/* ── Établissements proches ── */}
        {zoneState && zoneState.hospitals.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h3>{t('public.nearby')}</h3>
                <p>{zoneState.hospitals.length} {t('common.hospitals').toLowerCase()}</p>
              </div>
              <Link className="btn sm ghost" to="/map">
                <IconMap style={{ width: 15, height: 15 }} />
                {t('nav.map')}
              </Link>
            </div>
            <div className="col" style={{ gap: 8 }}>
              {zoneState.hospitals.slice(0, 8).map((h) => (
                <div key={h.id} className="row between wrap" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="bold small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.name}
                    </div>
                    <div className="tiny faint">{h.type} · {h.phone || (lang === 'fr' ? 'Non disponible' : 'Not available')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!zoneId && (
          <div className="card">
            <Empty icon={IconGlobe} title={t('public.selectZone')} hint={t('public.noAlert')} />
          </div>
        )}

        {/* ── Alertes récentes ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h3>{t('dash.recentAlerts')}</h3>
            <span className="badge soft">{alertCounts.active}</span>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {alertCounts.active === 0 ? (
              <Empty icon={IconShield} title={t('public.noAlert')} />
            ) : (
              <Link to="/alerts" className="btn block ghost">
                {t('common.viewAll')} →
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Mélange une couleur de sévérité avec le fond pour créer un dégradé contextuel. */
function severityMix(level, alpha = 0.16) {
  const c = levelInfo(level).color;
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
