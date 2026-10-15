# Mot à Mot

Un support d'attention conjointe pour un enfant de deux ans et son parent, sur
tablette e-ink couleur. Une image au centre, ses quatre plus proches voisines aux
coins. L'enfant nomme l'image du centre à voix haute ; le parent tape un coin ;
ce coin devient le centre. Indéfiniment.

L'application n'enseigne rien et ne parle pas : aucun texte sur le plateau, aucun
son, aucun score. Elle affiche, et c'est tout.

## Lancer

Ouvrir `mot-a-mot/index.html` dans un navigateur (ou passer par l'écran de choix
du jeu, `index.html` à la racine). Un seul fichier, sans build, sans réseau,
depuis un `file://`. Sur la liseuse : WebView ou Chromium en plein écran / kiosque.

Commandes du parent (barre du bas) : **Jeux** (retour à l'écran de choix du jeu),
**Retour** (historique), **Au hasard**,
**E-ink** (aperçu : blanc pur, noir pur, aplats sans teinte, fils épaissis).
Le réglage e-ink est mémorisé si le stockage local le permet ; sinon tout
fonctionne quand même.

Raccourcis de développement : `1`–`4` pour les coins, `Espace` pour le hasard,
`Retour arrière` pour revenir.

## Ajouter une notion

Dans `mot-a-mot/index.html`, bloc `<script id="donnees">`, ajouter **une ligne** au tableau
`NOTIONS` :

```js
// [ image, identifiant, famille, étiquettes[] ]
["🦊", "renard", "animal", ["poil", "pattes", "queue", "orange", "jardin"]],
```

- **image** : un emoji (provisoire) ou un chemin vers une illustration
  (`img/renard.webp`). Le code rend un `<span>` ou une `<img>` selon le cas.
- **identifiant** : unique, jamais affiché. Sert aux tests et aux journaux.
- **famille** : `animal`, `fruit`, `legume`, `objet` ou `nature`.
- **étiquettes** : 3 à 6, prises **exclusivement** dans `VOCABULAIRE` (juste
  au-dessus du tableau). Une étiquette hors liste fait planter la page au
  démarrage, volontairement : elle casserait le calcul de proximité en silence.

Rien d'autre à faire : la notion entre dans le graphe immédiatement. Après un
ajout, lancer `npm run test:graphe` pour vérifier que la marche aléatoire garde
sa qualité (voir plus bas).

## Substituer les illustrations définitives

Déposer les images dans `img/` (nommées par identifiant, voir `img/README.md`
pour le cahier des charges), puis remplacer l'emoji de chaque ligne par le
chemin :

```js
["img/chien.webp", "chien", "animal", ["poil", "pattes", "queue", "maison", "brun"]],
```

Les images à chemin sont préchargées au démarrage, donc le remplacement des cinq
images reste un seul repaint. Emoji et chemins peuvent coexister pendant la
transition.

## Le graphe d'association

La proximité se calcule sur les étiquettes, pas sur la famille :

```
score(a, b) = 3 × |étiquettes communes| + 2 × (même famille) + aléa dans [0 ; 1.6]
```

Les quatre voisines d'un centre sont les meilleurs scores, hors centre précédent
et hors coins qu'on vient d'afficher, avec **au plus deux voisines de la famille
du centre**. Chacune de ces règles est commentée dans le code ; aucune n'est
décorative.

Critère de qualité, vérifié par test : une marche aléatoire de 50 pas depuis
n'importe quel départ visite au moins 4 familles sur 5 et au moins 25 notions
distinctes. Si ce test échoue après un ajout, ce sont les étiquettes qu'il faut
revoir (une étiquette posée sur trop de notions crée un aimant), pas l'algorithme.

## Rendu e-ink

Le CSS s'interdit toute transition, animation, ombre, dégradé, filtre, `:hover`
et opacité partielle. Aucun cadre autour des images ; traits ≥ 2 px ; aucun gris
entre `#666` et `#AAA`. Le retour tactile est une inversion binaire tant que le doigt est posé.

Sur un écran rétroéclairé (tablette, ordinateur), le fond est un papier : blanc
cassé chaud avec un grain léger, parce que le blanc pur y fatigue les yeux. En
mode **E-ink**, le fond redevient blanc pur et plat : la dalle n'éblouit pas et
tramerait le grain en bruit.

Purge du ghosting : `motAMot.purgerDalle()` affiche une frame de noir plein
écran. Pour l'appeler automatiquement toutes les N navigations, passer
`flashAntiGhosting` à `true` dans `CONFIG` (haut du script d'interface). Si la
liseuse expose une API de rafraîchissement, l'assigner à
`motAMot.rafraichirDalle` ; elle sera préférée au flash.

## Tests

```
npm run test:graphe        # données, règles du graphe, marche aléatoire (Node seul)
npm run test:navigateur    # critères d'acceptation dans Chromium (Playwright requis)
npm test                   # les deux
```

Le test navigateur trouve Playwright en local (`npm install`) ou dans les
paquets globaux. Avec `CAPTURES=/un/dossier`, il enregistre aussi des captures
d'écran (plateau, appui, aperçu e-ink) en paysage et en portrait.
