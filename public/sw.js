// ── PlanR Service Worker ──────────────────────────────────────────────────────
// Strategy:
//   • App shell (HTML)         → network-first, cache fallback
//   • Hashed JS/CSS chunks     → cache-first (immutable, versioned by filename)
//   • Fonts (Google Fonts CDN) → cache-first, long-lived
//   • Firebase / analytics     → skip (always network)
//
// Bump CACHE_VERSION to force a full cache refresh on deploy.

const CACHE_VERSION = 'planr-v5';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const FONT_CACHE  = `${CACHE_VERSION}-fonts`;

const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

// Precache only the minimal shell — hashed chunks are cached on first fetch
const PRECACHE_SHELL = ['/', '/manifest.json'];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE_SHELL))
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Skip: Firebase, analytics, cross-origin API calls
  const skipHosts = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'firebaseapp.com',
    'googleapis.com',
    'google-analytics.com',
    'googletagmanager.com',
  ];
  if (skipHosts.some((h) => url.hostname.endsWith(h))) return;

  // 2. Fonts (Google Fonts CDN) — cache-first, very long-lived
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }

  // 3. Hashed static assets (_next/static/**) — cache-first, immutable
  //    Next.js content-hashes these filenames, so stale entries never serve wrong code
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 4. Static images / icons / SVGs from same origin — cache-first
  if (
    url.origin === self.location.origin &&
    /\.(svg|png|jpg|jpeg|webp|avif|ico|woff2?)$/i.test(url.pathname)
  ) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 5. App shell navigation — network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    e.respondWith(networkFirst(request, SHELL_CACHE, '/'));
    return;
  }

  // 6. Everything else same-origin (e.g. manifest.json) — network-first
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // 7. Unknown cross-origin — pass through
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Network error', { status: 408 });
  }
}

async function networkFirst(request, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await cache.match(fallbackPath);
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}
