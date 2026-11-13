# Architecture

Application web statique (PWA), sans compilation ni serveur : HTML + CSS + JavaScript « classique ». Aucune bibliothèque tierce. Hébergée sur GitHub Pages.

## Fichiers

```
index.html, style.css   Interface (en-tête des scores, plateau de 4 rangées, zone de main, fenêtres modales, bannière « Hors ligne »)
engine.js               Règles pures : paquet, têtes de bœuf, choix de rangée, pose, robots (window.Engine)
en-ligne.js             Brique commune « En ligne » (copie de celle de Skyjo) : connexion, parties, synchro (window.EnLigne)
game.js                 Déroulement de la partie, écrans, mode solo et mode en ligne
sw.js, manifest.webmanifest, icons/   PWA / hors ligne (cache `6quiprend-vN`, à incrémenter avec APP_VERSION de game.js)
tests/e2e/en_ligne.py   Deux appareils simulés (Chromium) + faux Supabase en mémoire
tests/e2e/solo.py       Essai de fumée : une manche contre l'ordinateur
```

Ordre de chargement : `engine.js`, `en-ligne.js`, `game.js`.

## Moteur

`heads(n)` (têtes de bœuf d'une carte), `targetRow(rows, carte)` (rangée visée, -1 si la carte est plus petite que toutes), `place(rows, carte, rangéeChoisie)` (pose, ramassage éventuel, pénalité), `botPick`, `botRow`, `newDeck`, `shuffle`. `ROW_MAX` = 5.

## Mode solo

Boucle asynchrone `run()` / `playTurn()` : l'humain choisit sa carte (`askPick`), les robots aussi, puis les cartes sont posées de la plus petite à la plus grande avec animations. Sauvegarde locale à chaque tour (`6qp.save.v1`).

## Mode en ligne

Fournisseur : Supabase (projet « plan-du-jour », table `parties`, accès réservé aux comptes connectés). Jeu : `6quiprend`. Session partagée `foyer_session_v1`.

**Particularité : tout le monde joue en même temps.** On ne peut donc pas se contenter de recopier l'état à tour de rôle. Le partage est le suivant :

- **L'hôte (siège 0) possède l'état et le publie en entier** (`publish()` → `flush()`), avec contrôle de version. Il pilote seul la résolution (`hostRun()`) : choix des robots, attente des cartes des humains, révélation, pose carte par carte, ramassage, fin de manche, nouvelle donne.
- **L'invité n'envoie que des actions** (`guestOp`) : `join`, `pick` (sa carte), `answer` (la rangée à ramasser), `next` (manche suivante / rejouer). Chaque action est appliquée sur le dernier état du serveur (`applyOps`) puis écrite avec contrôle de version ; en cas de conflit on relit et on recommence. Une action est idempotente (ignorée si elle n'a plus de sens). Elle est aussi appliquée tout de suite à l'écran.
- **L'hôte reprend les champs de l'invité** (`absorb`) quand le serveur a une version plus récente que la sienne : cartes choisies, réponse de rangée, « manche suivante », arrivée de l'invité.
- **Les deux appareils affichent le même état** (`onlineRender`) : plateau, ordre de révélation (`G.cue`), message d'état, main, fenêtre de fin de manche. Les animations de l'invité suivent les publications de l'hôte.

Champs de partie en ligne : `G.mode = 'online'`, `G.phase` (`pick` | `reveal` | `ask` | `roundend` | `over`), `G.cue` (ordre, avancement, surbrillance, message), `G.ask` / `G.answer` (rangée à choisir), `G.next` (choix de fin de manche), `G.online = {uids:[hôte, invité|null], joined}`, `players[i].picked` (carte choisie).

**Reprise** : la boucle de l'hôte est reprenable. La résolution d'un tour publie son avancement (`cue.done`) ; les mains ne sont retirées qu'à la fin du tour ; après rechargement, l'hôte continue où il en était (une question de rangée est reposée).

**Hors ligne** : la bannière `#offbar` (`pointer-events:none`) apparaît ; la carte choisie par l'invité reste affichée et part au retour du réseau (réessai toutes les 2 s). Si l'hôte est hors ligne, la partie s'arrête pour tous jusqu'à son retour.

**Mains cachées** : toutes les mains sont dans la ligne ; l'interface n'affiche que la sienne. Choix assumé (confiance).

## Sauvegardes (localStorage)

| Clé | Contenu |
|---|---|
| `6qp.save.v1` | partie solo en cours |
| `6qp.settings.v1` | mode, robots, objectif, prénoms, animations rapides |
| `6qp.online.v1` | partie en ligne → siège de cet appareil |
| `foyer_session_v1` | session de connexion (partagée entre les jeux) |
