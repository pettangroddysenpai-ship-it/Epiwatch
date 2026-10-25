# Cahier de charges — ÉpiWatch

**Plateforme de surveillance sanitaire et d'alerte épidémiologique en temps réel**

| | |
|---|---|
| **Nom du projet** | ÉpiWatch |
| **Version** | 1.0 (prototype démontrable) |
| **Contexte** | Concours INNOVA — projet de fin de semestre |
| **Date** | Octobre 2026 |
| **Nature du document** | Cahier de charges fonctionnel et technique |

---

## Table des matières

1. [Présentation générale](#1-présentation-générale)
2. [Contexte et problématique](#2-contexte-et-problématique)
3. [Objectifs](#3-objectifs)
4. [Public cible et rôles](#4-public-cible-et-rôles)
5. [Périmètre fonctionnel](#5-périmètre-fonctionnel)
6. [Description des fonctionnalités](#6-description-des-fonctionnalités)
7. [Le système d'alerte à sept niveaux](#7-le-système-dalerte-à-sept-niveaux)
8. [Logique d'escalade](#8-logique-descalade)
9. [Modèle de données](#9-modèle-de-données)
10. [Architecture technique](#10-architecture-technique)
11. [Interface et expérience utilisateur](#11-interface-et-expérience-utilisateur)
12. [Sécurité et confidentialité](#12-sécurité-et-confidentialité)
13. [Exigences non fonctionnelles](#13-exigences-non-fonctionnelles)
14. [Jeu de données de démonstration](#14-jeu-de-données-de-démonstration)
15. [Scénario de démonstration](#15-scénario-de-démonstration)
16. [Planning de réalisation](#16-planning-de-réalisation)
17. [Évolutions envisagées](#17-évolutions-envisagées)
18. [Limites et hypothèses](#18-limites-et-hypothèses)

---

## 1. Présentation générale

**ÉpiWatch** est une plateforme de **surveillance épidémiologique en temps réel** qui permet à
un ensemble d'établissements de santé de déclarer les cas de maladies infectieuses qu'ils
prennent en charge, de les centraliser dans une base commune, de les visualiser sur une carte
interactive et de **déclencher automatiquement des alertes graduées** à destination des
responsables sanitaires et de la population.

Le système se présente sous la forme d'une **application web progressive (PWA)** : une seule
base de code, utilisable depuis un navigateur sur ordinateur (postes de saisie des hôpitaux,
tableaux de bord des autorités) et installable sur téléphone mobile (réception des alertes).

> **Idée directrice :** un infirmier saisit quelques chiffres ; si la situation l'exige, la
> carte s'embrase, les responsables sont prévenus et la population est alertée — en quelques
> secondes, sans installation complexe.

---

## 2. Contexte et problématique

### 2.1 Contexte

Dans de nombreux systèmes de santé, les données de morbidité circulent lentement, sur papier ou
par téléphone, et restent cloisonnées par établissement. Au moment où une flambée épidémique
devient visible dans les statistiques nationales, il est souvent trop tard pour agir à faible
coût. Les populations, de leur côté, n'ont pas d'information fiable et localisée.

### 2.2 Problématique

> **Comment centraliser les données sanitaires de plusieurs hôpitaux, détecter rapidement les
> augmentations inhabituelles du nombre de cas de maladies, et informer à la fois les
> professionnels de santé et les populations concernées ?**

### 2.3 Réponse proposée

ÉpiWatch répond par cinq principes :

1. **Une base commune** alimentée par tous les établissements ;
2. **Une saisie simple**, adaptée au travail réel des agents ;
3. **Un calcul automatique** du niveau de gravité à partir de seuils configurables ;
4. **Une carte qui parle** : la couleur et la taille des marqueurs traduisent la gravité ;
5. **Une alerte qui se propage** de l'hôpital au district, puis à la région, jusqu'aux citoyens abonnés.

---

## 3. Objectifs

### 3.1 Objectif général

Concevoir une application web et mobile permettant de suivre l'évolution des cas de maladies
dans plusieurs établissements de santé, de visualiser leur répartition géographique et de
déclencher des alertes adaptées à la situation épidémiologique.

### 3.2 Objectifs spécifiques

| N° | Objectif | Indicateur de réussite |
|----|----------|------------------------|
| O1 | Permettre la saisie rapide des cas par un agent hospitalier | Un enregistrement en moins de 60 secondes |
| O2 | Centraliser les données de plusieurs établissements | ≥ 30 hôpitaux dans une base unique |
| O3 | Détecter automatiquement les hausses préoccupantes | Niveau d'alerte calculé sans intervention |
| O4 | Visualiser la situation sur une carte | Marqueurs colorés et dimensionnés par niveau |
| O5 | Alerter les responsables et le public | Notification reçue en < 5 secondes |
| O6 | Permettre une escalade locale → district → région | Alerte régionale automatique au-delà du seuil |
| O7 | Offrir une expérience mobile installable | PWA installable sur Android/iOS/desktop |

---

## 4. Public cible et rôles

ÉpiWatch distingue **cinq rôles** aux permissions croissantes.

| Rôle | Dénomination | Ce qu'il peut faire |
|------|--------------|---------------------|
| `agent` | Agent de saisie (infirmier) | Déclarer des cas **pour son seul hôpital**, consulter l'historique de ses saisies |
| `hospital_manager` | Responsable hospitalier (médecin/chef) | Saisir, consulter son établissement, acquitter les alertes le concernant |
| `regional_authority` | Autorité sanitaire régionale/départementale | Consulter toute sa région, acquitter et suivre les alertes |
| `admin` / `super_admin` | Administrateur | Gérer comptes, hôpitaux, maladies, seuils, configuration, données de démo |
| `public` | Citoyen | Consulter le niveau d'alerte public, **recevoir des notifications** pour les zones suivies |

**Comptes de démonstration** fournis (voir § 14.4).

---

## 5. Périmètre fonctionnel

Le périmètre se décompose en **quatre interfaces complémentaires**, réunies dans une même PWA.

### A. Tableau de bord / surveillance (autorités, administrateurs)
- Vue d'ensemble : nombre de patients actifs, nouveaux cas sur 7 jours, répartition par niveau.
- Carte interactive des 30 hôpitaux.
- Graphiques d'évolution (séries temporelles par maladie).
- Liste des alertes actives avec filtres (niveau, statut, zone).
- Rapports et export CSV.

### B. Carte interactive (tous rôles autorisés)
- Marqueurs localisés pour chaque hôpital.
- Couleur et taille du marqueur selon le niveau d'alerte.
- Infobulles : nom, district, région, maladie, nombre de patients, niveau.
- Filtres par maladie, région, niveau.
- Légende des 7 niveaux.

### C. Interface de saisie hospitalière (agents, responsables)
- Sélection automatique de l'hôpital de rattachement.
- Choix de la maladie, nombre de nouveaux cas, patients sous prise en charge, décès, guérisons.
- Enregistrement et correction d'une saisie avec **traçabilité** (journal d'audit).
- Historique des déclarations et horodatage.

### D. Alerte et notification (responsables + public)
- Notifications **dans l'application** en temps réel (flux SSE + bandeaux).
- Notifications système du navigateur (PWA) lorsque disponible.
- Choix de la **zone géographique à suivre** et du niveau minimal d'intérêt.
- Conseils de prévention validés pour chaque maladie.

### Hors périmètre de la version 1
- Nominalité des patients (aucune donnée personnelle de santé).
- Application mobile native (Flutter / React Native).
- Notifications push via serveur tiers (FCM) en production.
- Interopérabilité avec un système national d'information sanitaire (DHIS2, etc.).

---

## 6. Description des fonctionnalités

### 6.1 Parcours de saisie
1. L'agent se connecte (son hôpital est déduit de son compte).
2. Il sélectionne la maladie.
3. Il renseigne : nouveaux cas, patients sous prise en charge, décès, guérisons.
4. À la validation, le serveur recalcule immédiatement les niveaux d'alerte.
5. Les autres interfaces connectées sont mises à jour **instantanément** (flux temps réel).

### 6.2 Calcul et affichage du niveau
- Le niveau est calculé à partir des **patients sous prise en charge** (indicateur de charge
  réel), avec repli sur la **somme des nouveaux cas** d'une fenêtre glissante (7 jours par défaut).
- La carte intensifie la couleur et la taille du marqueur en conséquence.

### 6.3 Déclenchement des alertes
- Un enregistrement franchissant un seuil crée ou rehausse une **alerte**.
- Une alerte **résolue** est close automatiquement lorsque l'indicateur redescend.

### 6.4 Notification des utilisateurs
- Les responsables reçoivent **toutes** les alertes de leur périmètre.
- Les abonnés (public) reçoivent **uniquement** les alertes touchant une zone qu'ils suivent,
  à partir du niveau minimal choisi.

### 6.5 Administration
- Gestion des comptes (création, activation/désactivation, rôle, rattachement).
- Gestion des hôpitaux et maladies.
- **Configuration des seuils** par maladie (6 seuils → 7 niveaux).
- Configuration de l'escalade (nombre d'hôpitaux, niveau déclencheur).
- Journal d'audit de toutes les actions sensibles.
- Outils de démonstration : simulation d'une flambée, scénario épidémique, réinitialisation.

---

## 7. Le système d'alerte à sept niveaux

Le cœur du projet : **sept niveaux**, chacun associé à une couleur, une signification et une action.

| Niveau | Couleur | Signification | Action attendue |
|:------:|---------|---------------|-----------------|
| **0** | 🔵 Bleu | Aucun signal préoccupant | Surveillance habituelle |
| **1** | 🟢 Vert | Situation stable | Poursuivre la surveillance |
| **2** | 🟡 Jaune | Signal à surveiller | Vérifier les données et suivre l'évolution |
| **3** | 🟠 Orange | Hausse préoccupante | Informer les responsables, renforcer la vigilance |
| **4** | 🔴 Rouge léger | Alerte élevée | Évaluation rapide par les responsables sanitaires |
| **5** | 🔴 Rouge | Situation critique | Coordination et intervention selon protocoles |
| **6** | 🟥 Rouge foncé | Alerte majeure | Escalade vers les autorités compétentes |

### 7.1 Principe des seuils

Chaque maladie possède **six seuils configurables** (`min_active`) qui séparent les niveaux 1 à 6.
Un niveau est atteint dès que l'indicateur dépasse le seuil correspondant.

> **Point d'attention :** dix cas dans un petit centre de santé et dix cas dans un grand hôpital
> central ne représentent pas la même situation. C'est pourquoi les seuils sont **par maladie** et
> **entièrement configurables** par l'administrateur. Dans un déploiement réel, ils seraient
> définis ou validés par des professionnels de santé.

### 7.2 Indicateur retenu

| Paramètre | Valeur par défaut | Description |
|-----------|-------------------|-------------|
| `window_days` | 7 | Fenêtre glissante pour la somme des nouveaux cas |
| `threshold_basis` | `under_care` | Base du calcul (charge réelle) |
| `persist_min_level` | 2 | Niveau minimal conservé dans l'historique |

---

## 8. Logique d'escalade

L'alerte **se propage** du niveau local au niveau régional selon des règles configurables.

```
                ┌──────────────────────────────┐
                │  Hôpital franchit un seuil    │──► Alerte LOCALE
                └──────────────────────────────┘
                               │  agrégation par district
                               ▼
                ┌──────────────────────────────┐
                │  ≥ 2 hôpitaux du district     │──► Alerte de DISTRICT
                │  au niveau 5 ou plus          │
                └──────────────────────────────┘
                               │  agrégation par région
                               ▼
                ┌──────────────────────────────┐
                │  ≥ 5 hôpitaux de la région    │──► Alerte RÉGIONALE
                │  au niveau 5 ou plus          │
                └──────────────────────────────┘
                               │
                               ▼
                Niveau 6 sur un hôpital ──► escalade immédiate
```

| Règle | Paramètre | Valeur par défaut |
|-------|-----------|-------------------|
| Escalade district | `escalation.district` | ≥ 2 hôpitaux, niveau ≥ 5 |
| Escalade région | `escalation.region` | ≥ 5 hôpitaux, niveau ≥ 5 |
| Escalade immédiate | niveau 6 | toute portée (hôpital, district, région) |

Le système compte les **établissements distincts** concernés, et non le nombre total de cas.
Une autorité habilitée peut **acquitter** ou **clore** une alerte ; une alerte rehaussée est
automatiquement repassée en « non acquittée ».

---

## 9. Modèle de données

Base **SQLite** (via le module natif `node:sqlite`), en mode WAL.

| Table | Rôle |
|-------|------|
| `zones` | Découpage administratif hiérarchique : régions → districts |
| `hospitals` | Nom, code, type, coordonnées (lat/long), district, région |
| `diseases` | Maladies suivies (code, nom FR/EN, couleur) |
| `thresholds` | Six seuils par maladie (niveau → `min_active`) |
| `case_reports` | Déclarations : nouveaux cas, patients sous prise en charge, décès, guérisons, par hôpital / maladie / date |
| `alerts` | Alertes : portée (hôpital/district/région), niveau, statut, message, action |
| `users` | Comptes, rôles, hôpital ou zone de rattachement |
| `subscriptions` | Zones suivies et niveau minimal par utilisateur |
| `notifications` | Notifications générées par alerte et par destinataire |
| `audit_log` | Traçabilité de toutes les actions sensibles |
| `settings` | Configuration globale (fenêtre, escalade, niveaux) |

> **Distinction essentielle :** les **nouveaux cas** (par période) sont distingués des
> **patients sous prise en charge** (stock actuel), afin d'éviter de compter plusieurs fois le
> même patient dans les statistiques.

Le schéma complet et les index sont définis dans `server/src/db.js`.

---

## 10. Architecture technique

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                          CLIENTS (PWA)                           │
   │  Navigateur desktop   ·   Téléphone installé   ·   Tablette       │
   │            React 18 + Vite + Leaflet + Recharts                  │
   └───────────────┬──────────────────────────────┬───────────────────┘
                   │  REST (JSON)                 │  SSE (/api/stream)
                   ▼                              ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                     SERVEUR  (Node.js + Express)                 │
   │  Authentification · API REST · Bus temps réel · Calcul d'alertes │
   │  Sert également le front (web/dist) et le manifeste PWA          │
   └───────────────────────────────┬──────────────────────────────────┘
                                   │  node:sqlite (WAL)
                                   ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                     BASE SQLite  (epiwatch.db)                   │
   └──────────────────────────────────────────────────────────────────┘
```

### 10.1 Choix technologiques

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Front-end | **React 18 + Vite** | Démarrage rapide, écosystème riche, HMR |
| Cartographie | **Leaflet + OpenStreetMap** | Libre, léger, marqueurs personnalisables |
| Graphiques | **Recharts** | Intégration React simple |
| PWA | **Manifeste + Service Worker** | Installable, hors-ligne partiel |
| Back-end | **Node.js 24 + Express 4** | Écosystème JS unifié, léger |
| Base | **SQLite (`node:sqlite`)** | Zéro dépendance native, fichier unique, portable |
| Temps réel | **SSE (Server-Sent Events)** | Simplicité, fonctionne en HTTP clair sur LAN |
| Auth | **HMAC + scrypt** | Jetons signés, mots de passe salés |
| HTTPS | **selfsigned** (option `--secure`) | Certificat auto-signé pour le contexte sécurisé |

> **Pourquoi SQLite local plutôt que Supabase ?** Pour la démonstration devant le jury, une base
> **embarquée dans le serveur** supprime toute dépendance à Internet : le prototype fonctionne sur
> le réseau local de la salle, de façon déterministe et hors-ligne. Le passage à PostgreSQL /
> Supabase en production ne change pas le modèle de données.

### 10.2 Temps réel

- **Primaire :** flux **SSE** sur `/api/stream` — l'application reçoit les mises à jour sans
  rechargement. Cela fonctionne en **HTTP simple** sur le réseau local (aucun certificat requis).
- **Complément :** **notifications système** via l'API Notification du navigateur, activables
  en contexte sécurisé (`https` ou `localhost`).
- **Repli :** interrogation périodique (polling) si le flux temps réel est indisponible.

### 10.3 Structure du projet

```
epiwatch/
├── package.json              # scripts racine (dev, build, start, seed)
├── server/                   # API + base + temps réel
│   ├── src/
│   │   ├── index.js          # point d'entrée (serveur + statique + SPA)
│   │   ├── config.js         # constantes, niveaux, rôles
│   │   ├── db.js             # schéma + utilitaires de requête
│   │   ├── auth.js           # hachage, jetons, middlewares
│   │   ├── realtime.js       # bus SSE
│   │   ├── alerts.js         # calcul situation + alertes + escalade
│   │   ├── helpers.js        # validateurs, audit, référentiels
│   │   ├── api.js            # routes REST
│   │   └── seed.js           # jeu de données de démonstration
│   └── scripts/              # e2e.mjs, sse-test.mjs, inspect.mjs
├── web/                      # PWA React
│   ├── src/{pages,components,lib,i18n,styles}
│   ├── public/{manifest.webmanifest,sw.js,icons}
│   └── scripts/make-icons.mjs
└── docs/                     # ce cahier de charges + présentation
```

---

## 11. Interface et expérience utilisateur

### 11.1 Principes

- **Responsive** : grille desktop à partir de 1024 px, navigation inférieure sur mobile.
- **Thèmes** clair et sombre.
- **Bilingue** : français et anglais, sélection de la langue dans l'interface.
- **Accessibilité** : contrastes élevés, libellés explicites, niveaux indiqués par couleur **et** par numéro.

### 11.2 Écrans principaux

| Écran | Rôle principal | Contenu clé |
|-------|----------------|-------------|
| Connexion | tous | Formulaire + inscription citoyen |
| Tableau de bord | autorités | Indicateurs, mini-graphiques, alertes récentes |
| Carte | autorités, public | 30 marqueurs, filtres, légende |
| Saisie | agents | Formulaire d'enregistrement + historique |
| Alertes | autorités | Liste, filtres, acquittement |
| Rapports | autorités | Graphiques, export CSV |
| Notifications | tous | Centre de notifications, abonnements |
| Administration | admin | Utilisateurs, seuils, configuration, démo |
| Espace public | public | Niveau d'alerte local, conseils de prévention |

### 11.3 PWA

- Manifeste (`manifest.webmanifest`) : icônes 192/512/maskable, mode `standalone`, thème.
- Service Worker : mise en cache des ressources statiques.
- Bandeau de connexion : indique l'état du flux temps réel.

---

## 12. Sécurité et confidentialité

### 12.1 Sécurité applicative

- Mots de passe **hachés avec scrypt** (sel unique par compte).
- Sessions par **jeton HMAC** signé, expiration 7 jours.
- **Contrôle d'accès par rôle** (RBAC) sur chaque route sensible.
- **Cloisonnement par hôpital** : un agent ne peut saisir que pour son établissement.
- **Journal d'audit** horodaté de toutes les actions sensibles (saisie, modification, admin).
- En-têtes CORS maîtrisés ; option HTTPS auto-signé pour le contexte sécurisé.

### 12.2 Confidentialité des données

- **Aucune donnée personnelle de patient** n'est stockée : uniquement des **comptages agrégés**.
- Les données de la démonstration sont **entièrement fictives**.
- Un déploiement réel exigerait : règles de confidentialité, gestion fine des droits, sécurité
  du transport, et validation des déclarations par les autorités compétentes.

---

## 13. Exigences non fonctionnelles

| Exigence | Cible |
|----------|-------|
| **Performance** | Mise à jour temps réel perçue en < 5 s ; carte fluide avec 30+ marqueurs |
| **Disponibilité** | Fonctionnement **hors-ligne** sur réseau local (démonstration) |
| **Portabilité** | Un poste serveur + navigateurs modernes (Chrome, Firefox, Edge, Safari) |
| **Ergonomie** | Saisie en < 60 s ; navigation mobile en un pouce |
| **Internationalisation** | FR + EN complets |
| **Maintenabilité** | Modules serveur séparés, composants React réutilisables, tests automatisés |
| **Qualité** | Suite de tests d'intégration bout-en-bout (38 vérifications) |

---

## 14. Jeu de données de démonstration

### 14.1 Échelle géographique
**Plusieurs régions du Cameroun** — 8 régions, 16 districts, **30 hôpitaux réels** avec
leurs **coordonnées géographiques réelles** (données de cas fictives).

### 14.2 Maladies suivies
Choléra · COVID-19 · Paludisme · Typhoïde · **Autres maladies** (5 au total, 6 seuils chacune).

### 14.3 Historique
**56 jours** de déclarations quotidiennes (≈ 8 400 lignes), générées de façon **déterministe**
(PRNG à graine fixe : `20261022`) afin que chaque démonstration soit identique.

### 14.4 Comptes de démonstration

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| `admin@epiwatch.cm` | `Admin@2026` | super_admin |
| `autorite@epiwatch.cm` | `Autorite@2026` | autorité régionale |
| `chef.douala@epiwatch.cm` | `Chef@2026` | responsable hospitalier |
| `infirmier.douala@epiwatch.cm` | `Agent@2026` | agent de saisie |
| `infirmier.yaounde@epiwatch.cm` | `Agent@2026` | agent de saisie |
| `infirmier.bafoussam@epiwatch.cm` | `Agent@2026` | agent de saisie |
| `public@epiwatch.cm` | `Public@2026` | citoyen (abonné Littoral) |

**Scénario initial seedé :** une flambée de **choléra dans le Wouri (Douala)** — 6 hôpitaux aux
niveaux 5/6, entraînant une **alerte régionale Littoral** de niveau 6.

---

## 15. Scénario de démonstration

> Script détaillé : voir `docs/Guide_de_demonstration.md`.

**Déroulé en 5 minutes :**

1. **Connexion** du responsable régional → tableau de bord.
2. **Carte** : montrer la flambée de choléra à Douala (marqueurs rouges/rouge foncé).
3. **Scène de saisie** : l'agent d'un hôpital encore calme déclare une hausse → le marqueur
   change de couleur, une alerte apparaît, un bandeau temps réel s'affiche sur l'autre écran.
4. **Escalade** : plusieurs hôpitaux franchissent le seuil → alerte de district, puis régionale.
5. **Notification publique** : un téléphone installé (compte citoyen) reçoit la notification et
   affiche le conseil de prévention.

---

## 16. Planning de réalisation

| Étape | Livrable | Statut |
|-------|----------|--------|
| 01 — Prototype visuel | Tableau de bord, carte, marqueurs, écrans mobiles | ✅ Réalisé |
| 02 — Base de données & authentification | Schéma, comptes, rôles | ✅ Réalisé |
| 03 — Saisie & synchronisation | Enregistrement, mise à jour temps réel | ✅ Réalisé |
| 04 — Système d'alertes | Calcul, escalade, alertes locales/régionales | ✅ Réalisé |
| 05 — Notifications & installation | PWA, notifications, abonnements | ✅ Réalisé |
| 06 — Tests & documentation | 38 tests e2e, cahier de charges, présentation | ✅ Réalisé |

---

## 17. Évolutions envisagées

- Base **PostgreSQL / Supabase** et hébergement cloud.
- **Notifications push** via Firebase Cloud Messaging.
- Application **native** (Flutter / React Native).
- **Détection d'anomalies** statistique (au-delà des seuils fixes).
- **Interopérabilité** DHIS2 / systèmes nationaux.
- **Séries saisonnières** et prévisions.
- Rôles et délégations plus fins, validation multi-niveaux des déclarations.

---

## 18. Limites et hypothèses

- Les **seuils** de la démonstration sont **fictifs** et ne reflètent pas une doctrine médicale.
- Les données de cas sont **entièrement synthétiques** ; les hôpitaux et coordonnées, eux, sont réels.
- Le prototype vise une échelle de **démonstration** (30 hôpitaux), non la montée en charge nationale.
- Les notifications système dépendent des autorisations du navigateur et du contexte sécurisé.
- HTTPS reposant sur un certificat **auto-signé** : à remplacer par un certificat valide en production.

---

*Document de référence du projet ÉpiWatch — Concours INNOVA.*
