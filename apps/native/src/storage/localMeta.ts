/**
 * Native port of lib/localMeta.ts — same two pieces of sync bookkeeping
 * (the local "last changed" clock and the compare-and-swap base revision),
 * on MMKV instead of localStorage. Semantics are identical; see
 * lib/localMeta.ts for the reasoning behind each one.
 */
import { storage } from './mmkv';

function lastUpdatedKey(uid?: string | null): string {
  return uid ? `planr_lastUpdated:${uid}` : 'planr_lastUpdated:guest';
}

export function getLocalLastUpdated(uid?: string | null): number {
  try {
    return parseInt(storage.getString(lastUpdatedKey(uid)) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function writeLocalLastUpdated(ts: number, uid?: string | null): void {
  try {
    storage.set(lastUpdatedKey(uid), String(ts));
  } catch {
    // MMKV unavailable — non-fatal
  }
}

const BASE_REV_PREFIX = 'planr_baseRev';

function baseRevKey(uid?: string | null): string {
  return uid ? `${BASE_REV_PREFIX}:${uid}` : `${BASE_REV_PREFIX}:guest`;
}

/** The rev this device has incorporated, or null if it has never pulled. */
export function getLocalBaseRev(uid?: string | null): number | null {
  try {
    const raw = storage.getString(baseRevKey(uid));
    if (raw === undefined) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLocalBaseRev(rev: number, uid?: string | null): void {
  try {
    storage.set(baseRevKey(uid), String(rev));
  } catch {
    // non-fatal — an unknown base rev is treated conservatively by the push guard
  }
}

export function clearLocalBaseRev(uid?: string | null): void {
  try {
    storage.delete(baseRevKey(uid));
  } catch {
    // non-fatal
  }
}
