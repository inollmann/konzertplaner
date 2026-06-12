const CACHE_NAME = 'konzertplaner-v3';

// Install Event: Cache Ressourcen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll([
          '/',
          '/static/index.html',
          '/static/manifest.json',
          '/static/style.css'
        ]);
      })
      .then(() => {
        console.log('Service Worker: Caching complete');
      })
      .catch((err) => {
        console.error('Service Worker: Cache error:', err);
      })
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
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});