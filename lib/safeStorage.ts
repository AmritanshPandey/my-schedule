/**
 * safeStorage — try/caught wrappers around Web Storage.
 *
 * Why this exists: on iOS Safari, `localStorage`/`sessionStorage` access throws
 * outright in Private Browsing and when the origin quota is exceeded. An
 * unguarded `setItem` therefore crashes whatever component made the write (and,
 * inside React, trips its ErrorBoundary). These helpers swallow those failures
 * so persistence stays best-effort — a write that can't happen is a degraded
 * experience, not a crash. Mirrors the swallow-on-failure pattern already used
 * in lib/errorLog.ts and lib/ai/runtime.ts:markModelDownloaded.
 */

type Store = "local" | "session";

function store(kind: Store): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Even *accessing* the property can throw when storage is disabled.
    return null;
  }
}

export function safeGetItem(key: string, kind: Store = "local"): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns true if the value was persisted, false if storage rejected it. */
export function safeSetItem(key: string, value: string, kind: Store = "local"): boolean {
  try {
    const s = store(kind);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string, kind: Store = "local"): void {
  try {
    store(kind)?.removeItem(key);
  } catch {
    /* best effort */
  }
}
