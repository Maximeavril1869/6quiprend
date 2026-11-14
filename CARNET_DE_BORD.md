# Carnet de bord

Journal des opérations du projet, pour pouvoir le reprendre sans rien perdre.

## État courant

- Modes : contre l'ordinateur et **en ligne** (2 humains sur 2 appareils + robots). Passe-passe et face à face supprimés.
- Version 4 (plateau). Testé en navigateur simulé uniquement ; l'en ligne n'a pas encore été essayé sur de vrais appareils pour ce jeu.

## À faire

- Essayer l'en ligne sur de vrais appareils (iPhone / iPad / téléphone Android) et corriger ce qui sort des essais.
- Essayer le plateau sur un vrai iPad avec deux téléphones, et vérifier que le vrai Supabase accepte la ligne `jeu = 'plateau'` (les téléphones gardent la table sinon).
- Limite connue : si l'appareil de l'hôte est hors ligne ou fermé, la partie est figée pour l'invité jusqu'au retour de l'hôte (c'est lui qui joue les robots et fait avancer les tours).
- Déployer ensuite l'en ligne dans Flip 7, Le Contrat, Bataille navale, EnqueteManoir.

## Historique avant 2026-11-12

Jeu complet en local : modes ordinateur, passe-passe et face à face, 2 à 10 joueurs, partie à 66 ou manche unique, sauvegarde à chaque tour, PWA hors ligne, licence « Tous droits réservés ». Ce carnet n'existait pas : historique reconstitué à partir des commits.

## 2026-11-12 — Mode « En ligne » (version 2)

Décisions de l'auteur : seulement les jeux à plusieurs ; 2 humains maximum, ordinateurs possibles ; l'en ligne remplace passe-passe et face à face ; mains cachées par confiance.

Choix technique : ce jeu se joue **simultanément** (tout le monde choisit sa carte en même temps). L'hôte possède et publie l'état, l'invité envoie des actions (carte, rangée, manche suivante) appliquées sur le dernier état du serveur ; voir `ARCHITECTURE.md`.

Opérations :

1. `en-ligne.js` copié de Skyjo ; bannière `#offbar` ; `sw.js` en `6quiprend-v2`.
2. `game.js` : modes réduits à solo / en ligne ; menu avec connexion, création, code, parties en cours, version ; suppression de `handover` et du face à face ; `summaryBody()` extrait pour servir au solo et à l'en ligne ; bloc En ligne (`publish`, `flush`, `absorb`, `guestOp`, `applyOps`, `onlineRender`, `hostRun`, création / jonction / reprise).
3. `window.QP_SPEED` pour accélérer les animations en test.
4. Tests : `tests/e2e/en_ligne.py` (36 vérifications : connexion, code inconnu, 3e personne refusée, choix simultanés, hors ligne puis envoi, reprise, manche complète identique des deux côtés, manche suivante pressée par l'invité, suppression) et `tests/e2e/solo.py`.
5. Défaut trouvé par les tests et corrigé : après « Reprendre », le menu restait affiché au-dessus de la partie.
6. Création de ce carnet et de `ARCHITECTURE.md`.

## Version 3 (13/11/2026)
- Service worker : les requêtes d'une autre origine (Supabase) ne passent plus par le cache (avant, une coupure réseau était masquée par `index.html`).

## Version 4 (13/11/2026) — Plateau

Décisions de l'auteur : le plateau (iPad en affichage commun, personne ne joue dessus) est indispensable pour les jeux à main cachée ; quand il est branché, le téléphone cache la table commune et garde la main + ses boutons ; pas de mode facile pour ce jeu.

Opérations :

1. `game.js` : plateau en lecture seule (`plateauStart`, `plRender`, `plRemote`, `plStatus`, `plStop`, `plMenu`) qui réutilise l'affichage existant ; signe de vie dans une ligne séparée `jeu = 'plateau'` (`plBeat`) pour ne jamais entrer en conflit avec l'hôte qui publie l'état ; détection côté téléphone (`platWatch`, `noTable`) ; la carte se choisit toujours dans la main ; quand la table est cachée, la rangée à ramasser se choisit par 4 boutons (`rowButtons`) ; bouton de secours « Afficher la table » / « Masquer la table ».
2. `style.css` : `body.plateau` (cartes agrandies, textes plus grands), `#app.notable`, `.rowbtns`.
3. Tests : `tests/e2e/en_ligne.py` passe à 60 vérifications (plateau, masquage et retour de la table, plateau fermé sans prévenir puis rouvert, fin de manche sur le plateau, choix de rangée par boutons dans une partie neuve). Les clics du script sont devenus tolérants (éléments visibles, délai court) : la page se redessine souvent et l'ancienne version se bloquait parfois. Exécuté 6 fois en parallèle sans échec.
4. `APP_VERSION` 4, cache `6quiprend-v4`.

## 2026-11-14 — livraison v5 : marge haute iPhone + correctif de cache
1. En-tête descendu sous la zone floutée d'iOS (iPhone, appli installée) : marge haute supplémentaire (même principe que 5 Rois v15, à valider sur l'appareil de l'auteur).
2. Cache : fichiers versionnés `?v=5` dans index.html et sw.js, installation du service worker avec `cache: 'reload'`, requêtes avec `cache: 'no-cache'`, réseau d'abord puis cache hors ligne. Version et nom du cache incrémentés ensemble.
3. Tests e2e OK.

## 2026-11-14 — Version 6 : en-tête sous la zone floutée d'iOS, cache
1. Alignement sur 5 Rois v15 (validé sur iPhone 16e) : barre d'état `apple-mobile-web-app-status-bar-style` = `default` ; marge haute 34 px sous la zone sûre, pour que le titre sorte de la zone floutée d'iOS (~75 pt).
2. `APP_VERSION` 6, cache `6quiprend-v6`, scripts `?v=6`.
3. Le réglage de barre d'état n'est lu qu'à l'installation : supprimer l'icône de l'écran d'accueil puis la rajouter depuis Safari.
4. Tests : moteur + e2e en ligne (60) + solo OK.

## 2026-11-14 — Version 7 : marge haute alignée
1. Marge haute 34 px → 28 px, comme les autres jeux (demande de l'auteur).
2. `APP_VERSION` 7, cache `6quiprend-v7`, scripts `?v=7`. Tests : e2e en ligne + solo OK.
