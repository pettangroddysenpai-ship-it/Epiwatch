import express from 'express';
import { all, get, run, transaction } from './db.js';
import {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  loadUser,
  attachUser,
  requireAuth,
  requireRole,
  usernameFor,
  slugify,
} from './auth.js';
import {
  recomputeAlerts,
  computeSituation,
  overview,
  timeseries,
  listAlerts,
  countAlerts,
  getAlertConfig,
  updateAlertConfig,
  getThresholds,
} from './alerts.js';
import {
  handler,
  HttpError,
  badRequest,
  notFound,
  int,
  str,
  requireFields,
  isDate,
  audit,
  listZones,
  listHospitals,
  listDiseases,
  listUsers,
  getConfig,
} from './helpers.js';
import {
  CAN_REPORT,
  CAN_ACK_ALERT,
  CAN_MANAGE_CONFIG,
  ROLES,
} from './config.js';
import { addClient, removeClient, broadcast, clientCount } from './realtime.js';
import {
  getPublicKey,
  savePushSubscription,
  removePushSubscription,
  listPushSubscriptions,
  sendPushToUsers,
} from './push.js';
import { seed } from './seed.js';

export const api = express.Router();

/* Attache req.user à chaque requête si un jeton valide est fourni. */
api.use(attachUser);

/* ═══════════════════════════════  Santé  ═══════════════════════════════ */

api.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    realtime_clients: clientCount(),
    version: '1.0.0',
  });
});

/* ═══════════════════════════════  Auth  ═══════════════════════════════ */

api.post(
  '/auth/login',
  handler((req, res) => {
    // L'identifiant peut être un compteur (ex. « agent.hopitalcentraldouala »)
    // ou une adresse email (ex. « public@gmail.com »).
    const identifier = str(req.body?.identifier ?? req.body?.email, 200)?.toLowerCase();
    const password = str(req.body?.password, 200);
    if (!identifier || !password) throw badRequest('Identifiant et mot de passe requis');

    const row = get(
      'SELECT * FROM users WHERE active = 1 AND (lower(email) = ? OR lower(username) = ?)',
      [identifier, identifier],
    );
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'Identifiants invalides');
    }
    const user = loadUser(row.id);
    audit('users', row.id, 'login', row.id, { ip: req.ip });
    res.json({ token: signToken(row.id), user: publicUser(user) });
  }),
);

