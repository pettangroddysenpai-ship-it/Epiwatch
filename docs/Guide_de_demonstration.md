# ÉpiWatch — Guide de démonstration

> Script de présentation devant le jury du concours INNOVA.
> Durée cible : **5 à 7 minutes** de démonstration en direct.

---

## 1. Avant la démonstration (à faire la veille)

### 1.1 Matériel

| Élément | Rôle |
|---------|------|
| **1 ordinateur portable** (serveur + écran principal) | Héberge l'application et la base |
| **1 ordinateur ou navigateur secondaire** | Montre la synchronisation temps réel (« côté agent ») |
| **1 téléphone Android/iOS** | Montre la réception des alertes (PWA installée) |
| **1 routeur / partage de connexion** | Le réseau local commun (pas besoin d'Internet) |

> Tous les appareils doivent être sur le **même réseau local**.

### 1.2 Préparation initiale (une seule fois)

```powershell
# 1. Installer les dépendances
npm run install:all

# 2. Initialiser la base de démonstration (données fictives)
npm run seed
```

### 1.3 Lancement le jour J

Sur l'ordinateur portable :

```powershell
npm run start
```

Le serveur affiche une adresse du type :

```
┌────────────────────────────────────────────┐
│  ÉpiWatch  —  serveur démarré               │
│  Local   : http://localhost:4000            │
│  Réseau  : http://192.168.1.42:4000   ← à ouvrir sur le téléphone
└────────────────────────────────────────────┘
```

1. **Écran principal** : ouvrir `http://localhost:4000`.
2. **Écran secondaire** : ouvrir `http://<IP-LAN>:4000`.
3. **Téléphone** : ouvrir `http://<IP-LAN>:4000` puis « **Ajouter à l'écran d'accueil** »
   pour l'installer comme application.

### 1.4 Vérifications avant l'entrée du jury

- [ ] La carte affiche **30 marqueurs**.
- [ ] La **flambée de choléra à Douala** est visible (marqueurs rouges et rouge foncé).
- [ ] Une alerte **régionale Littoral** de niveau 6 est présente.
- [ ] Les trois écrans affichent le **bandeau « connecté »** (flux temps réel actif).
- [ ] Le téléphone peut se connecter avec `public@epiwatch.cm` / `Public@2026`.

---

## 2. Comptes à utiliser

| Écran | Compte | Mot de passe | Rôle |
|-------|--------|--------------|------|
| Écran principal | `autorite@epiwatch.cm` | `Autorite@2026` | Autorité régionale |
| Écran secondaire | `infirmier.bafoussam@epiwatch.cm` | `Agent@2026` | Agent de saisie (Bafoussam) |
| Téléphone | `public@epiwatch.cm` | `Public@2026` | Citoyen abonné au Littoral |
| (option) Administration | `admin@epiwatch.cm` | `Admin@2026` | Super administrateur |

---

## 3. Script de démonstration

### Étape 0 — Introduction (30 s)

> *« ÉpiWatch centralise les déclarations de cas de plusieurs hôpitaux, détecte automatiquement
> les hausses préoccupantes, les affiche sur une carte interactive et alerte les responsables
> ainsi que la population — en temps réel. »*

*(Montrer la carte avec la flambée déjà active.)*

---

### Étape 1 — Connexion et tableau de bord (45 s)

1. Sur l'**écran principal**, se connecter comme **autorité régionale**.
2. Montrer le **tableau de bord** : patients actifs, nouveaux cas sur 7 jours, répartition par niveau.
3. Attirer l'attention sur les **compteurs d'alertes** (actives, critiques, régionales).

> *« La région vit actuellement une flambée de choléra dans le Wouri. »*

---

### Étape 2 — La carte qui parle (60 s)

1. Ouvrir l'onglet **Carte**.
2. Montrer les marqueurs **pulsants** autour de Douala, en rouge et rouge foncé.
3. Cliquer sur un marqueur : l'infobulle indique hôpital, district, maladie, nombre de patients, niveau.
4. Utiliser le **filtre par maladie** : ne garder que le **choléra**.
5. Montrer la **légende des 7 niveaux**.

> *« La couleur et la taille du marqueur traduisent le niveau d'alerte : le bleu est normal,
> le rouge foncé est une alerte majeure. »*

---

### Étape 3 — La saisie qui déclenche tout (90 s)

Se placer devant les **deux écrans côte à côte**.

1. Sur l'**écran secondaire** (Bafoussam, encore calme), se connecter comme **agent**.
2. Ouvrir **Saisie**, choisir **Choléra**, saisir des chiffres élevés (ex. **400 nouveaux cas**,
   **1 500 patients sous prise en charge**).
3. **Valider.**
4. **Observer simultanément :**
   - L'**écran secondaire** confirme l'enregistrement.
   - L'**écran principal** affiche un **bandeau temps réel** et le marqueur de Bafoussam change de couleur.
   - La liste des **alertes** se met à jour sans rechargement.

> *« Aucun rechargement : les données circulent en quelques secondes via le flux temps réel. »*

---

### Étape 4 — Escalade locale → district → région (60 s)

1. Sur l'écran principal, **répéter la saisie** pour **plusieurs hôpitaux** de la région
   (ou utiliser le bouton **Simuler une flambée** / **Scénario** de l'administration).
2. Montrer l'apparition successive :
   - **alerte locale** (hôpital),
   - **alerte de district** (plusieurs hôpitaux),
   - **alerte régionale** (au-delà de 5 hôpitaux au niveau critique).

> *« Le système compte les établissements distincts : au-delà du seuil configurable, toute la
> région bascule en alerte. Les règles sont entièrement paramétrables. »*

---

### Étape 5 — L'alerte jusqu'au citoyen (60 s)

1. Prendre le **téléphone** (compte citoyen abonné au **Littoral**).
2. Montrer la **notification** reçue (bandeau dans l'application, et notification système si activée).
3. Ouvrir l'**espace public** : niveau d'alerte local et **conseils de prévention**.

> *« La population concernée est alertée automatiquement, avec les gestes de prévention validés. »*

---

### Étape 6 — Administration et configuration (30 s, optionnel)

1. Se connecter comme **administrateur**.
2. Montrer la **configuration des seuils** par maladie et les **règles d'escalade**.
3. Évoquer le **journal d'audit** (traçabilité de chaque action).

> *« Les seuils sont configurables par maladie : dix cas ici et dix cas dans un grand centre
> hospitalier ne représentent pas la même situation. »*

---

### Étape 7 — Conclusion (30 s)

> *« ÉpiWatch est une PWA unique, installable sur les postes des hôpitaux et les téléphones,
> fonctionnant même sans Internet sur un réseau local. La base, le temps réel et le moteur
> d'alertes sont opérationnels, avec 38 tests d'intégration validés. »*

---

## 4. Réinitialiser avant/après une répétition

Pour repartir d'un état propre identique :

```powershell
# Depuis l'administration de l'application (bouton « Réinitialiser »)
# OU en ligne de commande (serveur arrêté) :
npm run seed
```

Le jeu de données est **déterministe** (graine fixe) : la démonstration se reproduit à l'identique.

---

## 5. Scénarios de secours

| Situation | Solution |
|-----------|----------|
| Le flux temps réel ne s'affiche pas | Vérifier le réseau local ; l'application bascule automatiquement en interrogation périodique |
| Le téléphone ne se connecte pas | Utiliser l'**IP LAN** exacte imprimée par le serveur ; vérifier le pare-feu (autoriser le port 4000) |
| Les notifications système n'apparaissent pas | Elles exigent un contexte sécurisé : utiliser `npm run start:secure` ou `localhost` |
| Base corrompue ou état inattendu | `npm run seed` (réinitialisation déterministe) |
| Un écran reste figé | Recharger la page : la session est conservée |

---

## 6. Points forts à souligner devant le jury

1. **Temps réel réel** — synchronisation instantanée entre plusieurs appareils, pas une maquette.
2. **Escalade automatique** — hôpital → district → région, avec seuils configurables.
3. **Fonctionne hors-ligne** sur réseau local — aucune dépendance à Internet pour la démo.
4. **Une seule PWA** pour le desktop et le mobile — pas deux applications à maintenir.
5. **Sécurité** — rôles, cloisonnement par hôpital, mots de passe hachés, journal d'audit.
6. **Qualité** — 38 tests d'intégration bout-en-bout validés.
7. **Bilingue FR / EN**.

---

*Bon courage pour la présentation !*
