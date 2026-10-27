/**
 * Jeu de donnees de demonstration ÉpiWatch.
 *
 * - Hopitaux REELS du Cameroun avec coordonnees geographiques reelles.
 * - Donnees de cas FICTIVES (aucune donnee patient reelle).
 * - Scenarios d'epidemie simules et reproductibles (PRNG deterministe)
 *   pour demontrer la montee en charge des niveaux d'alerte.
 *
 * Usage :
 *   node src/seed.js --reset        # efface et reinitialise
 *   node src/seed.js --recompute    # recalcule les alertes seulement
 */
import { run, all, transaction, setSetting, setJsonSetting, isEmpty } from './db.js';
import { hashPassword, usernameFor } from './auth.js';
import { recomputeAlerts } from './alerts.js';
import { DEFAULT_ESCALATION, DEFAULT_WINDOW_DAYS } from './config.js';

/* ─────────────────────────  PRNG deterministe  ───────────────────────── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261022);
const rint = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

/* ───────────────────────────────  Zones  ─────────────────────────────── */

const REGIONS = [
  { code: 'LIT', name: 'Littoral', lat: 4.05, lng: 9.7, population: 4100000 },
  { code: 'CEN', name: 'Centre', lat: 3.87, lng: 11.52, population: 4700000 },
  { code: 'OUE', name: 'Ouest', lat: 5.48, lng: 10.42, population: 2100000 },
  { code: 'NORO', name: 'Nord-Ouest', lat: 5.96, lng: 10.15, population: 2000000 },
  { code: 'SUDO', name: 'Sud-Ouest', lat: 4.15, lng: 9.24, population: 1800000 },
  { code: 'NOR', name: 'Nord', lat: 9.3, lng: 13.39, population: 2800000 },
  { code: 'ADA', name: 'Adamaoua', lat: 7.32, lng: 13.58, population: 1300000 },
  { code: 'SUD', name: 'Sud', lat: 2.94, lng: 9.91, population: 800000 },
  { code: 'EST', name: 'Est', lat: 4.58, lng: 13.68, population: 900000 },
  { code: 'ENO', name: 'Extrême-Nord', lat: 10.6, lng: 14.32, population: 4100000 },
];

const DISTRICTS = [
  { code: 'WOU', name: 'Wouri', region: 'LIT', population: 3000000 },
  { code: 'MOU', name: 'Moungo', region: 'LIT', population: 500000 },
  { code: 'SAN', name: 'Sanaga-Maritime', region: 'LIT', population: 2000000 },
  { code: 'MFO', name: 'Mfoundi', region: 'CEN', population: 3200000 },
  { code: 'NYO', name: "Nyong-et-So'o", region: 'CEN', population: 500000 },
  { code: 'MBI', name: 'Mbam-et-Inoubou', region: 'CEN', population: 300000 },
  { code: 'MIF', name: 'Mifi', region: 'OUE', population: 600000 },
  { code: 'MEN', name: 'Menoua', region: 'OUE', population: 400000 },
  { code: 'BAM', name: 'Bamboutos', region: 'OUE', population: 350000 },
  { code: 'MEZ', name: 'Mezam', region: 'NORO', population: 700000 },
  { code: 'BUI', name: 'Bui', region: 'NORO', population: 400000 },
  { code: 'FAK', name: 'Fako', region: 'SUDO', population: 700000 },
  { code: 'MEM', name: 'Meme', region: 'SUDO', population: 400000 },
  { code: 'BEN', name: 'Bénoué', region: 'NOR', population: 900000 },
  { code: 'VIN', name: 'Vina', region: 'ADA', population: 600000 },
  { code: 'OCE', name: 'Océan', region: 'SUD', population: 300000 },
  { code: 'NYA', name: 'Nyong-et-Mfoumou', region: 'CEN', population: 250000 },
  { code: 'HDS', name: 'Haut-Nkam', region: 'OUE', population: 300000 },
  { code: 'MUN', name: 'Mungo', region: 'LIT', population: 350000 },
  { code: 'NKA', name: 'Nkam', region: 'LIT', population: 150000 },
  { code: 'LOM', name: 'Lom-et-Djérem', region: 'EST', population: 350000 },
  { code: 'KAO', name: 'Kadey', region: 'EST', population: 250000 },
  { code: 'MBE', name: 'Mbéré', region: 'ADA', population: 200000 },
  { code: 'LOG', name: 'Logone-et-Chari', region: 'ENO', population: 500000 },
  { code: 'DIA', name: 'Diamaré', region: 'ENO', population: 600000 },
  { code: 'MOR', name: 'Mayo-Tsanaga', region: 'ENO', population: 700000 },
  { code: 'MOK', name: 'Mayo-Kani', region: 'ENO', population: 400000 },
];