api.post(
  '/auth/register',
  handler((req, res) => {
    const email = str(req.body?.email, 200)?.toLowerCase();
    const password = str(req.body?.password, 200);
    const fullName = str(req.body?.full_name, 200);
    if (!email || !password || !fullName) throw badRequest('Nom, email et mot de passe requis');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest('Email invalide');
    if (password.length < 6) throw badRequest('Le mot de passe doit faire au moins 6 caractères');
    if (get('SELECT id FROM users WHERE lower(email) = ?', [email])) {
      throw new HttpError(409, 'Un compte existe déjà avec cet email');
    }

    // Inscription ouverte : réservée au rôle « public ». Les agents sont créés par un admin.
    const role = ROLES.PUBLIC;
    const zoneId = int(req.body?.zone_id);
    const username = usernameFor('public', email.split('@')[0], { unique: true });

    const result = run(
      `INSERT INTO users (email, username, password_hash, full_name, role, rank, hospital_id, zone_id, phone, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email, username, hashPassword(password), fullName, role, 'Citoyen',
        null, zoneId, str(req.body?.phone, 40), str(req.body?.language, 5) || 'fr',
      ],
    );
    const user = loadUser(result.lastInsertRowid);
    audit('users', user.id, 'register', req.user?.id ?? null, { role });
    broadcast('users', { action: 'registered', id: user.id });
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  }),
);

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(loadUser(req.user.id)) });
});

api.patch(
  '/auth/me',
  requireAuth,
  handler((req, res) => {
    run(
      `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
              language = COALESCE(?, language) WHERE id = ?`,
      [str(req.body?.full_name, 200), str(req.body?.phone, 40), str(req.body?.language, 5), req.user.id],
    );
    res.json({ user: publicUser(loadUser(req.user.id)) });
  }),
);

/* ═══════════════════════════════  Référentiels  ═══════════════════════════════ */

api.get('/zones', (_req, res) => res.json({ zones: listZones() }));
api.get('/hospitals', (req, res) =>
  res.json({
    hospitals: listHospitals({
      regionId: int(req.query.region_id),
      districtId: int(req.query.district_id),
      includeInactive: req.query.all === '1',
    }),
  }),
);
api.get('/diseases', (_req, res) => res.json({ diseases: listDiseases() }));
api.get('/config', (_req, res) => res.json({ config: getConfig() }));

api.get(
  '/users',
  requireRole(...CAN_MANAGE_CONFIG),
  (_req, res) => res.json({ users: listUsers() }),
);

/* ═══════════════════════════════  Déclarations de cas  ═══════════════════════════════ */

function assertCanReport(user, hospitalId) {
  if (!user || !CAN_REPORT.has(user.role)) {
    throw new HttpError(403, 'Votre rôle ne permet pas de saisir des déclarations');
  }
  // Chaque infirmier est rattaché à un hôpital : il ne peut déclarer que pour
  // son établissement. Les administrateurs peuvent saisir pour tout le pays.
  if (user.role === 'agent') {
    if (!user.hospital_id) {
      throw new HttpError(403, 'Votre compte n’est rattaché à aucun hôpital');
    }
    if (Number(user.hospital_id) !== Number(hospitalId)) {
      throw new HttpError(403, 'Vous ne pouvez déclarer que pour votre hôpital');
    }
  }
  if (!get('SELECT id FROM hospitals WHERE id = ? AND active = 1', [hospitalId])) {
    throw badRequest('Hôpital inconnu ou inactif');
  }
}

/**
 * Résout la maladie d'une déclaration :
 *  - `disease_id` fourni → maladie existante ;
 *  - sinon `custom_disease` (texte libre) → cherchée par nom, créée si absente.
 */
function resolveDisease(body) {
  const diseaseId = int(body.disease_id);
  if (diseaseId && get('SELECT id FROM diseases WHERE id = ? AND active = 1', [diseaseId])) {
    return diseaseId;
  }

  const name = str(body.custom_disease, 120)?.trim();
  if (!name) throw badRequest('Maladie requise (sélectionnez ou saisissez un nom)');

  const existing = get('SELECT id FROM diseases WHERE lower(name) = ?', [name.toLowerCase()]);
  if (existing) return existing.id;

  const code = `custom-${slugify(name) || Date.now().toString(36)}`;
  const color = '#64748b';
  const result = run(
    `INSERT INTO diseases (name, name_en, code, color, icon, description, advice, advice_en)
     VALUES (?, ?, ?, ?, 'activity', ?, ?, ?)`,
    [
      name,
      name,
      code,
      color,
      'Maladie déclarée par un agent (catégorie libre).',
      'Respectez les mesures d’hygiène et suivez les consignes des autorités sanitaires locales.',
      'Follow hygiene measures and local health authority guidance.',
    ],
  );
  // Seuils par défaut pour la nouvelle maladie (6 niveaux).
  const defaults = [5, 12, 25, 50, 80, 120];
  defaults.forEach((min, i) => {
    run('INSERT INTO thresholds (disease_id, level, min_active) VALUES (?, ?, ?)', [result.lastInsertRowid, i + 1, min]);
  });
  audit('diseases', result.lastInsertRowid, 'create', null, { name, code });
  return result.lastInsertRowid;
}

api.get(
  '/cases',
  handler((req, res) => {
    const where = [];
    const params = [];
    if (req.query.hospital_id) { where.push('r.hospital_id = ?'); params.push(int(req.query.hospital_id)); }
    if (req.query.disease_id) { where.push('r.disease_id = ?'); params.push(int(req.query.disease_id)); }
    if (req.query.region_id) {
      where.push('z.parent_id = ?');
      params.push(int(req.query.region_id));
    }
    if (req.query.from) { where.push('r.report_date >= ?'); params.push(str(req.query.from, 10)); }
    if (req.query.to) { where.push('r.report_date <= ?'); params.push(str(req.query.to, 10)); }

    const limit = Math.min(int(req.query.limit, 100) ?? 100, 2000);
    params.push(limit);

    const rows = all(
      `SELECT r.*, h.name AS hospital_name, h.code AS hospital_code,
              d.name AS disease_name, d.code AS disease_code, d.color AS disease_color,
              u.full_name AS created_by_name
         FROM case_reports r
         JOIN hospitals h ON h.id = r.hospital_id
         JOIN zones z ON z.id = h.zone_id
         JOIN diseases d ON d.id = r.disease_id
         LEFT JOIN users u ON u.id = r.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY r.report_date DESC, r.id DESC
        LIMIT ?`,
      params,
    );
    res.json({ cases: rows });
  }),
);

api.post(
  '/cases',
  requireAuth,
  handler((req, res) => {
    const body = req.body || {};
    requireFields(body, ['hospital_id']);
    const hospitalId = int(body.hospital_id);
    assertCanReport(req.user, hospitalId);

    if (!get('SELECT id FROM hospitals WHERE id = ? AND active = 1', [hospitalId])) {
      throw badRequest('Hôpital inconnu ou inactif');
    }

    // La maladie est soit choisie dans la liste, soit saisie librement
    // (champ « Autre maladie » → le nom devient une maladie a part entiere).
    const diseaseId = resolveDisease(body);

    const reportDate = isDate(body.report_date) ? body.report_date : new Date().toISOString().slice(0, 10);
    const newCases = Math.max(0, int(body.new_cases, 0) ?? 0);
    const underCare = Math.max(0, int(body.patients_under_care, 0) ?? 0);
    const deaths = Math.max(0, int(body.deaths, 0) ?? 0);
    const recovered = Math.max(0, int(body.recovered, 0) ?? 0);

    const result = run(
      `INSERT INTO case_reports (hospital_id, disease_id, report_date, new_cases,
                                 patients_under_care, deaths, recovered, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hospitalId, diseaseId, reportDate, newCases, underCare, deaths, recovered, str(body.notes, 1000), req.user.id],
    );
    audit('case_reports', result.lastInsertRowid, 'create', req.user.id, body);

    const report = get(
      `SELECT r.*, h.name AS hospital_name, d.name AS disease_name, d.color AS disease_color
         FROM case_reports r JOIN hospitals h ON h.id = r.hospital_id
         JOIN diseases d ON d.id = r.disease_id WHERE r.id = ?`,
      [result.lastInsertRowid],
    );

    const alerts = recomputeAlerts();
    const stats = overview();
    broadcast('case', { report });
    broadcast('stats', { overview: stats });
    broadcast('diseases', { action: 'maybe-created' });
    res.status(201).json({ report, alerts, overview: stats });
  }),
);

