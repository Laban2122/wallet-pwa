/**
 * wApp Wallet - Service Worker
 * No caching - all requests go directly to network
 */

// Install - skip waiting immediately, no caching
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate - delete all existing caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(cacheNames.map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

// Fetch - always go to network, never cache
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
