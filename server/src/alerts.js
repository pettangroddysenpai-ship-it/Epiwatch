import {
  all,
  get,
  run,
  getSetting,
  setSetting,
  getJsonSetting,
  setJsonSetting,
  transaction,
} from './db.js';
import {
  ALERT_LEVELS,
  DEFAULT_WINDOW_DAYS,
  DEFAULT_ESCALATION,
} from './config.js';
import { broadcast } from './realtime.js';
import { sendPushToUsers } from './push.js';

/* ───────────────────────────────  Seuils  ─────────────────────────────── */

export function getThresholds(diseaseId) {
  return all(
    'SELECT level, min_active FROM thresholds WHERE disease_id = ? ORDER BY level ASC',
    [diseaseId],
  );
}

/**
 * Traduit un nombre de patients actifs en niveau de 0 a 6
 * a partir des 6 seuils absolus configures pour la maladie.
 */
export function levelFor(minActive, active) {
  let level = 0;
  for (const t of minActive) {
    if (active >= t.min_active) level = t.level;
    else break;
  }
  return level;
}

export function levelMeta(level) {
  return ALERT_LEVELS[Math.max(0, Math.min(6, level))];
}

/* ───────────────────────────  Parametres  ─────────────────────────── */

export function getAlertConfig() {
  return {
    windowDays: Number(getSetting('window_days', DEFAULT_WINDOW_DAYS)),
    thresholdBasis: getSetting('threshold_basis', 'under_care'),
    persistMinLevel: Number(getSetting('persist_min_level', 2)),
    escalation: getJsonSetting('escalation', DEFAULT_ESCALATION),
  };
}

export function updateAlertConfig(patch = {}) {
  if (patch.windowDays != null) setSetting('window_days', Number(patch.windowDays));
  if (patch.thresholdBasis != null) setSetting('threshold_basis', patch.thresholdBasis);
  if (patch.persistMinLevel != null) setSetting('persist_min_level', Number(patch.persistMinLevel));
  if (patch.escalation != null) setJsonSetting('escalation', patch.escalation);
  broadcast('config', getAlertConfig());
  return getAlertConfig();
}

/* ───────────────────────  Calcul des indicateurs  ─────────────────────── */

/**
 * Construit l'etat sanitaire de chaque couple (hopital, maladie) :
 *   active   : patients actuellement sous prise en charge
 *   newCases : nouveaux cas cumules sur la fenetre glissante
 *   deaths / recovered : cumuls sur la fenetre
 *   level    : niveau d'alerte 0..6
 */
export function computeSituation(config = getAlertConfig()) {
  const { windowDays, thresholdBasis } = config;
  const since = `-${windowDays} days`;

  const hospitals = all(
    `SELECT h.id, h.name, h.code, h.type, h.lat, h.lng, h.zone_id,
            z.name AS zone_name, z.parent_id AS region_id, rz.name AS region_name
       FROM hospitals h
       JOIN zones z ON z.id = h.zone_id
       LEFT JOIN zones rz ON rz.id = z.parent_id
      WHERE h.active = 1
      ORDER BY h.name`,
  );

  const diseases = all('SELECT * FROM diseases WHERE active = 1 ORDER BY id');
  const thresholds = new Map();
  for (const d of diseases) thresholds.set(d.id, getThresholds(d.id));

  const aggRows = all(
    `SELECT hospital_id, disease_id,
            COALESCE(SUM(new_cases), 0)           AS new_cases_window,
            COALESCE(SUM(deaths), 0)              AS deaths_window,
            COALESCE(SUM(recovered), 0)           AS recovered_window,
            MAX(report_date)                      AS last_report_date
       FROM case_reports
      WHERE report_date >= date('now', ?)
      GROUP BY hospital_id, disease_id`,
    [since],
  );
  const agg = new Map(aggRows.map((r) => [`${r.hospital_id}:${r.disease_id}`, r]));

  const latestRows = all(
    `SELECT hospital_id, disease_id, patients_under_care, report_date
       FROM case_reports
      WHERE report_date >= date('now', ?)
        AND id IN (
          SELECT MAX(id) FROM case_reports
           WHERE report_date >= date('now', ?)
           GROUP BY hospital_id, disease_id
        )`,
    [since, since],
  );
  const latest = new Map(latestRows.map((r) => [`${r.hospital_id}:${r.disease_id}`, r]));

  const situation = [];
  for (const h of hospitals) {
    for (const d of diseases) {
      const key = `${h.id}:${d.id}`;
      const a = agg.get(key);
      const l = latest.get(key);
      const newCases = a?.new_cases_window ?? 0;
      const underCare = l?.patients_under_care ?? 0;

      let active;
      if (thresholdBasis === 'new_cases_window') {
        active = newCases;
      } else {
        // Base par defaut : patients sous prise en charge.
        // Repli sur les nouveaux cas si aucune prise en charge n'est renseignee.
        active = underCare > 0 ? underCare : newCases;
      }

      const level = levelFor(thresholds.get(d.id) || [], active);

      situation.push({
        hospital_id: h.id,
        hospital_name: h.name,
        hospital_code: h.code,
        hospital_type: h.type,
        lat: h.lat,
        lng: h.lng,
        zone_id: h.zone_id,
        zone_name: h.zone_name,
        region_id: h.region_id,
        region_name: h.region_name,
        disease_id: d.id,
        disease_code: d.code,
        disease_name: d.name,
        disease_name_en: d.name_en,
        disease_color: d.color,
        active,
        new_cases_window: newCases,
        deaths_window: a?.deaths_window ?? 0,
        recovered_window: a?.recovered_window ?? 0,
        last_report_date: a?.last_report_date ?? null,
        level,
      });
    }
  }
  return situation;
}

