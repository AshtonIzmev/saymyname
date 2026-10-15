# Flashcards

Des cartes-images pour les jumeaux : mots, lettres et chiffres en français. Le
parent tient la tablette et mène une séance de 5 à 10 minutes ; l'application
choisit quoi montrer et retient, pour chaque enfant, ce qu'il connaît.

- Le parent est toujours là : l'application lui fait signe, elle n'occupe jamais
  l'enfant seule.
- L'enfant touche à un doigt, le parent note à deux : un doigt qui traîne ou une
  main posée ne notent jamais rien et ne terminent jamais la séance.
- Rien ne récompense le tapotement : pas d'animation, pas de score visible des
  enfants. Et aucun son : l'application est muette, c'est le parent qui parle.
- Une chose à la fois : une grande image, un mot, rien d'autre.
- Un paquet par jumeau, jamais partagé, jamais comparé.

## Commencer

Y aller doucement. La première semaine :

1. **Vingt photos de la maison**, avant tout : le doudou, la tasse de l'enfant, le
   chien de la voisine, la voiture de papa, la porte, la cuillère. *Parent →
   Ajouter*, moins de trente secondes par carte. À deux ans, un référent réel et
   personnel vaut dix dessins ; les emoji semés attendent, en réserve de fait, les
   mots qu'on ne peut pas photographier. Le départ le rappelle d'une ligne tant
   qu'aucune carte n'a de photo.
2. **Montrer seulement.** *Choisir* s'ouvre de lui-même quand des mots auront été
   donnés (voir plus bas).
3. **Une séance par jour**, courte. Monter le plafond quand les enfants en
   redemandent, ce que le tableau (*fin : plafond / parent*) permet de voir.
4. **Les lettres, couleurs, formes et chiffres 4–5 restent en réserve** (voir *Jeu
   de départ*) : rien à faire, c'est le réglage de départ.

## Une séance

1. **Départ** : toucher la tuile de l'enfant (photo et prénom dans *Parent → Réglages*).
2. **Mode** : *Montrer* ou *Choisir*. Au-dessus, *Tout / Lettres / Chiffres* ; un
   filtre n'apparaît que si l'enfant a des cartes actives de ce type (au départ,
   seulement *Chiffres*, pour 1 à 3).
3. C'est parti. La séance s'arrête au plafond du jour (10 cartes par défaut, 6 à 15)
   ou par un appui long du parent, à deux doigts. L'écran affiche « fini » et reste
   verrouillé 30 secondes. Il vaut mieux qu'ils en redemandent. S'il n'y a rien à
   montrer (plafond atteint, tout vu, tout au repos), l'écran du mode le dit et
   on reste là : pas de « fini » verrouillé pour un appui de trop.

### Montrer (expressif)

Une carte, l'image sur ~70 % de l'écran, le mot dessous. Le parent demande
« c'est quoi ? » puis note d'un geste.
La carte ne change jamais toute seule.

### Choisir (réceptif)

Deux images côte à côte, sans mot. Le parent demande « où est… ? » (le souffleur
lui donne le mot). L'enfant touche :

- **juste** : l'autre image s'efface, le mot apparaît sous la cible ;
- **faux** : rien pendant une seconde, puis il peut réessayer.

La note est automatique (juste du premier coup = *su*, au deuxième = *hésitant*,
deux erreurs = *pas su*). Le distracteur est du même type mais d'une autre
catégorie (un animal contre un objet, jamais chat contre chien), de préférence une
carte que l'enfant connaît déjà (boîte 3+). Il ne compte jamais comme révisé. Les
distracteurs de toute la séance sont tirés au départ, et leurs images résolues
avec les autres : aucune image n'arrive en retard sur l'écran de l'enfant.

*Choisir* vient **après** *Montrer*, et ne décide pas qu'un mot est connu :

- il ne propose que des cartes déjà vues au moins une fois : un mot est d'abord
  donné par une voix avant d'être demandé. Sur un paquet neuf, la tuile est grisée
  (« d'abord Montrer ») ;
- une réussite en *Choisir* fait monter une carte jusqu'à la boîte 3, pas au-delà.
  Deux images, c'est une chance sur deux au hasard, et un enfant qui sait que
  l'autre image n'est pas « chien » réussit par exclusion. *Connu* (boîtes 4 et 5)
  reste une note du parent, en *Montrer*. Les échecs, eux, comptent comme les
  autres : deux erreurs sur deux images, c'est un signal.

Ce que *Choisir* mesure, c'est de la compréhension ; traitez-le comme un jeu, et le
tableau de bord comme le reflet de *Montrer*.

### Le souffleur

Ce qui enseigne, c'est la voix du parent ; la carte ne fait que choisir le mot.
Une ligne grise au ras du bas de l'écran, que l'enfant ne lit pas, dit au parent
la seule chose qu'il ne voit pas : si le mot est **nouveau** (« dis le mot, montre,
redis-le ») ou **déjà vu** (« demande “c'est quoi ?”, attends trois secondes, puis
dis-le »). Suit une relance par catégorie, pour en parler plutôt que passer à la
suivante : le bruit qu'il fait, où on l'a vu, tu aimes ?, montre le tien. La note
de la carte, s'il y en a une, vient en dernier.