api.patch(
  '/cases/:id',
  requireAuth,
  handler((req, res) => {
    const id = int(req.params.id);
    const existing = get('SELECT * FROM case_reports WHERE id = ?', [id]);
    if (!existing) throw notFound('Déclaration introuvable');
    assertCanReport(req.user, existing.hospital_id);

    const body = req.body || {};
    const next = {
      new_cases: Math.max(0, int(body.new_cases, existing.new_cases) ?? 0),
      patients_under_care: Math.max(0, int(body.patients_under_care, existing.patients_under_care) ?? 0),
      deaths: Math.max(0, int(body.deaths, existing.deaths) ?? 0),
      recovered: Math.max(0, int(body.recovered, existing.recovered) ?? 0),
      notes: body.notes !== undefined ? str(body.notes, 1000) : existing.notes,
      report_date: isDate(body.report_date) ? body.report_date : existing.report_date,
    };

    run(
      `UPDATE case_reports
          SET new_cases = ?, patients_under_care = ?, deaths = ?, recovered = ?, notes = ?,
              report_date = ?, updated_at = datetime('now')
        WHERE id = ?`,
      [next.new_cases, next.patients_under_care, next.deaths, next.recovered, next.notes, next.report_date, id],
    );
    audit('case_reports', id, 'update', req.user.id, { before: existing, after: next });

    const report = get(
      `SELECT r.*, h.name AS hospital_name, d.name AS disease_name
         FROM case_reports r JOIN hospitals h ON h.id = r.hospital_id
         JOIN diseases d ON d.id = r.disease_id WHERE r.id = ?`,
      [id],
    );
    const alerts = recomputeAlerts();
    broadcast('case', { report, action: 'updated' });
    broadcast('stats', { overview: overview() });
    res.json({ report, alerts });
  }),
);

