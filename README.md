# Jeux des jumeaux

Un écran de choix du jeu et deux applications pour les tout-petits. Tout est statique :
pas de serveur d'application, pas de compte, rien ne sort de l'appareil. Les fonds
sont un papier (blanc cassé, grain léger) plutôt qu'un blanc pur, sauf en mode
e-ink de Mot à Mot.

| Chemin | Quoi |
| --- | --- |
| `index.html` | **Choisir un jeu** : deux grandes tuiles, Mot à Mot et Flashcards. |
| `mot-a-mot/` | **Mot à Mot** : une image au centre, quatre voisines aux coins, sur liseuse e-ink. Voir [`mot-a-mot/README.md`](mot-a-mot/README.md). |
| `flashcards/` | **Flashcards** : mots, lettres et chiffres en français, une boîte de Leitner par enfant (autant d'enfants qu'on veut, un actif à la fois). Aucun son. Données sur l'appareil, sauvegarde par export / import d'un fichier. Voir [`flashcards/README.md`](flashcards/README.md). |
| `polices/` | **Police emoji embarquée** : Noto Color Emoji réduite aux emoji des deux jeux (131 Ko). Sans elle, chaque appareil dessine les emoji avec sa police système, et une tablette de quelques années n'a pas les plus récents : la carte reste vide. Fabriquée par `polices/emoji/fabriquer.py`. |
| `sw.js`, `manifest.webmanifest` | Installation sur l'écran d'accueil et démarrage hors ligne. |

Chaque jeu a un bouton pour revenir à l'écran de choix (**Jeux** dans la barre de
Mot à Mot, **← Jeux** en haut des flashcards).

## Lancer

N'importe quel serveur de fichiers statiques à la racine du dépôt :

```
npx http-server -p 8080      # ou : python3 -m http.server 8080
```

`index.html` et Mot à Mot s'ouvrent aussi directement depuis un `file://`. Les
flashcards également, mais sans installation ni mode hors ligne.

## Les images sur une tablette ancienne

Les images de départ sont des emoji, dessinés par la police de l'appareil. Une
tablette Android qui n'a plus reçu de mise à jour système n'a pas les emoji
ajoutés depuis (brosse à dents, seau, poivron, cercles de couleur…) et laisse la
carte vide. L'application embarque donc sa propre police (`polices/`), en format
COLRv1 : Chrome, le WebView Android et Firefox récents l'utilisent et dessinent
les mêmes images partout ; Safari et les navigateurs plus anciens gardent leur
police système. Sur une tablette ancienne, mettre à jour **Android System
WebView** et **Chrome** depuis le Play Store suffit pour que la police soit prise.

## Héberger

Toute publication de fichiers statiques convient : GitHub Pages, Netlify,
Cloudflare Pages… ou le conteneur fourni :

```
docker build -t jeux .
docker run -d -p 8080:8080 jeux
```

**HTTPS est nécessaire** pour l'installation sur
l'écran d'accueil et le mode hors ligne : Chrome les refuse en `http://` sauf sur
`localhost`. Les hébergements cités le fournissent d'office ; devant le conteneur,
un reverse proxy (Caddy) ou `tailscale serve` suffit.

L'hébergement ne voit jamais les données des enfants : elles restent dans le
navigateur de la tablette (voir *Données et sauvegarde* dans le README des flashcards).

## Tests

```
npm test                    # tout, fichier par fichier
npm run test:graphe         # Mot à Mot : graphe d'association (Node seul)
npm run test:navigateur     # Mot à Mot : critères d'acceptation dans Chromium
npm run test:planificateur  # Flashcards : règles de Leitner, sélection, distracteurs
npm run test:flashcards     # Accueil et flashcards de bout en bout dans Chromium,
                            # export puis import sur un deuxième appareil compris
```

Les tests navigateur trouvent Playwright en local (`npm install`) ou dans les
paquets globaux.
