/**
 * Restore-by-merge — bring a backup's data back without deleting anything
 * that exists now. Pure, no React or Firebase.
 *
 * The other restore (whole-schedule replacement, `stampSchedule(current,
 * backup)`) tombstones every entity created since the backup, and the next
 * sync deletes those on every device. That is right for "go back to exactly
 * this", and wrong for the usual reason someone opens a backup: something
 * went missing and they want it back.
 *
 * The rule here is deliberately simple, so it can be explained in one line of
 * UI copy: everything you have now stays as it is; anything the backup has
 * that you don't is added back. Where both have an entity, the current copy
 * wins — except a task's completion history, which is a union, so an old
 * backup also returns history the cloud's 90-day trim dropped.
 *
 * Merging deliberately ignores the current tombstones. Recovering from a bad
 * sync means recovering exactly the entities it tombstoned; honouring those
 * tombstones would make this restore a no-op in the case it exists for. The
 * caller runs the result through `stampSchedule`, which marks the returned
 * entities as re-created and clears their tombstones on every device.
 */

import type { DayKey, Schedule, Task } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { unionHistory } from "./mergeSchedule";
import { entityMap, ritualCompletionKey } from "./stampSchedule";

/** Append the items of `backup` whose key `current` doesn't have. */
function addMissing<T>(current: T[] | undefined, backup: T[] | undefined, keyOf: (item: T) => string): T[] {
  const now = current ?? [];
  if (!backup?.length) return now;
  const have = new Set(now.map(keyOf));
  const missing = backup.filter((item) => !have.has(keyOf(item)));
  return missing.length ? [...now, ...missing] : now;
}

function mergeDayTasks(current: Task[] | undefined, backup: Task[] | undefined): Task[] {
  const now = current ?? [];
  if (!backup?.length) return now;
  const fromBackup = new Map(backup.map((task) => [task.id, task]));
  let changed = false;
  const kept = now.map((task) => {
    const old = fromBackup.get(task.id);
    if (!old) return task;
    const history = unionHistory(task.completionHistory, old.completionHistory);
    if (history === task.completionHistory) return task;
    changed = true;
    return { ...task, completionHistory: history };
  });
  const merged = addMissing(kept, backup, (task) => task.id);
  return changed || merged !== kept ? merged : now;
}

const byId = (item: { id: string }) => item.id;

/**
 * `current` with every entity from `backup` it lacks added back. Returns
 * `current` itself when the backup adds nothing.
 */
export function restoreMissing(current: Schedule, backup: Schedule): Schedule {
  const activities = { ...current.activities } as Record<DayKey, Task[]>;
  let changed = false;
  for (const day of DAYS) {
    const key = day as DayKey;
    const merged = mergeDayTasks(current.activities?.[key], backup.activities?.[key]);
    if (merged !== (current.activities?.[key] ?? [])) changed = true;
    activities[key] = merged;
  }

  const next: Schedule = {
    ...current,
    activities,
    goals: addMissing(current.goals, backup.goals, byId),
    goalConnections: addMissing(current.goalConnections, backup.goalConnections, byId),
    plans: addMissing(current.plans, backup.plans, byId),
    categories: addMissing(current.categories, backup.categories, byId),
    progressTrackers: addMissing(current.progressTrackers, backup.progressTrackers, byId),
    metricEntries: addMissing(current.metricEntries, backup.metricEntries, byId),
    milestones: addMissing(current.milestones, backup.milestones, byId),
    rituals: addMissing(current.rituals, backup.rituals, byId),
    ritualCompletions: addMissing(current.ritualCompletions, backup.ritualCompletions, ritualCompletionKey),
    notes: addMissing(current.notes, backup.notes, byId),
  };

  return changed || entityMap(next).size !== entityMap(current).size ? next : current;
}

/** How many entities a merge-restore brought back. */
export function restoredCount(current: Schedule, restored: Schedule): number {
  return entityMap(restored).size - entityMap(current).size;
}

/** "merge" adds back what's missing; "replace" makes the app match the backup exactly. */
export type RestoreMode = "merge" | "replace";

/** `added` counts the entities a merge brought back (0 for a replace). */
export type RestoreOutcome = { ok: false } | { ok: true; added: number };

export type RestoreHandler = (raw: unknown, mode: RestoreMode) => RestoreOutcome;
