import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useStore } from '../lib/store.jsx';
import { api, timeAgo } from '../lib/api.js';
import { useBrowserNotifications } from '../lib/hooks.js';
import { Page, Topbar } from '../components/Shell.jsx';
import { Empty, InlineAlert, LevelBadge } from '../components/ui.jsx';
import { IconBell, IconCheck, IconGlobe, IconPulse, IconAlert } from '../components/Icons.jsx';
import { levelInfo } from '../lib/ui.js';
import { disablePush, enablePush, pushSupported, pushSecureContext } from '../lib/push.js';

export function NotificationsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { zones, alertCounts, setNotifier } = useStore();
  const { permission, request, notify, supported } = useBrowserNotifications();

  const [items, setItems] = useState([]);
  const [subs, setSubs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const pushOk = pushSupported();
  const secure = pushSecureContext();
  const [pushPerm, setPushPerm] = useState(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');

  const load = useCallback(() => {
    if (!user) return;
    api.notifications().then((r) => setItems(r.notifications)).catch(() => undefined);
    api.subscriptions().then((r) => setSubs(r.subscriptions)).catch(() => undefined);
  }, [user]);

  useEffect(load, [load]);

  /* Enregistre la fonction de notification du navigateur auprès du magasin. */
  useEffect(() => {
    setNotifier?.(notify);
  }, [notify, setNotifier]);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await api.markNotificationsRead();
      load();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPerm(Notification.permission);
    }
  }, []);

  const enable = async () => {
    const result = await request();
    if (result === 'granted') {
      setFeedback({ kind: 'info', message: t('notif.enabled') });
      notify(
        'ÉpiWatch',
        lang === 'fr' ? 'Les notifications sont activées. Vous serez alerté en cas de hausse significative.' : 'Notifications enabled. You will be alerted on any significant surge.',
        { level: 3, test: true },
      );
    } else if (result === 'denied') {
      setFeedback({ kind: 'warn', message: t('notif.blocked') });
    }
  };

  const enableSystemPush = async () => {
    if (!user) return;
    setPushBusy(true);
    setFeedback(null);
    try {
      await enablePush();
      setPushPerm(Notification.permission);
      setFeedback({
        kind: 'info',
        message: lang === 'fr'
          ? 'Notifications système activées. Vous serez prévenu même si l’onglet/écran est fermé.'
          : 'System notifications enabled. You will be notified even when the app is closed.',
      });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setPushBusy(false);
    }
  };

  const disableSystemPush = async () => {
    setPushBusy(true);
    setFeedback(null);
    try {
      await disablePush();
      setPushPerm(Notification.permission);
      setFeedback({
        kind: 'info',
        message: lang === 'fr' ? 'Notifications système désactivées sur cet appareil.' : 'System notifications disabled on this device.',
      });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setPushBusy(false);
    }
  };

  const testSystemPush = async () => {
    if (!user) return;
    setPushBusy(true);
    setFeedback(null);
    try {
      const r = await api.pushTest();
      setFeedback({
        kind: r.sent ? 'info' : 'warn',
        message:
          r.sent
            ? lang === 'fr'
              ? `Notification de test envoyée (${r.sent} appareil(s)).`
              : `Test sent (${r.sent} device(s)).`
            : lang === 'fr'
              ? 'Aucun appareil abonné. Activez d’abord « Notifications système » sur ce téléphone/navigateur.'
              : 'No device subscribed. Enable “System notifications” on this browser/phone first.',
      });
    } catch (err) {
      setFeedback({ kind: 'warn', message: err.message });
    } finally {
      setPushBusy(false);
    }
  };

  const toggleZone = async (zoneId, enabled) => {
    const current = subs.find((s) => s.zone_id === zoneId);
    await api.setSubscription({
      zone_id: zoneId,
      min_level: current?.min_level ?? 2,
      enabled,
    });
    load();
  };

  const setMinLevel = async (zoneId, level) => {
    await api.setSubscription({ zone_id: zoneId, min_level: level, enabled: true });
    load();
  };

  const sendTest = () => {
    notify(
      lang === 'fr' ? 'Alerte sanitaire - Test' : 'Health alert - Test',
      lang === 'fr'
        ? 'Niveau 5 · Situation critique · Choléra · Hôpital Central de Douala'
        : 'Level 5 · Critical situation · Cholera · Douala Central Hospital',
      { level: 5, test: true },
    );
    setFeedback({ kind: 'info', message: lang === 'fr' ? 'Notification de test envoyée (si la page est en arrière-plan).' : 'Test notification sent (if the page is in the background).' });
  };

  const regions = useMemo(() => (zones || []).filter((z) => z.type === 'region'), [zones]);

  return (
    <>
      <Topbar title={t('notif.title')} subtitle={`${alertCounts.active} ${t('status.active').toLowerCase()}`} />
      <Page>
        {feedback && (
          <InlineAlert kind={feedback.kind} onClose={() => setFeedback(null)}>
            {feedback.message}
          </InlineAlert>
        )}

        <div className="grid grid-2" style={{ marginBottom: 16 }}>
          {/* ── Notifications système (Web Push) ── */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{lang === 'fr' ? 'Notifications système (Web Push)' : 'System notifications (Web Push)'}</h3>
                <p>
                  {lang === 'fr'
                    ? 'Recommandé. Fonctionne même si l’onglet, le navigateur ou l’application est fermé.'
                    : 'Recommended. Works even if the tab, browser or app is closed.'}
                </p>
              </div>
              <IconBell style={{ width: 18, height: 18, color: 'var(--primary)' }} />
            </div>

            {!user ? (
              <InlineAlert kind="warn">
                {lang === 'fr' ? 'Connectez-vous pour activer les notifications système.' : 'Sign in to enable system notifications.'}
              </InlineAlert>
            ) : !pushOk ? (
              <InlineAlert kind="warn">
                {lang === 'fr'
                  ? 'Ce navigateur ne prend pas en charge le Web Push (utilisez Chrome, Edge ou Firefox récent).'
                  : 'This browser does not support Web Push (use a recent Chrome, Edge or Firefox).'}
              </InlineAlert>
            ) : !secure ? (
              <InlineAlert kind="warn">
                {lang === 'fr'
                  ? 'Exige HTTPS ou http://localhost. Pour tester sur un autre appareil, utilisez `npm run start:secure` (certificat auto-signé).'
                  : 'Requires HTTPS or http://localhost. To test on another device, use `npm run start:secure` (self-signed cert).'}
              </InlineAlert>
            ) : pushPerm === 'granted' ? (
              <div className="col" style={{ gap: 10 }}>
                <span className="badge lvl-1">
                  <IconCheck style={{ width: 13, height: 13 }} />
                  {lang === 'fr' ? 'Activées sur cet appareil' : 'Enabled on this device'}
                </span>
                <div className="row wrap" style={{ gap: 10 }}>
                  <button className="btn sm" onClick={testSystemPush} disabled={pushBusy}>
                    {pushBusy && <span className="spinner" />}
                    {lang === 'fr' ? 'Tester la notification' : 'Send test notification'}
                  </button>
                  <button className="btn sm ghost" onClick={disableSystemPush} disabled={pushBusy}>
                    {lang === 'fr' ? 'Désactiver sur cet appareil' : 'Disable on this device'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="row wrap" style={{ gap: 10 }}>
                <button className="btn primary" onClick={enableSystemPush} disabled={pushBusy || pushPerm === 'denied'}>
                  {pushBusy ? <span className="spinner" /> : <IconBell style={{ width: 16, height: 16 }} />}
                  {lang === 'fr' ? 'Activer les notifications système' : 'Enable system notifications'}
                </button>
                {pushPerm === 'denied' && (
                  <span className="small" style={{ color: 'var(--lvl4)' }}>
                    {lang === 'fr'
                      ? 'Refusé par le navigateur. Autorisez les notifications dans les réglages du site.'
                      : 'Denied by browser. Allow notifications in site settings.'}
                  </span>
                )}
              </div>
            )}

            {/* Fallback in-app si non activées */}
            {pushPerm !== 'granted' && supported && (
              <div className="divider" />
            )}
            {pushPerm !== 'granted' && supported && (
              <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
                <span className="small faint">
                  {lang === 'fr' ? 'Alternative : notifications dans cet onglet' : 'Fallback: in-tab notifications'}
                </span>
                <button className="btn sm ghost" onClick={enable} disabled={permission === 'denied'}>
                  {t('notif.enable')}
                </button>
                <button className="btn sm ghost" onClick={sendTest}>{t('notif.test')}</button>
              </div>
            )}
          </div>

          {/* ── Abonnements par zone ── */}
          <div className="card">
            <div className="card-head">
              <div>
                <h3>{t('notif.subscriptions')}</h3>
                <p>{t('notif.subscribeZone')}</p>
              </div>
              <IconGlobe style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            </div>
            {!user ? (
              <div className="small faint">{lang === 'fr' ? 'Connectez-vous pour gérer vos abonnements.' : 'Sign in to manage your subscriptions.'}</div>
            ) : (
              <div className="col" style={{ gap: 10 }}>
                {regions.map((z) => {
                  const sub = subs.find((s) => s.zone_id === z.id);
                  return (
                    <div key={z.id} className="row between wrap" style={{ gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--border-soft)' }}>
                      <label className="row" style={{ gap: 9, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto' }}
                          checked={!!sub}
                          onChange={(e) => toggleZone(z.id, e.target.checked)}
                        />
                        <span className="small bold">{z.name}</span>
                        <span className="tiny faint">{z.districts?.length ?? 0} {t('common.district').toLowerCase()}(s)</span>
                      </label>
                      {sub && (
                        <select
                          value={sub.min_level}
                          onChange={(e) => setMinLevel(z.id, Number(e.target.value))}
                          style={{ width: 'auto', fontSize: 12 }}
                        >
                          {[2, 3, 4, 5, 6].map((l) => (
                            <option key={l} value={l}>≥ {l} · {lang === 'en' ? levelInfo(l).labelEn : levelInfo(l).labelFr}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Historique ── */}
        <div className="card">
          <div className="card-head">
            <div>
              <h3>{t('notif.title')}</h3>
              <p>{items.length} {lang === 'fr' ? 'reçues' : 'received'}</p>
            </div>
            {user && items.some((n) => !n.read) && (
              <button className="btn sm" onClick={markAllRead} disabled={busy}>{t('notif.markAll')}</button>
            )}
          </div>

          {!user ? (
            <Empty icon={IconBell} title={lang === 'fr' ? 'Connectez-vous' : 'Sign in'} hint={lang === 'fr' ? 'Vos notifications apparaîtront ici.' : 'Your notifications will appear here.'} />
          ) : items.length === 0 ? (
            <Empty icon={IconPulse} title={t('notif.empty')} />
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {items.map((n) => (
                <Link
                  key={n.id}
                  to="/alerts"
                  className="alert-card"
                  style={{
                    display: 'flex',
                    borderLeftColor: n.disease_color || levelInfo(n.level).color,
                    opacity: n.read ? 0.6 : 1,
                  }}
                >
                  <div className="alert-body">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <LevelBadge level={n.level} lang={lang} size="sm" />
                      <span className="bold" style={{ fontSize: 13.5 }}>{n.title}</span>
                      {!n.read && <span className="dot" style={{ background: 'var(--danger)' }} />}
                    </div>
                    <div className="alert-msg">{n.body}</div>
                    <div className="alert-meta">
                      <span>{timeAgo(n.created_at, lang)}</span>
                      {n.scope && (
                        <>
                          <span>·</span>
                          <span>{t(`alerts.scope.${n.scope}`)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <IconAlert style={{ width: 16, height: 16, color: levelInfo(n.level).color, alignSelf: 'center' }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
