/**
 * The native data model hook — a port of lib/useScheduleDB.ts on MMKV instead
 * of IndexedDB. Same responsibilities, same order of operations, same guards:
 *
 * - One local record per identity (`guest:data`, `user:{uid}:data`), so data
 *   for one account can never be written under another's key.
 * - Boot: hydrate from the local record, then (signed in) pull the cloud
 *   snapshot; a fresh account adopts meaningful guest data instead of
 *   orphaning trial work.
 * - Remote snapshots are MERGED into local state (mergeSchedules), never
 *   swapped in — the previous native store replaced local data wholesale,
 *   which silently dropped any edit not yet pushed.
 * - Every load, restore and cloud snapshot runs through the shared migrate
 *   pipeline (packages/core/lib/scheduleMigrate.ts), validated by the same
 *   zod schema as the web.
 * - setSchedule stamps per-entity change times and keeps a bounded undo stack;
 *   deterministic housekeeping (day rollover, auto-miss) is unstamped.
 *
 * What's different, and why:
 * - No other-tab listener or per-tab revision: one process owns the MMKV
 *   record, so the IndexedDB compare-and-merge write has nothing to guard.
 * - No Cmd+Z key binding (no hardware keyboard contract on a phone); undo is
 *   reached the same way the iOS shell reaches it — toast "Undo" actions.
 * - A pending debounced write is flushed when the app is backgrounded: iOS
 *   suspends JS timers there, which would otherwise hold the last edit back
 *   from both local storage and the sync engine until the next foreground.
 * - One-time adoption of the pre-port native records: the old single
 *   `schedule` key (treated like the web's legacy `data` record) and the
 *   native-only `notes` key, whose notes were never part of the synced
 *   schedule. They are folded into the schedule so they finally sync.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Note, Schedule } from '@planr/core/lib/scheduleTypes';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { applyAutoMissed } from '@planr/core/lib/consistency/autoMiss';
import { pushHistory, popHistory, HISTORY_LIMIT } from '@planr/core/lib/scheduleHistory';
import { validateSchedule } from '@planr/core/lib/scheduleSchema';
import { mergeSchedules } from '@planr/core/lib/mergeSchedule';
import { stampSchedule } from '@planr/core/lib/stampSchedule';
import {
  emptySchedule as emptyEmpty,
  hasMeaningfulData,
  normalizeMilestoneTimelines,
  safeMigrate as safeMigrateWith,
  schedulesEqual,
} from '@planr/core/lib/scheduleMigrate';
import { mergeCloudIfNewer, noteLatestSchedule, onCloudMerge, queueSync } from './cloudSync';
import { logError } from './errorLog';
import { useAuth } from '../contexts/AuthProvider';
import { storage } from '../storage/mmkv';
import { getLocalLastUpdated, writeLocalLastUpdated } from '../storage/localMeta';

/** safeMigrate, reporting to the on-device error log. */
function safeMigrate(raw: unknown): Schedule | null {
  return safeMigrateWith(raw, logError);
}

const RECORD_PREFIX = 'schedule-record:';
/** The pre-port native store's single, account-agnostic record. */
const LEGACY_RECORD_KEY = 'schedule';
/** The pre-port native notes store — kept outside the schedule, never synced. */
const LEGACY_NOTES_KEY = 'notes';
const GUEST_RECORD_KEY = 'guest:data';

function recordKeyForUid(uid: string): string {
  return `user:${uid}:data`;
}

function readRecord(key: string): unknown | null {
  // The legacy record predates the prefix; every current record carries it.
  const storageKey = key === LEGACY_RECORD_KEY ? key : `${RECORD_PREFIX}${key}`;
  try {
    const raw = storage.getString(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logError('mmkv:read', err);
    return null;
  }
}

/** Validate, then persist. Throws (like web's writeDB rejects) on invalid data. */
function writeRecord(key: string, data: Schedule): void {
  const validation = validateSchedule(data);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    throw new Error(`Schedule validation failed at ${issue?.path.join('.') || 'root'}: ${issue?.message || 'invalid data'}`);
  }
  storage.set(`${RECORD_PREFIX}${key}`, JSON.stringify(validation.data));
}

function deleteRecord(key: string): void {
  storage.delete(key === LEGACY_RECORD_KEY ? key : `${RECORD_PREFIX}${key}`);
}

