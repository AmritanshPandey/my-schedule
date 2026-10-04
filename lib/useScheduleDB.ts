"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { categoryFromIcon } from "@/lib/colorSystem";
import { mergeCloudIfNewer, queueSync, noteLatestSchedule } from "@/lib/cloudSync";
import { getLocalLastUpdated, writeLocalLastUpdated } from "@/lib/localMeta";
import { logError } from "@/lib/errorLog";
import { useAuth } from "@/contexts/AuthProvider";
import { DAYS } from "@/lib/scheduleConstants";
import { bootLog } from "@/lib/iosSafeMode";

export { DAYS, DAY_LABELS, DAY_FULL_LABELS } from "@/lib/scheduleConstants";

// Pure normalization lives in scheduleNormalize.ts (no React/auth deps, so it's
// unit-testable). Re-exported here so existing import sites are unchanged.
export { normalizeTasks, resetStaleCompletions } from "@/lib/scheduleNormalize";
import { applyAutoMissed } from "@/lib/consistency/autoMiss";
import { isEditableTarget } from "@/lib/keyboardEvents";
import { pushHistory, popHistory, HISTORY_LIMIT } from "@/lib/scheduleHistory";
import { validateSchedule } from "@/lib/scheduleSchema";
import { mergeSchedules, resolveLocalWrite } from "@/lib/mergeSchedule";
import { onLocalWrite, publishLocalWrite } from "@/lib/tabSync";
import { stampSchedule } from "@/lib/stampSchedule";

// ─── Shared domain types (packages/core/lib/scheduleTypes.ts) ─────────────
// Moved out so apps/native can use the same types via @planr/core. Re-exported
// here (explicit named export, not `export *`, to avoid it colliding with the
// identically-named local `import type` below) so every existing
// `@/lib/useScheduleDB` import site is unchanged.
export type {
  PlanCategory,
  PlanMetricGoal,
  GoalStatus,
  Goal,
  DomainEventType,
  ScheduleEvent,
  TaskCompletionEvent,
  TaskException,
  TaskRecurrence,
  TaskSlot,
  TaskTypeValue,
  Task,
  SummaryConfig,
  PlanCoachMessage,
  Plan,
  ProgressTracker,
  MetricEntry,
  Milestone,
  RitualColor,
  RitualTrackingType,
  RitualStep,
  RitualRecurrenceKind,
  RitualRecurrence,
  Ritual,
  Activity,
  ProgressEntry,
  DayActivities,
  RitualCompletion,
  Note,
  SchedulePreferences,
  CategoryKind,
  TaskCategory,
  GoalConnectionType,
  GoalConnection,
  Schedule,
  GoalDirection,
  ScheduleSyncMeta,
  DayKey,
} from "@planr/core/lib/scheduleTypes";
export { RITUAL_COLORS, RITUAL_TRACKING_TYPES } from "@planr/core/lib/scheduleTypes";
import type { Schedule } from "@planr/core/lib/scheduleTypes";

// The pure migrate pipeline (normalize/migrate/safeMigrate and friends) lives in
// packages/core/lib/scheduleMigrate.ts so apps/native loads every snapshot
// through the exact same code. This hook keeps only the IndexedDB + React half.
import {
  emptySchedule as emptyEmpty,
  hasMeaningfulData,
  normalizeMilestoneTimelines,
  safeMigrate as safeMigrateWith,
  schedulesEqual,
} from "@planr/core/lib/scheduleMigrate";

/** safeMigrate, reporting to the on-device error log. */
function safeMigrate(raw: unknown): Schedule | null {
  return safeMigrateWith(raw, logError);
}

const DB_NAME = "daily-planner";
const DB_VERSION = 10;
const STORE = "schedule";
const LEGACY_RECORD_KEY = "data";
const GUEST_RECORD_KEY = "guest:data";