/* ─────────────────────────  Moteur d'alertes  ───────────────────────── */

function scopeLabel(scope, scopeName) {
  if (scope === 'region') return `Région ${scopeName}`;
  if (scope === 'district') return `District ${scopeName}`;
  return scopeName;
}

function hasChanges(prev, next) {
  return (
    !prev ||
    prev.level !== next.level ||
    prev.status === 'resolved' ||
    prev.hospital_count !== next.hospital_count ||
    prev.total_cases !== next.total_cases
  );
}

function upsertAlert(candidate, meta) {
  const prev = get(
    'SELECT * FROM alerts WHERE scope = ? AND scope_id = ? AND disease_id = ?',
    [candidate.scope, candidate.scope_id, candidate.disease_id],
  );

  if (prev && prev.level === candidate.level && prev.status !== 'resolved') {
    // Rien de neuf : on met juste a jour les compteurs eventuels.
    if (prev.hospital_count !== candidate.hospital_count || prev.total_cases !== candidate.total_cases) {
      run(
        `UPDATE alerts SET hospital_count = ?, total_cases = ?, updated_at = datetime('now')
          WHERE id = ?`,
        [candidate.hospital_count, candidate.total_cases, prev.id],
      );
    }
    return { alert: { ...prev, ...candidate }, created: false, changed: false };
  }

  if (prev) {
    run(
      `UPDATE alerts
          SET level = ?, status = ?, title = ?, message = ?, action = ?,
              hospital_count = ?, total_cases = ?, updated_at = datetime('now'),
              acknowledged_by = CASE WHEN ? = 1 THEN NULL ELSE acknowledged_by END,
              acknowledged_at = CASE WHEN ? = 1 THEN NULL ELSE acknowledged_at END
        WHERE id = ?`,
      [
        candidate.level,
        'active',
        candidate.title,
        candidate.message,
        candidate.action,
        candidate.hospital_count,
        candidate.total_cases,
        candidate.level > prev.level ? 1 : 0,
        candidate.level > prev.level ? 1 : 0,
        prev.id,
      ],
    );
    const updated = get('SELECT * FROM alerts WHERE id = ?', [prev.id]);
    return { alert: updated, created: false, changed: hasChanges(prev, updated) };
  }

  const res = run(
    `INSERT INTO alerts (scope, scope_id, disease_id, level, status, title, message, action,
                         hospital_count, total_cases)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      candidate.scope,
      candidate.scope_id,
      candidate.disease_id,
      candidate.level,
      candidate.title,
      candidate.message,
      candidate.action,
      candidate.hospital_count,
      candidate.total_cases,
    ],
  );
  const created = get('SELECT * FROM alerts WHERE id = ?', [res.lastInsertRowid]);
  return { alert: created, created: true, changed: true };
}

/**
 * Complète une alerte avec le nom de sa portée et de sa maladie,
 * afin que tous les objets renvoyés (API et flux temps réel) aient la même forme.
 */
export function enrichAlert(alert) {
  if (!alert) return alert;
  const scopeName =
    alert.scope === 'hospital'
      ? get('SELECT name FROM hospitals WHERE id = ?', [alert.scope_id])?.name
      : get('SELECT name FROM zones WHERE id = ?', [alert.scope_id])?.name;
  const disease = get('SELECT name, name_en, color FROM diseases WHERE id = ?', [alert.disease_id]);
  return {
    ...alert,
    scope_name: scopeName ?? null,
    disease_name: disease?.name ?? null,
    disease_name_en: disease?.name_en ?? null,
    disease_color: disease?.color ?? null,
  };
}

function resolveAlert(alertId) {
  const row = get('SELECT * FROM alerts WHERE id = ?', [alertId]);
  if (!row || row.status === 'resolved') return null;
  run(
    `UPDATE alerts SET status = 'resolved', level = 1, updated_at = datetime('now') WHERE id = ?`,
    [alertId],
  );
  return { ...row, status: 'resolved', level: 1 };
}

function levelCopy(level, diseaseName) {
  const meta = levelMeta(level);
  const fr = {
    0: { title: `Surveillance habituelle — ${diseaseName}`, action: 'Poursuivre la surveillance de routine.' },
    1: { title: `Situation stable — ${diseaseName}`, action: 'Poursuivre la surveillance.' },
    2: { title: `Signal à surveiller — ${diseaseName}`, action: 'Vérifier les données et suivre l’évolution.' },
    3: { title: `Hausse préoccupante — ${diseaseName}`, action: 'Informer les responsables et renforcer la vigilance.' },
    4: { title: `Alerte élevée — ${diseaseName}`, action: 'Évaluation rapide par les responsables sanitaires.' },
    5: { title: `Situation critique — ${diseaseName}`, action: 'Coordination et intervention selon les protocoles validés.' },
    6: { title: `Alerte majeure — ${diseaseName}`, action: 'Escalade vers les autorités sanitaires compétentes.' },
  };
  return { meta, ...fr[level] };
}

function notifyAlert(alert, diseaseName) {
  const meta = levelMeta(alert.level);

  /*
   * Résolution des zones concernées par l'alerte :
   *  - alerte hospitalière : la région du district de rattachement
   *  - alerte de district  : le district lui-même et sa région
   *  - alerte régionale    : la région
   */
  let districtId = null;
  let regionId = null;
  if (alert.scope === 'hospital') {
    const row = get(
      `SELECT z.id AS district_id, z.parent_id AS region_id
         FROM hospitals h JOIN zones z ON z.id = h.zone_id
        WHERE h.id = ?`,
      [alert.scope_id],
    );
    districtId = row?.district_id ?? null;
    regionId = row?.region_id ?? null;
  } else if (alert.scope === 'district') {
    districtId = alert.scope_id;
    regionId = get('SELECT parent_id AS region_id FROM zones WHERE id = ?', [alert.scope_id])?.region_id ?? null;
  } else {
    regionId = alert.scope_id;
  }

  // Rôles de pilotage (admin + agents) : alertés sur toutes les alertes.
  const managers = all(
    "SELECT id FROM users WHERE active = 1 AND role IN ('admin','agent')",
  );

  // Public et abonnés : uniquement les alertes touchant une zone qu'ils suivent.
  // Un abonnement sans zone (zone_id NULL) vaut « toutes les zones ».
  const subscribers = all(
    `SELECT DISTINCT u.id
       FROM users u
       JOIN subscriptions s ON s.user_id = u.id
      WHERE u.active = 1
        AND s.min_level <= ?
        AND (
          s.zone_id IS NULL
          OR s.zone_id = ?
          OR (? IS NOT NULL AND s.zone_id = ?)
        )`,
    [alert.level, regionId, districtId, districtId],
  );

  const recipientIds = new Set([...managers, ...subscribers].map((u) => u.id));
  if (!recipientIds.size) return 0;

  // Évite les doublons lorsqu'une même alerte est recalculée au même niveau.
  const already = new Set(
    all(
      'SELECT user_id FROM notifications WHERE alert_id = ? AND level = ?',
      [alert.id, alert.level],
    ).map((n) => n.user_id),
  );

  const title = `Niveau ${alert.level} · ${meta.key === 'darkred' ? 'Alerte majeure' : diseaseName}`;
  const newlyNotified = [];
  for (const userId of recipientIds) {
    if (already.has(userId)) continue;
    run(
      `INSERT INTO notifications (user_id, alert_id, title, body, level, scope, scope_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        alert.id,
        title,
        alert.message,
        alert.level,
        alert.scope,
        alert.scope_id,
      ],
    );
    newlyNotified.push(userId);
  }

  // Notification système (Web Push) vers les appareils abonnés.
  if (newlyNotified.length) {
    sendPushToUsers(newlyNotified, {
      title,
      body: alert.message,
      level: alert.level,
      scope: alert.scope,
      scopeId: alert.scope_id,
      alertId: alert.id,
      url: '/alerts',
    }).catch(() => {});
  }
  return newlyNotified.length;
}