/* ──────────────────────────────  Hopitaux  ────────────────────────────── */

const HOSPITALS = [
  // Littoral — Wouri (Douala)
  { code: 'HCD', name: 'Hôpital Central de Douala', type: 'central', district: 'WOU', lat: 4.046, lng: 9.701, beds: 650, phone: '+237 233 42 10 20', address: 'Rue de la Réunification, Akwa, Douala' },
  { code: 'HGD', name: 'Hôpital Général de Douala', type: 'regional', district: 'WOU', lat: 4.073, lng: 9.686, beds: 320, phone: '+237 233 37 15 15', address: 'Bonabéri, Douala' },
  { code: 'HLQ', name: 'Hôpital Laquintinie de Douala', type: 'regional', district: 'WOU', lat: 4.05, lng: 9.691, beds: 700, phone: '+237 233 42 44 44', address: 'Boulevard de la Liberté, Douala' },
  { code: 'CHUD', name: 'CHU de Douala', type: 'central', district: 'WOU', lat: 4.043, lng: 9.7025, beds: 500, phone: '+237 233 42 88 00', address: 'Quartier Bali, Douala' },
  { code: 'HDD', name: 'Hôpital de District de Deïdo', type: 'district', district: 'WOU', lat: 4.07, lng: 9.73, beds: 120, phone: '+237 233 41 22 11', address: 'Deïdo, Douala' },
  { code: 'HDB', name: 'Hôpital de District de Bonabéri', type: 'district', district: 'WOU', lat: 4.08, lng: 9.68, beds: 100, phone: '+237 233 39 55 12', address: 'Bonabéri, Douala' },
  // Littoral — Moungo
  { code: 'HRN', name: 'Hôpital Régional de Nkongsamba', type: 'regional', district: 'MOU', lat: 4.954, lng: 9.939, beds: 180, phone: '+237 233 45 12 30', address: 'Nkongsamba' },
  { code: 'HDMB', name: 'Hôpital de District de Mbanga', type: 'district', district: 'MOU', lat: 4.5, lng: 9.57, beds: 80, phone: '+237 233 46 11 20', address: 'Mbanga' },
  // Littoral — Sanaga-Maritime
  { code: 'HDE', name: 'Hôpital de District de Edéa', type: 'district', district: 'SAN', lat: 3.801, lng: 10.133, beds: 110, phone: '+237 233 47 22 40', address: 'Edéa' },
  // Centre — Mfoundi (Yaoundé)
  { code: 'HCY', name: 'Hôpital Central de Yaoundé', type: 'central', district: 'MFO', lat: 3.885, lng: 11.502, beds: 650, phone: '+237 222 23 40 20', address: 'Rue Henri Dunant, Yaoundé' },
  { code: 'HGY', name: 'Hôpital Général de Yaoundé', type: 'regional', district: 'MFO', lat: 3.876, lng: 11.523, beds: 300, phone: '+237 222 23 40 10', address: 'Ngousso, Yaoundé' },
  { code: 'CHUY', name: 'CHU de Yaoundé', type: 'central', district: 'MFO', lat: 3.861, lng: 11.518, beds: 550, phone: '+237 222 31 20 10', address: 'Melen, Yaoundé' },
  { code: 'HDBI', name: 'Hôpital de District de Biyem-Assi', type: 'district', district: 'MFO', lat: 3.835, lng: 11.48, beds: 120, phone: '+237 222 31 55 40', address: 'Biyem-Assi, Yaoundé' },
  // Centre — autres
  { code: 'HDM', name: 'Hôpital de District de Mbalmayo', type: 'district', district: 'NYO', lat: 3.783, lng: 11.902, beds: 90, phone: '+237 222 28 11 30', address: 'Mbalmayo' },
  { code: 'HDBF', name: 'Hôpital de District de Bafia', type: 'district', district: 'MBI', lat: 4.75, lng: 11.233, beds: 75, phone: '+237 222 24 11 20', address: 'Bafia' },
  // Ouest — Mifi
  { code: 'HRB', name: 'Hôpital Régional de Bafoussam', type: 'regional', district: 'MIF', lat: 5.478, lng: 10.417, beds: 250, phone: '+237 233 44 13 40', address: 'Bafoussam' },
  { code: 'CHUB', name: 'CHU de Bafoussam', type: 'central', district: 'MIF', lat: 5.473, lng: 10.422, beds: 400, phone: '+237 233 44 15 15', address: 'Bafoussam' },
  { code: 'HDMF', name: 'Hôpital de District de Mifi', type: 'district', district: 'MIF', lat: 5.482, lng: 10.43, beds: 110, phone: '+237 233 44 22 10', address: 'Bafoussam' },
  // Ouest — Menoua / Bamboutos
  { code: 'HRDS', name: 'Hôpital Régional de Dschang', type: 'regional', district: 'MEN', lat: 5.449, lng: 10.056, beds: 200, phone: '+237 233 45 11 40', address: 'Dschang' },
  { code: 'HDDS', name: 'Hôpital de District de Dschang', type: 'district', district: 'MEN', lat: 5.444, lng: 10.052, beds: 85, phone: '+237 233 45 12 10', address: 'Dschang' },
  { code: 'HDMB2', name: 'Hôpital de District de Mbouda', type: 'district', district: 'BAM', lat: 5.626, lng: 10.255, beds: 80, phone: '+237 233 46 33 20', address: 'Mbouda' },
  // Nord-Ouest
  { code: 'CHUBA', name: 'CHU de Bamenda', type: 'central', district: 'MEZ', lat: 5.96, lng: 10.15, beds: 420, phone: '+237 233 36 11 20', address: 'Bamenda' },
  { code: 'HRBA', name: 'Hôpital Régional de Bamenda', type: 'regional', district: 'MEZ', lat: 5.963, lng: 10.156, beds: 230, phone: '+237 233 36 14 40', address: 'Bamenda' },
  { code: 'HDK', name: 'Hôpital de District de Kumbo', type: 'district', district: 'BUI', lat: 6.2, lng: 10.68, beds: 90, phone: '+237 233 37 20 10', address: 'Kumbo' },
  // Sud-Ouest
  { code: 'HRBU', name: 'Hôpital Régional de Buea', type: 'regional', district: 'FAK', lat: 4.156, lng: 9.241, beds: 210, phone: '+237 233 32 21 40', address: 'Buea' },
  { code: 'HDLI', name: 'Hôpital de District de Limbe', type: 'district', district: 'FAK', lat: 4.023, lng: 9.196, beds: 100, phone: '+237 233 33 21 10', address: 'Limbe' },
  { code: 'HDKU', name: 'Hôpital de District de Kumba', type: 'district', district: 'MEM', lat: 4.636, lng: 9.446, beds: 120, phone: '+237 233 35 11 40', address: 'Kumba' },
  // Nord / Adamaoua / Sud
  { code: 'HRG', name: 'Hôpital Régional de Garoua', type: 'regional', district: 'BEN', lat: 9.301, lng: 13.392, beds: 260, phone: '+237 222 27 12 40', address: 'Garoua' },
  { code: 'HRNG', name: "Hôpital Régional de Ngaoundéré", type: 'regional', district: 'VIN', lat: 7.319, lng: 13.582, beds: 220, phone: '+237 222 25 11 40', address: 'Ngaoundéré' },
  { code: 'HDKR', name: 'Hôpital de District de Kribi', type: 'district', district: 'OCE', lat: 2.942, lng: 9.907, beds: 95, phone: '+237 233 46 44 20', address: 'Kribi' },
  // Est
  { code: 'HRBM', name: 'Hôpital Régional de Bertoua', type: 'regional', district: 'LOM', lat: 4.577, lng: 13.684, beds: 200, phone: '+237 222 24 11 40', address: 'Bertoua' },
  { code: 'HDBT', name: 'Hôpital de District de Batouri', type: 'district', district: 'KAO', lat: 4.435, lng: 14.366, beds: 90, phone: '+237 222 24 22 10', address: 'Batouri' },
  // Extrême-Nord
  { code: 'HRMR', name: 'Hôpital Régional de Maroua', type: 'regional', district: 'DIA', lat: 10.591, lng: 14.316, beds: 230, phone: '+237 222 29 11 40', address: 'Maroua' },
  { code: 'HDKO', name: 'Hôpital de District de Kousséri', type: 'district', district: 'LOG', lat: 12.076, lng: 15.031, beds: 100, phone: '+237 222 29 22 10', address: 'Kousséri' },
  { code: 'HDMK', name: 'Hôpital de District de Mokolo', type: 'district', district: 'MOR', lat: 10.742, lng: 13.802, beds: 85, phone: '+237 222 29 33 20', address: 'Mokolo' },
];

