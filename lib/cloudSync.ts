/**
 * Cloud Sync Engine — module-level singleton.
 *
 * Design rules:
 * - No realtime listeners. Sync is manual and debounced.
 * - queueSync() is a no-op for guest users.
 * - All Firestore writes are batched into one document.
 * - Visibility/online events trigger smart syncs.
 * - Everything cleans up on destroySync().
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Schedule } from "@/lib/useScheduleDB";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface CloudSnapshot {
  schedule: Schedule;
  lastUpdated: number;
}

// ── Module state ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 30_000; // 30 s between auto-syncs

let _uid: string | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _syncing = false;
let _pending: Schedule | null = null;
let _lastSchedule: Schedule | null = null; // latest snapshot seen by queueSync
let _lastSyncedAt = 0;
let _status: SyncStatus = "idle";
let _skipNextSync = false; // prevents re-uploading data we just downloaded

const _listeners = new Set<(s: SyncStatus) => void>();

function firestoreRef(uid: string) {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  return doc(db, "users", uid, "data", "snapshot");
}

function setStatus(s: SyncStatus) {
  _status = s;
  _listeners.forEach((fn) => fn(s));
}

// ── Visibility + online handlers (set up once, torn down on destroySync) ──────

let _visibilityFn: (() => void) | null = null;
let _onlineFn: (() => void) | null = null;

function attachListeners() {
  _visibilityFn = () => {
    if (document.visibilityState === "hidden" && _pending) {
      // Use Web Locks API when available to extend tab lifetime during the flush.
      const snap = _pending;
      if ("locks" in navigator) {
        navigator.locks.request("planr-sync-flush", { steal: true }, () => performSync(snap));
      } else {
        performSync(snap);
      }
    } else if (document.visibilityState === "visible" && _pending) {
      scheduleSync(_pending, 3_000); // re-queue shortly after coming back
    }
  };
  _onlineFn = () => {
    if (_pending) scheduleSync(_pending, 5_000); // retry soon after reconnect
  };

  document.addEventListener("visibilitychange", _visibilityFn);
  window.addEventListener("online", _onlineFn);
}

function detachListeners() {
  if (_visibilityFn) document.removeEventListener("visibilitychange", _visibilityFn);
  if (_onlineFn) window.removeEventListener("online", _onlineFn);
  _visibilityFn = null;
  _onlineFn = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once when an authenticated user is resolved. */
export function initSync(uid: string) {
  _uid = uid;
  attachListeners();
}

/** Call on sign-out or component teardown. */
export function destroySync() {
  if (_timer) clearTimeout(_timer);
  _timer = null;
  _uid = null;
  _pending = null;
  _syncing = false;
  _skipNextSync = false;
  detachListeners();
  setStatus("idle");
}

export function getSyncStatus(): SyncStatus {
  return _status;
}

export function getLastSyncedAt(): number {
  return _lastSyncedAt;
}

/** Subscribe to status changes. Returns an unsubscribe function. */
export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Returns the most recent schedule seen by queueSync (for flush-on-logout). */
export function getLastSchedule(): Schedule | null {
  return _lastSchedule;
}

/** Delete the user's cloud snapshot. Used by "Clear data". */
export async function deleteCloudData(): Promise<void> {
  if (!_uid) return;
  try {
    await deleteDoc(firestoreRef(_uid));
    _lastSyncedAt = 0;
    _pending = null;
    setStatus("idle");
  } catch (err) {
    console.warn("[CloudSync] deleteCloudData failed:", err);
  }
}

/**
 * Queue a debounced cloud sync. No-op for guest users.
 * Safe to call on every IndexedDB write.
 */
export function queueSync(schedule: Schedule): void {
  if (!_uid || _skipNextSync) {
    _skipNextSync = false;
    return;
  }
  _lastSchedule = schedule;
  _pending = schedule;
  scheduleSync(schedule, DEBOUNCE_MS);
}