/**
 * Recalcule toutes les alertes a partir des declarations de cas.
 * Idempotent : peut etre appele apres chaque saisie ou manuellement.
 */
export function recomputeAlerts({ silent = false, notify = true } = {}) {
  const config = getAlertConfig();
  const situation = computeSituation(config);

  const diseases = new Map(all('SELECT * FROM diseases').map((d) => [d.id, d]));
  const zones = new Map(all('SELECT * FROM zones').map((z) => [z.id, z]));

  const events = { created: [], updated: [], resolved: [] };

  transaction(() => {
    /* 1. Alertes hopital */
    const byHospitalDisease = new Map();
    for (const s of situation) byHospitalDisease.set(`${s.hospital_id}:${s.disease_id}`, s);

    const existingHospitalAlerts = all("SELECT * FROM alerts WHERE scope = 'hospital'");
    const existingByKey = new Map(
      existingHospitalAlerts.map((a) => [`${a.scope_id}:${a.disease_id}`, a]),
    );

    for (const s of situation) {
      const key = `${s.hospital_id}:${s.disease_id}`;
      const existing = existingByKey.get(key);

      if (s.level >= config.persistMinLevel) {
        const { title, action } = levelCopy(s.level, s.disease_name);
        const message =
          `${s.active} patient(s) sous prise en charge pour ${s.disease_name} à ${s.hospital_name}. ` +
          `${s.new_cases_window} nouveau(x) cas sur les ${config.windowDays} derniers jours.`;
        const result = upsertAlert(
          {
            scope: 'hospital',
            scope_id: s.hospital_id,
            disease_id: s.disease_id,
            level: s.level,
            title: `${title} · ${s.hospital_name}`,
            message,
            action,
            hospital_count: 1,
            total_cases: s.active,
          },
          { situation: s },
        );
        if (result.created) {
          const alert = enrichAlert(result.alert);
          events.created.push(alert);
          if (notify) notifyAlert(alert, s.disease_name);
        } else if (result.changed) {
          const alert = enrichAlert(result.alert);
          events.updated.push(alert);
          if (result.alert.level > (existing?.level ?? 0)) {
            if (notify) notifyAlert(alert, s.disease_name);
          }
        }
      } else if (existing && existing.status !== 'resolved') {
        const resolved = resolveAlert(existing.id);
        if (resolved) events.resolved.push(resolved);
      }
    }

    /* 2. Escalade district et region */
    const scopes = [
      { scope: 'district', groupBy: 'zone_id', nameOf: (id) => zones.get(id)?.name, rule: config.escalation.district, immediate: config.escalation.districtImmediateLevel },
      { scope: 'region', groupBy: 'region_id', nameOf: (id) => zones.get(id)?.name, rule: config.escalation.region, immediate: config.escalation.regionImmediateLevel },
    ];

    for (const def of scopes) {
      const grouped = new Map(); // `${scopeId}:${diseaseId}` -> situation[]
      for (const s of situation) {
        const scopeId = s[def.groupBy];
        if (scopeId == null) continue;
        const key = `${scopeId}:${s.disease_id}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(s);
      }

      const existingScopeAlerts = all('SELECT * FROM alerts WHERE scope = ?', [def.scope]);
      const existingMap = new Map(
        existingScopeAlerts.map((a) => [`${a.scope_id}:${a.disease_id}`, a]),
      );

      for (const [key, rows] of grouped) {
        const [scopeIdStr, diseaseIdStr] = key.split(':');
        const scopeId = Number(scopeIdStr);
        const diseaseId = Number(diseaseIdStr);
        const disease = diseases.get(diseaseId);
        const minLevel = def.rule?.minLevel ?? 5;
        const minHospitals = def.rule?.minHospitals ?? 5;

        const hit = rows.filter((r) => r.level >= minLevel);
        const distinctHospitals = new Set(hit.map((r) => r.hospital_id)).size;
        const maxLevel = rows.reduce((m, r) => Math.max(m, r.level), 0);
        const immediateTrigger = def.immediate != null && maxLevel >= def.immediate;
        const triggered = distinctHospitals >= minHospitals || immediateTrigger;

        const existing = existingMap.get(key);

        if (triggered) {
          const level = Math.max(maxLevel, minLevel);
          const totalCases = rows.reduce((sum, r) => sum + r.active, 0);
          const scopeName = def.nameOf(scopeId) || `#${scopeId}`;
          const meta = levelMeta(level);
          const result = upsertAlert({
            scope: def.scope,
            scope_id: scopeId,
            disease_id: diseaseId,
            level,
            title: `Alerte ${def.scope === 'region' ? 'régionale' : 'de district'} · ${scopeName} · ${disease?.name ?? ''}`,
            message:
              `${distinctHospitals} établissement(s) en niveau ${minLevel}+ pour ${disease?.name ?? ''} ` +
              `dans ${scopeLabel(def.scope, scopeName)}. ${totalCases} patient(s) sous prise en charge au total.`,
            action: levelCopy(level, disease?.name ?? '').action,
            hospital_count: distinctHospitals,
            total_cases: totalCases,
          });
          if (result.created) {
            const alert = enrichAlert(result.alert);
            events.created.push(alert);
            if (notify) notifyAlert(alert, disease?.name ?? '');
          } else if (result.changed) {
            const alert = enrichAlert(result.alert);
            events.updated.push(alert);
            if (result.alert.level > (existing?.level ?? 0)) {
              if (notify) notifyAlert(alert, disease?.name ?? '');
            }
          }
        } else if (existing && existing.status !== 'resolved') {
          const resolved = resolveAlert(existing.id);
          if (resolved) events.resolved.push(resolved);
        }
      }
    }
  });

  const payload = {
    at: new Date().toISOString(),
    created: events.created,
    updated: events.updated,
    resolved: events.resolved,
    counts: countAlerts(),
  };
  if (!silent && (events.created.length || events.updated.length || events.resolved.length)) {
    broadcast('alerts', payload);
  }
  return payload;
}