En mode *Choisir*, la ligne commence par **le mot à demander** : sans lui, le
parent ne saurait pas laquelle des deux images est la cible. Ce mot reste affiché
même souffleur éteint (*Parent → Réglages → Souffleur*). Les textes sont dans
`souffleur.js`, testés dans `test/souffleur.test.js`.

### Les gestes du parent

Invisibles des enfants : aucun bouton sur leur écran. Et hors de leur portée :
tout geste du parent se fait **à deux doigts**. À un doigt, l'enfant ne peut que
toucher une image en mode *Choisir* ; un doigt qui traîne, un index qui reste
appuyé, une paume posée ne font rien.

| Geste (deux doigts) | Effet |
| --- | --- |
| Glisser → | **Su** : la carte monte d'une boîte |
| Glisser ↑ | **Hésitant** : même boîte, revue à la prochaine séance |
| Glisser ← | **Pas su** : retour en boîte 1 |
| Glisser ↓ | *Choisir* seulement : suivante, avec la note automatique |
| Appui long (0,9 s) | Fin de séance → « fini » |

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
  indéfiniment, pour les deux enfants), **reposer un mois pour un seul enfant**
  (ou le réveiller), historique des révisions.
- **Tableau** : par enfant, côte à côte — cartes par boîte, boîtes 4–5, nouveaux mots
  dits en 7 jours (premier *su* en *Montrer* ; une réussite en *Choisir* n'en est pas
  un), jamais montrées, séances, durée moyenne, fin par plafond ou par le parent,
  cartes en échec 3 fois de suite.
