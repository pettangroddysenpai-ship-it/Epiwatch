/* ÉpiWatch — Service Worker (PWA + Web Push) */
const VERSION = 'epiwatch-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

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
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.alertId ? `epiwatch-alert-${payload.alertId}` : payload.tag || 'epiwatch-alert',
      renotify: true,
      vibrate: level >= 4 ? [300, 120, 300, 120, 500] : [180, 80, 180],
      data: { url: target, alertId: payload.alertId ?? null },
      actions: [{ action: 'open', title: 'Voir les alertes' }],
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

/* L'abonnement a expiré/été renouvelé : on re-synchronise au prochain lancement. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .getSubscription()
      .then((subscription) => {
        if (!subscription) return undefined;
        return fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        }).catch(() => undefined);
      })
      .catch(() => undefined),
  );
});
