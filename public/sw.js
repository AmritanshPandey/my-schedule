const CACHE = 'planr-v2';
const PRECACHE = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only cache same-origin and skip Firebase/analytics
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_next/data')) return; // dynamic Next.js data routes

  if (request.mode === 'navigate') {
    // Navigation: network-first, fall back to cached shell
    e.respondWith(
      fetch(request)
        .then((r) => {
          // Clone synchronously before any async operation
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
          return r;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((r) => {
        // Clone synchronously before passing into async cache.put
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return r;
      });
    })
  );
});
