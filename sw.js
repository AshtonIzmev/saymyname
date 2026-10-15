// Service worker : garde une copie de toutes les pages pour que l'application
// démarre sans réseau. Les données et les médias ne passent pas par ici :
// ils vivent dans IndexedDB (voir flashcards/stockage.js).
// Changer VERSION à chaque publication pour purger l'ancienne copie.
const VERSION = "jeux-v6";
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
  "polices/emoji.css",
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => "polices/emoji/" + n + ".woff2"),
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
// Mais pas à n'importe quel prix : un wifi à moitié mort peut mettre une
// minute à échouer, et l'enfant attend. Au-delà de DELAI_RESEAU sans réponse,
// la copie locale sert tout de suite ; la réponse réseau, si elle finit par
// arriver, met la copie à jour pour la prochaine fois.
const DELAI_RESEAU = 3000;
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const reseau = fetch(e.request).then((r) => {
    if (r.ok) { const copie = r.clone(); e.waitUntil(caches.open(VERSION).then((c) => c.put(e.request, copie))); }
    return r;
  });
  const copie = () => caches.match(e.request, { ignoreSearch: true })
    .then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : null));
  const delai = new Promise((ok) => setTimeout(() => ok(null), DELAI_RESEAU));
  e.waitUntil(reseau.catch(() => {}));
  e.respondWith(
    Promise.race([reseau.catch(() => null), delai])
      .then((r) => r || copie().then((c) => c || reseau.catch(() => Response.error())))
  );
});
