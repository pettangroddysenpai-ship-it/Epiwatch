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
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
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
  if (!pushSupported()) {
    throw new Error(
      'Notifications système non prises en charge par ce navigateur. Utilisez Chrome, Edge ou Firefox récent.',
    );
  }
  if (!pushSecureContext()) {
    throw new Error(
      'Les notifications système exigent HTTPS ou localhost. Ouvrez l’application via https:// (npm run start:secure) ou sur localhost.',
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permission refusée. Les notifications système restent désactivées.');
  }

  try {
    const { publicKey } = await api.pushKey();
    if (!publicKey) throw new Error('Clé publique push indisponible sur le serveur.');
    await registerServiceWorker();

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await api.pushSubscribe(subscription.toJSON());
    return subscription;
  } catch (err) {
    throw friendlyError(err);
  }
}

/**
 * Réenregistre silencieusement un abonnement existant (endpoint peut changer
 * après une mise à jour du navigateur). Appelé à la connexion.
 */
export async function syncPushSubscription() {
  if (!pushSupported() || notificationPermission() !== 'granted') return null;
  try {
    await registerServiceWorker();
    const subscription = await getPushSubscription();
    if (subscription) await api.pushSubscribe(subscription.toJSON());
    return subscription;
  } catch {
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
