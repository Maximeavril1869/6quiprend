# 6 qui prend

Le jeu de cartes **6 qui prend**, jouable en local dans le navigateur, installable comme une app (PWA) et utilisable hors ligne.

## Modes

- **Contre l'ordi** : toi contre 1 à 9 robots.
- **Passe-passe** : 2 à 4 humains sur le même appareil (+ robots éventuels). Un écran « Passe l'appareil à… » protège chaque main.
- **Face à face** : 2 humains de chaque côté de l'iPad (la main du joueur du haut est retournée). Les mains restent cachées jusqu'à « Voir ma main ».

De 2 à 10 joueurs au total. Fin de partie : *partie à 66* (on enchaîne les manches) ou *une seule manche*.
La partie en cours est sauvegardée à chaque tour (bouton « Reprendre » dans le menu ☰).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html`, `style.css` | Interface |
| `engine.js` | Règles et robots (sans dépendance au DOM) |
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
