import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.EPIWATCH_DATA_DIR || path.join(ROOT, 'data');
export const DB_FILE = process.env.EPIWATCH_DB || path.join(DATA_DIR, 'epiwatch.db');

export const PORT = Number(process.env.PORT || 4000);
export const HOST = process.env.HOST || '0.0.0.0';

/** Fenetre glissante (jours) utilisee pour agreger les nouveaux cas. */
export const DEFAULT_WINDOW_DAYS = 7;

/** Regles d'escalade : nombre d'hopitaux distincts concernes par niveau. */
export const DEFAULT_ESCALATION = {
  district: { minHospitals: 2, minLevel: 5 },
  region: { minHospitals: 5, minLevel: 5 },
  /** Un niveau critique dans un seul hopital suffit a alerter l'echelle superieure. */
  regionImmediateLevel: 6,
  districtImmediateLevel: 6,
};

/**
 * Echelle des niveaux d'alerte (7 niveaux).
 * `color`  : couleur du marqueur sur la carte
 * `short`  : code court affiche dans les pastilles
 * `signal` : intensite du signal (pulse) appliquee au marqueur
 */
export const ALERT_LEVELS = [
  { level: 0, key: 'blue', color: '#2563eb', short: '0', signal: 0 },
  { level: 1, key: 'green', color: '#16a34a', short: '1', signal: 0 },
  { level: 2, key: 'yellow', color: '#eab308', short: '2', signal: 1 },
  { level: 3, key: 'orange', color: '#f97316', short: '3', signal: 2 },
  { level: 4, key: 'lightred', color: '#ef4444', short: '4', signal: 3 },
  { level: 5, key: 'red', color: '#b91c1c', short: '5', signal: 4 },
  { level: 6, key: 'darkred', color: '#7f1d1d', short: '6', signal: 5 },
];

export const ALERT_LEVEL_BY_KEY = Object.fromEntries(ALERT_LEVELS.map((l) => [l.key, l]));

/**
 * Modele simplifie a trois roles :
 *  - `agent`  : infirmier / agent de saisie rattache a un hopital (peut saisir et surveiller)
 *  - `public` : simple citoyen (consultation + notifications)
 *  - `admin`  : administrateur (gestion des comptes, configuration, tableau de bord)
 */
export const ROLES = {
  ADMIN: 'admin',
  AGENT: 'agent',
  PUBLIC: 'public',
};

/** Roles habilites a saisir des declarations de cas. */
export const CAN_REPORT = new Set([ROLES.ADMIN, ROLES.AGENT]);

/** Roles habilites a confirmer / escalader une alerte. */
export const CAN_ACK_ALERT = new Set([ROLES.ADMIN, ROLES.AGENT]);

/** Roles habilites a modifier la configuration (seuils, hopitaux, comptes...). */
export const CAN_MANAGE_CONFIG = new Set([ROLES.ADMIN]);

/** Roles internes (agents de sante). */
export const STAFF_ROLES = new Set([ROLES.ADMIN, ROLES.AGENT]);

/* ─────────────────────────────  Notifications push (Web Push)  ───────────────────────────── */

/** Sujet VAPID (identifie le serveur aupres des services de push). */
export const VAPID_SUBJECT = process.env.EPIWATCH_VAPID_SUBJECT || 'mailto:admin@epiwatch.cm';

/** Duree de vie par defaut d'une notification push (secondes). */
export const PUSH_TTL = 60 * 60 * 24;

