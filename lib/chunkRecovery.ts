/**
 * Shared recovery for ChunkLoadErrors.
 *
 * After a deploy, an installed PWA may still reference content-hashed chunks
 * that no longer exist on the server (and, because the SPA rewrite serves
 * index.html for any missing path, a stale chunk request comes back as HTML —
 * surfacing as "Failed to load chunk" / "Unexpected token '<'"). The fix is to
 * drop the stale caches and reload once to pick up the fresh build.
 *
 * These chunk failures arrive on THREE paths: a React render crash (caught by
 * ErrorBoundary), an uncaught `window` error, and — critically — an unhandled
 * promise rejection from a failed dynamic `import()`/prefetch, which never
 * reaches the React boundary. This module centralizes the loop-guarded reload
 * so every path can call it and share one counter.
 */

const RELOAD_KEY = "planr-chunk-reloads";
export const MAX_RELOADS = 2;

// In-memory mirror of the reload counter. iOS Private Browsing throws on every
// sessionStorage write, so the persisted counter would stay 0 and the guard
// would reload forever; this module-level fallback caps the loop within the
// session even when storage is unavailable.
let memReloadCount = 0;
let recovering = false;

export function getReloadCount(): number {
  let stored = 0;
  try {
    stored = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    /* storage unavailable — rely on the in-memory mirror */
  }
  return Math.max(stored, memReloadCount);
}

export function setReloadCount(n: number): void {
  memReloadCount = n;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(n));
  } catch {
    /* storage unavailable — in-memory mirror already updated */
  }
}

export function resetReloadCount(): void {
  memReloadCount = 0;
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function isChunkLoadError(message: string | undefined | null): boolean {
  if (!message) return false;
  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("Unexpected token") // stale chunk served as index.html
  );
}

/** Drop the app's service-worker caches so the follow-up reload fetches fresh. */
export async function clearStaleCaches(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("planr-")).map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
}

/**
 * Clear stale caches and reload once to recover from a chunk failure. Guarded so
 * a chunk that *keeps* failing can't loop (which Safari surfaces as "A problem
 * repeatedly occurred"). Returns true if a recovery is in flight / was started,
 * false if the reload budget is exhausted (caller should show a manual fallback).
 */
export function recoverFromChunkError(delayMs = 600): boolean {
  if (typeof window === "undefined") return false;
  if (recovering) return true;
  if (getReloadCount() >= MAX_RELOADS) return false;
  recovering = true;
  setReloadCount(getReloadCount() + 1);
  clearStaleCaches().finally(() => {
    window.setTimeout(() => window.location.reload(), delayMs);
  });
  return true;
}