api.delete(
  '/cases/:id',
  requireAuth,
  handler((req, res) => {
    const id = int(req.params.id);
    const existing = get('SELECT * FROM case_reports WHERE id = ?', [id]);
    if (!existing) throw notFound('Déclaration introuvable');
    assertCanReport(req.user, existing.hospital_id);
    run('DELETE FROM case_reports WHERE id = ?', [id]);
    audit('case_reports', id, 'delete', req.user.id, existing);
    const alerts = recomputeAlerts();
    broadcast('stats', { overview: overview() });
    res.json({ ok: true, alerts });
  }),
);

/* ═══════════════════════════════  Carte & statistiques  ═══════════════════════════════ */

api.get('/situation', (req, res) => {
  const diseaseId = int(req.query.disease_id);
  const situation = computeSituation();
  res.json({
    situation: diseaseId ? situation.filter((s) => s.disease_id === diseaseId) : situation,
    generated_at: new Date().toISOString(),
  });
});

api.get('/overview', (_req, res) => res.json({ overview: overview() }));

api.get('/timeseries', (req, res) => {
  res.json({
    series: timeseries({
      days: int(req.query.days, 30) ?? 30,
      diseaseId: int(req.query.disease_id),
      regionId: int(req.query.region_id),
    }),
  });
});

api.get('/audit', requireRole(...CAN_MANAGE_CONFIG), (req, res) => {
  const limit = Math.min(int(req.query.limit, 100) ?? 100, 500);
  res.json({
    entries: all(
      `SELECT a.*, u.full_name AS actor_name FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.id DESC LIMIT ?`,
      [limit],
    ),
  });
});

/* ═══════════════════════════════  Alertes  ═══════════════════════════════ */

api.get('/alerts', (req, res) => {
  res.json({
    alerts: listAlerts({
      status: str(req.query.status),
      level: int(req.query.level),
      scope: str(req.query.scope),
      regionId: int(req.query.region_id),
      diseaseId: int(req.query.disease_id),
      limit: int(req.query.limit, 100) ?? 100,
    }),
    counts: countAlerts(),
  });
});

api.post(
  '/alerts/:id/ack',
  requireAuth,
  handler((req, res) => {
    if (!CAN_ACK_ALERT.has(req.user.role)) {
      throw new HttpError(403, 'Vous n’êtes pas habilité à traiter les alertes');
    }
    const id = int(req.params.id);
    const alert = get('SELECT * FROM alerts WHERE id = ?', [id]);
    if (!alert) throw notFound('Alerte introuvable');

    const status = str(req.body?.status) === 'resolved' ? 'resolved' : 'acknowledged';
    run(
      `UPDATE alerts SET status = ?, acknowledged_by = ?, acknowledged_at = datetime('now'),
              updated_at = datetime('now') WHERE id = ?`,
      [status, req.user.id, id],
    );
    audit('alerts', id, status === 'resolved' ? 'resolve' : 'acknowledge', req.user.id, {
      comment: str(req.body?.comment, 500),
    });
    const updated = get('SELECT * FROM alerts WHERE id = ?', [id]);
    broadcast('alerts', { created: [], updated: [updated], resolved: [], counts: countAlerts() });
    res.json({ alert: updated, counts: countAlerts() });
  }),
);

