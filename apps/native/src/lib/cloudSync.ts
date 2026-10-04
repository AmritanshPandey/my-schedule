/**
 * Cloud Sync Engine — native port of lib/cloudSync.ts. Same Firestore
 * document (`users/{uid}/data/snapshot`), same compare-and-swap/merge
 * algorithm (packages/core/lib/mergeSchedule.ts), same daily-backup and
 * conflict-archive behavior — this is the same engine, not a rewrite, so a
 * device running the native app and one running the web app resolve a
 * conflict identically.
 *
 * What's different from the web version, and why:
 * - AppState replaces `document.visibilitychange` (foreground/background is
 *   the mobile analog of tab visibility) — no Web Locks equivalent exists,
 *   so the background flush is a best-effort direct call rather than a
 *   lock-extended one; background execution time is capped by the OS either
 *   way.
 * - There's no `navigator.onLine`/`window "online"` event without adding
 *   @react-native-community/netinfo as a new native dependency. Skipped for
 *   this pass: the existing try/catch + exponential-backoff retry already
 *   handles a failed push whether the cause was "offline" or any other
 *   transient Firestore error, so the online gate was an optimization
 *   (avoid a doomed attempt), not something correctness depends on.
 * - No `window.dispatchEvent(CustomEvent)` — merges are delivered through a
 *   plain listener set (onCloudMerge), the same pattern this file already
 *   uses for onSyncStatusChange.
 * - Consumed the same way: apps/native/src/lib/useScheduleDB.ts subscribes
 *   with onCloudMerge and MERGES the remote into local state, exactly like
 *   lib/useScheduleDB.ts's 'cloud-sync-merge' listener.
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
} from 'firebase/firestore';
import { AppState, type AppStateStatus } from 'react-native';
import { db } from './firebase';
import { logError } from './errorLog';
import {
  clearLocalBaseRev,
  getLocalBaseRev,
  getLocalLastUpdated,
  writeLocalBaseRev,
} from '../storage/localMeta';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { localISODate } from '@planr/core/lib/dateUtils';
import { schedulePayloadBytes, validateSchedule } from '@planr/core/lib/scheduleSchema';
import { pushIsSafe, type SnapshotDoc } from '@planr/core/lib/syncRevision';
import { mergeSchedules, PLACEHOLDER_STAMP } from '@planr/core/lib/mergeSchedule';
import { NS } from '@planr/core/lib/stampSchedule';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'merged';

export interface CloudSnapshot {
  uid: string;
  schedule: Schedule;
  lastUpdated: number;
  /** True when this device just wrote this schedule as a merge result — the
   *  listener should absorb it locally without re-queuing a push. */
  pushed?: boolean;
}

export type CloudMergeResult = 'merged' | 'equal' | 'missing' | 'error';

// ── Module state ──────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 30_000;
const RETRY_DELAYS = [5_000, 15_000, 45_000];

let _uid: string | null = null;
let _timer: ReturnType<typeof setTimeout> | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _retryCount = 0;
let _syncing = false;
let _pending: Schedule | null = null;
let _lastSchedule: Schedule | null = null;
let _lastSyncedAt = 0;
let _lastPullAt = 0;
let _status: SyncStatus = 'idle';
let _remoteReadOk = false;

const PULL_THROTTLE_MS = 10_000;

const _statusListeners = new Set<(s: SyncStatus) => void>();
const _mergeListeners = new Set<(snapshot: CloudSnapshot) => void>();

function firestoreRef(uid: string) {
  if (!db) throw new Error('[CloudSync] Firestore not initialized');
  return doc(db, 'users', uid, 'data', 'snapshot');
}

// ── Snapshot history (daily backups) ────────────────────────────────────────

const BACKUP_KEEP = 10;
let _lastBackupDate: string | null = null;

function backupDocRef(uid: string, id: string) {
  if (!db) throw new Error('[CloudSync] Firestore not initialized');
  return doc(db, 'users', uid, 'backups', id);
}

function backupsCollection(uid: string) {
  if (!db) throw new Error('[CloudSync] Firestore not initialized');
  return collection(db, 'users', uid, 'backups');
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
  const snaps = await getDocs(backupsCollection(uid));
  const ids = snaps.docs.map((d) => d.id).sort();
  const excess = ids.slice(0, Math.max(0, ids.length - BACKUP_KEEP));
  await Promise.all(excess.map((id) => deleteDoc(backupDocRef(uid, id))));
}

