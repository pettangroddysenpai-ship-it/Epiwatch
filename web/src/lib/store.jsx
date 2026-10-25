import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { useRealtime } from './hooks.js';
import { useAuth } from './auth.jsx';

const StoreContext = createContext(null);

const POLL_INTERVAL = 20000;

/**
 * Magasin applicatif central.
 * - Charge les référentiels (zones, hôpitaux, maladies, config).
 * - Maintient les statistiques, la situation et les alertes à jour.
 * - Écoute le flux temps réel du serveur et déclenche les notifications.
 */
export function StoreProvider({ children }) {
  const { user } = useAuth();

  const [zones, setZones] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [diseases, setDiseases] = useState([]);
  const [config, setConfig] = useState(null);
  const [overview, setOverview] = useState(null);
  const [situation, setSituation] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [alertCounts, setAlertCounts] = useState({ active: 0, critical: 0, regional: 0 });
  const [ready, setReady] = useState(false);
  const [lastEventAt, setLastEventAt] = useState(null);
  const [toasts, setToasts] = useState([]);

  const notifRef = useRef(null);

  const pushToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, ...toast }].slice(-4));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 7000);
  }, []);

  /* ── Chargement initial des référentiels ── */
  const loadReference = useCallback(async () => {
    const [z, h, d, c] = await Promise.all([
      api.zones(),
      api.hospitals(),
      api.diseases(),
      api.config(),
    ]);
    setZones(z.zones);
    setHospitals(h.hospitals);
    setDiseases(d.diseases);
    setConfig(c.config);
  }, []);

  /* ── Rafraîchissement des données de surveillance ── */
  const refreshSurveillance = useCallback(async () => {
    const [o, s, a] = await Promise.all([
      api.overview(),
      api.situation(),
      api.alerts({ limit: 120 }),
    ]);
    setOverview(o.overview);
    setSituation(s.situation);
    setAlerts(a.alerts);
    setAlertCounts(a.counts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadReference();
        await refreshSurveillance();
      } catch (err) {
        console.error('[store] chargement initial échoué', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReference, refreshSurveillance]);

  /* ── Après connexion : recharger les données au cas où la base a changé ── */
  useEffect(() => {
    if (!user) return;
    refreshSurveillance().catch(() => undefined);
    loadReference().catch(() => undefined);
  }, [user, refreshSurveillance, loadReference]);

  /* ── Flux temps réel ── */
  const handleEvent = useCallback(
    (event, data) => {
      setLastEventAt(Date.now());

      if (event === 'case') {
        refreshSurveillance();
        pushToast({
          kind: 'info',
          title: 'Nouvelle déclaration',
          body: data?.report
            ? `${data.report.hospital_name} · ${data.report.disease_name} · ${data.report.new_cases} cas`
            : 'Déclaration mise à jour',
        });
      } else if (event === 'alerts') {
        refreshSurveillance();
        for (const alert of [...(data?.created ?? []), ...(data?.updated ?? [])]) {
          if (alert.level >= 3) {
            pushToast({
              kind: alert.level >= 5 ? 'danger' : 'warning',
              title: `Alerte niveau ${alert.level}`,
              body: alert.message,
            });
          }
        }
      } else if (event === 'stats') {
        if (data?.overview) setOverview(data.overview);
        api.situation().then((s) => setSituation(s.situation)).catch(() => undefined);
      } else if (event === 'config') {
        loadReference();
      } else if (event === 'hospitals' || event === 'users' || event === 'diseases') {
        loadReference();
      } else if (event === 'reset') {
        loadReference().then(refreshSurveillance);
      }
    },
    [refreshSurveillance, loadReference, pushToast],
  );

  const { status: realtimeStatus, isConnected } = useRealtime(handleEvent);

  /* ── Sondage de repli quand le flux temps réel est coupé ── */
  useEffect(() => {
    if (isConnected) return undefined;
    const id = setInterval(() => {
      refreshSurveillance().catch(() => undefined);
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isConnected, refreshSurveillance]);

  const value = useMemo(
    () => ({
      zones,
      hospitals,
      diseases,
      config,
      overview,
      situation,
      alerts,
      alertCounts,
      ready,
      realtimeStatus,
      isConnected,
      lastEventAt,
      toasts,
      pushToast,
      dismissToast: (id) => setToasts((l) => l.filter((t) => t.id !== id)),
      refresh: refreshSurveillance,
      reloadReference: loadReference,
      setNotifier: (fn) => {
        notifRef.current = fn;
      },
      emitNotification: (title, body, data) => notifRef.current?.(title, body, data),
      user,
    }),
    [
      zones, hospitals, diseases, config, overview, situation, alerts, alertCounts,
      ready, realtimeStatus, isConnected, lastEventAt, toasts, pushToast,
      refreshSurveillance, loadReference, user,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore doit être utilisé dans un StoreProvider');
  return ctx;
}
