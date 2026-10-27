const TOKEN_KEY = 'epiwatch.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body, { auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `Erreur ${res.status}`);
  }
  return data;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const api = {
  // Auth
  login: (identifier, password) =>
    request('POST', '/auth/login', { identifier, email: identifier, password }, { auth: false }),
  register: (payload) => request('POST', '/auth/register', payload, { auth: false }),
  googleSignIn: (idToken) => request('POST', '/auth/google', { id_token: idToken }, { auth: false }),
  me: () => request('GET', '/auth/me'),
  updateMe: (payload) => request('PATCH', '/auth/me', payload),

  // Référentiels
  zones: () => request('GET', '/zones', undefined, { auth: false }),
  hospitals: (params = {}) => request('GET', `/hospitals${qs(params)}`, undefined, { auth: false }),
  diseases: () => request('GET', '/diseases', undefined, { auth: false }),
  config: () => request('GET', '/config', undefined, { auth: false }),
  users: () => request('GET', '/users'),

  // Données
  overview: () => request('GET', '/overview', undefined, { auth: false }),
  situation: (params = {}) => request('GET', `/situation${qs(params)}`, undefined, { auth: false }),
  timeseries: (params = {}) => request('GET', `/timeseries${qs(params)}`, undefined, { auth: false }),
  cases: (params = {}) => request('GET', `/cases${qs(params)}`),
  createCase: (payload) => request('POST', '/cases', payload),
  updateCase: (id, payload) => request('PATCH', `/cases/${id}`, payload),
  deleteCase: (id) => request('DELETE', `/cases/${id}`),

  // Alertes
  alerts: (params = {}) => request('GET', `/alerts${qs(params)}`, undefined, { auth: false }),
  ackAlert: (id, status, comment) => request('POST', `/alerts/${id}/ack`, { status, comment }),

  // Notifications / abonnements
  notifications: () => request('GET', '/notifications'),
  markNotificationsRead: (ids) => request('POST', '/notifications/read', { ids }),
  subscriptions: () => request('GET', '/subscriptions'),
  setSubscription: (payload) => request('PUT', '/subscriptions', payload),

  // Web Push (notifications système, application fermée)
  pushKey: () => request('GET', '/push/key', undefined, { auth: false }),
  pushSubscribe: (subscription) => request('POST', '/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint) => request('POST', '/push/unsubscribe', { endpoint }),
  pushSubscriptions: () => request('GET', '/push/subscriptions'),
  pushTest: () => request('POST', '/push/test'),

  // Admin
  updateConfig: (payload) => request('PUT', '/config', payload),
  updateThresholds: (diseaseId, thresholds) =>
    request('PUT', `/diseases/${diseaseId}/thresholds`, { thresholds }),
  createHospital: (payload) => request('POST', '/hospitals', payload),
  updateHospital: (id, payload) => request('PATCH', `/hospitals/${id}`, payload),
  createUser: (payload) => request('POST', '/users', payload),
  updateUser: (id, payload) => request('PATCH', `/users/${id}`, payload),
  audit: (limit = 100) => request('GET', `/audit?limit=${limit}`),

  // Démo
  simulate: (payload) => request('POST', '/demo/simulate', payload),
  runScenario: (scenario) => request('POST', '/demo/scenario', { scenario }),
  resetDemo: () => request('POST', '/demo/reset'),
};

function qs(params) {
  const entries = Object.entries(params || {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/* ── Utilitaires de formatage ── */

export function formatNumber(value, lang = 'fr') {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'fr-FR').format(value ?? 0);
}

export function formatDate(value, lang = 'fr', withTime = false) {
  if (!value) return lang === 'fr' ? 'Non disponible' : 'Not available';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function timeAgo(value, lang = 'fr') {
  if (!value) return lang === 'fr' ? 'Non disponible' : 'Not available';
  const date = new Date(String(value).replace(' ', 'T'));
  const diff = (Date.now() - date.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return rtf.format(-Math.round(diff), 'second');
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export function exportCsv(filename, rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
