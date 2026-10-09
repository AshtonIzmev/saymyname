# Mot à Mot est une page statique autonome : un serveur de fichiers suffit.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY img/ /usr/share/nginx/html/img/

EXPOSE 8080
