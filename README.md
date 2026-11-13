# 6 qui prend

Le jeu de cartes **6 qui prend**, jouable en local dans le navigateur, installable comme une app (PWA) et utilisable hors ligne.

## Modes

- **Contre l'ordi** : toi contre 1 à 9 robots.
- **En ligne** : 2 humains, chacun sur son appareil (iPhone, iPad, téléphone Android…), plus 0 à 8 robots pour compléter la table. Il faut un compte (le même que pour les autres applications) ; on crée une partie, on reçoit un code à 4 lettres, l'autre joueur le tape. Chacun ne voit que sa main (masquée à l'écran, pas chiffrée : le jeu repose sur la confiance entre les deux joueurs).

Les anciens modes « passe-passe » et « face à face » ont été remplacés par l'en ligne.

**Plateau** : un iPad peut s'afficher en « plateau » (menu → En ligne → saisir le code → « Ouvrir comme plateau ») : affichage commun en lecture seule, personne ne joue dessus (les 4 rangées, les cartes révélées dans l'ordre, les scores, les résultats de fin de manche). Tant qu'un plateau est branché, les téléphones cachent la table commune et ne gardent que la main du joueur et ses boutons ; si une carte est trop petite, la rangée à ramasser se choisit avec 4 boutons. Un bouton « Afficher la table » reste disponible. Si le plateau disparaît, la table revient toute seule après ~30 s.

De 2 à 10 joueurs au total. Fin de partie : *partie à 66* (on enchaîne les manches) ou *une seule manche*.
La partie en cours est sauvegardée à chaque tour (bouton « Reprendre » dans le menu ☰).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html`, `style.css` | Interface |
| `engine.js` | Règles et robots (sans dépendance au DOM) |
| `en-ligne.js` | Brique commune « En ligne » (connexion, parties, synchro) |
| `game.js` | Déroulement de la partie et écrans |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA / hors ligne |

Aucune dépendance, aucun build : ouvre `index.html` ou sers le dossier avec n'importe quel serveur statique.

## Publier sur GitHub Pages

```bash
git init
git add .
git commit -m "6 qui prend"
git branch -M main
git remote add origin https://github.com/<ton-compte>/6quiprend.git
git push -u origin main
```

Puis sur GitHub : **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
Le jeu sera sur `https://<ton-compte>.github.io/6quiprend/`.

Sur iPad / iPhone : ouvre l'adresse dans Safari → **Partager → Sur l'écran d'accueil**.

> Après une modification des fichiers, incrémente `CACHE` dans `sw.js` (`6quiprend-v2`, …) pour que l'app installée se mette à jour.


## Licence

Tous droits réservés © Maximeavril1869. Code publié pour consultation uniquement ; toute réutilisation exige l'autorisation écrite de l'auteur. Voir le fichier `LICENSE`.

## Tests

```
python3 -m http.server 8123          # depuis la racine du dépôt
python3 tests/e2e/solo.py            # essai de fumée : contre l'ordi
python3 tests/e2e/en_ligne.py        # deux appareils simulés + faux Supabase (36 vérifications)
```

Voir `ARCHITECTURE.md` et `CARNET_DE_BORD.md`.