// ── Conflict archive ──────────────────────────────────────────────────────────

const CONFLICT_KEEP = 10;

function conflictsCollection(uid: string) {
  if (!db) throw new Error('[CloudSync] Firestore not initialized');
  return collection(db, 'users', uid, 'conflicts');
}

async function pruneConflicts(uid: string): Promise<void> {
  const snaps = await getDocs(conflictsCollection(uid));
  const ids = snaps.docs.map((d) => d.id).sort();
  const excess = ids.slice(0, Math.max(0, ids.length - CONFLICT_KEEP));
  await Promise.all(excess.map((old) => deleteDoc(doc(conflictsCollection(uid), old))));
}

export interface CloudBackupMeta {
  id: string;
  lastUpdated: number;
}

export async function listCloudBackups(): Promise<CloudBackupMeta[]> {
  if (!_uid || !db) return [];
  const snaps = await getDocs(backupsCollection(_uid));
  return snaps.docs
    .map((d) => ({ id: d.id, lastUpdated: (d.data().lastUpdated as number) ?? 0 }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

export async function fetchCloudBackup(id: string): Promise<unknown | null> {
  if (!_uid || !db) return null;
  const snap = await getDoc(backupDocRef(_uid, id));
  if (!snap.exists()) return null;
  return (snap.data() as { schedule?: unknown }).schedule ?? null;
}

function setStatus(s: SyncStatus) {
  _status = s;
  _statusListeners.forEach((fn) => fn(s));
}

function emitMerge(snapshot: CloudSnapshot) {
  _mergeListeners.forEach((fn) => fn(snapshot));
}

// ── AppState handler (foreground/background — mobile's tab-visibility analog) ──

// AppState.currentState is loosely typed (`string | null | undefined`) since
// it can be unknown briefly at startup — 'active' is a safe assumption for
// that window, since the sync engine only ever starts from a foreground app.
let _appStateSub: { remove: () => void } | null = null;
let _lastAppState: AppStateStatus = (AppState.currentState as AppStateStatus) ?? 'active';

function attachListeners() {
  _lastAppState = (AppState.currentState as AppStateStatus) ?? 'active';
  const sub = AppState.addEventListener('change', (next) => {
    const prev = _lastAppState;
    _lastAppState = next;

    if (next === 'background' && prev !== 'background') {
      if (_pending) void performSync(_pending);
    } else if (next === 'active' && prev !== 'active') {
      if (_pending) {
        scheduleSync(_pending, 3_000);
      } else {
        void maybePull();
      }
    }
  });
  _appStateSub = sub;
}

function detachListeners() {
  _appStateSub?.remove();
  _appStateSub = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

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
    setStatus('idle');
  }
  _uid = uid;
  detachListeners();
  attachListeners();
}

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
  setStatus('idle');
}

export function getSyncStatus(): SyncStatus {
  return _status;
}

/** The signed-in uid sync is currently running for, or null for a guest.
 *  AuthProvider is the only writer, via initSync/destroySync. */
export function getSyncUid(): string | null {
  return _uid;
}

export function getLastSyncedAt(): number {
  return _lastSyncedAt;
}

export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  _statusListeners.add(fn);
  return () => _statusListeners.delete(fn);
}

/** Subscribe to remote snapshots read by this device. The listener (native
 *  useScheduleDB) merges them with local state and owns persisting the result. */
export function onCloudMerge(fn: (snapshot: CloudSnapshot) => void): () => void {
  _mergeListeners.add(fn);
  return () => _mergeListeners.delete(fn);
}

export function getLastSchedule(): Schedule | null {
  return _lastSchedule;
}

export function noteLatestSchedule(schedule: Schedule): void {
  _lastSchedule = schedule;
}

export async function deleteCloudData(): Promise<void> {
  if (!_uid) return;
  try {
    await deleteDoc(firestoreRef(_uid));
    const backups = await getDocs(backupsCollection(_uid));
    await Promise.all(backups.docs.map((d) => deleteDoc(d.ref)));
    _lastSyncedAt = 0;
    _lastBackupDate = null;
    _pending = null;
    clearLocalBaseRev(_uid);
    _remoteReadOk = true;
    setStatus('idle');
  } catch (err) {
    console.warn('[CloudSync] deleteCloudData failed:', err);
  }
}

