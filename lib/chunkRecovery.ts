/**
 * Shared recovery for ChunkLoadErrors.
 *
 * After a deploy, an installed PWA may still reference content-hashed chunks
 * that no longer exist on the server (and, because the SPA rewrite serves
 * index.html for any missing path, a stale chunk request comes back as HTML —
 * surfacing as "Failed to load chunk" / "Unexpected token '<'"). The fix is to
 * drop the stale caches and let the user manually reopen/refresh to pick up
 * the fresh build.
 *
 * These chunk failures arrive on THREE paths: a React render crash (caught by
 * ErrorBoundary), an uncaught `window` error, and — critically — an unhandled
 * promise rejection from a failed dynamic `import()`/prefetch, which never
 * reaches the React boundary. During the iOS crash investigation, automatic
 * reloads are disabled so Safari cannot fall into a repeated-problem loop.
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
 * User-initiated "update the app" used by the Settings refresh button. Unlike
 * unregisters the service worker and drops every cache so the next user-initiated
 * page load pulls the latest deploy. It does NOT touch IndexedDB or localStorage,
 * so the schedule, preferences, and sign-in are all preserved.
 */
export async function hardRefreshApp(): Promise<void> {
  resetReloadCount(); // a manual refresh clears any prior chunk-recovery budget
  // Unregister service workers so a fresh one installs on the next load.
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* best effort — still clear caches + reload below */
  }
  // Drop every cache (not just planr-*) so no stale chunk survives the update.
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
}

/**
 * Clear stale caches after a chunk failure. Automatic reload is disabled for the
 * iOS safe-mode build because reload loops are one suspected crash source.
 */
export function recoverFromChunkError(_delayMs = 600): boolean {
  if (typeof window === "undefined") return false;
  if (recovering) return true;
  if (getReloadCount() >= MAX_RELOADS) return false;
  recovering = true;
  setReloadCount(getReloadCount() + 1);
  clearStaleCaches().finally(() => {
    recovering = false;
  });
  return true;
}