/* ───────────────────────────────  Maladies  ─────────────────────────────── */

const DISEASES = [
  {
    code: 'cholera', name: 'Choléra', name_en: 'Cholera', color: '#0ea5e9', icon: 'droplet',
    description: 'Infection diarrhéique aiguë causée par Vibrio cholerae.',
    advice: 'Lavez-vous les mains au savon, buvez de l\'eau traitée ou bouillie, lavez les fruits et légumes, consultez immédiatement en cas de diarrhée aqueuse abondante.',
    advice_en: 'Wash hands with soap, drink treated or boiled water, wash fruit and vegetables, seek care immediately for profuse watery diarrhoea.',
    thresholds: [3, 8, 15, 30, 50, 80],
  },
  {
    code: 'covid19', name: 'COVID-19', name_en: 'COVID-19', color: '#8b5cf6', icon: 'virus',
    description: 'Infection respiratoire causée par le SARS-CoV-2.',
    advice: 'Portez un masque dans les lieux clos, respectez la distanciation, aérez les pièces, vaccinez-vous et isolez-vous en cas de symptômes.',
    advice_en: 'Wear a mask indoors, keep distance, ventilate rooms, get vaccinated and self-isolate if symptomatic.',
    thresholds: [5, 15, 30, 60, 100, 150],
  },
  {
    code: 'malaria', name: 'Paludisme', name_en: 'Malaria', color: '#f59e0b', icon: 'mosquito',
    description: 'Maladie parasitaire transmise par les moustiques Anophèles.',
    advice: 'Dormez sous une moustiquaire imprégnée, éliminez les eaux stagnantes, utilisez des répulsifs et consultez en cas de fièvre.',
    advice_en: 'Sleep under an insecticide-treated net, remove standing water, use repellents and seek care for fever.',
    thresholds: [10, 30, 60, 120, 200, 300],
  },
  {
    code: 'typhoid', name: 'Typhoïde', name_en: 'Typhoid fever', color: '#10b981', icon: 'bacteria',
    description: 'Infection bactérienne causée par Salmonella typhi.',
    advice: 'Consommez une eau et des aliments sûrs, lavez-vous les mains, faites-vous vacciner si recommandé et consultez en cas de fièvre persistante.',
    advice_en: 'Consume safe water and food, wash hands, get vaccinated if recommended and seek care for persistent fever.',
    thresholds: [5, 12, 25, 50, 80, 120],
  },
  {
    code: 'dengue', name: 'Dengue', name_en: 'Dengue fever', color: '#ef4444', icon: 'alert',
    description: 'Infection virale transmise par les moustiques Aedes.',
    advice: 'Éliminez les eaux stagnantes, utilisez des répulsifs anti-moustiques, portez des vêtements couvrants et consultez en cas de fièvre élevée avec douleurs articulaires.',
    advice_en: 'Eliminate standing water, use mosquito repellents, wear protective clothing and seek care for high fever with joint pain.',
    thresholds: [4, 10, 20, 40, 70, 110],
  },
  {
    code: 'yellow_fever', name: 'Fièvre Jaune', name_en: 'Yellow fever', color: '#eab308', icon: 'alert',
    description: 'Infection virale hémorragique transmise par les moustiques.',
    advice: 'Vaccinez-vous contre la fièvre jaune, utilisez des répulsifs, dormez sous une moustiquaire et consultez immédiatement en cas de fièvre avec ictère.',
    advice_en: 'Get vaccinated against yellow fever, use repellents, sleep under a mosquito net and seek immediate care for fever with jaundice.',
    thresholds: [2, 5, 10, 20, 35, 60],
  },
  {
    code: 'measles', name: 'Rougeole', name_en: 'Measles', color: '#f97316', icon: 'alert',
    description: 'Infection virale hautement contagieuse.',
    advice: 'Faites vacciner les enfants, isolez les malades, portez un masque et consultez en cas de fièvre avec éruption cutanée.',
    advice_en: 'Vaccinate children, isolate the sick, wear a mask and seek care for fever with rash.',
    thresholds: [3, 8, 15, 30, 50, 80],
  },
  {
    code: 'tuberculosis', name: 'Tuberculose', name_en: 'Tuberculosis', color: '#64748b', icon: 'alert',
    description: 'Infection bactérienne touchant principalement les poumons.',
    advice: 'Consultez en cas de toux persistante (>2 semaines), fièvre, sueurs nocturnes et perte de poids. Suivez le traitement complet.',
    advice_en: 'Seek care for persistent cough (>2 weeks), fever, night sweats and weight loss. Complete the full treatment.',
    thresholds: [2, 5, 10, 20, 35, 60],
  },
  {
    code: 'meningitis', name: 'Méningite', name_en: 'Meningitis', color: '#dc2626', icon: 'alert',
    description: 'Inflammation des méninges, souvent d\'origine virale ou bactérienne.',
    advice: 'Consultez d\'urgence en cas de fièvre élevée, raideur de la nuque, maux de tête intenses, photophobie ou confusion.',
    advice_en: 'Seek emergency care for high fever, stiff neck, severe headache, light sensitivity or confusion.',
    thresholds: [2, 4, 8, 15, 25, 40],
  },
  {
    code: 'other', name: 'Autre maladie', name_en: 'Other disease', color: '#6b7280', icon: 'help',
    description: 'Autre maladie non listée.',
    advice: 'Consultez un professionnel de santé pour un diagnostic précis et un traitement approprié.',
    advice_en: 'Consult a healthcare professional for accurate diagnosis and appropriate treatment.',
    thresholds: [5, 10, 20, 40, 70, 100],
  },
];

