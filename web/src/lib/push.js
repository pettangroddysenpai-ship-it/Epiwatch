import { api } from './api.js';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushSecureContext() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext;
}

export function notificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Enregistre le service worker (nécessaire pour le Web Push). */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Ce navigateur ne prend pas en charge les service workers.');
  }
  
  // Check if already registered
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) {
    console.log('[push] Service worker already registered, waiting for activation');
    await existing.update();
    await navigator.serviceWorker.ready;
    return existing;
  }
  
  console.log('[push] Registering new service worker');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  console.log('[push] Service worker registered, waiting for activation');
  await navigator.serviceWorker.ready;
  console.log('[push] Service worker activated and ready');
  return registration;
}

export async function getPushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

function friendlyError(err) {
  if (err?.name === 'NotAllowedError') {
    return new Error('Permission refusée. Autorisez les notifications dans les réglages du navigateur.');
  }
  if (err?.name === 'AbortError') {
    return new Error('Abonnement push interrompu. Réessayez.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Demande la permission, crée l'abonnement navigateur et l'enregistre côté serveur.
 * Renvoie l'abonnement actif.
 */
export async function enablePush() {
  console.log('[push] Starting push enablement...');
  
  if (!pushSupported()) {
    console.error('[push] Push not supported by browser');
    throw new Error(
      'Notifications système non prises en charge par ce navigateur. Utilisez Chrome, Edge ou Firefox récent.',
    );
  }
  if (!pushSecureContext()) {
    console.error('[push] Not in secure context');
    throw new Error(
      'Les notifications système exigent HTTPS ou localhost. Ouvrez l’application via https:// (npm run start:secure) ou sur localhost.',
    );
  }

  console.log('[push] Requesting notification permission...');
  const permission = await Notification.requestPermission();
  console.log('[push] Permission result:', permission);
  if (permission !== 'granted') {
    throw new Error('Permission refusée. Les notifications système restent désactivées.');
  }

  try {
    console.log('[push] Fetching VAPID public key...');
    const { publicKey } = await api.pushKey();
    if (!publicKey) throw new Error('Clé publique push indisponible sur le serveur.');
    console.log('[push] VAPID key received, registering service worker...');
    
    const registration = await registerServiceWorker();
    console.log('[push] Service worker ready, checking existing subscription...');
    
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      console.log('[push] No existing subscription, creating new one...');
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      console.log('[push] New subscription created:', subscription.endpoint);
    } else {
      console.log('[push] Existing subscription found:', subscription.endpoint);
    }
    
    console.log('[push] Sending subscription to server...');
    await api.pushSubscribe(subscription.toJSON());
    console.log('[push] Subscription registered on server successfully');
    return subscription;
  } catch (err) {
    console.error('[push] Enable push failed:', err);
    throw friendlyError(err);
  }
}

/**
 * Réenregistre silencieusement un abonnement existant (endpoint peut changer
 * après une mise à jour du navigateur). Appelé à la connexion.
 */
export async function syncPushSubscription() {
  console.log('[push] Syncing push subscription...');
  if (!pushSupported()) {
    console.log('[push] Push not supported, skipping sync');
    return null;
  }
  if (notificationPermission() !== 'granted') {
    console.log('[push] Notification permission not granted, skipping sync');
    return null;
  }
  try {
    await registerServiceWorker();
    const subscription = await getPushSubscription();
    if (subscription) {
      console.log('[push] Found existing subscription, re-registering with server...');
      await api.pushSubscribe(subscription.toJSON());
      console.log('[push] Subscription re-registered successfully');
      return subscription;
    } else {
      console.log('[push] No existing subscription to sync');
    }
    return null;
  } catch (err) {
    console.error('[push] Sync push subscription failed:', err);
    return null;
  }
}

export async function disablePush() {
  try {
    const subscription = await getPushSubscription();
    if (!subscription) return;
    await api.pushUnsubscribe(subscription.endpoint);
    await subscription.unsubscribe();
  } catch {
    /* l'abonnement local est peut-être déjà absent */
  }
}

export async function sendTestPush() {
  return api.pushTest();
}

/**
 * Vérifie l'état complet de l'abonnement push (local + serveur).
 * Utile pour le diagnostic.
 */
export async function checkPushStatus() {
  const status = {
    supported: pushSupported(),
    secure: pushSecureContext(),
    permission: notificationPermission(),
    hasServiceWorker: false,
    serviceWorkerReady: false,
    hasLocalSubscription: false,
    hasServerSubscription: false,
    serverSubscriptions: [],
  };

  if (status.supported) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      status.hasServiceWorker = !!reg;
      if (reg) {
        await navigator.serviceWorker.ready;
        status.serviceWorkerReady = true;
        const sub = await reg.pushManager.getSubscription();
        status.hasLocalSubscription = !!sub;
      }
    } catch (err) {
      console.error('[push] Error checking service worker:', err);
    }
  }

  try {
    const result = await api.pushSubscriptions();
    status.serverSubscriptions = result.subscriptions || [];
    status.hasServerSubscription = status.serverSubscriptions.length > 0;
  } catch (err) {
    // Not logged in or API error
    console.error('[push] Error checking server subscriptions:', err);
  }

  console.log('[push] Status check:', status);
  return status;
}