/* ─────────────────────────────  Lecture  ───────────────────────────── */

export function countAlerts() {
  const row = get(
    `SELECT
       SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END)              AS active,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END)                 AS unacknowledged,
       SUM(CASE WHEN status != 'resolved' AND level >= 5 THEN 1 ELSE 0 END) AS critical,
       SUM(CASE WHEN status != 'resolved' AND scope = 'region' THEN 1 ELSE 0 END) AS regional
     FROM alerts`,
  ) || {};
  return {
    active: row.active || 0,
    unacknowledged: row.unacknowledged || 0,
    critical: row.critical || 0,
    regional: row.regional || 0,
  };
}

export function listAlerts({ status, level, scope, regionId, diseaseId, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    if (status === 'open') where.push("a.status != 'resolved'");
    else { where.push('a.status = ?'); params.push(status); }
  }
  if (level != null) { where.push('a.level >= ?'); params.push(Number(level)); }
  if (scope) { where.push('a.scope = ?'); params.push(scope); }
  if (diseaseId) { where.push('a.disease_id = ?'); params.push(Number(diseaseId)); }

  let joinZone = '';
  if (regionId) {
    joinZone = 'JOIN zones zz ON zz.id = a.scope_id';
    where.push("(a.scope = 'region' AND a.scope_id = ? OR a.scope = 'district' AND zz.parent_id = ?)");
    params.push(Number(regionId), Number(regionId));
  }

  const sql = `
    SELECT a.*, d.name AS disease_name, d.name_en AS disease_name_en, d.color AS disease_color,
           CASE a.scope
             WHEN 'hospital' THEN (SELECT name FROM hospitals WHERE id = a.scope_id)
             ELSE (SELECT name FROM zones WHERE id = a.scope_id)
           END AS scope_name
      FROM alerts a
      JOIN diseases d ON d.id = a.disease_id
      ${joinZone}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.status = 'resolved' ASC, a.level DESC, a.updated_at DESC
      LIMIT ?`;
  params.push(Number(limit));
  return all(sql, params);
}

