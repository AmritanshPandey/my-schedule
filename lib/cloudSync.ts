/**
 * Cloud Sync Engine — module-level singleton.
 *
 * Design rules:
 * - No realtime listeners. Sync is manual and debounced.
 * - queueSync() is a no-op for guest users.
 * - All Firestore writes are batched into one document.
 * - Visibility/online events trigger smart syncs.
 * - Everything cleans up on destroySync().
 *
 * Concurrency: the snapshot document carries a monotonic `rev`, and every push
 * is a compare-and-swap inside a transaction against the rev this device has
 * actually incorporated (see getLocalBaseRev). A device can therefore never
 * overwrite a revision it has not absorbed — which is what used to let a second
 * device silently replace the first device's work. When the CAS fails, the
 * local snapshot is archived to users/{uid}/conflicts/{ISO} and the remote is
 * adopted: visible and recoverable rather than silent and lost.
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Schedule } from "@/lib/useScheduleDB";
import { logError } from "@/lib/errorLog";
import {
  clearLocalBaseRev,
  getLocalBaseRev,
  getLocalLastUpdated,
  writeLocalBaseRev,
} from "@/lib/localMeta";
import { localISODate } from "@/lib/dateUtils";
import { schedulePayloadBytes, validateSchedule } from "@/lib/scheduleSchema";
import { pushIsSafe, type SnapshotDoc } from "@/lib/syncRevision";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "conflict";

export interface CloudSnapshot {
  uid: string;
  schedule: Schedule;
  lastUpdated: number;
}

export type CloudMergeResult = "merged" | "local-newer" | "equal" | "missing" | "error";

// ── Module state ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 30_000; // 30 s between auto-syncs

const RETRY_DELAYS = [5_000, 15_000, 45_000]; // exponential-ish backoff after a failed sync

let _uid: string | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryCount = 0;
let _syncing = false;
let _pending: Schedule | null = null;
let _lastSchedule: Schedule | null = null; // latest snapshot seen by queueSync
let _lastSyncedAt = 0;
let _lastPullAt = 0; // throttle resume/reconnect pulls (rapid visibility toggles)
let _status: SyncStatus = "idle";
// Have we successfully READ the remote document at least once this session?
// Pushing before a read is how a device with stale local data used to clobber
// the cloud after a failed pull. This is a session flag; the durable half of the
// guard is the persisted base rev, which survives reloads.
let _remoteReadOk = false;

const PULL_THROTTLE_MS = 10_000; // at most one resume-pull per 10 s
const LARGE_PAYLOAD_WARNING_BYTES = 750_000;

const _listeners = new Set<(s: SyncStatus) => void>();

function firestoreRef(uid: string) {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  return doc(db, "users", uid, "data", "snapshot");
}

// ── Snapshot history ──────────────────────────────────────────────────────────
// One versioned backup doc per day (users/{uid}/backups/{YYYY-MM-DD}), written
// alongside the first successful push of the day and pruned to the most recent
// BACKUP_KEEP. Exists so a bad sync/merge/restore is never unrecoverable — the
// live snapshot doc is last-write-wins, these are its safety net.

const BACKUP_KEEP = 10;
let _lastBackupDate: string | null = null;

function backupDocRef(uid: string, id: string) {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  return doc(db, "users", uid, "backups", id);
}

function backupsCollection(uid: string) {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  return collection(db, "users", uid, "backups");
}

async function writeDailyBackup(uid: string, payload: Schedule, lastUpdated: number): Promise<void> {
  const today = localISODate(new Date());
  if (_lastBackupDate === today) return;
  await setDoc(backupDocRef(uid, today), {
    schedule: payload,
    lastUpdated,
    savedAt: serverTimestamp(),
  });
  _lastBackupDate = today;
  // Prune: doc ids are ISO dates, so lexicographic order is chronological.
  const snaps = await getDocs(backupsCollection(uid));
  const ids = snaps.docs.map((d) => d.id).sort();
  const excess = ids.slice(0, Math.max(0, ids.length - BACKUP_KEEP));
  await Promise.all(excess.map((id) => deleteDoc(backupDocRef(uid, id))));
}

// ── Conflict archive ──────────────────────────────────────────────────────────
// When a push loses the compare-and-swap, the local snapshot is parked here
// before the remote is adopted, so a diverged device never simply loses its
// work. Deliberately a SEPARATE collection from `backups`: that one prunes by
// lexicographic id sort assuming YYYY-MM-DD ids, and a full-ISO id mixed in
// would break its ordering.

const CONFLICT_KEEP = 10;

function conflictsCollection(uid: string) {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  return collection(db, "users", uid, "conflicts");
}

async function archiveConflict(uid: string, local: Schedule, localRev: number | null): Promise<void> {
  const id = new Date().toISOString();
  // Same transport limits as the live snapshot: an oversized archive write
  // would fail, and a failed archive leaves the device permanently unable to
  // resolve the conflict.
  const { payload } = capPayloadSize(trimForSync(local));
  await setDoc(doc(conflictsCollection(uid), id), {
    schedule: payload,
    lastUpdated: getLocalLastUpdated(uid),
    baseRev: localRev,
    savedAt: serverTimestamp(),
  });
  // Full ISO ids sort chronologically too, so the same prune shape works here.
  const snaps = await getDocs(conflictsCollection(uid));
  const ids = snaps.docs.map((d) => d.id).sort();
  const excess = ids.slice(0, Math.max(0, ids.length - CONFLICT_KEEP));
  await Promise.all(excess.map((old) => deleteDoc(doc(conflictsCollection(uid), old))));
}

export interface CloudBackupMeta {
  id: string; // ISO date, doubles as the display label source
  lastUpdated: number;
}

/** List available daily snapshots, newest first. Empty for guests/offline. */
export async function listCloudBackups(): Promise<CloudBackupMeta[]> {
  if (!_uid || !db) return [];
  const snaps = await getDocs(backupsCollection(_uid));
  return snaps.docs
    .map((d) => ({ id: d.id, lastUpdated: (d.data().lastUpdated as number) ?? 0 }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Fetch one daily snapshot's raw schedule (un-migrated), or null if gone. */
export async function fetchCloudBackup(id: string): Promise<unknown | null> {
  if (!_uid || !db) return null;
  const snap = await getDoc(backupDocRef(_uid, id));
  if (!snap.exists()) return null;
  return (snap.data() as { schedule?: unknown }).schedule ?? null;
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
      // If the lock can't be acquired (rejects/throws), still flush directly so
      // the final edit isn't silently dropped on tab close.
      const snap = _pending;
      if ("locks" in navigator) {
        try {
          navigator.locks
            .request("planr-sync-flush", { steal: true }, () => performSync(snap))
            .catch(() => performSync(snap));
        } catch {
          performSync(snap);
        }
      } else {
        performSync(snap);
      }
    } else if (document.visibilityState === "visible") {
      if (_pending) {
        scheduleSync(_pending, 3_000); // re-queue local edits shortly after coming back
      } else {
        // Caught up locally → pull any newer snapshot another device wrote while
        // this one was backgrounded, so the two surfaces stay in step without a
        // full reload.
        void maybePull();
      }
    }
  };
  _onlineFn = () => {
    if (_pending) scheduleSync(_pending, 5_000); // retry soon after reconnect
    else void maybePull(); // reconnected with nothing pending → check for remote changes
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
  if (_uid !== uid) {
    if (_timer) clearTimeout(_timer);
    if (_retryTimer) clearTimeout(_retryTimer);
    _timer = null;
    _retryTimer = null;
    _retryCount = 0;
    _pending = null;
    _lastSchedule = null;
    _lastSyncedAt = 0;
    _lastPullAt = 0;
    _lastBackupDate = null;
    _remoteReadOk = false;
    setStatus("idle");
  }
  _uid = uid;
  detachListeners();
  attachListeners();
}

/** Call on sign-out or component teardown. */
export function destroySync() {
  if (_timer) clearTimeout(_timer);
  if (_retryTimer) clearTimeout(_retryTimer);
  _timer = null;
  _retryTimer = null;
  _retryCount = 0;
  _uid = null;
  _pending = null;
  _lastSchedule = null;
  _lastSyncedAt = 0;
  _lastPullAt = 0;
  _lastBackupDate = null;
  _remoteReadOk = false;
  _syncing = false;
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

/**
 * Synchronously record the latest schedule without scheduling a sync.
 * Called on every local edit so flushNow() (logout/app-close) always has the
 * freshest data, instead of whatever the 30s debounce last happened to capture.
 */
export function noteLatestSchedule(schedule: Schedule): void {
  _lastSchedule = schedule;
}

/** Delete the user's cloud snapshot and its daily backups. Used by "Clear data". */
export async function deleteCloudData(): Promise<void> {
  if (!_uid) return;
  try {
    await deleteDoc(firestoreRef(_uid));
    const backups = await getDocs(backupsCollection(_uid));
    await Promise.all(backups.docs.map((d) => deleteDoc(d.ref)));
    _lastSyncedAt = 0;
    _lastBackupDate = null;
    _pending = null;
    // The document is gone, so the revision counter restarts from zero; a
    // leftover base rev would make the next push look like a conflict.
    clearLocalBaseRev(_uid);
    _remoteReadOk = true; // we just read/wrote the remote: it is definitively empty
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
  _lastSchedule = schedule; // always track latest so flushNow / Sync Now always has data
  if (!_uid) return;
  _pending = schedule;
  // A fresh edit deserves a fresh backoff budget: without this, three failures
  // exhaust RETRY_DELAYS for the rest of the session and nothing auto-retries
  // again however much the user goes on to change.
  _retryCount = 0;
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
 * Reports which side is newer so callers can immediately recover unsynced
 * local data without overwriting a newer cloud snapshot.
 *
 * Base-rev bookkeeping is the subtle part. The rev is recorded only when this
 * device ends up holding the remote *content*: on "merged" (absorbed), on
 * "equal" (identical by construction) and on "missing" (nothing to lose).
 * It is deliberately NOT recorded on "local-newer" — that verdict rests on two
 * unsynchronised wall clocks, and advancing the base there would hand a device
 * with a fast clock a licence to overwrite work it never saw, which is the
 * exact failure this whole mechanism exists to prevent.
 *
 * `force` skips the freshness comparison and adopts the remote outright; used
 * by the conflict path, where the remote has already won the CAS.
 */
export async function mergeCloudIfNewer(
  uid: string,
  localLastUpdated: number,
  force = false,
): Promise<CloudMergeResult> {
  try {
    const snap = await getDoc(firestoreRef(uid));
    _remoteReadOk = true;
    if (!snap.exists()) {
      writeLocalBaseRev(0, uid);
      return "missing";
    }

    const data = snap.data() as SnapshotDoc;
    const remoteRev = data.rev ?? 0;
    if (!data.schedule || !data.lastUpdated) {
      writeLocalBaseRev(remoteRev, uid);
      return "missing";
    }
    if (!force) {
      if (data.lastUpdated < localLastUpdated) return "local-newer";
      if (data.lastUpdated === localLastUpdated) {
        writeLocalBaseRev(remoteRev, uid);
        return "equal";
      }
    }

    // Cloud is newer → notify useScheduleDB to absorb the data.
    // Cancel any pending local sync first — the local data is stale and must
    // not overwrite the cloud data we're about to absorb.
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _pending = null;
    const event = new CustomEvent<CloudSnapshot>("cloud-sync-merge", {
      detail: { uid, schedule: data.schedule, lastUpdated: data.lastUpdated },
    });
    window.dispatchEvent(event);

    writeLocalBaseRev(remoteRev, uid);
    _lastSyncedAt = data.lastUpdated;
    return "merged";
  } catch (err) {
    console.warn("[CloudSync] mergeCloudIfNewer failed:", err);
    return "error";
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

/**
 * Pull a newer cloud snapshot on resume/reconnect. Only runs when this device is
 * "caught up" (no _pending local edits) so a passive resume never clobbers
 * unsynced local work — those edits are pushed instead and the pull happens on a
 * later resume. Throttled and skipped while a push is in flight. mergeCloudIfNewer
 * is a no-op unless the cloud is strictly newer, and the merge listener's
 * equality guard suppresses any redundant re-render.
 */
async function maybePull(): Promise<void> {
  if (!_uid || _pending || _syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const now = Date.now();
  if (now - _lastPullAt < PULL_THROTTLE_MS) return;
  _lastPullAt = now;
  try {
    await mergeCloudIfNewer(_uid, getLocalLastUpdated(_uid));
  } catch {
    // non-fatal — mergeCloudIfNewer already swallows + logs its own errors
  }
}

function scheduleSync(schedule: Schedule, delayMs: number) {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => {
    _timer = null;
    performSync(schedule);
  }, delayMs);
}

// Trim payload before writing to Firestore (1 MB document limit).
// - completionHistory: drop events older than 90 days
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
  };
}

// Firestore caps a document at 1 MB. Stay comfortably under it; if a payload is
// still too big after trimForSync (e.g. a giant note), drop the
// largest offenders from the CLOUD copy only — they remain intact locally in
// IndexedDB — so the rest of the data still backs up instead of failing wholesale.
const MAX_DOC_BYTES = 900_000;

function encodedBytes(value: unknown): number {
  return schedulePayloadBytes(value);
}

/** Exported for diagnostics/tests without exposing the sync singleton. */
export function serializedScheduleSize(schedule: Schedule): number {
  return schedulePayloadBytes(schedule);
}

function capPayloadSize(schedule: Schedule): { payload: Schedule; oversizedFields: number } {
  if (encodedBytes(schedule) <= MAX_DOC_BYTES) return { payload: schedule, oversizedFields: 0 };

  let oversizedFields = 0;
  let payload: Schedule = schedule;

  // 1. Blank the largest note bodies until we fit (keep the note + title).
  if (Array.isArray(payload.notes) && payload.notes.length > 0) {
    const order = payload.notes
      .map((n, i) => ({ i, size: n.body?.length ?? 0 }))
      .sort((a, b) => b.size - a.size);
    const notes = [...payload.notes];
    for (const { i } of order) {
      if (encodedBytes(payload) <= MAX_DOC_BYTES) break;
      if (notes[i]?.body) {
        notes[i] = { ...notes[i], body: "" };
        oversizedFields++;
        payload = { ...payload, notes };
      }
    }
  }

  return { payload, oversizedFields };
}

// ── Compare-and-swap push ─────────────────────────────────────────────────────

type PushOutcome = { ok: true; rev: number } | { ok: false };

async function pushWithCas(
  uid: string,
  payload: Schedule,
  now: number,
  baseRev: number | null,
): Promise<PushOutcome> {
  if (!db) throw new Error("[CloudSync] Firestore not initialized");
  const ref = firestoreRef(uid);
  const localLastUpdated = getLocalLastUpdated(uid);
  let outcome: PushOutcome = { ok: false };

  await runTransaction(db, async (tx) => {
    // Firestore re-runs this callback on contention, so every path must assign
    // the outcome rather than assume the previous attempt's value.
    outcome = { ok: false };
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() as SnapshotDoc) : null;
    if (!pushIsSafe(data, baseRev, localLastUpdated)) return; // read-only txn: nothing written

    const nextRev = (data?.rev ?? 0) + 1;
    tx.set(ref, {
      schedule: payload,
      lastUpdated: now,
      rev: nextRev,
      syncedAt: serverTimestamp(),
    });
    outcome = { ok: true, rev: nextRev };
  });

  return outcome;
}

/**
 * The push lost the CAS: another device owns a revision this one never absorbed.
 * Park the local snapshot in the cloud first, then adopt the remote so this
 * device rejoins the shared lineage and the user's next edit pushes cleanly.
 *
 * If the archive write itself fails we deliberately do NOT adopt — leaving the
 * device stuck-but-visible is recoverable; discarding local data to a failed
 * upload is not.
 */
async function handleConflict(uid: string, local: Schedule): Promise<void> {
  if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _retryCount = 0;
  _pending = null; // retrying can only lose the same CAS again

  try {
    await archiveConflict(uid, local, getLocalBaseRev(uid));
  } catch (err) {
    logError("cloudsync:conflict-archive", err);
    setStatus("conflict");
    return;
  }
  logError(
    "cloudsync:conflict",
    "Another device had newer cloud data. This device's copy was saved to the cloud conflict archive and the newer data was loaded.",
  );
  await mergeCloudIfNewer(uid, 0, true);
  setStatus("conflict");
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
  const uid = _uid;
  const pendingSnapshot = _pending; // capture so we can detect new edits during await

  const now = Date.now();
  try {
    // Never push before reading the remote at least once this session. A failed
    // boot pull used to fall straight through to a full-document overwrite.
    if (!_remoteReadOk) {
      const bootstrap = await mergeCloudIfNewer(uid, getLocalLastUpdated(uid));
      if (bootstrap === "error") {
        _pending = schedule;
        setStatus("error");
        scheduleRetry(schedule);
        return;
      }
      if (bootstrap === "merged") {
        // Remote was ahead and has just replaced local state; the snapshot we
        // were about to push is now orphaned, so archive rather than drop it.
        await handleConflict(uid, schedule);
        return;
      }
    }

    const { payload, oversizedFields } = capPayloadSize(trimForSync(schedule));
    const validation = validateSchedule(payload);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      logError("cloudsync:validation", `Schedule validation failed at ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid data"}`);
      // Drop it from the queue: retrying is pointless, and a stuck _pending
      // blocks every subsequent pull for the rest of the session.
      if (_pending === pendingSnapshot) _pending = null;
      setStatus("error");
      return;
    }
    const payloadBytes = serializedScheduleSize(payload);
    if (payloadBytes >= LARGE_PAYLOAD_WARNING_BYTES && process.env.NODE_ENV !== "production") {
      console.warn(
        `[CloudSync] Schedule payload is unusually large: ${(payloadBytes / 1_000_000).toFixed(2)} MB. Large content may come from notes, completion history, or embedded document data.`
      );
    }

    const outcome = await pushWithCas(uid, validation.data, now, getLocalBaseRev(uid));
    if (!outcome.ok) {
      await handleConflict(uid, schedule);
      return;
    }

    writeLocalBaseRev(outcome.rev, uid);
    _lastSyncedAt = now;
    _retryCount = 0;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    // Only clear _pending if no new edit arrived while we were awaiting the push
    if (_pending === pendingSnapshot) _pending = null;
    setStatus("idle");
    // Fire-and-forget: the daily safety-net snapshot must never block or fail
    // the main sync. First successful push of the day wins; pruning rides along.
    void writeDailyBackup(uid, validation.data, now).catch((err) => {
      console.warn("[CloudSync] daily backup failed:", err);
    });
    if (oversizedFields > 0) {
      logError(
        "cloudsync:oversize",
        `Cloud backup skipped ${oversizedFields} oversized field(s) to fit Firestore's 1MB limit. They remain saved on this device.`
      );
    }
  } catch (err) {
    logError("cloudsync", err);
    setStatus("error");
    // Keep _pending and auto-retry with backoff (transient network/Firestore
    // hiccups shouldn't strand the user on "Sync failed" until a manual retry).
    scheduleRetry(schedule);
  } finally {
    _syncing = false;
  }
}

function scheduleRetry(schedule: Schedule) {
  if (_retryTimer) clearTimeout(_retryTimer);
  if (_retryCount >= RETRY_DELAYS.length) return;
  const delay = RETRY_DELAYS[_retryCount];
  _retryCount++;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void performSync(_pending ?? schedule);
  }, delay);
}
