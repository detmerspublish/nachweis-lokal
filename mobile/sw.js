/**
 * Service Worker für Nachweis Lokal Mobile.
 * Cache-first Strategie: Seite funktioniert offline.
 */

const CACHE_NAME = 'nachweis-mobile-v1';
const STATIC_ASSETS = [
  '/mobile/index.html',
  '/mobile/style.css',
  '/mobile/app.js',
  '/mobile/manifest.json',
];

// Install: Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: Cache-first for static, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: always network (offline queue handles failures in app.js)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // /inspect/:id → serve cached index.html
  if (url.pathname.startsWith('/inspect/')) {
    event.respondWith(
      caches.match('/mobile/index.html').then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.pathname.startsWith('/mobile/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for HTML
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/mobile/index.html');
      }
    })
  );
});
