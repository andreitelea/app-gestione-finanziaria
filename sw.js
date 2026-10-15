// Soldi — service worker: tiene una copia dei file dell'app per aprirla anche offline.
// Quando pubblichi una nuova versione, cambia VERSIONE: i telefoni scaricheranno i file nuovi.
const VERSIONE = "soldi-v1.0.0";
const FILE = [
  "./", "./index.html", "./styles.css", "./app.js", "./engine.js", "./db.js",
  "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Prima la copia salvata (apertura istantanea e offline), altrimenti la rete
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(r => r ||
      fetch(e.request).catch(() => (e.request.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
