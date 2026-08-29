const LEGACY_LOCAL_META_KEY = "planr_lastUpdated";

function localMetaKey(uid?: string | null): string {
  return uid ? `planr_lastUpdated:${uid}` : "planr_lastUpdated:guest";
}

export function getLocalLastUpdated(uid?: string | null): number {
  try {
    const key = localMetaKey(uid);
    const scopedValue = localStorage.getItem(key);
    if (scopedValue !== null) return parseInt(scopedValue, 10) || 0;
    if (!uid) return parseInt(localStorage.getItem(LEGACY_LOCAL_META_KEY) ?? "0", 10) || 0;
    return 0;
  } catch {
    return 0;
  }
}

export function writeLocalLastUpdated(ts: number, uid?: string | null): void {
  try {
    localStorage.setItem(localMetaKey(uid), String(ts));
  } catch {
    // localStorage unavailable (private mode, etc.) — non-fatal
  }
}

// ── Base revision ─────────────────────────────────────────────────────────────
// The cloud snapshot revision whose *content* this device has actually
// incorporated — the compare-and-swap base for the next push. Kept in
// localStorage (not module state) so it survives a reload: a single device that
// edited offline still knows the rev it owns and can push without a conflict.
//
// Advanced only when this device ends up holding the remote content: after a
// snapshot has been read and merged into local state, or when the remote is
// provably identical or absent. Never advanced on a failed read — having tried
// to see a revision is not the same as having incorporated it, and treating
// the two as equivalent is exactly how a stale device overwrites a newer one.

const BASE_REV_PREFIX = "planr_baseRev";

function baseRevKey(uid?: string | null): string {
  return uid ? `${BASE_REV_PREFIX}:${uid}` : `${BASE_REV_PREFIX}:guest`;
}

/** The rev this device has incorporated, or null if it has never pulled. */
export function getLocalBaseRev(uid?: string | null): number | null {
  try {
    const raw = localStorage.getItem(baseRevKey(uid));
    if (raw === null) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalBaseRev(rev: number, uid?: string | null): void {
  try {
    localStorage.setItem(baseRevKey(uid), String(rev));
  } catch {
    // localStorage unavailable (private mode, etc.) — non-fatal: an unknown
    // base rev is treated conservatively by the push guard.
  }
}

export function clearLocalBaseRev(uid?: string | null): void {
  try {
    localStorage.removeItem(baseRevKey(uid));
  } catch {
    // non-fatal
  }
}