/**
 * Immediately push current data to cloud (e.g., on logout or app close).
 * No-op for guest users. Waits for any in-progress sync to finish first.
 */
export async function flushNow(schedule: Schedule): Promise<void> {
  if (!_uid) return;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  // If a sync is already in flight, wait for it to finish (poll with short delay)
  // before pushing the latest snapshot so the logout flush isn't silently skipped.
  if (_syncing) {
    await new Promise<void>((resolve) => {
      const check = () => (_syncing ? setTimeout(check, 50) : resolve());
      check();
    });
  }
  await performSync(schedule);
}

/**
 * On login: fetch cloud snapshot and merge if it's newer than local.
 * Dispatches a "cloud-sync-merge" CustomEvent so useScheduleDB can
 * update its state without coupling to Firebase directly.
 *
 * Returns true if a merge happened.
 */
export async function mergeCloudIfNewer(
  uid: string,
  localLastUpdated: number
): Promise<boolean> {
  try {
    const snap = await getDoc(firestoreRef(uid));
    if (!snap.exists()) return false;

    const data = snap.data() as { schedule?: Schedule; lastUpdated?: number };
    if (!data.schedule || !data.lastUpdated) return false;
    if (data.lastUpdated <= localLastUpdated) return false;

    // Cloud is newer → notify useScheduleDB to absorb the data.
    // Cancel any pending local sync first — the local data is stale and must
    // not overwrite the cloud data we're about to absorb.
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _pending = null;
    _skipNextSync = true;

    const event = new CustomEvent<CloudSnapshot>("cloud-sync-merge", {
      detail: { schedule: data.schedule, lastUpdated: data.lastUpdated },
    });
    window.dispatchEvent(event);

    _lastSyncedAt = data.lastUpdated;
    return true;
  } catch (err) {
    console.warn("[CloudSync] mergeCloudIfNewer failed:", err);
    return false;
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function scheduleSync(schedule: Schedule, delayMs: number) {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    performSync(schedule);
  }, delayMs);
}

// Trim payload before writing to Firestore (1 MB document limit).
// - completionHistory: drop events older than 90 days
// - strategies.pdfData: strip binary blobs entirely (base64 PDF = multi-MB,
//   would blow the limit on its own). HTML content is text and stays.
//   PDF files remain local-only until Firebase Storage is wired up.
function trimForSync(schedule: Schedule): Schedule {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffIso = cutoff.toISOString();

  return {
    ...schedule,
    activities: Object.fromEntries(
      Object.entries(schedule.activities).map(([day, tasks]) => [
        day,
        tasks.map((task) => ({
          ...task,
          completionHistory: task.completionHistory?.filter(
            (e) => e.completedAt >= cutoffIso
          ),
        })),
      ])
    ) as Schedule["activities"],
    strategies: (schedule.strategies ?? []).map(({ pdfData: _dropped, ...rest }) => rest),
  };
}

async function performSync(schedule: Schedule): Promise<void> {
  if (!_uid) return;
  if (!navigator.onLine) {
    setStatus("offline");
    _pending = schedule;
    return;
  }
  if (_syncing) {
    _pending = schedule; // will be re-queued after current sync
    return;
  }

  _syncing = true;
  setStatus("syncing");
  const pendingSnapshot = _pending; // capture so we can detect new edits during await

  const now = Date.now();
  try {
    await setDoc(firestoreRef(_uid), {
      schedule: trimForSync(schedule),
      lastUpdated: now,
      syncedAt: serverTimestamp(),
    });
    _lastSyncedAt = now;
    // Only clear _pending if no new edit arrived while we were awaiting setDoc
    if (_pending === pendingSnapshot) _pending = null;
    setStatus("idle");
  } catch (err) {
    console.error("[CloudSync] performSync failed:", err);
    setStatus("error");
    // Keep _pending so we retry on next trigger
  } finally {
    _syncing = false;
  }
}