/* ───────────────────────────  Statistiques  ─────────────────────────── */

export function overview() {
  const situation = computeSituation();
  const hospitals = all('SELECT COUNT(*) AS c FROM hospitals WHERE active = 1')[0].c;
  const diseases = all('SELECT COUNT(*) AS c FROM diseases WHERE active = 1')[0].c;

  const byLevel = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const byDisease = new Map();
  let totalActive = 0;
  let newCasesWindow = 0;
  let deaths = 0;

  for (const s of situation) {
    byLevel[s.level] = (byLevel[s.level] || 0) + 1;
    totalActive += s.active;
    newCasesWindow += s.new_cases_window;
    deaths += s.deaths_window;
    const d = byDisease.get(s.disease_id) || {
      disease_id: s.disease_id,
      name: s.disease_name,
      name_en: s.disease_name_en,
      color: s.disease_color,
      active: 0,
      new_cases: 0,
      max_level: 0,
    };
    d.active += s.active;
    d.new_cases += s.new_cases_window;
    d.max_level = Math.max(d.max_level, s.level);
    byDisease.set(s.disease_id, d);
  }

  const alerts = countAlerts();

  // Regions les plus touches
  const regionMap = new Map();
  for (const s of situation) {
    if (s.region_id == null) continue;
    const r = regionMap.get(s.region_id) || {
      region_id: s.region_id,
      region_name: s.region_name,
      active: 0,
      max_level: 0,
      alert_hospitals: 0,
    };
    r.active += s.active;
    r.max_level = Math.max(r.max_level, s.level);
    regionMap.set(s.region_id, r);
  }
  for (const r of regionMap.values()) {
    r.alert_hospitals = new Set(
      situation
        .filter((s) => s.region_id === r.region_id && s.level >= 5)
        .map((s) => s.hospital_id),
    ).size;
  }

  return {
    hospitals,
    diseases,
    total_active: totalActive,
    new_cases_window: newCasesWindow,
    deaths_window: deaths,
    by_level: byLevel,
    by_disease: [...byDisease.values()].sort((a, b) => b.active - a.active),
    regions: [...regionMap.values()].sort((a, b) => b.max_level - a.max_level || b.active - a.active),
    alerts,
    config: getAlertConfig(),
    generated_at: new Date().toISOString(),
  };
}

/** Serie temporelle agregee (nouveaux cas / deces / guerisons par jour). */
export function timeseries({ days = 30, diseaseId, regionId } = {}) {
  const params = [`-${Number(days)} days`];
  let where = `r.report_date >= date('now', ?)`;
  if (diseaseId) { where += ' AND r.disease_id = ?'; params.push(Number(diseaseId)); }
  if (regionId) {
    where += ' AND h.zone_id IN (SELECT id FROM zones WHERE parent_id = ? OR id = ?)';
    params.push(Number(regionId), Number(regionId));
  }
  return all(
    `SELECT r.report_date AS date,
            COALESCE(SUM(r.new_cases), 0) AS new_cases,
            COALESCE(SUM(r.patients_under_care), 0) AS under_care,
            COALESCE(SUM(r.deaths), 0) AS deaths,
            COALESCE(SUM(r.recovered), 0) AS recovered
       FROM case_reports r
       JOIN hospitals h ON h.id = r.hospital_id
      WHERE ${where}
      GROUP BY r.report_date
      ORDER BY r.report_date ASC`,
    params,
  );
}