/* Pics epidemiques simules : hopitaux (codes) touches et intensite. */
const OUTBREAKS = [
  { disease: 'cholera', hospitals: ['HCD', 'HGD', 'HLQ', 'CHUD', 'HDD', 'HDB'], rampDays: 13, maxMult: 17 },
  { disease: 'cholera', hospitals: ['HDE', 'HDKR'], rampDays: 9, maxMult: 6 },
  { disease: 'malaria', hospitals: ['HCY', 'HGY', 'CHUY', 'HDBI'], rampDays: 22, maxMult: 2.6 },
  { disease: 'typhoid', hospitals: ['HRB', 'CHUB', 'HDMF'], rampDays: 15, maxMult: 3.4 },
  { disease: 'covid19', hospitals: ['CHUBA', 'HRBA'], rampDays: 18, maxMult: 4.6 },
  { disease: 'malaria', hospitals: ['CHUBA', 'HRBA', 'HDK'], rampDays: 20, maxMult: 1.9 },
];

const BASE_NEW = {
  cholera: 3,
  covid19: 2,
  malaria: 14,
  typhoid: 4,
  dengue: 5,
  yellow_fever: 2,
  measles: 3,
  tuberculosis: 4,
  meningitis: 2,
  other: 1,
};
const TYPE_FACTOR = { central: 1.7, regional: 1.35, district: 1.0, clinic: 0.6, private: 0.7 };

