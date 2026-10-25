import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DB_FILE, DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SCHEMA = `
-- ─────────────────────────────  Zones géographiques  ─────────────────────────────
-- Hiérarchie région > district. Un hopital est rattache a un district,
-- lui-meme rattache a une region.
CREATE TABLE IF NOT EXISTS zones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL UNIQUE,
  type        TEXT    NOT NULL CHECK (type IN ('region','district')),
  parent_id   INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  population  INTEGER,
  lat         REAL,
  lng         REAL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────────────────  Hopitaux  ────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  code        TEXT    NOT NULL UNIQUE,
  type        TEXT    NOT NULL CHECK (type IN ('central','regional','district','clinic','private')),
  zone_id     INTEGER NOT NULL REFERENCES zones(id),
  address     TEXT,
  phone       TEXT,
  beds        INTEGER,
  lat         REAL    NOT NULL,
  lng         REAL    NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hospitals_zone ON hospitals(zone_id);

-- ────────────────────────────────  Maladies  ────────────────────────────────
CREATE TABLE IF NOT EXISTS diseases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  color        TEXT NOT NULL DEFAULT '#64748b',
  icon         TEXT NOT NULL DEFAULT 'virus',
  description  TEXT,
  advice       TEXT,
  advice_en    TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

-- ────────────────────  Seuils d'alerte (absolus, configurables)  ────────────────────
-- 6 seuils par maladie => 7 niveaux possibles (0 = bleu ... 6 = rouge fonce).
CREATE TABLE IF NOT EXISTS thresholds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  disease_id   INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
  level        INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  min_active   INTEGER NOT NULL,
  UNIQUE (disease_id, level)
);

-- ─────────────────────────────  Utilisateurs  ─────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  username      TEXT    UNIQUE,
  password_hash TEXT    NOT NULL,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL,
  rank          TEXT,
  hospital_id   INTEGER REFERENCES hospitals(id) ON DELETE SET NULL,
  zone_id       INTEGER REFERENCES zones(id) ON DELETE SET NULL,
  phone         TEXT,
  language      TEXT    NOT NULL DEFAULT 'fr',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ─────────────────────────  Declarations de cas  ─────────────────────────
-- Une ligne = une declaration d'un hopital pour une maladie a une date.
-- new_cases            : nouveaux cas enregistres sur la periode
-- patients_under_care  : patients actuellement suivis (total actif)
CREATE TABLE IF NOT EXISTS case_reports (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id          INTEGER NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  disease_id           INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
  report_date          TEXT    NOT NULL,
  new_cases            INTEGER NOT NULL DEFAULT 0,
  patients_under_care  INTEGER NOT NULL DEFAULT 0,
  deaths               INTEGER NOT NULL DEFAULT 0,
  recovered            INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cases_hosp ON case_reports(hospital_id, disease_id, report_date);
CREATE INDEX IF NOT EXISTS idx_cases_date ON case_reports(report_date);

-- ────────────────────────────────  Alertes  ────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scope           TEXT    NOT NULL CHECK (scope IN ('hospital','district','region')),
  scope_id        INTEGER NOT NULL,
  disease_id      INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
  level           INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','acknowledged','resolved')),
  title           TEXT    NOT NULL,
  message         TEXT    NOT NULL,
  action          TEXT,
  hospital_count  INTEGER NOT NULL DEFAULT 0,
  total_cases     INTEGER NOT NULL DEFAULT 0,
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (scope, scope_id, disease_id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status, level);

-- ──────────────────────────  Journal de traçabilité  ──────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  action     TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payload    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────  Abonnements aux alertes (mobile)  ────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id    INTEGER REFERENCES zones(id) ON DELETE CASCADE,
  min_level  INTEGER NOT NULL DEFAULT 2,
  channel    TEXT NOT NULL DEFAULT 'push',
  UNIQUE (user_id, zone_id, channel)
);

-- ────────────────  Abonnements Web Push (notifications systeme)  ────────────────
-- Un enregistrement = un endpoint push (un par navigateur / appareil).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- ────────────────────────────  Parametres  ────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ────────────────────  Notifications (historique utilisateur)  ────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  alert_id   INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  level      INTEGER NOT NULL DEFAULT 0,
  scope      TEXT,
  scope_id   INTEGER,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`;

db.exec(SCHEMA);

/* ── Migrations légères (bases existantes) ────────────────────────────────── */
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('rank')) {
  db.exec('ALTER TABLE users ADD COLUMN rank TEXT');
}

/* ──────────────────────────  Helpers de requêtage  ────────────────────────── */

const toPlain = (row) => (row ? { ...row } : row);

/** Convertit les valeurs JS non supportées par node:sqlite (bool, undefined). */
export function bindable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return value;
}

export function all(sql, params = []) {
  return db.prepare(sql).all(...params.map(bindable)).map(toPlain);
}

export function get(sql, params = []) {
  return toPlain(db.prepare(sql).get(...params.map(bindable)) ?? null);
}

export function run(sql, params = []) {
  const result = db.prepare(sql).run(...params.map(bindable));
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ───────────────────────────────  Settings  ─────────────────────────────── */

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, String(value)],
  );
}

export function getJsonSetting(key, fallback) {
  const raw = getSetting(key, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJsonSetting(key, value) {
  setSetting(key, JSON.stringify(value));
}

/* ─────────────────────────────  Identité serveur  ───────────────────────────── */

export function serverSecret() {
  let secret = getSetting('server_secret', null);
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('server_secret', secret);
  }
  return secret;
}

export function isEmpty() {
  const row = get('SELECT COUNT(*) AS c FROM hospitals');
  return !row || row.c === 0;
}