/** Queue a debounced cloud sync. No-op for guest users. Safe to call on
 *  every local write (see useScheduleDB.ts's write effect). */
export function queueSync(schedule: Schedule): void {
  _lastSchedule = schedule;
  if (!_uid) return;
  _pending = schedule;
  _retryCount = 0;
  scheduleSync(schedule, DEBOUNCE_MS);
}

export async function flushNow(schedule: Schedule): Promise<void> {
  if (!_uid) return;
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  if (_syncing) {
    await new Promise<void>((resolve) => {
      const check = () => (_syncing ? setTimeout(check, 50) : resolve());
      check();
    });
  }
  await performSync(schedule);
}

export async function mergeCloudIfNewer(uid: string, localLastUpdated: number): Promise<CloudMergeResult> {
  try {
    const snap = await getDoc(firestoreRef(uid));
    _remoteReadOk = true;
    if (!snap.exists()) {
      writeLocalBaseRev(0, uid);
      return 'missing';
    }

    const data = snap.data() as SnapshotDoc;
    const remoteRev = data.rev ?? 0;
    if (!data.schedule || !data.lastUpdated) {
      writeLocalBaseRev(remoteRev, uid);
      return 'missing';
    }
    if (data.lastUpdated === localLastUpdated) {
      writeLocalBaseRev(remoteRev, uid);
      return 'equal';
    }

    emitMerge({ uid, schedule: data.schedule, lastUpdated: data.lastUpdated });

    writeLocalBaseRev(remoteRev, uid);
    if (data.lastUpdated > _lastSyncedAt) _lastSyncedAt = data.lastUpdated;
    return 'merged';
  } catch (err) {
    console.warn('[CloudSync] mergeCloudIfNewer failed:', err);
    return 'error';
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function maybePull(): Promise<void> {
  if (!_uid || _pending || _syncing) return;
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
          completionHistory: task.completionHistory?.filter((e) => e.completedAt >= cutoffIso),
        })),
      ]),
    ) as Schedule['activities'],
  };
}

const MAX_DOC_BYTES = 900_000;

function encodedBytes(value: unknown): number {
  return schedulePayloadBytes(value);
}

export function serializedScheduleSize(schedule: Schedule): number {
  return schedulePayloadBytes(schedule);
}

function capPayloadSize(schedule: Schedule): {
  payload: Schedule;
  oversizedFields: number;
  overflow: boolean;
} {
  if (encodedBytes(schedule) <= MAX_DOC_BYTES) {
    return { payload: schedule, oversizedFields: 0, overflow: false };
  }

  let oversizedFields = 0;
  let payload: Schedule = schedule;

  if (Array.isArray(payload.notes) && payload.notes.length > 0) {
    const order = payload.notes
      .map((n, i) => ({ i, size: n.body?.length ?? 0 }))
      .sort((a, b) => b.size - a.size);
    const notes = [...payload.notes];
    const blanked: string[] = [];
    for (const { i } of order) {
      if (encodedBytes(payload) <= MAX_DOC_BYTES) break;
      if (notes[i]?.body) {
        notes[i] = { ...notes[i], body: '' };
        blanked.push(notes[i].id);
        oversizedFields++;
        payload = { ...payload, notes };
      }
    }
    if (blanked.length > 0) payload = demoteBlankedNotes(payload, blanked);
  }

  return { payload, oversizedFields, overflow: encodedBytes(payload) > MAX_DOC_BYTES };
}

function demoteBlankedNotes(payload: Schedule, blankedIds: string[]): Schedule {
  const updated = { ...(payload.syncMeta?.updated ?? {}) };
  for (const id of blankedIds) updated[`${NS.note}|${id}`] = PLACEHOLDER_STAMP;
  return { ...payload, syncMeta: { ...payload.syncMeta, updated } };
}

// -- Compare-and-swap push ---------------------------------------------------

interface PushOutcome {
  rev: number | null;
  merged: Schedule | null;
  invalid: string | null;
}

const NO_PUSH: PushOutcome = { rev: null, merged: null, invalid: null };

