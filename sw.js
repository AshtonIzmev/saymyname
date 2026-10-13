// Service worker : garde une copie de toutes les pages pour que l'application
// démarre sans réseau. Les données et les médias ne passent pas par ici :
// ils vivent dans IndexedDB (voir flashcards/stockage.js).
// Changer VERSION à chaque publication pour purger l'ancienne copie.
const VERSION = "jeux-v3";
const COQUILLE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icones/icone.svg",
  "icones/icone-192.png",
  "icones/icone-512.png",
  "mot-a-mot/index.html",
  "flashcards/index.html",
  "flashcards/style.css",
  "flashcards/app.js",
  "flashcards/planificateur.js",
  "flashcards/graines.js",
  "flashcards/stockage.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord quand il répond (pour prendre les mises à jour), copie sinon.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copie)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
