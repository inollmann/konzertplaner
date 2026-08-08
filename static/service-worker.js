const CACHE_NAME = 'konzertplaner-v7';

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
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 &&
              (url.pathname.startsWith('/static/js/') || url.pathname === '/static/style.css' ||
               url.pathname === '/static/index.html' || url.pathname === '/')) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
  );
});