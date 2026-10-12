# Les pages (accueil, Mot à Mot, Flashcards) et l'API de synchronisation des
# flashcards, servies par un seul processus Node sans dépendance.
FROM node:24-alpine

WORKDIR /app
COPY index.html sw.js manifest.webmanifest ./
COPY icones/ icones/
COPY mot-a-mot/ mot-a-mot/
COPY flashcards/ flashcards/
COPY serveur/ serveur/

# La base SQLite et les médias (photos, voix) : à monter sur un volume.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
ENV PORT=8080 DATA_DIR=/data
# SECRETS=secret-tablette,secret-telephone à fournir au lancement.

USER node
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "serveur/serveur.js"]
