# Flashcards

Des cartes-images pour les jumeaux : mots, lettres et chiffres en français. Le
parent tient la tablette et mène une séance de 5 à 10 minutes ; l'application
choisit quoi montrer et retient, pour chaque enfant, ce qu'il connaît.

- Le parent est toujours là : l'application lui fait signe, elle n'occupe jamais
  l'enfant seule.
- Rien ne récompense le tapotement : pas d'animation, pas de score visible des
  enfants. Et aucun son : l'application est muette, c'est le parent qui parle.
- Une chose à la fois : une grande image, un mot, rien d'autre.
- Un paquet par jumeau, jamais partagé, jamais comparé.

## Une séance

1. **Départ** : toucher la tuile de l'enfant (photo et prénom dans *Parent → Réglages*).
2. **Mode** : *Montrer* ou *Choisir*. Au-dessus, *Tout / Lettres / Chiffres*.
3. C'est parti. La séance s'arrête au plafond du jour (10 cartes par défaut, 6 à 15)
   ou par un appui long du parent. L'écran affiche « fini » et reste verrouillé
   30 secondes. Il vaut mieux qu'ils en redemandent.

### Montrer (expressif)

Une carte, l'image sur ~70 % de l'écran, le mot dessous. Le parent demande
« c'est quoi ? » puis note d'un geste.
La carte ne change jamais toute seule.

### Choisir (réceptif)

Deux images côte à côte, sans mot. Le parent demande « où est… ? ». L'enfant touche :

- **juste** : l'autre image s'efface, le mot apparaît sous la cible ;
- **faux** : rien pendant une seconde, puis il peut réessayer.

La note est automatique (juste du premier coup = *su*, au deuxième = *hésitant*,
deux erreurs = *pas su*). Le distracteur est du même type mais d'une autre
catégorie (un animal contre un objet, jamais chat contre chien), de préférence une
carte que l'enfant connaît déjà (boîte 3+). Il ne compte jamais comme révisé.

### Les gestes du parent

Invisibles des enfants : aucun bouton sur leur écran.

| Geste | Effet |
| --- | --- |
| Glisser → | **Su** : la carte monte d'une boîte |
| Glisser ↑ | **Hésitant** : même boîte, revue à la prochaine séance |
| Glisser ← | **Pas su** : retour en boîte 1 |
| Glisser ↓ | *Choisir* seulement : suivante, avec la note automatique |
| Appui long | Fin de séance → « fini » |

En mode *Choisir*, glisser →, ↑ ou ← remplace la note automatique.

Au clavier (développement) : flèches, `Échap` (fin), `1` / `2` (toucher l'image
de gauche / droite).

## Côté parent

*Parent*, en haut à droite du départ, ou directement `flashcards/index.html#parent`.
Tout se fait sur la tablette : elle a l'appareil photo.

- **Ajouter** (moins de 30 s) : prendre ou choisir une photo (recadrée au carré,
  1024 px, WebP) ou taper un emoji ; le mot ; les paquets ; enregistrer. La carte entre
  en boîte 1 et sera dans la prochaine séance (les dernières ajoutées passent en
  tête des nouvelles).
- **Cartes** : filtres par type, boîte, source, signalées, suspendues. Toucher une carte ouvre sa fiche : images (choisir la principale, en
  ajouter une), mot, paquets, suspendre (un mois ou
  indéfiniment), historique des révisions.
- **Tableau** : par enfant, côte à côte — cartes par boîte, boîtes 4–5, nouveaux mots
  reconnus en 7 jours, jamais montrées, séances, durée moyenne, fin par plafond ou
  par le parent, cartes en échec 3 fois de suite.
- **Réglages** : prénom, photo et plafond de chaque enfant ; **sauvegarde**
  (exporter, importer) ; images en masse.

### Import en masse

Un dossier d'images nommées par leur mot : `chien.jpg` → carte « chien ».
`chien-2.jpg` ajoute une deuxième image à la même carte (ou à la carte « chien »
existante). Choisir la source (MultiPic, BOSS, photo…), la catégorie et les paquets
avant l'import.

## Le planificateur

Leitner à cinq boîtes, par enfant (`planificateur.js`, testé dans
`test/planificateur.test.js`).

| Boîte | Revue après | Sens |
| --- | --- | --- |
| 1 | chaque séance | nouvelle ou ratée |
| 2 | 1 jour | vue une fois |
| 3 | 3 jours | reconnue deux fois de suite |
| 4 | 7 jours | connue |
| 5 | 21 jours | maîtrisée (surtout comme distracteur) |

Sélection du jour, dans l'ordre : les dues des boîtes 2–4 (la plus ancienne
d'abord), puis la boîte 1 (ratées avant jamais vues), au plus 3 nouvelles par
séance, au plus 50 % de lettres + chiffres (sauf séance *Lettres* ou *Chiffres*),
mélangées sans jamais deux fois le même mot à la suite. Le plafond est quotidien :
une deuxième séance le même jour ne propose que le reste.

