import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Connexion au flux temps réel (SSE) exposé par le serveur ÉpiWatch.
 * Reconnexion automatique avec repli sur sondage périodique si le flux échoue.
 */
export function useRealtime(onEvent, { enabled = true } = {}) {
  const [status, setStatus] = useState('connecting');
  const handlersRef = useRef(onEvent);
  handlersRef.current = onEvent;

  const connect = useCallback(() => {
    if (!enabled) return undefined;

    const API_BASE = import.meta.env.VITE_API_URL || '/api';
    const source = new EventSource(`${API_BASE}/stream`);
    let closed = false;

    source.addEventListener('open', () => setStatus('connected'));
    source.addEventListener('hello', () => setStatus('connected'));

    const forward = (event) => (e) => {
      let data = null;
      try {
        data = JSON.parse(e.data);
      } catch {
        data = null;
      }
      handlersRef.current?.(event, data);
    };

    const events = ['case', 'alerts', 'stats', 'config', 'users', 'hospitals', 'reset'];
    for (const ev of events) source.addEventListener(ev, forward(ev));

    source.onerror = () => {
      if (closed) return;
      setStatus('reconnecting');
      source.close();
      setTimeout(() => {
        if (!closed) connectRef.current?.();
      }, 4000);
    };

    return () => {
      closed = true;
      source.close();
    };
  }, [enabled]);

  const connectRef = useRef(connect);
  connectRef.current = connect;

  useEffect(() => {
    const cleanup = connect();
    return () => cleanup?.();
  }, [connect]);

  return { status, isConnected: status === 'connected' };
}

/** Sondage de repli, utilisé si le flux SSE est indisponible. */
export function usePolling(fn, intervalMs = 15000, enabled = false) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    fnRef.current?.();
    const id = setInterval(() => fnRef.current?.(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

/* ── Notifications navigateur ── */

export function useBrowserNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  const request = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = useCallback(
    (title, body, data) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;

      // Si la page est au premier plan, on laisse l'interface gérer l'affichage.
      if (document.visibilityState === 'visible') return false;

      try {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then((reg) =>
            reg.showNotification(title, {
              body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              vibrate: [200, 100, 200, 100, 400],
              tag: `epiwatch-${data?.level ?? 0}`,
              renotify: true,
              data: { url: '/alerts', ...data },
            }),
          );
          return true;
        }
        new Notification(title, { body, icon: '/icons/icon-192.png' });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  return { permission, request, notify, supported: permission !== 'unsupported' };
}
