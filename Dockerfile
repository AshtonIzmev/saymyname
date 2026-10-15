# Tout est statique : l'accueil, Mot à Mot et les flashcards. Les données des
# flashcards vivent sur l'appareil ; aucun serveur d'application.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html sw.js manifest.webmanifest /usr/share/nginx/html/
COPY icones/ /usr/share/nginx/html/icones/
COPY polices/ /usr/share/nginx/html/polices/
COPY mot-a-mot/ /usr/share/nginx/html/mot-a-mot/
COPY flashcards/ /usr/share/nginx/html/flashcards/

EXPOSE 8080
