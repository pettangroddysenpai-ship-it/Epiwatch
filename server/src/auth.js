import crypto from 'node:crypto';
import { get, all, serverSecret } from './db.js';

/* ─────────────────────────  Identifiants (compteurs)  ───────────────────────── */

/** Normalise un libelle en identifiant : minuscules, sans accents ni ponctuation. */
export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}

const COUNTER_PREFIX = { admin: 'admin', agent: 'inf', public: 'public' };

/**
 * Construit le compteur court d'un utilisateur a partir de son role et de son hopital.
 * Exemples : agent + code « HCD » → « inf.hcd »
 *            public + email « awa@mail.cm » → « public.awa »
 *            admin → « admin » ; collision → suffixe numerique.
 * On privilegie le code hopital (court) ; sinon le nom est normalise.
 */
export function usernameFor(
  role,
  hospitalNameOrBase,
  { unique = false, hospitalCode = null } = {},
) {
  const prefix = COUNTER_PREFIX[role] || slugify(role) || 'user';
  const base = slugify(hospitalCode || hospitalNameOrBase);
  const stem = base ? `${prefix}.${base}` : prefix;
  let candidate = stem;
  if (!unique) return candidate;
  let n = 2;
  while (get('SELECT 1 FROM users WHERE username = ?', [candidate])) {
    candidate = `${stem}${n}`;
    n += 1;
  }
  return candidate;
}

/* ─────────────────────────  Mots de passe (scrypt)  ───────────────────────── */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algo, salt, expected] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expectedBuf = Buffer.from(expected, 'hex');
  if (expectedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

/* ───────────────────────────  Jetons (HMAC)  ─────────────────────────── */

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 jours

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signToken(userId, ttlMs = TOKEN_TTL_MS) {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const sig = crypto
    .createHmac('sha256', serverSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawId, rawIssued, sig] = parts;
  const payload = `${rawId}.${rawIssued}`;
  const expected = crypto
    .createHmac('sha256', serverSecret())
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const issuedAt = Number(rawIssued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > TOKEN_TTL_MS) return null;

  const userId = Number(rawId);
  return Number.isFinite(userId) ? userId : null;
}

/* ─────────────────────────────  Middlewares  ───────────────────────────── */

export function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

export function loadUser(id) {
  return get(
    `SELECT u.*, h.name AS hospital_name, h.zone_id AS hospital_zone_id,
            z.name AS zone_name, z.type AS zone_type,
            rz.name AS region_name, rz.id AS region_id
       FROM users u
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       LEFT JOIN zones z ON z.id = h.zone_id
       LEFT JOIN zones rz ON rz.id = z.parent_id
      WHERE u.id = ? AND u.active = 1`,
    [id],
  );
}

/** Authentification optionnelle : attache req.user si le jeton est valide. */
export function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = verifyToken(token);
  req.user = userId ? loadUser(userId) : null;
  next();
}

/** Exige une authentification. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  next();
}

/** Exige l'un des roles fournis. */
export function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
    if (!allowed.has(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle' });
    }
    next();
  };
}
