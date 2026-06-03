const CACHE_NAME = 'konzertplaner-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/konzertplaner.ico',
  '/design_tool.html'
];

// Install Event: Cache Ressourcen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Activate Event: Alte Caches löschen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Cache-First Strategie
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache treffer -> aus Cache laden
        if (response) {
          return response;
        }
        // Cache fehler -> vom Netzwerk laden
        return fetch(event.request);
      })
  );
});