/**
 * Test d'intégration bout-en-bout de l'API ÉpiWatch.
 * Lancer le serveur sur le port 4000, puis : node scripts/e2e.mjs
 */
const BASE = process.env.BASE || 'http://localhost:4000';

let pass = 0;
let fail = 0;

function check(label, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label} ${extra}`);
  }
}

async function call(method, path, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

console.log(`\nÉpiWatch — test d'intégration (${BASE})\n`);

// 1. Santé
const health = await call('GET', '/api/health');
check('health endpoint', health.status === 200 && health.data.status === 'ok');

// 2. Auth invalide
const bad = await call('POST', '/api/auth/login', { email: 'admin@epiwatch.cm', password: 'mauvais' });
check('rejet des identifiants invalides', bad.status === 401);

// 3. Connexion admin
const admin = await call('POST', '/api/auth/login', { email: 'admin@epiwatch.cm', password: 'Admin@2026' });
check('connexion admin', admin.status === 200 && !!admin.data.token, JSON.stringify(admin.data));
const adminToken = admin.data.token;

// 4. Connexion agent
const agent = await call('POST', '/api/auth/login', { email: 'infirmier.douala@epiwatch.cm', password: 'Agent@2026' });
check('connexion agent', agent.status === 200 && agent.data.user.hospital_id, JSON.stringify(agent.data));
const agentToken = agent.data.token;
const agentHospital = agent.data.user.hospital_id;

// 5. Référentiels
const zones = await call('GET', '/api/zones');
check('zones chargées', zones.data.zones.length >= 8);
const districts = zones.data.zones[0].districts;
check('districts imbriqués', Array.isArray(districts));

const hospitals = await call('GET', '/api/hospitals');
check('30 hôpitaux', hospitals.data.hospitals.length === 30, `reçu ${hospitals.data.hospitals.length}`);

const diseases = await call('GET', '/api/diseases');
check('5 maladies avec 6 seuils', diseases.data.diseases.length === 5 && diseases.data.diseases.every((d) => d.thresholds.length === 6));
const cholera = diseases.data.diseases.find((d) => d.code === 'cholera');

// 6. Statistiques
const before = await call('GET', '/api/overview');
check('overview disponible', before.data.overview.hospitals === 30);
const alertsBefore = before.data.overview.alerts.active;

// 7. Déclaration de cas (agent, son propre hôpital)
const report = await call(
  'POST',
  '/api/cases',
  {
    hospital_id: agentHospital,
    disease_id: cholera.id,
    new_cases: 60,
    patients_under_care: 200,
    deaths: 1,
    recovered: 3,
    notes: 'Test intégration automatisé',
  },
  agentToken,
);
check('création d’une déclaration', report.status === 201, JSON.stringify(report.data).slice(0, 200));
check('déclaration renvoie les alertes recalculées', Array.isArray(report.data.alerts?.created));

// 8. Cloisonnement : l'agent ne peut pas déclarer pour un autre hôpital
const other = hospitals.data.hospitals.find((h) => h.id !== agentHospital);
const forbidden = await call(
  'POST',
  '/api/cases',
  { hospital_id: other.id, disease_id: cholera.id, new_cases: 5, patients_under_care: 10 },
  agentToken,
);
check('cloisonnement par hôpital (403)', forbidden.status === 403, `status=${forbidden.status}`);

// 9. Un agent ne peut pas modifier la configuration
const cfgForbidden = await call('PUT', '/api/config', { window_days: 10 }, agentToken);
check('config protégée (403)', cfgForbidden.status === 403);

// 10. L'admin peut modifier les seuils
const thresholds = cholera.thresholds.map((t) => ({ level: t.level, min_active: t.min_active * 2 }));
const upd = await call('PUT', `/api/diseases/${cholera.id}/thresholds`, { thresholds }, adminToken);
check('mise à jour des seuils', upd.status === 200 && upd.data.thresholds[0].min_active === thresholds[0].min_active);

// Seuils incohérents rejetés
const badTh = cholera.thresholds.map((t, i) => ({ level: t.level, min_active: 100 - i * 10 }));
const updBad = await call('PUT', `/api/diseases/${cholera.id}/thresholds`, { thresholds: badTh }, adminToken);
check('seuils décroissants rejetés (400)', updBad.status === 400);

// Restauration des seuils
await call('PUT', `/api/diseases/${cholera.id}/thresholds`, { thresholds: cholera.thresholds.map((t) => ({ level: t.level, min_active: t.min_active })) }, adminToken);

// 11. Alertes
const alerts = await call('GET', '/api/alerts?status=open');
check('liste des alertes', alerts.status === 200 && alerts.data.alerts.length > 0);
check('compteurs d’alertes', typeof alerts.data.counts.active === 'number');
const critical = await call('GET', '/api/alerts?level=5');
check('filtre par niveau', critical.data.alerts.every((a) => a.level >= 5));

// 12. Filtrage régional
const littoral = zones.data.zones.find((z) => z.name === 'Littoral');
const regional = await call('GET', `/api/alerts?region_id=${littoral.id}`);
check('filtre régional retourne des alertes', regional.data.alerts.length > 0);

// 13. Acquittement d'alerte
const firstAlert = alerts.data.alerts.find((a) => a.scope === 'hospital');
if (firstAlert) {
  const ack = await call('POST', `/api/alerts/${firstAlert.id}/ack`, { status: 'acknowledged' }, adminToken);
  check('acquittement d’alerte', ack.status === 200 && ack.data.alert.status === 'acknowledged');
}

