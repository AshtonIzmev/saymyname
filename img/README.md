# Illustrations

Ce dossier reçoit les illustrations définitives, une par notion, nommées par
l'identifiant de la notion : `chien.webp`, `pomme.webp`, `cerf-volant.webp`…

Pour l'instant il est vide : les emoji du tableau `NOTIONS` (dans `index.html`)
servent d'images de remplacement.

## Cahier des charges d'une image

- Style unique pour toute la série : aplats, contour noir de 6 à 8 px à l'échelle
  1024 px, aucun dégradé, aucune ombre, aucune texture.
- Vue canonique (le chien de profil, la pomme de face). Jamais de scène, jamais
  l'objet en action, jamais de perspective inhabituelle.
- Un seul sujet, détouré, fond transparent, occupant 70 à 80 % du cadre,
  optiquement centré.
- Palette de 8 couleurs saturées, partagée par toutes les images, fixée une fois.
- PNG 1024×1024 à fond transparent, plus un dérivé WebP (c'est le WebP qu'on
  référence).

## Test de validation (simulation Kaleido)

Réduire l'image à 4096 couleurs, baisser la saturation de 40 %, puis la montrer
à quelqu'un qui ne sait pas ce qu'elle représente. S'il hésite, l'image est
refusée.

## Brancher une image

Dans `index.html`, remplacer l'emoji de la ligne par le chemin :

```js
["🐕", "chien", "animal", [...]]           // avant
["img/chien.webp", "chien", "animal", [...]] // après
```

Le code détecte un chemin (présence d'un `/` ou d'une extension d'image) et rend
une `<img>` préchargée au lieu d'un glyphe. Rien d'autre à toucher. Les deux
formes peuvent coexister pendant la transition.