function outbreakMultiplier(diseaseCode, hospitalCode, daysAgo) {
  let mult = 1;
  for (const o of OUTBREAKS) {
    if (o.disease !== diseaseCode || !o.hospitals.includes(hospitalCode)) continue;
    if (daysAgo > o.rampDays) continue;
    const progress = 1 - daysAgo / o.rampDays; // 0 -> debut, 1 -> aujourd'hui
    mult = Math.max(mult, 1 + (o.maxMult - 1) * Math.pow(progress, 1.5));
  }
  return mult;
}

const iso = (d) => d.toISOString().slice(0, 10);

/* ───────────────────────────────  Seed  ─────────────────────────────── */

export function seed({ reset = false, days = 56, noDemo = false } = {}) {
  transaction(() => {
    if (reset) {
      for (const t of [
        'push_subscriptions', 'notifications', 'subscriptions', 'audit_log', 'alerts',
        'case_reports', 'thresholds', 'users', 'hospitals', 'diseases', 'zones', 'settings',
      ]) {
        run(`DELETE FROM ${t}`);
      }
      run("DELETE FROM sqlite_sequence WHERE name IN ('push_subscriptions','notifications','subscriptions','audit_log','alerts','case_reports','thresholds','users','hospitals','diseases','zones')");
    }

    /* Zones */
    const regionIds = new Map();
    for (const r of REGIONS) {
      const res = run(
        `INSERT INTO zones (name, code, type, population, lat, lng) VALUES (?, ?, 'region', ?, ?, ?)`,
        [r.name, `REG-${r.code}`, r.population, r.lat, r.lng],
      );
      regionIds.set(r.code, res.lastInsertRowid);
    }
    const districtIds = new Map();
    for (const d of DISTRICTS) {
      const res = run(
        `INSERT INTO zones (name, code, type, parent_id, population) VALUES (?, ?, 'district', ?, ?)`,
        [d.name, `DIS-${d.code}`, regionIds.get(d.region), d.population],
      );
      districtIds.set(d.code, res.lastInsertRowid);
    }

    /* Hopitaux */
    const hospitalIds = new Map();
    for (const h of HOSPITALS) {
      const res = run(
        `INSERT INTO hospitals (name, code, type, zone_id, address, phone, beds, lat, lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [h.name, h.code, h.type, districtIds.get(h.district), h.address, h.phone, h.beds, h.lat, h.lng],
      );
      hospitalIds.set(h.code, res.lastInsertRowid);
    }

    /* Maladies + seuils */
    const diseaseIds = new Map();
    for (const d of DISEASES) {
      const res = run(
        `INSERT INTO diseases (name, name_en, code, color, icon, description, advice, advice_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.name, d.name_en, d.code, d.color, d.icon, d.description, d.advice, d.advice_en],
      );
      diseaseIds.set(d.code, res.lastInsertRowid);
      d.thresholds.forEach((min, i) => {
        run('INSERT INTO thresholds (disease_id, level, min_active) VALUES (?, ?, ?)', [
          res.lastInsertRowid,
          i + 1,
          min,
        ]);
      });
    }

    /* Utilisateurs - only admin account */
    const users = [
      // Administrateur : gere les comptes, les grades et la configuration.
      {
        email: 'admin@epiwatch.cm', username: 'admin', pass: 'Admin@2026',
        name: 'Administrateur ÉpiWatch', role: 'admin', rank: 'Administrateur',
      },
    ];

    const userIds = new Map();
    for (const u of users) {
      const res = run(
        `INSERT INTO users (email, username, password_hash, full_name, role, rank, hospital_id, zone_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.email, u.username, hashPassword(u.pass), u.name, u.role, u.rank,
          u.hospital_id ?? null, u.zone_id ?? null,
        ],
      );
      userIds.set(u.email, res.lastInsertRowid);
    }

    /* Parametres par defaut */
    setSetting('window_days', DEFAULT_WINDOW_DAYS);
    setSetting('threshold_basis', 'under_care');
    setSetting('persist_min_level', 2);
    setJsonSetting('escalation', DEFAULT_ESCALATION);
    setSetting('demo_mode', noDemo ? '0' : '1');
    setSetting('org_name', 'ÉpiWatch Cameroun');
  });

  const summary = recomputeAlerts({ silent: true, notify: false });
  return {
    hospitals: HOSPITALS.length,
    diseases: DISEASES.length,
    regions: REGIONS.length,
    districts: DISTRICTS.length,
    alerts_created: summary.created.length,
    alerts_resolved: summary.resolved.length,
  };
}

/* ───────────────────────────────  CLI  ─────────────────────────────── */

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/seed.js');
if (isMain) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--recompute')) {
    const out = recomputeAlerts({ silent: false, notify: false });
    console.log('Alertes recalculees :', {
      created: out.created.length,
      updated: out.updated.length,
      resolved: out.resolved.length,
      counts: out.counts,
    });
  } else if (args.has('--clean')) {
    const summary = seed({ reset: true, noDemo: true });
    console.log('Base initialisee (sans donnees demo) :', summary);
    console.log('\nCompte admin uniquement :');
    console.log('  admin              / Admin@2026    (administrateur)');
    console.log('\nUtilisez l\'interface admin pour creer vos propres utilisateurs.');
  } else {
    if (!args.has('--reset') && !isEmpty()) {
      console.log('La base contient deja des donnees. Utilisez --reset pour reinitialiser.');
      console.log('Utilisez --clean pour initialiser sans donnees de demonstration.');
    } else {
      const summary = seed({ reset: true });
      console.log('Base initialisee :', summary);
      console.log('\nComptes de demonstration :');
      console.log('  admin              / Admin@2026    (administrateur)');
      console.log('  inf.hcd            / Agent@2026    (infirmier, Hôpital Central de Douala)');
      console.log('  inf.hcy            / Agent@2026    (infirmier, Hôpital Central de Yaoundé)');
      console.log('  inf.hrb            / Agent@2026    (infirmier, Hôpital Régional de Bafoussam)');
      console.log('  inf.hrmr           / Agent@2026    (infirmier, Hôpital Régional de Maroua)');
      console.log('  public.citoyen     / Public@2026   (public / alertes)');
      console.log('\nConnexion possible aussi avec l\'adresse email de chaque compte.');
      console.log('Pour initialiser sans donnees demo : npm run seed -- --clean');
    }
  }
}