function readLegacyNotes(): Note[] {
  try {
    const raw = storage.getString(LEGACY_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

function logWriteError(err: unknown): void {
  logError('mmkv:write', err);
}

export function useScheduleDB() {
  const { user, authLoading } = useAuth();
  const storageKey = authLoading ? null : user ? recordKeyForUid(user.uid) : GUEST_RECORD_KEY;
  const storageUid = user?.uid ?? null;
  const [schedule, setScheduleState] = useState<Schedule>(emptyEmpty());
  const [ready, setReady] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const scheduleRef = useRef(schedule);
  const historyRef = useRef<Schedule[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // The storage key the in-memory `schedule` was hydrated for. The write
  // effect only persists when this matches the current `storageKey`.
  const loadedKeyRef = useRef<string | null>(null);
  // Suppresses the immediate echo-write right after hydrating from disk/cloud.
  const skipNextWriteRef = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write the debounce is holding, so a backgrounding app can flush it.
  const pendingWriteRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, []);

  // ── Load from MMKV whenever the resolved auth identity changes ────────────
  useEffect(() => {
    if (!storageKey) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activeStorageKey = storageKey;
    const activeUid = storageUid;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    pendingWriteRef.current = null;
    setReady(false);
    setIsFirstLaunch(false);

    const stored = readRecord(activeStorageKey);
    const legacyGuestStored =
      !stored && activeStorageKey === GUEST_RECORD_KEY ? readRecord(LEGACY_RECORD_KEY) : null;

    const hasLocalData = !!stored || !!legacyGuestStored;
    loadedKeyRef.current = activeStorageKey;
    skipNextWriteRef.current = true;

    let localSchedule: Schedule | null = null;
    if (stored) {
      // A corrupt record falls back to empty but keeps going — the cloud merge
      // below can still restore a healthy snapshot.
      localSchedule = safeMigrate(stored);
      setScheduleState(localSchedule ?? emptyEmpty());
    } else if (legacyGuestStored) {
      const migrated = safeMigrate(legacyGuestStored);
      if (migrated) {
        const now = Date.now();
        setScheduleState(migrated);
        try {
          writeRecord(activeStorageKey, migrated);
          writeLocalLastUpdated(now, activeUid);
          deleteRecord(LEGACY_RECORD_KEY); // adopted → drop the legacy copy
        } catch (err) {
          logWriteError(err);
        }
      } else {
        setScheduleState(emptyEmpty());
        if (!activeUid) setIsFirstLaunch(true);
      }
    } else {
      setScheduleState(emptyEmpty());
      if (!activeUid) setIsFirstLaunch(true);
    }
    setReady(true);

    if (activeUid) {
      void (async () => {
        const cloudResult = await mergeCloudIfNewer(activeUid, getLocalLastUpdated(activeUid));
        if (cancelled) return;
        const merged = cloudResult === 'merged';
        // Deliberately no push here (see lib/useScheduleDB.ts): the debounced
        // write path pushes unsynced work on the first edit, as a
        // compare-and-swap that merges rather than replaces.
        if (!merged && !hasLocalData) {
          const guestData = readRecord(GUEST_RECORD_KEY) ?? readRecord(LEGACY_RECORD_KEY);
          if (cancelled) return;
          const guestSchedule = guestData ? safeMigrate(guestData) : null;
          if (guestSchedule && hasMeaningfulData(guestSchedule)) {
            const now = Date.now();
            loadedKeyRef.current = activeStorageKey;
            skipNextWriteRef.current = true; // persisted + synced manually below
            setScheduleState(guestSchedule);
            setIsFirstLaunch(false);
            try {
              writeRecord(activeStorageKey, guestSchedule);
            } catch {
              // non-fatal — the in-memory copy still syncs below
            }
            writeLocalLastUpdated(now, activeUid);
            queueSync(guestSchedule); // back the adopted data up to this user's cloud
            deleteRecord(GUEST_RECORD_KEY); // moved into the account
            deleteRecord(LEGACY_RECORD_KEY);
          } else {
            setIsFirstLaunch(true);
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [storageKey, storageUid]);

  // ── Cloud-merge listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!storageKey) return;
    const activeStorageKey = storageKey;

    return onCloudMerge(({ uid, schedule: cloudSchedule, lastUpdated, pushed }) => {
      if (uid !== storageUid) return false;

      const migrated = safeMigrate(cloudSchedule);
      if (!migrated) return false; // corrupt cloud snapshot — keep current local state

      loadedKeyRef.current = activeStorageKey;
      const localLastUpdated = getLocalLastUpdated(storageUid);
      const prev = scheduleRef.current;
      const merged = mergeSchedules(
        { schedule: prev, lastUpdated: localLastUpdated },
        { schedule: migrated, lastUpdated },
      );
      const changed = !schedulesEqual(prev, merged);
      setIsFirstLaunch(false);
      writeLocalLastUpdated(lastUpdated, storageUid);
      if (changed) {
        scheduleRef.current = merged;
        if (pushed) {
          // Already in the cloud — persist locally without an echo push.
          skipNextWriteRef.current = true;
          try {
            writeRecord(activeStorageKey, merged);
          } catch (err) {
            logWriteError(err);
          }
        }
        // Otherwise the debounced write effect persists this and queues the
        // push: the merge may hold local entities the cloud has never seen.
        setScheduleState(merged);
        return true;
      }
      if (storageUid && !pushed && !schedulesEqual(migrated, merged)) queueSync(merged);
      return true;
    });
  }, [storageKey, storageUid]);

  // ── Debounced MMKV write + cloud sync trigger ────────────────────────────
  useEffect(() => {
    if (!ready || !storageKey) return;
    if (loadedKeyRef.current !== storageKey) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const snap = schedule;
    const key = storageKey;
    if (storageUid) noteLatestSchedule(snap);
    const write = () => {
      pendingWriteRef.current = null;
      const now = Date.now();
      try {
        writeRecord(key, snap);
        writeLocalLastUpdated(now, storageUid);
        queueSync(snap); // no-op for guests
      } catch (err) {
        logWriteError(err);
      }
    };
    pendingWriteRef.current = write;
    writeTimer.current = setTimeout(write, 500);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [schedule, ready, storageKey, storageUid]);

  // Flush the held write before iOS suspends timers in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && pendingWriteRef.current) {
        if (writeTimer.current) clearTimeout(writeTimer.current);
        pendingWriteRef.current();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // ── One-time adoption of the pre-port native notes store ─────────────────
  useEffect(() => {
    if (!ready || !storageKey) return;
    const legacyNotes = readLegacyNotes();
    if (legacyNotes.length === 0) return;
    const prev = scheduleRef.current;
    const known = new Set((prev.notes ?? []).map((n) => n.id));
    const adopted = legacyNotes.filter((n) => n && typeof n.id === 'string' && !known.has(n.id));
    if (adopted.length > 0) {
      const next = stampSchedule(prev, { ...prev, notes: [...adopted, ...(prev.notes ?? [])] });
      scheduleRef.current = next;
      setScheduleState(next);
    }
    storage.delete(LEGACY_NOTES_KEY);
  }, [ready, storageKey]);

  const setSchedule = useCallback((updater: (prev: Schedule) => Schedule, options?: { stamp?: boolean }) => {
    const prev = scheduleRef.current;
    const raw = updater(prev);
    const next = options?.stamp === false ? raw : stampSchedule(prev, raw);
    if (next !== prev) {
      historyRef.current = pushHistory(historyRef.current, prev, HISTORY_LIMIT);
      scheduleRef.current = next;
      setCanUndo(true);
    }
    setScheduleState(next);
  }, []);

  /** Pop the last snapshot off the undo stack and restore it. */
  const undo = useCallback(() => {
    const [restored, rest] = popHistory(historyRef.current);
    if (restored === undefined) return;
    historyRef.current = rest;
    // Stamp the step backwards too, so an undone delete isn't re-deleted by
    // the next cloud merge (see lib/useScheduleDB.ts).
    const next = stampSchedule(scheduleRef.current, restored);
    scheduleRef.current = next;
    setCanUndo(rest.length > 0);
    setScheduleState(next);
  }, []);

  // Auto-miss across the day-start boundary while the app stays open.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setScheduleState((prev) => applyAutoMissed(prev, new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, [ready]);

  /** Replace the whole schedule with a restored backup. False when corrupt. */
  const restoreData = useCallback((raw: unknown): boolean => {
    const migrated = safeMigrate(raw);
    if (!migrated) return false;
    const next = stampSchedule(scheduleRef.current, migrated);
    scheduleRef.current = next;
    setScheduleState(next);
    setIsFirstLaunch(false);
    return true;
  }, []);

  async function clearData(): Promise<void> {
    const empty = stampSchedule(scheduleRef.current, emptyEmpty());
    scheduleRef.current = empty;
    setScheduleState(empty);
    if (storageKey) {
      try {
        writeRecord(storageKey, empty);
      } catch (err) {
        logError('mmkv:clear', err);
      }
    }
  }

  /**
   * Wipe all *progress* — task completions (incl. history), ritual check-ins,
   * and logged metric values — while keeping the structure.
   */
  async function clearProgress(): Promise<void> {
    const current = scheduleRef.current;
    const next: Schedule = (() => {
      const activities = {} as Schedule['activities'];
      for (const day of DAYS) {
        activities[day] = (current.activities[day] ?? []).map((t) => {
          const { completed: _c, completedAt: _a, completedSubtaskIds: _s, completedSlotIndices: _sl, completionHistory: _h, missed: _m, missedAt: _ma, missedSlotIndices: _msl, ...rest } = t;
          void _c; void _a; void _s; void _sl; void _h; void _m; void _ma; void _msl;
          return rest;
        });
      }
      const milestones = normalizeMilestoneTimelines(
        current.plans,
        current.milestones.map((m) => {
          const { actualCompletedDate: _ad, completedDate: _cd, ...rest } = m;
          void _ad; void _cd;
          return { ...rest, status: 'upcoming' as const, completionStatus: 'pending' as const };
        }),
      );
      return { ...current, activities, milestones, ritualCompletions: [], metricEntries: [] };
    })();
    const stamped = stampSchedule(current, next);
    scheduleRef.current = stamped;
    setScheduleState(stamped);
    if (storageKey) {
      try {
        writeRecord(storageKey, stamped);
      } catch (err) {
        logError('mmkv:clear-progress', err);
      }
    }
  }

  return { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch, undo, canUndo };
}

export type ScheduleDB = ReturnType<typeof useScheduleDB>;