- **Réglages** : prénom, photo et plafond de chaque enfant ; **en réserve** (voir
  *Jeu de départ*) ; **sauvegarde** (exporter, importer) ; images en masse.

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
d'abord), puis **au plus 3 jamais vues** (les dernières ajoutées d'abord ; à date
égale, les mots avant les chiffres et les lettres, au hasard), puis les ratées de
la boîte 1 (la moins récemment vue d'abord). Au plus 50 % de lettres + chiffres
(sauf séance *Lettres* ou *Chiffres*), mélangées sans jamais deux fois le même
mot à la suite. Le plafond est quotidien : une deuxième séance le même jour ne
propose que le reste.

Les nouvelles passent avant les ratées, pas l'inverse : une ratée revient de
toute façon à chaque séance, tandis qu'un enfant qui rate beaucoup ne verrait
sinon plus jamais rien de nouveau et tournerait sur les mêmes dix cartes pendant
des mois. Un paquet tout neuf ouvre donc sur trois mots, pas sur A, B, C.

En mode *Choisir*, la sélection écarte les cartes jamais vues et un *su* ne fait
pas monter au-delà de la boîte 3 (`PLAFOND_CHOIX`) : à ce plafond, la carte reste
dans sa boîte et sera revue à son échéance ; la série vers la boîte 5 ne bouge pas.

Une carte *su* trois fois de suite en boîte 4 passe en boîte 5. Une carte ratée 4
fois de suite en boîte 1 est **signalée** et **se repose une semaine** : on ne
drille pas un enfant de deux ans sur ce qu'il rate, on y revient plus tard. Elle
n'est jamais retirée. Le repos vaut pour un enfant, pas pour la carte : depuis la
fiche, le parent peut aussi la reposer un mois pour l'un des deux, ou la
réveiller. Au retour, un *su* efface la série ; un nouvel échec la repose une
semaine de plus.

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
`H` (muet en français) et `X` (pas d'emoji xylophone) portent une note. `W` a
« wapiti », l'un des rares mots français en /w/ (« wagon » se dit /v/).

### En réserve

Tout n'est pas montré à deux ans. Quatre groupes sont semés **suspendus** : ils sont
dans *Cartes*, pas dans les séances, jusqu'à ce que le parent les réveille dans
*Parent → Réglages → En réserve*, un groupe à la fois, d'un bouton (et les y remette
de même).

| Groupe | Pourquoi attendre |
| --- | --- |
| Les lettres (26) | La conscience des sons vient vers quatre ou cinq ans. Et C, K, Q donnent tous /k/, G se nomme « gé » mais sonne /g/ : il faudra d'abord trancher entre nom et son. |
| Les couleurs (8) | Mot abstrait, acquis plus tard, et un rond rouge pour « rouge » se confond avec un rond rouge pour « rond ». |
| Les formes (5) | Même confusion dans l'autre sens : un carré bleu pour « carré » peut s'apprendre comme « bleu ». |
| Les chiffres 4 et 5 | Un enfant de deux ans perçoit d'un coup d'œil jusqu'à trois. 1, 2 et 3 restent en séance. |

Une centaine de mots concrets, c'est déjà des mois. Le groupe vaut pour toutes les
cartes, celles du parent comprises : réveiller les couleurs réveille aussi une couleur
qu'il aurait ajoutée. Une installation d'avant cette règle passe en réserve, une
fois, les cartes de ces groupes que les enfants n'ont jamais vues ; ce qui a déjà été
montré reste en séance.

Les emoji sont dessinés par la police embarquée (`polices/`, voir le README
à la racine), pas par celle de la tablette : les mêmes images partout. Un emoji
tapé par le parent dans *Ajouter* n'y est pas et dépend de l'appareil ; après un
ajout d'emoji dans `graines.js`, relancer `polices/emoji/fabriquer.py`.

## Données et sauvegarde

Pas de serveur. Tout vit sur l'appareil, dans le stockage du navigateur
(IndexedDB) : cartes, photos, boîtes, séances, révisions. Une séance n'attend
jamais le réseau, et rien ne sort de la tablette. L'application demande au
navigateur de ne pas effacer ces données pour gagner de la place. Si une écriture
est refusée (stockage plein), le départ l'affiche en rouge : exporter, puis
libérer de la place. Si le navigateur n'a pas de stockage du tout, il le dit
aussi : rien ne survivra à la fermeture.

C'est aussi le **seul exemplaire**. Effacer les données de Chrome, réinitialiser ou
perdre la tablette, et tout est perdu. D'où la sauvegarde, dans *Parent → Réglages* :

- **Exporter** télécharge un fichier `flashcards-AAAA-MM-JJ.json` (dossier
  *Téléchargements*) : tout l'état, avec chaque photo dedans.
  Compter quelques dizaines de Mo une fois le paquet rempli de photos.
  Le garder en lieu sûr (Drive, ordinateur, clé USB). Il contient les prénoms
  et les photos des enfants en clair : c'est un fichier de famille, pas un
  fichier à laisser traîner sur une tablette partagée.
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
démarrer sans réseau. Si le réseau est là mais traîne (wifi à moitié mort), la
copie locale sert au bout de 3 secondes.

## Choix faits là où le cahier des charges laissait de la marge

- **Deux doigts pour le parent.** Le cahier des charges voulait des gestes
  invisibles des enfants ; invisibles ne suffisait pas, un doigt qui traîne
  notait. À deux doigts, un enfant de deux ans ne note rien par accident.
- **Nouvelles avant ratées, et repos d'une semaine au quatrième échec.** Une
  simulation sur soixante jours montrait qu'un enfant qui ne sait que 25 % des
  cartes ne voyait que 14 cartes distinctes en deux mois, drillé sur ses échecs.
- **Mots avant lettres** à date d'ajout égale, pour qu'un paquet neuf n'ouvre
  pas sur l'alphabet.
- **Glisser ↓** en mode *Choisir* : il fallait un geste pour « passer en gardant
  la note automatique » ; les trois autres directions la remplacent. Un glissement
  du parent en *Choisir* reste une note de *Choisir* : plafonnée à la boîte 3, même
  si c'est lui qui a jugé. Pour faire passer un mot en *connu*, c'est *Montrer*.
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

Limites connues, laissées telles quelles pour l'instant :

- chaque note réécrit tout l'état en un seul enregistrement, et l'export
  construit un seul fichier JSON avec les photos encodées dedans : au-delà de
  quelques centaines de photos, prévoir un export en archive ;
- le mode *Choisir* à deux images laisse une chance sur deux au hasard, et le
  distracteur est toujours d'une autre catégorie : trois images et des
  distracteurs plus proches à mesure que la carte monte sont la suite logique ;
- le souffleur dit au parent *quand* donner le mot et quand le demander, et une
  relance par catégorie ; il ne tranche pas, pour une lettre, entre le nom et le
  son : c'est au parent de choisir, et de s'y tenir.
