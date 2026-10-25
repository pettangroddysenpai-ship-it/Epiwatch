import { all, run, getSetting, getJsonSetting, setJsonSetting } from './db.js';
import { ALERT_LEVELS, DEFAULT_ESCALATION, DEFAULT_WINDOW_DAYS } from './config.js';

/* ─────────────────────────  Validation minimale  ───────────────────────── */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function notFound(message = 'Ressource introuvable') {
  return new HttpError(404, message);
}

/** Wrapper pour les handlers asynchrones / synchrones. */
export function handler(fn) {
  return (req, res, next) => {
    try {
      const out = fn(req, res, next);
      if (out && typeof out.then === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

export function int(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw badRequest(`Champs manquants : ${missing.join(', ')}`);
}

export function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/* ─────────────────────────────  Audit  ───────────────────────────── */

export function audit(entity, entityId, action, actorId, payload) {
  run(
    `INSERT INTO audit_log (entity, entity_id, action, actor_id, payload)
     VALUES (?, ?, ?, ?, ?)`,
    [entity, entityId ?? null, action, actorId ?? null, payload ? JSON.stringify(payload) : null],
  );
}

/* ─────────────────────────────  Référentiels  ───────────────────────────── */

export function listZones() {
  const zones = all('SELECT * FROM zones ORDER BY type DESC, name');
  const regions = zones.filter((z) => z.type === 'region');
  const districts = zones.filter((z) => z.type === 'district');
  return regions.map((r) => ({
    ...r,
    districts: districts.filter((d) => d.parent_id === r.id),
  }));
}

export function listHospitals({ regionId, districtId, includeInactive = false } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('h.active = 1');
  if (districtId) { where.push('h.zone_id = ?'); params.push(Number(districtId)); }
  if (regionId) { where.push('z.parent_id = ?'); params.push(Number(regionId)); }
  return all(
    `SELECT h.*, z.name AS district_name, z.id AS district_id,
            r.name AS region_name, r.id AS region_id
       FROM hospitals h
       JOIN zones z ON z.id = h.zone_id
       JOIN zones r ON r.id = z.parent_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.name, h.name`,
    params,
  ).map((h) => ({ ...h, active: !!h.active }));
}

export function listDiseases() {
  const diseases = all('SELECT * FROM diseases ORDER BY id');
  const thresholds = all('SELECT * FROM thresholds ORDER BY disease_id, level');
  return diseases.map((d) => ({
    ...d,
    active: !!d.active,
    thresholds: thresholds.filter((t) => t.disease_id === d.id),
  }));
}

export function listUsers() {
  return all(
    `SELECT u.id, u.email, u.username, u.full_name, u.role, u.rank,
            u.hospital_id, u.zone_id, u.phone, u.language, u.active, u.created_at,
            h.name AS hospital_name, h.code AS hospital_code, z.name AS zone_name
       FROM users u
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       LEFT JOIN zones z ON z.id = u.zone_id
      ORDER BY u.role, u.full_name`,
  ).map((u) => ({ ...u, active: !!u.active }));
}

/* ─────────────────────────────  Configuration  ───────────────────────────── */

export function getConfig() {
  return {
    levels: ALERT_LEVELS,
    window_days: Number(getSetting('window_days', DEFAULT_WINDOW_DAYS)),
    threshold_basis: getSetting('threshold_basis', 'under_care'),
    persist_min_level: Number(getSetting('persist_min_level', 2)),
    escalation: getJsonSetting('escalation', DEFAULT_ESCALATION),
    org_name: getSetting('org_name', 'ÉpiWatch Cameroun'),
    demo_mode: getSetting('demo_mode', '0') === '1',
  };
}

export { setJsonSetting };