/* ═══════════════════════════════  Notifications & abonnements  ═══════════════════════════════ */

api.get(
  '/notifications',
  requireAuth,
  handler((req, res) => {
    const limit = Math.min(int(req.query.limit, 50) ?? 50, 200);
    const rows = all(
      `SELECT n.*, d.name AS disease_name, d.color AS disease_color
         FROM notifications n
         LEFT JOIN alerts a ON a.id = n.alert_id
         LEFT JOIN diseases d ON d.id = a.disease_id
        WHERE n.user_id = ?
        ORDER BY n.id DESC LIMIT ?`,
      [req.user.id, limit],
    );
    const unread = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0', [req.user.id]).c;
    res.json({ notifications: rows.map((n) => ({ ...n, read: !!n.read })), unread });
  }),
);

api.post(
  '/notifications/read',
  requireAuth,
  handler((req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : null;
    if (ids && ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      run(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${placeholders})`, [
        req.user.id,
        ...ids,
      ]);
    } else {
      run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id]);
    }
    res.json({ ok: true });
  }),
);

api.get(
  '/subscriptions',
  requireAuth,
  handler((req, res) => {
    res.json({
      subscriptions: all(
        `SELECT s.*, z.name AS zone_name FROM subscriptions s
           LEFT JOIN zones z ON z.id = s.zone_id WHERE s.user_id = ?`,
        [req.user.id],
      ),
    });
  }),
);

api.put(
  '/subscriptions',
  requireAuth,
  handler((req, res) => {
    const zoneId = int(req.body?.zone_id);
    const minLevel = Math.max(0, Math.min(6, int(req.body?.min_level, 2) ?? 2));
    const enabled = req.body?.enabled !== false;
    if (enabled) {
      run(
        `INSERT INTO subscriptions (user_id, zone_id, min_level, channel)
         VALUES (?, ?, ?, 'push')
         ON CONFLICT(user_id, zone_id, channel)
         DO UPDATE SET min_level = excluded.min_level`,
        [req.user.id, zoneId, minLevel],
      );
    } else {
      run('DELETE FROM subscriptions WHERE user_id = ? AND zone_id IS ? AND channel = ?', [
        req.user.id,
        zoneId,
        'push',
      ]);
    }
    res.json({
      subscriptions: all('SELECT * FROM subscriptions WHERE user_id = ?', [req.user.id]),
    });
  }),
);

/* ═══════════════════════════  Notifications système (Web Push)  ═══════════════════════════ */

api.get('/push/key', (_req, res) => {
  res.json({ publicKey: getPublicKey(), enabled: true });
});

api.post(
  '/push/subscribe',
  requireAuth,
  handler((req, res) => {
    const subscription = req.body?.subscription || req.body;
    savePushSubscription(req.user.id, subscription, req.headers['user-agent'] || null);
    audit('push_subscriptions', null, 'subscribe', req.user.id, { endpoint: subscription?.endpoint });
    res.status(201).json({ ok: true });
  }),
);

api.post(
  '/push/unsubscribe',
  requireAuth,
  handler((req, res) => {
    const endpoint = str(req.body?.endpoint, 500);
    if (endpoint) removePushSubscription(endpoint);
    else run('DELETE FROM push_subscriptions WHERE user_id = ?', [req.user.id]);
    res.json({ ok: true });
  }),
);

api.get(
  '/push/subscriptions',
  requireAuth,
  handler((req, res) => {
    res.json({ subscriptions: listPushSubscriptions(req.user.id) });
  }),
);

api.post(
  '/push/test',
  requireAuth,
  handler(async (req, res) => {
    const result = await sendPushToUsers([req.user.id], {
      title: 'Test ÉpiWatch',
      body: 'Les notifications système fonctionnent sur cet appareil.',
      level: 3,
      url: '/notifications',
    });
    res.json(result);
  }),
);

/* ═══════════════════════════════  Administration  ═══════════════════════════════ */

api.put(
  '/config',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    updateAlertConfig({
      windowDays: int(req.body?.window_days),
      thresholdBasis: str(req.body?.threshold_basis),
      persistMinLevel: int(req.body?.persist_min_level),
      escalation: req.body?.escalation,
    });
    audit('settings', null, 'update', req.user.id, req.body);
    recomputeAlerts({ notify: false });
    res.json({ config: getConfig(), overview: overview() });
  }),
);

api.put(
  '/diseases/:id/thresholds',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    const diseaseId = int(req.params.id);
    if (!get('SELECT id FROM diseases WHERE id = ?', [diseaseId])) throw notFound('Maladie introuvable');
    const rows = Array.isArray(req.body?.thresholds) ? req.body.thresholds : [];
    if (rows.length !== 6) throw badRequest('Il faut exactement 6 seuils (niveaux 1 à 6)');

    const values = rows
      .map((r) => ({ level: int(r.level), min_active: Math.max(0, int(r.min_active, 0) ?? 0) }))
      .sort((a, b) => a.level - b.level);
    for (let i = 0; i < 6; i++) {
      if (values[i].level !== i + 1) throw badRequest('Les niveaux doivent être 1, 2, 3, 4, 5, 6');
      if (i > 0 && values[i].min_active < values[i - 1].min_active) {
        throw badRequest('Les seuils doivent être croissants');
      }
    }

    transaction(() => {
      for (const v of values) {
        run(
          `INSERT INTO thresholds (disease_id, level, min_active) VALUES (?, ?, ?)
           ON CONFLICT(disease_id, level) DO UPDATE SET min_active = excluded.min_active`,
          [diseaseId, v.level, v.min_active],
        );
      }
    });
    audit('thresholds', diseaseId, 'update', req.user.id, values);
    recomputeAlerts({ notify: false });
    broadcast('config', getConfig());
    res.json({ thresholds: getThresholds(diseaseId), overview: overview() });
  }),
);

api.post(
  '/hospitals',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    const body = req.body || {};
    requireFields(body, ['name', 'code', 'type', 'zone_id', 'lat', 'lng']);
    const result = run(
      `INSERT INTO hospitals (name, code, type, zone_id, address, phone, beds, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        str(body.name, 200), str(body.code, 20), str(body.type, 20), int(body.zone_id),
        str(body.address, 300), str(body.phone, 40), int(body.beds),
        Number(body.lat), Number(body.lng),
      ],
    );
    audit('hospitals', result.lastInsertRowid, 'create', req.user.id, body);
    broadcast('hospitals', { action: 'created', id: result.lastInsertRowid });
    res.status(201).json({ hospital: get('SELECT * FROM hospitals WHERE id = ?', [result.lastInsertRowid]) });
  }),
);