// 14. Notifications : on force une escalation sur un hôpital encore calme du Littoral.
// Le public est abonné à la région Littoral (min_level 3), il doit donc être notifié.
const littoralHosps = hospitals.data.hospitals.filter((h) => h.region_name === 'Littoral');
const notifTarget = littoralHosps[littoralHosps.length - 1];
const situation0 = await call('GET', '/api/situation');
const targetRow = situation0.data.situation.find(
  (s) => s.hospital_id === notifTarget.id && s.disease_id === cholera.id,
);
check('hôpital cible trouvé dans la situation', !!targetRow, `hôpital ${notifTarget?.name}`);
await call(
  'POST',
  '/api/cases',
  { hospital_id: notifTarget.id, disease_id: cholera.id, new_cases: 400, patients_under_care: 1500 },
  adminToken,
);

const notifs = await call('GET', '/api/notifications', undefined, adminToken);
check('notifications générées (admin)', notifs.status === 200 && notifs.data.notifications.length > 0, `reçues ${notifs.data.notifications.length}`);
check('compteur non-lues', typeof notifs.data.unread === 'number');

// 14b. Le public abonné au Littoral reçoit les alertes de sa zone
const publicLogin = await call('POST', '/api/auth/login', { email: 'public@epiwatch.cm', password: 'Public@2026' });
check('connexion du public', publicLogin.status === 200);
const publicNotifs = await call('GET', '/api/notifications', undefined, publicLogin.data.token);
check('notifications ciblées pour le public abonné', publicNotifs.data.notifications.length > 0, `reçues ${publicNotifs.data.notifications.length}`);
check('les alertes reçues sont bien de niveau ≥ 3', publicNotifs.data.notifications.every((n) => n.level >= 3));

// 15. Abonnements
const sub = await call('PUT', '/api/subscriptions', { zone_id: littoral.id, min_level: 3, enabled: true }, adminToken);
check('création d’abonnement', sub.status === 200 && sub.data.subscriptions.length > 0);

// 16. Inscription publique : rôle forcé à "public"
const unique = `test${Date.now()}@epiwatch.cm`;
const reg = await call('POST', '/api/auth/register', { email: unique, password: 'Test1234', full_name: 'Test Citoyen', role: 'admin' });
check('inscription publique forcée au rôle public', reg.status === 201 && reg.data.user.role === 'public', JSON.stringify(reg.data.user?.role));

// 17. L'utilisateur public ne peut pas saisir
const publicCase = await call('POST', '/api/cases', { hospital_id: agentHospital, disease_id: cholera.id, new_cases: 1, patients_under_care: 1 }, reg.data.token);
check('public ne peut pas déclarer (403)', publicCase.status === 403);

// 18. Série temporelle
const ts = await call('GET', '/api/timeseries?days=30');
check('série temporelle', ts.data.series.length >= 20);

// 19. Situation
const sit = await call('GET', '/api/situation');
check('situation : 30 hôpitaux × 5 maladies = 150 lignes', sit.data.situation.length === 150, `reçu ${sit.data.situation.length}`);

// 20. Administration : journal d'audit
const audit = await call('GET', '/api/audit?limit=50', undefined, adminToken);
check('journal d’audit alimenté', audit.status === 200 && audit.data.entries.length > 0);

// 21. Simulation de démo
const sim = await call('POST', '/api/demo/simulate', { hospital_id: agentHospital, disease_id: cholera.id, new_cases: 30 }, agentToken);
check('simulation de démo', sim.status === 200 && sim.data.active > 0);

// 22. Création d'utilisateur par l'admin
const newUser = await call('POST', '/api/users', { email: `agent${Date.now()}@epiwatch.cm`, password: 'Agent2026', full_name: 'Agent Test', role: 'agent', hospital_id: other.id }, adminToken);
check('création d’utilisateur', newUser.status === 201 && newUser.data.user.role === 'agent');

// 23. Escalade régionale
const littoralHospitals = hospitals.data.hospitals.filter((h) => h.region_name === 'Littoral');
const littl = littoralHospitals.slice(0, 6);
for (const h of littl) {
  await call('POST', '/api/cases', { hospital_id: h.id, disease_id: cholera.id, new_cases: 80, patients_under_care: 250 }, adminToken);
}
const afterAlerts = await call('GET', '/api/alerts?scope=region&status=open');
check('alerte régionale déclenchée', afterAlerts.data.alerts.length > 0, `reçues ${afterAlerts.data.alerts.length}`);
if (afterAlerts.data.alerts.length) {
  const ra = afterAlerts.data.alerts[0];
  check('alerte régionale au niveau maximal', ra.level >= 5, `niveau ${ra.level}`);
  check('au moins 5 établissements concernés', ra.hospital_count >= 5, `hospitals ${ra.hospital_count}`);
}

// 24. Réinitialisation
const reset = await call('POST', '/api/demo/reset', undefined, adminToken);
check('réinitialisation des données', reset.status === 200 && reset.data.summary.hospitals === 30);

console.log(`\n────────────────────────────────\n  ${pass} réussis · ${fail} échoués\n`);
process.exit(fail === 0 ? 0 : 1);