function recordKeyForUid(uid: string): string {
  return `user:${uid}:data`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Per-tab memory of the record revision this tab last read or wrote.
 *
 * Module scope is exactly the semantics wanted: two tabs of one browser share
 * the IndexedDB record but each gets its own copy of this map, so a mismatch
 * against the stored revision means *the other tab wrote*.
 */
const _seenLocalRev = new Map<string, number>();

/** Companion record holding a monotonic revision for `key`. */
function localRevKey(key: string): string {
  return `${key}:localRev`;
}

function readDB(db: IDBDatabase, key: string): Promise<Schedule | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    // Seed the revision this tab is now up to date with, in the same
    // transaction, so the first write after boot doesn't look like a conflict.
    const revReq = store.get(localRevKey(key));
    revReq.onsuccess = () => {
      _seenLocalRev.set(key, typeof revReq.result === "number" ? revReq.result : 0);
    };
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist the schedule, merging first if another tab wrote since this one last
 * touched the record.
 *
 * This is the local analogue of the cloud compare-and-swap, and it is where
 * two-tab correctness actually lives: a plain `put()` here was erasing the
 * other tab's work on disk, with no network involved. The read, the merge and
 * the write all happen inside ONE IndexedDB transaction, which the engine
 * serializes, so no lock is needed.
 *
 * A whole-schedule replacement (clear data, clear progress, restore backup)
 * survives this merge because those paths stamp tombstones through
 * `stampSchedule` first, and a tombstone newer than the other side's edit wins.
 */
function writeDB(db: IDBDatabase, key: string, data: Schedule, uid?: string | null): Promise<void> {
  const validation = validateSchedule(data);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    return Promise.reject(new Error(`Schedule validation failed at ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid data"}`));
  }
  const mine = validation.data;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let nextRev = 1;

    const commit = (payload: Schedule, storedRev: number) => {
      nextRev = storedRev + 1;
      store.put(payload, key);
      store.put(nextRev, localRevKey(key));
    };

    const revReq = store.get(localRevKey(key));
    revReq.onsuccess = () => {
      const storedRev = typeof revReq.result === "number" ? revReq.result : 0;
      const expected = _seenLocalRev.get(key);
      // `undefined` means this tab has never read the record; treat that as a
      // conflict too, since writing blind is the very thing being fixed.
      if (expected !== undefined && storedRev === expected) {
        commit(mine, storedRev);
        return;
      }
      const currentReq = store.get(key);
      currentReq.onsuccess = () => {
        commit(
          resolveLocalWrite({
            mine,
            stored: (currentReq.result as Schedule | null) ?? null,
            storedRev,
            expectedRev: expected,
            otherLastUpdated: getLocalLastUpdated(uid),
            now: Date.now(),
          }),
          storedRev,
        );
      };
    };

    tx.oncomplete = () => {
      _seenLocalRev.set(key, nextRev);
      // Announce after the transaction commits, so a tab that re-reads on the
      // message is guaranteed to see this write.
      publishLocalWrite({ recordKey: key, rev: nextRev });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function deleteDBKey(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}


// Defined in lib/colorSystem.ts so pure modules can reach it without pulling in
// this hook (and, through it, contexts/AuthProvider). Re-exported here because
// a dozen call sites import it from this module.
export { categoryFromIcon };



/**
 * Log an IndexedDB write failure, calling out a full-storage quota error with an
 * actionable message — on iOS the quota is small and a silent failure means
 * recent edits aren't persisted and are lost on the next reload.
 */
function logWriteError(err: unknown): void {
  const quota =
    err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
  logError(
    "indexeddb:write",
    quota
      ? "Device storage is full — recent changes couldn't be saved on this device. Free up space (or use Settings → Clear data) to keep saving."
      : err
  );
}


export function useScheduleDB() {
  const { user, authLoading } = useAuth();
  const storageKey = authLoading ? null : user ? recordKeyForUid(user.uid) : GUEST_RECORD_KEY;
  const storageUid = user?.uid ?? null;
  const [schedule, setScheduleState] = useState<Schedule>(emptyEmpty());
  const [ready, setReady] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);
  // Undo (Cmd+Z) support. scheduleRef always mirrors the latest `schedule` —
  // including updates that bypass `setSchedule` (cloud-merge, auto-miss,
  // restore, clear) — via the sync effect below, so `setSchedule` always
  // computes/pushes against the true current value even across renders.
  const scheduleRef = useRef(schedule);
  const historyRef = useRef<Schedule[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // The storage key the in-memory `schedule` was hydrated for. The write effect
  // only persists when this matches the current `storageKey`, so data for one
  // identity can never be written under another's key (or while auth is still
  // resolving). This replaces the order-dependent isFirstRender guard.
  const loadedKeyRef = useRef<string | null>(null);
  // Suppresses the immediate echo-write right after hydrating from disk/cloud,
  // so freshly-loaded data isn't re-persisted with a new timestamp.
  const skipNextWriteRef = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  // ── Load from IndexedDB whenever the resolved auth identity changes ───────
  useEffect(() => {
    if (!storageKey) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activeStorageKey = storageKey;
    const activeUid = storageUid;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    setReady(false);
    setIsFirstLaunch(false);
    // Do NOT reset loadedKeyRef here: while the new identity loads it must keep
    // pointing at the *previous* key so the write effect refuses to persist the
    // outgoing identity's in-memory data under the incoming key.

    const getDB = async () => {
      if (dbRef.current) return dbRef.current;
      const db = await openDB();
      dbRef.current = db;
      return db;
    };

    getDB()
      .then(async (db) => {
        const stored = await readDB(db, activeStorageKey);
        const legacyGuestStored =
          !stored && activeStorageKey === GUEST_RECORD_KEY
            ? await readDB(db, LEGACY_RECORD_KEY)
            : null;
        if (cancelled) return;

        const hasLocalData = !!stored || !!legacyGuestStored;
        // Mark which identity the in-memory schedule now belongs to, and skip
        // the echo-write of this freshly-hydrated data.
        loadedKeyRef.current = activeStorageKey;
        skipNextWriteRef.current = true;

        let localSchedule: Schedule | null = null;
        if (stored) {
          // If the local record is corrupt, fall back to empty but keep going —
          // the cloud-merge block below can still restore a healthy snapshot.
          localSchedule = safeMigrate(stored);
          setScheduleState(localSchedule ?? emptyEmpty());
        } else if (legacyGuestStored) {
          const migrated = safeMigrate(legacyGuestStored);
          if (migrated) {
            const now = Date.now();
            setScheduleState(migrated);
            writeDB(db, activeStorageKey, migrated, activeUid).catch(logWriteError);
            writeLocalLastUpdated(now, activeUid); // keep sync clock in step with the migrated record
            deleteDBKey(db, LEGACY_RECORD_KEY).catch(() => {}); // adopted → drop the legacy copy
          } else {
            setScheduleState(emptyEmpty());
            if (!activeUid) setIsFirstLaunch(true);
          }
        } else {
          setScheduleState(emptyEmpty());
          if (!activeUid) setIsFirstLaunch(true);
        }
        setReady(true);
        bootLog("LOCAL_DB_READY");

        if (activeUid) {
          const cloudResult = await mergeCloudIfNewer(activeUid, getLocalLastUpdated(activeUid));
          if (cancelled) return;
          const merged = cloudResult === "merged";
          // Deliberately no push here. Boot used to flush the local snapshot
          // whenever its clock looked ahead, and queue it even after a FAILED
          // pull. On a second device holding older data that is precisely how
          // the first device's work got overwritten before the user touched
          // anything. Unsynced work from a previous session is not lost: the
          // normal debounced write path still pushes it on the first edit, and
          // that push is now a compare-and-swap that merges rather than
          // replaces when the two devices have diverged (lib/cloudSync.ts).
          if (!merged && !hasLocalData) {
            // Fresh account: no newer cloud snapshot and no local user record.
            // Adopt any meaningful guest data so trial work isn't orphaned.
            const guestData =
              (await readDB(db, GUEST_RECORD_KEY)) ?? (await readDB(db, LEGACY_RECORD_KEY));
            if (cancelled) return;
            if (guestData && hasMeaningfulData(guestData)) {
              const now = Date.now();
              const migrated = safeMigrate(guestData);
              if (!migrated) {
                setIsFirstLaunch(true);
                return;
              }
              loadedKeyRef.current = activeStorageKey;
              skipNextWriteRef.current = true; // persisted + synced manually below
              setScheduleState(migrated);
              setIsFirstLaunch(false);
              await writeDB(db, activeStorageKey, migrated, activeUid).catch(() => {});
              writeLocalLastUpdated(now, activeUid);
              queueSync(migrated); // back the adopted data up to this user's cloud
              await deleteDBKey(db, GUEST_RECORD_KEY).catch(() => {}); // moved into the account
              await deleteDBKey(db, LEGACY_RECORD_KEY).catch(() => {});
            } else {
              setIsFirstLaunch(true);
            }
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        logError("indexeddb:load", err);
        // Don't crash — fall back to an empty in-memory schedule so the app
        // still renders even if IndexedDB is unavailable (private mode, quota).
        setScheduleState(emptyEmpty());
        setReady(true);
        bootLog("LOCAL_DB_READY");
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey, storageUid]);

  // ── Cloud-merge listener ─────────────────────────────────────────────────
  // cloudSync dispatches this whenever it has read a remote snapshot. The
  // remote is MERGED with local state rather than replacing it: this hook
  // holds the authoritative local schedule, so it is the only place that can
  // combine the two without plumbing app state into the sync engine.
  useEffect(() => {
    if (!storageKey) return;
    const activeStorageKey = storageKey;

    function handleCloudMerge(e: Event) {
      const { uid, schedule: cloudSchedule, lastUpdated, pushed } =
        (e as CustomEvent<{ uid: string; schedule: Schedule; lastUpdated: number; pushed?: boolean }>).detail;
      if (uid !== storageUid) return;

      const migrated = safeMigrate(cloudSchedule);
      if (!migrated) return; // corrupt cloud snapshot — keep current local state

      loadedKeyRef.current = activeStorageKey;
      const localLastUpdated = getLocalLastUpdated(storageUid);
      let merged: Schedule = migrated;
      let changed = false;
      setScheduleState((prev) => {
        merged = mergeSchedules(
          { schedule: prev, lastUpdated: localLastUpdated },
          { schedule: migrated, lastUpdated },
        );
        // Content-identical to what we already render (common right after login
        // when this device wrote the snapshot last) → keep the existing tree.
        // Swapping in a structurally new-but-equal one forces every memo and
        // component to re-render for nothing: a visible flash while syncing.
        if (schedulesEqual(prev, merged)) return prev;
        changed = true;
        return merged;
      });
      setIsFirstLaunch(false);
      writeLocalLastUpdated(lastUpdated, storageUid);
      if (changed) {
        if (pushed) {
          // The engine merged and wrote this to the cloud already. Persist it
          // locally, but suppress the write effect's echo push — otherwise
          // every merge costs a second, entirely redundant revision.
          skipNextWriteRef.current = true;
          if (dbRef.current) writeDB(dbRef.current, activeStorageKey, merged, storageUid).catch(logWriteError);
        }
        // Otherwise the debounced write effect persists this and queues the
        // push: the merge may contain local entities the cloud has never seen,
        // so that push is wanted, not an echo to be suppressed.
        return;
      }
      // Local already covered everything in the merge, so no state change and
      // therefore no write effect — but if the cloud copy is behind, nobody
      // else will publish the difference.
      if (storageUid && !pushed && !schedulesEqual(migrated, merged)) queueSync(merged);
    }
    window.addEventListener("cloud-sync-merge", handleCloudMerge);
    return () => window.removeEventListener("cloud-sync-merge", handleCloudMerge);
  }, [storageKey, storageUid]);

  // ── Other-tab listener ────────────────────────────────────────────────────
  // Two tabs of one browser share the IndexedDB record but not a line of state.
  // `writeDB`'s compare-and-merge already stops them corrupting each other on
  // disk; this is what stops the idle tab *showing* data that is already stale,
  // and it is why the shared planr_baseRev/planr_lastUpdated keys become
  // truthful again — both tabs converge, so "this browser" really is one
  // replica, which is what the cloud compare-and-swap always assumed.
  useEffect(() => {
    if (!storageKey || !ready) return;
    const activeStorageKey = storageKey;

    async function absorbLocalRecord() {
      const db = dbRef.current;
      if (!db || loadedKeyRef.current !== activeStorageKey) return;
      // readDB re-seeds this tab's revision marker, so the next local write
      // won't see a phantom conflict.
      const stored = await readDB(db, activeStorageKey).catch(() => null);
      if (!stored) return;
      const migrated = safeMigrate(stored);
      if (!migrated) return; // corrupt record — keep what we have

      const otherLastUpdated = getLocalLastUpdated(storageUid);
      setScheduleState((prev) => {
        const merged = mergeSchedules(
          { schedule: prev, lastUpdated: otherLastUpdated },
          { schedule: migrated, lastUpdated: otherLastUpdated },
        );
        if (schedulesEqual(prev, merged)) return prev;
        // Suppress the echo write ONLY when the record on disk already contains
        // everything in the merge. If this tab had an edit still inside its own
        // 500ms debounce, the merge is a superset of the record and skipping
        // here would strand that edit in memory for good — so let the write
        // effect run, and let writeDB's compare-and-merge fold it in.
        if (schedulesEqual(migrated, merged)) skipNextWriteRef.current = true;
        return merged;
      });
    }

    const unsubscribe = onLocalWrite((msg) => {
      if (msg.recordKey !== activeStorageKey) return;
      void absorbLocalRecord();
    });
    // Catch-up for anything a throttled background tab never received.
    const onVisible = () => {
      if (document.visibilityState === "visible") void absorbLocalRecord();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [storageKey, storageUid, ready]);

  // ── Debounced IndexedDB write + cloud sync trigger ────────────────────────
  useEffect(() => {
    if (!ready || !dbRef.current || !storageKey) return;
    // Isolation guard: never persist data that belongs to a different identity
    // than the one currently selected (covers auth switches and the resolving
    // window). loadedKeyRef is only advanced once hydration for a key completes.
    if (loadedKeyRef.current !== storageKey) return;
    // Skip the one echo-write that immediately follows hydration.
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const db = dbRef.current;
    const snap = schedule; // capture for closure
    // Keep the sync singleton's latest-snapshot fresh on every edit so a
    // logout/app-close flush never loses the last debounce window of changes.
    if (storageUid) noteLatestSchedule(snap);
    writeTimer.current = setTimeout(() => {
      const now = Date.now();
      writeDB(db, storageKey, snap, storageUid)
        .then(() => {
          writeLocalLastUpdated(now, storageUid); // update local timestamp for cloud comparison
          queueSync(snap);            // queue cloud backup (no-op for guests)
        })
        .catch(logWriteError);
    }, 500);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [schedule, ready, storageKey, storageUid]);

  // Keep scheduleRef current regardless of *how* `schedule` changed, so
  // setSchedule's synchronous read below is never stale — e.g. right after a
  // cloud-merge or auto-miss tick, both of which call setScheduleState
  // directly and don't go through setSchedule/history at all (by design: a
  // stray Cmd+Z should never undo a background sync or a day-rollover).
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Stable identity (setScheduleState is stable) so downstream effects and
  // useCallback hooks that depend on it don't re-run/recreate every render.
  //
  // Resolves the updater synchronously against scheduleRef (rather than
  // passing the updater through to React's functional setState form) so it
  // can push the pre-mutation value onto the undo stack exactly once. Doing
  // that push *inside* a functional setScheduleState(updater) instead would
  // risk double-recording if React ever replays the updater (StrictMode's
  // dev double-invoke, concurrent-mode interruption).
  const setSchedule = useCallback((
    updater: (prev: Schedule) => Schedule,
    options?: { stamp?: boolean },
  ) => {
    const prev = scheduleRef.current;
    const raw = updater(prev);
    // Record which entities changed, so a merge with another device resolves
    // per item instead of per document. `stamp: false` is for deterministic
    // housekeeping (the day-rollover reset) that both devices compute
    // identically — stamping it would let an idle device fabricate a newer
    // revision and beat a device that did real work.
    const next = options?.stamp === false ? raw : stampSchedule(prev, raw);
    if (next !== prev) {
      historyRef.current = pushHistory(historyRef.current, prev, HISTORY_LIMIT);
      scheduleRef.current = next;
      setCanUndo(true);
    }
    setScheduleState(next);
  }, []);

  /** Cmd/Ctrl+Z: pop the last snapshot off the undo stack and restore it.
   *  No-op when the stack is empty. */
  const undo = useCallback(() => {
    const [restored, rest] = popHistory(historyRef.current);
    if (restored === undefined) return;
    historyRef.current = rest;
    // Stamp the step backwards too. Undoing a delete re-creates an entity that
    // already has a tombstone, and without a fresh stamp the next cloud merge
    // would dutifully delete it again.
    const next = stampSchedule(scheduleRef.current, restored);
    scheduleRef.current = next;
    setCanUndo(rest.length > 0);
    setScheduleState(next);
  }, []);

  // Global Cmd+Z (Mac) / Ctrl+Z (Windows/Linux) — one listener covers
  // whichever shell (iOS or desktop) is mounted, since useScheduleDB is
  // called exactly once per shell and only one shell renders at a time.
  // Falls through to the browser's/tiptap's own text-undo while focus is in
  // an editable element (isEditableTarget), and deliberately ignores
  // Cmd+Shift+Z (redo) since no redo exists yet — better to leave that chord
  // untouched than fire a single undo on it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (e.key.toLowerCase() !== "z") return;
      if (isEditableTarget(e.target)) return;
      if (historyRef.current.length === 0) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  // Auto-miss also runs on load (safeMigrate); this catches the case where the
  // app stays open across the day-start boundary. `applyAutoMissed` returns the
  // same reference until a new day has actually rolled over, so this minute
  // tick is a cheap no-op (React bails, nothing persists) on every other tick.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setScheduleState((prev) => applyAutoMissed(prev, new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, [ready]);

  /**
   * Replace the whole schedule with data restored from a backup file. The raw
   * object goes through the same migrate pipeline as any stored snapshot, so
   * old exports load cleanly. Returns false (state untouched) when the payload
   * is corrupt. Persistence + cloud sync then follow the normal debounced
   * write path, exactly like any other edit.
   */
  const restoreData = useCallback((raw: unknown): boolean => {
    const migrated = safeMigrate(raw);
    if (!migrated) return false;
    // Whole-schedule replacement still has to say what it REMOVED. Without
    // tombstones a merge reads "restore" as "add these back" and every entity
    // the backup doesn't contain returns from the other device.
    const next = stampSchedule(scheduleRef.current, migrated);
    scheduleRef.current = next;
    setScheduleState(next);
    setIsFirstLaunch(false);
    return true;
  }, []);

  async function clearData(): Promise<void> {
    // Same reasoning as restoreData: the wipe has to be expressed as deletions,
    // or the other device simply refills everything on the next merge.
    const empty = stampSchedule(scheduleRef.current, emptyEmpty());
    scheduleRef.current = empty;
    setScheduleState(empty);
    if (dbRef.current && storageKey) {
      // Surface a failed wipe (don't pretend it succeeded). Cloud deletion is
      // paired by the caller (SettingsView → deleteCloudData).
      await writeDB(dbRef.current, storageKey, empty, storageUid).catch((err) => logError("indexeddb:clear", err));
    }
  }

  /**
   * Wipe all *progress* — task completions (incl. history), ritual check-ins,
   * and logged metric values — while keeping the structure (plans, tasks,
   * trackers, rituals, milestones, notes). Used by Settings → "Clear progress".
   */
  async function clearProgress(): Promise<void> {
    const next: Schedule = (() => {
      const activities = {} as Schedule["activities"];
      for (const day of DAYS) {
        activities[day] = (schedule.activities[day] ?? []).map((t) => {
          const { completed: _c, completedAt: _a, completedSubtaskIds: _s, completedSlotIndices: _sl, completionHistory: _h, missed: _m, missedAt: _ma, missedSlotIndices: _msl, ...rest } = t;
          void _c; void _a; void _s; void _sl; void _h; void _m; void _ma; void _msl;
          return rest;
        });
      }
      // Un-complete milestones: strip the completion dates and re-derive status
      // from the roadmap timeline (keeps the milestones, resets their progress).
      const milestones = normalizeMilestoneTimelines(
        schedule.plans,
        schedule.milestones.map((m) => {
          const { actualCompletedDate: _ad, completedDate: _cd, ...rest } = m;
          void _ad; void _cd;
          return { ...rest, status: "upcoming" as const, completionStatus: "pending" as const };
        }),
      );
      return { ...schedule, activities, milestones, ritualCompletions: [], metricEntries: [] };
    })();
    // Cleared ritual check-ins and metric rows are deletions; the reset tasks
    // and milestones are edits. Both need recording or the merge undoes them.
    const stamped = stampSchedule(scheduleRef.current, next);
    scheduleRef.current = stamped;
    setScheduleState(stamped);
    if (dbRef.current && storageKey) {
      await writeDB(dbRef.current, storageKey, stamped, storageUid).catch((err) => logError("indexeddb:clear-progress", err));
    }
  }

  return { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch, undo, canUndo };
}