api.patch(
  '/hospitals/:id',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    const id = int(req.params.id);
    const existing = get('SELECT * FROM hospitals WHERE id = ?', [id]);
    if (!existing) throw notFound('Hôpital introuvable');
    const b = req.body || {};
    run(
      `UPDATE hospitals SET name = COALESCE(?, name), address = COALESCE(?, address),
              phone = COALESCE(?, phone), beds = COALESCE(?, beds),
              lat = COALESCE(?, lat), lng = COALESCE(?, lng),
              active = COALESCE(?, active)
        WHERE id = ?`,
      [
        str(b.name, 200), str(b.address, 300), str(b.phone, 40), int(b.beds),
        b.lat != null ? Number(b.lat) : null, b.lng != null ? Number(b.lng) : null,
        b.active === undefined ? null : b.active ? 1 : 0, id,
      ],
    );
    audit('hospitals', id, 'update', req.user.id, b);
    broadcast('hospitals', { action: 'updated', id });
    res.json({ hospital: get('SELECT * FROM hospitals WHERE id = ?', [id]) });
  }),
);

api.post(
  '/users',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    const b = req.body || {};
    requireFields(b, ['email', 'password', 'full_name', 'role']);
    const email = String(b.email).toLowerCase();
    const role = str(b.role, 30);
    if (!Object.values(ROLES).includes(role)) {
      throw badRequest('Rôle invalide (admin, agent ou public)');
    }
    if (get('SELECT id FROM users WHERE lower(email) = ?', [email])) {
      throw new HttpError(409, 'Un compte existe déjà avec cet email');
    }

    if (role === 'agent' && !int(b.hospital_id)) {
      throw badRequest('Un infirmier doit être rattaché à un hôpital');
    }

    const hospital = int(b.hospital_id)
      ? get('SELECT id, name, code FROM hospitals WHERE id = ?', [int(b.hospital_id)])
      : null;
    if (int(b.hospital_id) && !hospital) throw badRequest('Hôpital inconnu');

    // Compteur court dérivé du rôle et du code hôpital (ex. « inf.hcd »).
    const username = usernameFor(role, hospital?.name || email.split('@')[0], {
      unique: true,
      hospitalCode: hospital?.code || null,
    });
    const defaultRank = role === 'agent' ? 'Infirmier' : role === 'admin' ? 'Administrateur' : 'Citoyen';

    const result = run(
      `INSERT INTO users (email, username, password_hash, full_name, role, rank, hospital_id, zone_id, phone, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email, username, hashPassword(String(b.password)), str(b.full_name, 200), role,
        str(b.rank, 120) || defaultRank, hospital?.id ?? null, int(b.zone_id),
        str(b.phone, 40), str(b.language, 5) || 'fr',
      ],
    );
    audit('users', result.lastInsertRowid, 'create', req.user.id, { email, role, username });
    broadcast('users', { action: 'created', id: result.lastInsertRowid });
    res.status(201).json({ user: publicUser(loadUser(result.lastInsertRowid)), username });
  }),
);

api.patch(
  '/users/:id',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((req, res) => {
    const id = int(req.params.id);
    const existing = get('SELECT * FROM users WHERE id = ?', [id]);
    if (!existing) throw notFound('Utilisateur introuvable');

    const b = req.body || {};
    const nextRole = existing.role;
    let hospitalId = existing.hospital_id;
    if (b.hospital_id !== undefined) {
      if (b.hospital_id === null || b.hospital_id === '') {
        hospitalId = nextRole === 'agent' ? existing.hospital_id : null;
      } else {
        const hospital = get('SELECT id FROM hospitals WHERE id = ?', [int(b.hospital_id)]);
        if (!hospital) throw badRequest('Hôpital inconnu');
        hospitalId = hospital.id;
      }
    }
    if (nextRole === 'agent' && !hospitalId) {
      throw badRequest('Un infirmier doit être rattaché à un hôpital');
    }

    let username = existing.username;
    if (nextRole === 'agent' && Number(hospitalId) !== Number(existing.hospital_id)) {
      const hospital = get('SELECT name, code FROM hospitals WHERE id = ?', [hospitalId]);
      username = usernameFor('agent', hospital.name, {
        unique: true,
        hospitalCode: hospital.code,
      });
    }

    const rank = b.rank !== undefined ? str(b.rank, 120) : existing.rank;
    const fullName = b.full_name !== undefined ? str(b.full_name, 200) : existing.full_name;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : existing.active;
    const passwordHash = b.password ? hashPassword(String(b.password)) : existing.password_hash;

    run(
      `UPDATE users SET full_name = ?, rank = ?, username = ?, hospital_id = ?,
              zone_id = COALESCE(?, zone_id), active = ?, password_hash = ?
        WHERE id = ?`,
      [fullName, rank, username, hospitalId, int(b.zone_id), active, passwordHash, id],
    );
    audit('users', id, 'update', req.user.id, { rank, hospital_id: hospitalId, active, username });
    broadcast('users', { action: 'updated', id });
    res.json({ user: publicUser(loadUser(id)), username });
  }),
);

/* ═══════════════════════════════  Démonstration  ═══════════════════════════════ */

api.post(
  '/demo/simulate',
  requireAuth,
  handler((req, res) => {
    if (!CAN_REPORT.has(req.user.role)) {
      throw new HttpError(403, 'Rôle non autorisé');
    }
    const hospitalId = int(req.body?.hospital_id);
    const diseaseId = int(req.body?.disease_id);
    const newCases = Math.max(1, int(req.body?.new_cases, 10) ?? 10);
    if (!hospitalId || !diseaseId) throw badRequest('hospital_id et disease_id requis');

    const latest = get(
      `SELECT patients_under_care FROM case_reports
        WHERE hospital_id = ? AND disease_id = ?
        ORDER BY report_date DESC, id DESC LIMIT 1`,
      [hospitalId, diseaseId],
    );
    const underCare = (latest?.patients_under_care ?? 0) + newCases;

    const result = run(
      `INSERT INTO case_reports (hospital_id, disease_id, report_date, new_cases,
                                 patients_under_care, deaths, recovered, notes, created_by)
       VALUES (?, ?, date('now'), ?, ?, 0, 0, ?, ?)`,
      [hospitalId, diseaseId, newCases, underCare, 'Simulation de démonstration', req.user.id],
    );
    const alerts = recomputeAlerts();
    broadcast('stats', { overview: overview() });
    res.json({ report_id: result.lastInsertRowid, active: underCare, alerts });
  }),
);

api.post(
  '/demo/scenario',
  requireAuth,
  handler((req, res) => {
    if (!CAN_MANAGE_CONFIG.has(req.user.role)) throw new HttpError(403, 'Rôle non autorisé');
    const scenario = str(req.body?.scenario) || 'cholera_douala';
    const disease = get("SELECT * FROM diseases WHERE code = 'cholera'") || get('SELECT * FROM diseases LIMIT 1');
    const targets = all(
      `SELECT h.id FROM hospitals h JOIN zones z ON z.id = h.zone_id
        WHERE z.code = 'DIS-WOU'`,
    );
    if (!targets.length) throw badRequest('Aucun hôpital cible pour ce scénario');

    const created = [];
    transaction(() => {
      for (const t of targets) {
        const latest = get(
          `SELECT patients_under_care FROM case_reports
            WHERE hospital_id = ? AND disease_id = ?
            ORDER BY report_date DESC, id DESC LIMIT 1`,
          [t.id, disease.id],
        );
        const bump = 45 + Math.floor(Math.random() * 30);
        const underCare = (latest?.patients_under_care ?? 0) + bump;
        const r = run(
          `INSERT INTO case_reports (hospital_id, disease_id, report_date, new_cases,
                                     patients_under_care, deaths, recovered, notes, created_by)
           VALUES (?, ?, date('now'), ?, ?, 0, 0, ?, ?)`,
          [t.id, disease.id, bump, underCare, `Scénario ${scenario}`, req.user.id],
        );
        created.push({ hospital_id: t.id, report_id: r.lastInsertRowid, active: underCare });
      }
    });
    const alerts = recomputeAlerts();
    broadcast('stats', { overview: overview() });
    res.json({ scenario, disease: disease.name, created, alerts });
  }),
);

api.post(
  '/demo/reset',
  requireRole(...CAN_MANAGE_CONFIG),
  handler((_req, res) => {
    const summary = seed({ reset: true });
    broadcast('reset', { at: new Date().toISOString() });
    broadcast('stats', { overview: overview() });
    res.json({ ok: true, summary });
  }),
);

/* ═══════════════════════════════  Flux temps réel  ═══════════════════════════════ */

api.get('/stream', (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  const client = addClient(res);
  req.on('close', () => removeClient(client));
});

/* ═══════════════════════════════  Erreurs  ═══════════════════════════════ */

api.use((req, _res, next) => next(notFound(`Route inconnue : ${req.method} ${req.originalUrl}`)));

api.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Erreur interne du serveur' });
});
