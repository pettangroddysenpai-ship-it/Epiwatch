# ÉpiWatch

**Plateforme de surveillance sanitaire et d'alerte épidémiologique en temps réel.**

ÉpiWatch permet à plusieurs établissements de santé de déclarer les cas de maladies infectieuses
qu'ils prennent en charge, de les centraliser dans une base commune, de les visualiser sur une
carte interactive et de **déclencher automatiquement des alertes graduées** vers les responsables
sanitaires et la population.

> Projet présenté au **concours INNOVA** — application web progressive (PWA), utilisable sur
> ordinateur (postes de saisie, tableaux de bord) et installable sur téléphone (alertes).

---

## Aperçu

| | |
|---|---|
| **Niveaux d'alerte** | 7 (bleu → rouge foncé) |
| **Hôpitaux de démonstration** | 30, au Cameroun (coordonnées réelles, données fictives) |
| **Maladies** | Choléra · COVID-19 · Paludisme · Typhoïde · Autres |
| **Escalade** | Hôpital → district → région (seuils configurables) |
| **Temps réel** | SSE + notifications |
| **Langues** | Français · Anglais |
| **Base de données** | SQLite embarquée (aucune dépendance native) |

---

## Démarrage rapide

Prérequis : **Node.js 22.5+** (testé sur 24.x, pour `node:sqlite`).

```powershell
# 1. Installer les dépendances (serveur + web)
npm run install:all

# 2. Initialiser la base de démonstration
npm run seed

# 3. Construire le front et lancer le serveur
npm run start
```

Ouvrir ensuite **http://localhost:4000**.
Le serveur affiche aussi l'**adresse réseau** (`http://<IP-LAN>:4000`) à ouvrir depuis les
téléphones du même réseau local.

### Mode développement (rechargement à chaud)

```powershell
# Terminal 1 — API + temps réel
npm run dev:server

# Terminal 2 — interface web (Vite, proxy /api)
npm run dev:web
```

Interface de développement : **http://localhost:5173**

---

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run install:all` | Installe les dépendances du serveur et du web |
| `npm run seed` | (Re)génère la base de données de démonstration |
| `npm run dev:server` | Démarre l'API en mode développement |
| `npm run dev:web` | Démarre le front Vite en mode développement |
| `npm run build` | Construit l'interface web pour la production |
| `npm run start` | Construit le front puis lance le serveur unique |
| `npm run start:secure` | Idem avec HTTPS auto-signé (notifications système) |

---

## Comptes de démonstration

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| `admin@epiwatch.cm` | `Admin@2026` | Super administrateur |
| `autorite@epiwatch.cm` | `Autorite@2026` | Autorité régionale |
| `chef.douala@epiwatch.cm` | `Chef@2026` | Responsable hospitalier |
| `infirmier.douala@epiwatch.cm` | `Agent@2026` | Agent de saisie |
| `infirmier.yaounde@epiwatch.cm` | `Agent@2026` | Agent de saisie |
| `infirmier.bafoussam@epiwatch.cm` | `Agent@2026` | Agent de saisie |
| `public@epiwatch.cm` | `Public@2026` | Citoyen (alertes) |

---

## Structure du projet

```
epiwatch/
├── server/    # API Express + SQLite + moteur d'alertes + temps réel (SSE)
├── web/       # PWA React (Vite + Leaflet + Recharts)
└── docs/      # Cahier de charges, architecture, guide de démonstration, présentation
```

Détails techniques : voir [`docs/Architecture.md`](docs/Architecture.md).
Spécifications fonctionnelles : voir [`docs/Cahier_de_charge.md`](docs/Cahier_de_charge.md).
Scénario de présentation : voir [`docs/Guide_de_demonstration.md`](docs/Guide_de_demonstration.md).

---

## Tests

Avec le serveur démarré sur le port 4000 :

```powershell
cd server
node --disable-warning=ExperimentalWarning scripts/e2e.mjs
node --disable-warning=ExperimentalWarning scripts/sse-test.mjs
```

- `e2e.mjs` — **38 vérifications** : authentification, rôles, cloisonnement, seuils, alertes,
  notifications ciblées, escalade régionale, audit, démonstration.
- `sse-test.mjs` — connexion au flux temps réel et réception d'un événement d'alerte.

---

## Configuration

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `4000` | Port d'écoute du serveur |
| `HOST` | `0.0.0.0` | Interface d'écoute (accessible sur le réseau local) |
| `EPIWATCH_DB` | `server/data/epiwatch.db` | Chemin du fichier de base |

---

## Licence et données

Les **hôpitaux et leurs coordonnées sont réels** ; les **données de cas sont entièrement
fictives**, à des fins de démonstration. Aucune donnée personnelle de patient n'est traitée.