Une carte *su* trois fois de suite en boîte 4 passe en boîte 5. Une carte ratée 4
fois de suite en boîte 1 est **signalée**, jamais retirée : reprendre la photo
ou la suspendre un mois.

Chaque mot peut avoir plusieurs images : la principale jusqu'à la boîte 3, puis
toutes à tour de rôle, pour que l'enfant apprenne le mot et pas l'image.

## Pas de son

L'application ne fait aucun bruit et n'utilise pas le micro : ni voix de synthèse,
ni enregistrement du parent. C'est le parent qui dit le mot, ou la question. Un
test (`test/flashcards.test.js`) échoue si une API audio réapparaît dans le code.
Les anciennes sauvegardes qui contiennent des voix s'importent quand même : les
enregistrements sont retirés, les cartes et les progrès restent. Au démarrage,
l'application retire aussi les voix qu'une ancienne version aurait gardées sur
l'appareil.

## Jeu de départ

`graines.js` : ~110 mots en emoji (animaux, nourriture, corps, vêtements, objets,
véhicules, nature, couleurs, formes), les 26 lettres avec un compagnon au premier
son sans ambiguïté, les chiffres 1 à 5 avec trois objets différents chacun. Semés
dans les deux paquets. Les emoji sont des remplaçants : les photos du parent et les
dessins MultiPic / BOSS les remplacent au fil de l'eau (fiche → ajouter une image).
`H` (muet en français) et `X` (pas d'emoji xylophone) portent une note.

## Données et sauvegarde

Pas de serveur. Tout vit sur l'appareil, dans le stockage du navigateur
(IndexedDB) : cartes, photos, boîtes, séances, révisions. Une séance n'attend
jamais le réseau, et rien ne sort de la tablette. L'application demande au
navigateur de ne pas effacer ces données pour gagner de la place.

C'est aussi le **seul exemplaire**. Effacer les données de Chrome, réinitialiser ou
perdre la tablette, et tout est perdu. D'où la sauvegarde, dans *Parent → Réglages* :

- **Exporter** télécharge un fichier `flashcards-AAAA-MM-JJ.json` (dossier
  *Téléchargements*) : tout l'état, avec chaque photo dedans.
  Compter quelques dizaines de Mo une fois le paquet rempli de photos.
  Le garder en lieu sûr (Drive, ordinateur, clé USB).
- **Importer**, sur un autre appareil (ou le même après une réinitialisation),
  après confirmation, **remplace tout** ce qu'il contient par la sauvegarde. Ce
  n'est pas une fusion : deux appareils ne doivent pas être utilisés en parallèle,
  le dernier importé gagne.

Les réglages affichent la date de la dernière sauvegarde. Tant qu'il y a des
progrès à perdre et pas de sauvegarde depuis 14 jours, le départ le rappelle d'une
ligne discrète.

## La tablette en kiosque

[Fully Kiosk Browser](https://www.fully-kiosk.com/) sur la tablette Android :

- *Start URL* : `https://<hébergement>/` (l'écran de choix du jeu) ou
  `https://<hébergement>/flashcards/index.html` pour arriver directement au départ ;
- *Kiosk Mode* activé, avec un PIN de sortie ; navigation Android masquée,
  écran épinglé ;
- *Screen brightness* plafonnée, *Keep screen on* activé ;
- l'accès à la caméra (pour ajouter des cartes) ; le micro n'est pas nécessaire ;
- autoriser les téléchargements et le choix de fichiers (pour exporter et importer
  la sauvegarde, et pour les photos) ;
- désactiver la navigation par glissement (*Swipe Navigation*) et *Pull to Refresh*,
  pour que les glissements de notation ne soient jamais interceptés.

Ouvrir une fois l'application en ligne : le service worker la garde ensuite pour
démarrer sans réseau.

## Choix faits là où le cahier des charges laissait de la marge

- **Glisser ↓** en mode *Choisir* : il fallait un geste pour « passer en gardant
  la note automatique » ; les trois autres directions la remplacent.
- **Boîte 5 due** (après 21 jours) : revue après les boîtes 2–4, pour ne pas
  disparaître pour toujours.
- **Série vers la boîte 5** : `streak` compte les *su* d'affilée dans la boîte
  courante ; il retombe à zéro à chaque changement de boîte ou note non-*su*.
- **Retirer un enfant d'une carte** n'est pas proposé (cela effacerait son
  historique) : on suspend la carte.

## Pas encore fait

Prévu en v3 par le cahier des charges : minuscules, chiffres 6–10, choix à trois
images, syllabes. Les questions ouvertes restent ouvertes : même jeu de départ pour
les deux (c'est le cas aujourd'hui).
