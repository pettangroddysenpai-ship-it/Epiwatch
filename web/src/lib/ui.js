/**
 * Utilitaires partagés : niveaux d'alerte, rôles, sévérité.
 */

export const LEVELS = [
  { level: 0, key: 'blue', color: '#2563eb', labelFr: 'Aucun signal', labelEn: 'No signal' },
  { level: 1, key: 'green', color: '#16a34a', labelFr: 'Situation stable', labelEn: 'Stable' },
  { level: 2, key: 'yellow', color: '#eab308', labelFr: 'Signal à surveiller', labelEn: 'Monitor' },
  { level: 3, key: 'orange', color: '#f97316', labelFr: 'Hausse préoccupante', labelEn: 'Concerning' },
  { level: 4, key: 'lightred', color: '#ef4444', labelFr: 'Alerte élevée', labelEn: 'High alert' },
  { level: 5, key: 'red', color: '#b91c1c', labelFr: 'Situation critique', labelEn: 'Critical' },
  { level: 6, key: 'darkred', color: '#7f1d1d', labelFr: 'Alerte majeure', labelEn: 'Major alert' },
];

export function levelInfo(level) {
  return LEVELS[Math.max(0, Math.min(6, level ?? 0))];
}

export function levelColor(level) {
  return levelInfo(level).color;
}

export function severityTextColor(level) {
  // Les niveaux très pâles/jaunes nécessitent un texte foncé.
  return level === 2 || level === 0 || level === 1 ? '#0f172a' : '#ffffff';
}

export function severityClass(level) {
  return `lvl-${Math.max(0, Math.min(6, level ?? 0))}`;
}

export const ROLE_LABELS = {
  admin: 'role.admin',
  agent: 'role.agent',
  public: 'role.public',
};

/** Les agents et les admins saisissent des cas. */
export const CAN_REPORT_ROLES = ['admin', 'agent'];
/** Seuls les admins et les agents traitent les alertes. */
export const CAN_ACK_ROLES = ['admin', 'agent'];
export const CAN_MANAGE_ROLES = ['admin'];
export const STAFF_ROLES = ['admin', 'agent'];

export function canReport(user) {
  return !!user && CAN_REPORT_ROLES.includes(user.role);
}
export function canAck(user) {
  return !!user && CAN_ACK_ROLES.includes(user.role);
}
export function canManage(user) {
  return !!user && CAN_MANAGE_ROLES.includes(user.role);
}

/** Rôle "public" (citoyen) : pas d'accès aux écrans de saisie. */
export function isPublic(user) {
  return !user || user.role === 'public';
}

export function isStaff(user) {
  return !!user && STAFF_ROLES.includes(user.role);
}

/** Page d'accueil selon le rôle. */
export function homeFor(user) {
  return isPublic(user) ? '/public' : '/';
}

export const SCOPE_LABELS = {
  hospital: 'alerts.scope.hospital',
  district: 'alerts.scope.district',
  region: 'alerts.scope.region',
};

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function initials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
