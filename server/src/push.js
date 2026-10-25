/**
 * Notifications Web Push (notifications système, même application fermée).
 *
 * Les clés VAPID sont générées une seule fois et conservées dans la table
 * `settings`, afin que les abonnements restent valides entre deux démarrages.
 *
 * Note : le navigateur n'autorise Web Push qu'en contexte sécurisé
 * (https:// ou http://localhost). Sur un réseau local en HTTP simple, on
 * retombe sur les notifications dans l'application (SSE).
 */
import webpush from 'web-push';
import { all, get, run, getSetting, setSetting } from './db.js';
import { VAPID_SUBJECT, PUSH_TTL } from './config.js';

let configured = false;

/** Récupère (ou génère) la paire de clés VAPID et configure web-push. */
export function initPush() {
  let publicKey = getSetting('vapid_public', null);
  let privateKey = getSetting('vapid_private', null);

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  configured = true;
  return publicKey;
}

export function getPublicKey() {
  if (!configured) initPush();
  return getSetting('vapid_public', null);
}

/** Enregistre (ou met à jour) un abonnement push pour un utilisateur. */
export function savePushSubscription(userId, subscription, userAgent = null) {
  const { endpoint, keys } = subscription || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Abonnement push invalide');
  }
  run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh  = excluded.p256dh,
       auth    = excluded.auth,
       user_agent = excluded.user_agent`,
    [userId, endpoint, keys.p256dh, keys.auth, userAgent],
  );
  return { endpoint };
}

export function removePushSubscription(endpoint) {
  run('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

export function listPushSubscriptions(userId) {
  return all('SELECT id, endpoint, user_agent, created_at FROM push_subscriptions WHERE user_id = ?', [userId]);
}

/**
 * Envoie une notification push à tous les appareils des utilisateurs ciblés.
 * Supprime automatiquement les abonnements expirés (404 / 410).
 */
export async function sendPushToUsers(userIds, payload) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return { sent: 0, failed: 0 };

  if (!configured) initPush();

  const placeholders = ids.map(() => '?').join(',');
  const subs = all(
    `SELECT * FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    ids,
  );
  if (!subs.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: PUSH_TTL },
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        // Abonnement périmé : on le supprime.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          removePushSubscription(sub.endpoint);
        }
      }
    }),
  );

  return { sent, failed };
}

export function pushSubscriptionCount() {
  const row = get('SELECT COUNT(*) AS c FROM push_subscriptions');
  return row?.c ?? 0;
}
