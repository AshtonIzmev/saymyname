# Jeux des jumeaux

Un écran de choix du jeu et deux applications pour les garçons :

| Chemin | Quoi |
| --- | --- |
| `index.html` | **Choisir un jeu** : deux grandes tuiles, Mot à Mot et Flashcards. |
| `mot-a-mot/` | **Mot à Mot** : une image au centre, quatre voisines aux coins, sur liseuse e-ink. Autonome, sans réseau. Voir [`mot-a-mot/README.md`](mot-a-mot/README.md). |
| `flashcards/` | **Flashcards** : mots, lettres et chiffres en français, une boîte de Leitner par jumeau, la voix du parent. Voir [`flashcards/README.md`](flashcards/README.md). |
| `serveur/` | Serveur Node sans dépendance : sert les pages et synchronise les flashcards entre la tablette et le téléphone (SQLite + dossier de médias). |
| `sw.js`, `manifest.webmanifest` | Installation sur l'écran d'accueil et démarrage hors ligne. |

Chaque jeu a un bouton pour revenir à l'écran de choix (**Jeux** dans la barre de
Mot à Mot, **← Jeux** en haut des flashcards).

## Lancer

```
npm start                 # http://localhost:8080 — Node ≥ 22.13, aucune dépendance
```

Variables : `PORT` (8080), `DATA_DIR` (`./data`), `SECRETS` (un secret par appareil,
séparés par des virgules ; vide = API ouverte, pour le développement seulement).

Sans serveur, `index.html` et Mot à Mot s'ouvrent toujours depuis un `file://`.
Les flashcards aussi, mais restent alors sur l'appareil, sans synchronisation.

## Déployer

```
docker build -t jeux .
docker run -d -p 8080:8080 -v jeux-data:/data -e SECRETS=secret-tablette,secret-telephone jeux
```

Le volume `/data` contient la base (`flashcards.sqlite`) et les photos et voix
(`media/`) : c'est lui qu'il faut sauvegarder.

**HTTPS est nécessaire** pour le micro (enregistrer la voix), l'installation sur
l'écran d'accueil et le mode hors ligne : Chrome les refuse en `http://` sauf sur
`localhost`. Un reverse proxy (Caddy, Traefik) ou Tailscale (`tailscale serve`)
devant le conteneur suffit.

## Tests

```
npm test                  # tout, fichier par fichier
npm run test:graphe       # Mot à Mot : graphe d'association (Node seul)
npm run test:navigateur   # Mot à Mot : critères d'acceptation dans Chromium
npm run test:planificateur # Flashcards : règles de Leitner, sélection, distracteurs
npm run test:serveur      # Flashcards : API, fusion, médias, secret
npm run test:flashcards   # Accueil et flashcards de bout en bout dans Chromium
```

Les tests navigateur trouvent Playwright en local (`npm install`) ou dans les
paquets globaux.
