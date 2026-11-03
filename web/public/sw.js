/* ÉpiWatch — Service Worker (PWA + Web Push) */
const VERSION = 'epiwatch-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

// Embedded icon for notifications (SVG as data URI to avoid file loading issues)
const NOTIFICATION_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjExMiIgZmlsbD0iIzUzNjNDQSIvPgogIDxjaXJjbGUgY3g9IjI1NiIgY3k9IjI0MCIgcj0iMTUwIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMTAiIG9wYWNpdHk9IjAuMTgiLz4KICA8Y2lyY2xlIGN4PSIyNTYiIGN5PSIyNDAiIHI9IjEwMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjYiIG9wYWNpdHk9IjAuNCIvPgogIDxwYXRoIGQ9Ik0xMjAgMjQwIEgxOTAgTDIxNCAxOTYgTDQ0IDMwMCBMMjcyIDE2OCBMMzAwIDI0MCBIMzkyIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMjAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4=';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Jamais de cache pour l'API (données temps réel) ni pour le flux SSE.
  if (url.pathname.startsWith('/api/')) return;

  // En développement, ne jamais intercepter les modules Vite / HMR.
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t')
  ) {
    return;
  }

  // Navigation : réseau d'abord, repli sur le cache (mode démo hors ligne).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  // Ressources statiques : cache d'abord.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && (url.origin === self.location.origin)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached || Response.error());
    }),
  );
});

/* Notifications push / locales */
self.addEventListener('push', (event) => {
  let payload = { title: 'ÉpiWatch', body: 'Nouvelle alerte sanitaire' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  const level = payload.level ?? 0;
  const target = payload.url || '/alerts';
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: NOTIFICATION_ICON,
      badge: '/icons/icon-192.png',
      tag: payload.alertId ? `epiwatch-alert-${payload.alertId}` : payload.tag || 'epiwatch-alert',
      renotify: true,
      vibrate: level >= 4 ? [300, 120, 300, 120, 500] : [180, 80, 180],
      data: { url: target, alertId: payload.alertId ?? null },
      actions: [{ action: 'open', title: 'Voir les alertes' }],
      dir: 'auto',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/* L'abonnement a expiré/été renouvelé : on re-synchronise au prochain lancement.
   Note: This event is not consistently supported across browsers.
   Re-syncing is handled by syncPushSubscription() in the app on login. */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[sw] Push subscription changed');
  event.waitUntil(
    self.registration.pushManager
      .getSubscription()
      .then((subscription) => {
        if (!subscription) {
          console.log('[sw] No subscription after change');
          return undefined;
        }
        console.log('[sw] New subscription after change:', subscription.endpoint);
        // Store in IndexedDB for later sync when app opens
        return (async () => {
          try {
            const db = await self.indexedDB.open('epiwatch-push-sync', 1);
            if (!db.objectStoreNames.contains('subscriptions')) {
              db.createObjectStore('subscriptions');
            }
            const tx = db.transaction('subscriptions', 'readwrite');
            tx.objectStore('subscriptions').put(subscription.toJSON(), 'current');
            await tx.complete;
            console.log('[sw] Subscription stored for later sync');
          } catch (err) {
            console.error('[sw] Failed to store subscription:', err);
          }
        })();
      })
      .catch((err) => console.error('[sw] Failed to handle subscription change:', err)),
  );
});
