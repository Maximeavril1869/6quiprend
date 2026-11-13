# Carnet de bord

Journal des opérations du projet, pour pouvoir le reprendre sans rien perdre.

## État courant

- Modes : contre l'ordinateur et **en ligne** (2 humains sur 2 appareils + robots). Passe-passe et face à face supprimés.
- Version 2. Testé en navigateur simulé uniquement ; l'en ligne n'a pas encore été essayé sur de vrais appareils pour ce jeu.

## À faire

- Essayer l'en ligne sur de vrais appareils (iPhone / iPad / téléphone Android) et corriger ce qui sort des essais.
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
