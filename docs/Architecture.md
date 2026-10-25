# ÉpiWatch — Dossier d'architecture technique

> Complément technique du `Cahier_de_charge.md`. Public visé : jury technique, développeurs.

---

## 1. Vue d'ensemble

ÉpiWatch est une **application web progressive (PWA)** adossée à un **serveur Node.js** unique
qui assure à la fois l'API, le calcul des alertes, la diffusion temps réel et le service des
fichiers statiques. Les données sont stockées dans une base **SQLite embarquée** (fichier unique).

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENTS (PWA React)                         │
│   Desktop (poste de saisie) · Mobile (alertes) · Tablette            │
│   React 18 · Vite 5 · Leaflet 1.9 · Recharts 2 · react-router 6      │
└──────────────┬───────────────────────────────────┬───────────────────┘
               │  REST /api/*  (JSON)               │  GET /api/stream (SSE)
               ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       SERVEUR  (Node 24 · Express 4)                 │
│  ┌────────────┬─────────────┬──────────────┬─────────────────────┐   │
│  │ auth.js    │ api.js      │ alerts.js    │ realtime.js         │   │
│  │ scrypt+HMAC│ routes REST │ calcul+niveaux│ bus SSE (broadcast) │   │
│  └────────────┴─────────────┴──────────────┴─────────────────────┘   │
│  ┌──────────────────────┬───────────────────────────────────────┐   │
│  │ helpers.js (audit,   │ index.js (static web/dist, CORS,      │   │
│  │ validateurs)         │ SPA fallback, HTTPS optionnel)        │   │
│  └──────────────────────┴───────────────────────────────────────┘   │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │  node:sqlite (WAL, FK on)
                                    ▼
                             ┌──────────────┐
                             │ epiwatch.db  │
                             └──────────────┘
```

---

## 2. Pile technologique et justification

| Couche | Choix | Pourquoi |
|--------|-------|----------|
| Front | React 18 + Vite 5 | HMR instantané, build rapide, écosystème |
| Routing | react-router-dom 6 | Routes protégées, layout partagé |
| Carte | Leaflet 1.9 + OpenStreetMap | Libre, léger, `divIcon` pour marqueurs pulsants |
| Graphiques | Recharts 2 | Composants React déclaratifs |
| État | Contexte React maison (`store.jsx`) | Suffisant, pas de dépendance lourde |
| Back | Node.js 24 + Express 4 | JS unifié, `node:sqlite` natif (sans compilation) |
| Base | `node:sqlite` (WAL) | Zéro dépendance native, fichier unique, portable |
| Temps réel | SSE (`text/event-stream`) | Fonctionne en HTTP clair sur LAN, reconnexion auto |
| Auth | HMAC-SHA256 + scrypt | Jeton signé, mot de passe salé, sans dépendance |
| HTTPS | `selfsigned` (option `--secure`) | Contexte sécurisé pour l'API Notification |

**Décision clé — SQLite local au lieu de Supabase.** La démonstration doit être **déterministe
et hors-ligne** : un serveur + un fichier `.db` suffisent, sans compte cloud ni Internet. Le
schéma relationnel est directement transposable en PostgreSQL / Supabase.

---

## 3. Structure du dépôt

```
epiwatch/
├── package.json                 # scripts racine (install:all, seed, dev, build, start)
├── .gitignore
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js             # bootstrap : seed si vide, CORS, static, LAN, HTTPS, shutdown
│   │   ├── config.js            # DATA_DIR, PORT, ALERT_LEVELS, ROLES, DEFAULT_ESCALATION
│   │   ├── db.js                # DatabaseSync + schéma + all/get/run/transaction/bindable
│   │   ├── auth.js              # hashPassword, verify, sign/verifyToken, load/attach/requireAuth/Role
│   │   ├── realtime.js          # addClient/removeClient/broadcast/clientCount (heartbeat 25 s)
│   │   ├── alerts.js            # computeSituation, recomputeAlerts, listAlerts, overview, timeseries
│   │   ├── helpers.js           # HttpError, validateurs, audit(), listZones/Hospitals/Diseases/Users
│   │   ├── api.js               # Router REST complet + /stream
│   │   └── seed.js              # données de démonstration déterministes (graine 20261022)
│   ├── scripts/
│   │   ├── e2e.mjs              # 38 vérifications d'intégration bout-en-bout
│   │   ├── sse-test.mjs         # vérifie la diffusion temps réel
│   │   └── inspect.mjs          # introspection rapide de la base
│   └── data/                    # epiwatch.db (+ -wal, -shm) — régénérable
├── web/
│   ├── package.json
│   ├── vite.config.js           # host:true, proxy /api → localhost:4000
│   ├── index.html
│   ├── public/
│   │   ├── manifest.webmanifest # PWA : icônes, standalone, thème
│   │   ├── sw.js                # service worker (cache statique)
│   │   └── icons/               # 192, 512, maskable-512, apple-touch
│   ├── scripts/make-icons.mjs   # génère les PNG depuis le SVG source
│   └── src/
│       ├── main.jsx · App.jsx   # entrée + routeur + gardes de rôle
│       ├── lib/                 # api.js, hooks.js (SSE), auth.jsx, store.jsx, ui.js
│       ├── i18n/index.jsx       # tables FR + EN, useI18n, diseaseName
│       ├── components/          # Icons, Layout, Shell, ui (primitives)
│       ├── pages/               # Login, Dashboard, MapView, Entry, Alerts, Reports,
│       │                        # Notifications, Admin, Users, Public, About
│       └── styles/app.css       # design system (thèmes clair/sombre, responsive)
└── docs/
    ├── Cahier_de_charge.md
    ├── Architecture.md          # ce document
    ├── Guide_de_demonstration.md
    └── slides/                  # présentation PowerPoint
```

---

## 4. Modèle de données

### 4.1 Schéma relationnel

```
zones (id, name, code, type∈{region,district}, parent_id→zones, population, lat, lng)
  ▲                                        ▲
  │ zone_id                                │ zone_id (région)
hospitals (id, name, code, type, zone_id, address, phone, beds, lat, lng, active)

diseases (id, name, name_en, code, color, icon, description, advice, advice_en, active)
  ▲                    ▲
  │ disease_id         │ disease_id
thresholds         case_reports (id, hospital_id, disease_id, report_date,
(level 1..6,          new_cases, patients_under_care, deaths, recovered,
 min_active)          notes, created_by, created_at, updated_at)
                          ▲
                          │ (alimente le calcul)
alerts (id, scope∈{hospital,district,region}, scope_id, disease_id, level,
        status∈{active,acknowledged,resolved}, title, message, action,
        hospital_count, total_cases, acknowledged_by, acknowledged_at)
  ▲ UNIQUE(scope, scope_id, disease_id)
  │ alert_id
notifications (id, user_id, alert_id, title, body, level, scope, scope_id, read)
                       ▲
users (id, email, password_hash, full_name, role, hospital_id, zone_id,
       phone, language, active)
  ▲ user_id
subscriptions (id, user_id, zone_id, min_level, channel)  UNIQUE(user_id, zone_id, channel)

audit_log (id, entity, entity_id, action, actor_id, payload, created_at)
settings  (key, value, updated_at)
```

### 4.2 Points importants

- **Nouveaux cas vs patients sous prise en charge.** `new_cases` (flux sur la période) est
  strictement séparé de `patients_under_care` (stock actuel) : c'est ce dernier qui sert de
  base au calcul du niveau par défaut, évitant les doubles comptages.
- **Seuils absolus configurables.** `thresholds` porte 6 lignes par maladie (`level` 1..6),
  chacune associée à `min_active`. Contrainte d'unicité `(disease_id, level)`.
- **Unicité des alertes.** `UNIQUE(scope, scope_id, disease_id)` : le recalcul est **idempotent** —
  une même situation met à jour l'alerte existante au lieu d'en créer une nouvelle.
- **Index** sur `case_reports(hospital_id, disease_id, report_date)`, `case_reports(report_date)`,
  `alerts(status, level)`, `notifications(user_id, read)`, `hospitals(zone_id)`.
- **WAL** activé (`PRAGMA journal_mode = WAL`) et clés étrangères (`PRAGMA foreign_keys = ON`).
- **Compatibilité `node:sqlite`** : `bindable()` convertit booléens / `undefined` / `Date`
  en valeurs acceptées par le module (il refuse les booléens JS en paramètres liés).

---

## 5. API REST

Préfixe : `/api`. Authentification par en-tête `Authorization: Bearer <token>`.

### 5.1 Santé et authentification

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET  | `/health` | public | État du service + nombre de clients temps réel |
| POST | `/auth/register` | public | Inscription (rôle **forcé** à `public`) |
| POST | `/auth/login` | public | Connexion → jeton (TTL 7 j) |
| GET  | `/auth/me` | authentifié | Profil courant |

### 5.2 Référentiels

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET | `/zones` | public | Régions et districts imbriqués |
| GET | `/hospitals` | public | 30 hôpitaux (filtrable région/district) |
| GET | `/diseases` | public | Maladies + seuils |
| GET | `/config` | public | Fenêtre, base de seuil, règles d'escalade |
| GET | `/users` | admin | Liste des comptes |

### 5.3 Déclarations de cas

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET | `/cases` | authentifié | Historique (cloisonné par rôle) |
| POST | `/cases` | authentifié | Enregistrer → recalcul + diffusion |
| DELETE | `/cases/:id` | authentifié | Supprimer avec traçabilité (audit) |

### 5.4 Situation, alertes, rapports

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET | `/situation` | public | 30 hôpitaux × 5 maladies = 150 lignes |
| GET | `/overview` | public | Indicateurs globaux + compteurs d'alertes |
| GET | `/timeseries` | public | Séries temporelles (`?days=`) |
| GET | `/alerts` | public | Filtres : `status`, `level`, `scope`, `region_id` |
| POST | `/alerts/:id/ack` | authentifié | Acquitter / clore |
| GET | `/audit` | admin | Journal de traçabilité |

### 5.5 Notifications et abonnements

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET | `/notifications` | authentifié | Notifications de l'utilisateur + non-lues |
| POST | `/notifications/read` | authentifié | Marquer comme lues |
| GET | `/subscriptions` | authentifié | Abonnements de l'utilisateur |
| PUT | `/subscriptions` | authentifié | Créer/mettre à jour un abonnement |

### 5.6 Administration

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| PUT | `/config` | admin | Fenêtre, base de seuil, escalade |
| PUT | `/diseases/:id/thresholds` | admin | Mise à jour des 6 seuils (validation croissante) |
| POST | `/hospitals` | admin | Créer un hôpital |
| POST | `/users` | admin | Créer un compte |

### 5.7 Démonstration

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| POST | `/demo/simulate` | authentifié | Injecter des cas pour déclencher une flambée |
| POST | `/demo/scenario` | authentifié | Scénario épidémique guidé |
| POST | `/demo/reset` | admin | Réinitialiser aux données seedées |

### 5.8 Temps réel

| Méthode | Route | Accès | Description |
|--------:|-------|-------|-------------|
| GET | `/stream` | authentifié | Flux **SSE** : `hello`, `alert`, `heartbeat` |

---

## 6. Moteur d'alertes (`alerts.js`)

### 6.1 `computeSituation(config)`

Produit, pour chaque couple **(hôpital, maladie)**, l'indicateur retenu :

```
si threshold_basis = 'under_care'  →  patients_under_care du dernier rapport
sinon                              →  Σ new_cases sur window_days
```

### 6.2 `levelFor(value, thresholds)`

Parcourt les 6 seuils et retourne le plus haut niveau satisfait (0 si aucun).
Les niveaux 0..6 portent couleur et intensité de signal (`config.js → ALERT_LEVELS`).

### 6.3 `recomputeAlerts({silent, notify})`

1. **Portée hôpital** : pour chaque ligne de la situation, `upsertAlert` (création ou mise à jour).
2. **Portée district** : agrège les hôpitaux du district ; si `≥ minHospitals` atteignent
   `≥ minLevel` (ou niveau 6 immédiat), crée une alerte de district.
3. **Portée région** : même logique au niveau régional.
4. **Résolution** : une alerte dont la condition disparaît passe en `resolved`.
5. **Notification** : `notifyAlert` cible les destinataires (voir § 7).
6. **Diffusion** : si `!silent`, `broadcast()` envoie l'événement `alert` aux clients SSE.

**Idempotence** : `upsertAlert` s'appuie sur `UNIQUE(scope, scope_id, disease_id)` ; un recalcul
sans changement de niveau ne renotifie pas.

### 6.4 `enrichAlert(alert)`

Ajoute `scope_name`, `disease_name`, `disease_name_en`, `disease_color` — garantit que les objets
renvoyés par l'API **et** par le flux temps réel ont une forme identique.

---

## 7. Ciblage des notifications (`notifyAlert`)

```
                     ┌───────────────────────────────────────┐
                     │            Alerte (niveau N)            │
                     └───────────────────┬───────────────────┘
                                         │
              ┌──────────────────────────┴──────────────────────────┐
              ▼                                                      ▼
   ┌───────────────────────┐                     ┌──────────────────────────────┐
   │  Rôles de pilotage     │                     │  Abonnés (public)             │
   │  super_admin, admin,   │                     │  subscription.min_level ≤ N   │
   │  regional_authority    │                     │  ET zone suivie = zone        │
   │  → toutes les alertes  │                     │     concernée (ou zone NULL)  │
   └───────────────────────┘                     └──────────────────────────────┘
                                         │
                                         ▼
                        Déduplication (alert_id, level, user_id)
                                         │
                                         ▼
                            INSERT notifications + broadcast SSE
```

Résolution de la **zone concernée** selon la portée de l'alerte :

| Portée | Zone résolue |
|--------|--------------|
| `hospital` | région du district de l'hôpital (+ district) |
| `district` | le district + sa région |
| `region` | la région |

Un abonnement dont `zone_id IS NULL` vaut « toutes les zones ».

---

## 8. Temps réel (SSE)

`realtime.js` maintient un `Set` de réponses HTTP ouvertes :

- `addClient(res)` : en-têtes `text/event-stream`, enregistrement, `hello` initial.
- `broadcast(event, data)` : écrit `event: <nom>\ndata: <json>\n\n` à tous les clients.
- `removeClient` au `close`.
- **Heartbeat** toutes les 25 s (`: ping`) pour traverser les proxys.

Flux d'un événement :

```
POST /api/cases ─► recomputeAlerts ─► broadcast('alert', payload)
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                       écran A           écran B          téléphone C
                     (mise à jour)     (bandeau)         (notification)
```

**Repli** : le hook `useRealtime` du front rétablit automatiquement la connexion et déclenche une
interrogation périodique si le flux échoue.

---

## 9. Sécurité

### 9.1 Authentification

- **Mots de passe** : `scrypt` avec sel aléatoire par compte ; comparaison en temps constant.
- **Jetons** : `base64url(payload).signature` signés HMAC-SHA256 avec un secret serveur, TTL 7 jours.
- Middlewares : `attachUser` (décode le jeton si présent) → `requireAuth` → `requireRole(...)`.

### 9.2 Autorisation (RBAC)

| Capacité | Rôles |
|----------|-------|
| `CAN_REPORT` | agent, hospital_manager, admin, super_admin |
| `CAN_ACK_ALERT` | hospital_manager, regional_authority, admin, super_admin |
| `CAN_MANAGE_CONFIG` | admin, super_admin |
| Inscription publique | rôle **imposé** à `public` (un rôle privilégié fourni est ignoré) |

### 9.3 Cloisonnement

Un `agent` ne peut créer/supprimer une déclaration que pour **son** `hospital_id` ; toute autre
cible renvoie **403**.

### 9.4 Traçabilité

`audit()` consigne entité, action, acteur et charge utile pour chaque opération sensible
(saisie, suppression, changement de seuils, administration).

### 9.5 Confidentialité

Aucune donnée personnelle de patient ; uniquement des **comptages agrégés**. Données de démo fictives.

---

## 10. Front-end

### 10.1 Organisation

- **`store.jsx`** — contexte central : référentiels, situation, alertes, indicateurs, notifications,
  bandeaux (toasts) ; expose les actions et l'état à toutes les pages.
- **`hooks.js`** — `useRealtime` (SSE), `usePolling` (repli), `useBrowserNotifications`.
- **`auth.jsx`** — session (jeton persistant), `login/logout`, utilisateur courant.
- **`ui.js`** — niveaux, rôles, prédicats `canReport/canAck/canManage/isPublic`.
- **`i18n/`** — tables FR/EN complètes, `useI18n`, `diseaseName`.
- **`components/`** — primitives (`LevelBadge`, `StatCard`, `Modal`, `Tabs`, `ToastStack`…),
  `Shell` (en-tête/nav mobile/desktop), `Layout` (marque, barre latérale).
- **`pages/`** — 11 écrans (voir `Cahier_de_charge.md` § 11.2).

### 10.2 Carte

`MapView.jsx` utilise Leaflet avec des **marqueurs `divIcon`** : un point coloré dont la taille et
l'animation de pulsation dépendent de `ALERT_LEVELS[niveau].signal`. Légende, filtres (maladie,
région, niveau) et infobulles détaillées.

### 10.3 PWA

- `manifest.webmanifest` : icônes 192/512/maskable, `display: standalone`, couleurs de thème.
- `sw.js` : cache des ressources statiques (consultation hors-ligne partielle).
- Bandeau de connexion indiquant l'état du flux temps réel.

---

## 11. Démarrage et exploitation

### 11.1 Scripts racine

```jsonc
{
  "install:all": "npm --prefix server install && npm --prefix web install",
  "seed":        "npm --prefix server run seed",
  "dev:server":  "npm --prefix server run dev",
  "dev:web":     "npm --prefix web run dev",
  "build":       "npm --prefix web run build",
  "start":       "npm --prefix web run build && npm --prefix server start",
  "start:secure":"npm --prefix web run build && node server/src/index.js --secure"
}
```

### 11.2 Mode développement

| Terminal | Commande | Rôle |
|----------|----------|------|
| 1 | `npm run dev:server` | API + SSE sur `http://localhost:4000` |
| 2 | `npm run dev:web` | Vite (HMR) sur `http://localhost:5173`, proxy `/api` |

### 11.3 Mode démonstration (un seul serveur)

```powershell
npm run start          # build du front + serveur sur http://<IP-LAN>:4000
```

Le serveur **sème la base si elle est vide**, imprime l'**adresse LAN** à ouvrir depuis les
téléphones, et sert le front (avec repli SPA sur toute route inconnue).

### 11.4 HTTPS et notifications système

```powershell
npm run start:secure   # certificat auto-signé (selfsigned)
```

Nécessaire pour l'API **Notification** du navigateur (contexte sécurisé). Sur `localhost`,
le navigateur la considère déjà comme sécurisée.

### 11.5 Variables d'environnement

| Variable | Défaut | Effet |
|----------|--------|-------|
| `PORT` | `4000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface d'écoute (LAN) |
| `EPIWATCH_DB` | `server/data/epiwatch.db` | Chemin de la base |
| `EPIWATCH_DATA_DIR` | `server/data` | Répertoire des données |

> Toutes les invocations Node utilisent `--disable-warning=ExperimentalWarning` (module `node:sqlite`).

---

## 12. Tests

| Script | Couverture |
|--------|-----------|
| `server/scripts/e2e.mjs` | **38 vérifications** : santé, auth (invalid/valid), référentiels, RBAC, cloisonnement, seuils, alertes, notifications ciblées, abonnements, escalade régionale, audit, démo, reset |
| `server/scripts/sse-test.mjs` | Connexion SSE + réception d'un événement `alert` après escalade |
| `server/scripts/inspect.mjs` | Introspection rapide des volumes en base |

Exécution (serveur lancé au préalable) :

```powershell
node --disable-warning=ExperimentalWarning scripts/e2e.mjs
node --disable-warning=ExperimentalWarning scripts/sse-test.mjs
```

---

## 13. Décisions d'ingénierie notables

| Sujet | Décision | Raison |
|-------|----------|--------|
| Base de données | SQLite local plutôt que cloud | Démo déterministe et hors-ligne |
| Temps réel | SSE plutôt que WebSocket | Fonctionne en HTTP clair sur LAN, plus simple |
| Notifications | In-app (SSE) en primaire, navigateur en complément | Aucun serveur push nécessaire |
| Mode hors-ligne | PWA installable + service worker | Robustesse sur réseaux instables |
| Sécurité | scrypt + HMAC, zéro dépendance | Embarqué, auditable |
| Seed déterministe | PRNG à graine fixe | Démonstration reproductible à l'identique |
| Front mono-paquet | Une PWA pour desktop + mobile | Une seule base de code |
| Bilingue | FR + EN dans le même paquet | Ouverture, simplicité de distribution |

---

## 14. Évolutions d'architecture

- **PostgreSQL / Supabase** : schéma transposable à l'identique ; remplacer `db.js` par un client SQL.
- **FCM** : ajouter un canal push serveur pour les alertes hors-application.
- **Native** : React Native / Flutter réutilisant l'API existante.
- **Streaming épidémiologique** : détection d'anomalies au-delà des seuils fixes.
- **Interopérabilité** : connecteur DHIS2 / systèmes nationaux.

---

*Document d'architecture technique — projet ÉpiWatch, Concours INNOVA.*
