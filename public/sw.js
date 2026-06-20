// ── PlanR Service Worker ──────────────────────────────────────────────────────
// Strategy:
//   • App shell (HTML)         → stale-while-revalidate (instant launch, refresh in bg)
//   • Hashed JS/CSS chunks     → cache-first (immutable, versioned by filename)
//   • Static images / icons    → cache-first, long-lived
//   • Firebase / analytics     → skip (always network)
//
// Fonts are self-hosted by next/font at build time (served from /_next/static/),
// so there are no Google Fonts CDN requests to special-case here.
//
// Bump CACHE_VERSION to force a full cache refresh on deploy.

const CACHE_VERSION = 'planr-v7';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

const ALL_CACHES = [SHELL_CACHE, ASSET_CACHE];

// Minimal shell precache. The entry JS chunks are appended at build time by
// scripts/inject-precache.mjs (see PRECACHE_ASSETS); hashed chunks not listed
// there are still cached on first fetch.
const PRECACHE_SHELL = ['/', '/manifest.json'];

// Populated at build time with the entry chunk URLs from out/index.html.
// Left empty in source so `next dev` and un-injected builds still work.
const PRECACHE_ASSETS = [];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    Promise.all([
      // Shell is required — a failed shell precache should fail the install.
      caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE_SHELL)),
      // Entry chunks are best-effort — one missing chunk must not abort install.
      caches.open(ASSET_CACHE).then((c) =>
        Promise.allSettled(PRECACHE_ASSETS.map((url) => c.add(url)))
      ),
    ])
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

  // 2. Hashed static assets (_next/static/**) — cache-first, immutable
  //    Next.js content-hashes these filenames, so stale entries never serve wrong code
  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 3. Static images / icons / SVGs / fonts from same origin — cache-first
  if (
    url.origin === self.location.origin &&
    /\.(svg|png|jpg|jpeg|webp|avif|ico|woff2?)$/i.test(url.pathname)
  ) {
    e.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 4. App shell navigation — stale-while-revalidate: serve cached shell instantly,
  //    refresh it in the background so the next launch is current. This makes the
  //    installed PWA open without waiting on the network every time.
  if (request.mode === 'navigate') {
    e.respondWith(staleWhileRevalidate(request, SHELL_CACHE, '/'));
    return;
  }

  // 5. Everything else same-origin (e.g. manifest.json) — stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // 6. Unknown cross-origin — pass through
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

// Serve the cached response immediately (if present) while fetching a fresh copy
// in the background to update the cache. Falls back to the network on a cache
// miss, and to `fallbackPath` (the app shell) when both miss and we're offline.
async function staleWhileRevalidate(request, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Don't let the background refresh block the response.
    networkFetch;
    return cached;
  }

  const response = await networkFetch;
  if (response) return response;

  if (fallbackPath) {
    const fallback = await cache.match(fallbackPath);
    if (fallback) return fallback;
  }
  return new Response('Offline', { status: 503 });
}