async function pushWithCas(
  uid: string,
  local: Schedule,
  now: number,
  baseRev: number | null,
): Promise<PushOutcome> {
  if (!db) throw new Error('[CloudSync] Firestore not initialized');
  const ref = firestoreRef(uid);
  const localLastUpdated = getLocalLastUpdated(uid);
  let outcome: PushOutcome = NO_PUSH;
  let oversizedFields = 0;

  await runTransaction(db, async (tx) => {
    outcome = NO_PUSH;
    oversizedFields = 0;
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() as SnapshotDoc) : null;

    let merged: Schedule | null = null;
    let source: Schedule = local;
    if (!pushIsSafe(data, baseRev, localLastUpdated) && data?.schedule) {
      merged = mergeSchedules(
        { schedule: local, lastUpdated: localLastUpdated },
        { schedule: data.schedule, lastUpdated: data.lastUpdated ?? 0 },
      );
      source = merged;
    }

    const capped = capPayloadSize(trimForSync(source));
    oversizedFields = capped.oversizedFields;
    if (capped.overflow) {
      outcome = {
        rev: null,
        merged: null,
        invalid: `payload is ${Math.round(encodedBytes(capped.payload) / 1000)} KB after trimming, over Firestore's document limit`,
      };
      return;
    }
    const validation = validateSchedule(capped.payload);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      outcome = {
        rev: null,
        merged: null,
        invalid: `${issue?.path.join('.') || 'root'}: ${issue?.message || 'invalid data'}`,
      };
      return;
    }

    const nextRev = (data?.rev ?? 0) + 1;
    tx.set(ref, {
      schedule: validation.data,
      lastUpdated: now,
      rev: nextRev,
      syncedAt: serverTimestamp(),
    });
    if (merged) {
      const localCopy = capPayloadSize(trimForSync(local)).payload;
      tx.set(doc(conflictsCollection(uid), new Date(now).toISOString()), {
        schedule: localCopy,
        lastUpdated: localLastUpdated,
        baseRev,
        remoteRev: data?.rev ?? 0,
        savedAt: serverTimestamp(),
      });
    }
    outcome = { rev: nextRev, merged, invalid: null };
  });

  if (oversizedFields > 0) {
    logError(
      'cloudsync:oversize',
      `Cloud backup skipped ${oversizedFields} oversized field(s) to fit Firestore's 1MB limit. They remain saved on this device.`,
    );
  }
  return outcome;
}

async function performSync(schedule: Schedule): Promise<void> {
  if (!_uid) return;
  if (_syncing) {
    _pending = schedule;
    return;
  }

  _syncing = true;
  setStatus('syncing');
  const uid = _uid;
  const pendingSnapshot = _pending;

  const now = Date.now();
  try {
    if (!_remoteReadOk) {
      const bootstrap = await mergeCloudIfNewer(uid, getLocalLastUpdated(uid));
      if (bootstrap === 'error') {
        _pending = schedule;
        setStatus('error');
        scheduleRetry(schedule);
        return;
      }
      if (bootstrap === 'merged') {
        setStatus('idle');
        return;
      }
    }

    const outcome = await pushWithCas(uid, schedule, now, getLocalBaseRev(uid));

    if (outcome.invalid !== null) {
      logError('cloudsync:validation', `Cloud sync skipped — ${outcome.invalid}`);
      if (_pending === pendingSnapshot) _pending = null;
      setStatus('error');
      return;
    }
    if (outcome.rev === null) {
      setStatus('error');
      scheduleRetry(schedule);
      return;
    }

    writeLocalBaseRev(outcome.rev, uid);
    _lastSyncedAt = now;
    _retryCount = 0;
    if (_retryTimer) {
      clearTimeout(_retryTimer);
      _retryTimer = null;
    }
    if (_pending === pendingSnapshot) _pending = null;

    if (outcome.merged) {
      emitMerge({ uid, schedule: outcome.merged, lastUpdated: now, pushed: true });
      setStatus('merged');
    } else {
      setStatus('idle');
    }

    void writeDailyBackup(uid, outcome.merged ?? schedule, now).catch((err) => {
      console.warn('[CloudSync] daily backup failed:', err);
    });
    if (outcome.merged) {
      void pruneConflicts(uid).catch(() => {
        // Housekeeping only
      });
    }
  } catch (err) {
    logError('cloudsync', err);
    setStatus('error');
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
