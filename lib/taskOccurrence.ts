/**
 * Per-date occurrence resolution for recurring (weekday-template) tasks.
 *
 * Tasks recur by weekday — the same task object lives in each weekday bucket of
 * `schedule.activities`. `Task.exceptions[dateISO]` layers per-date overrides on
 * top of that template so a single dated occurrence can be skipped or edited
 * without touching every weekday copy. These helpers are pure (no React, no
 * side-effects) and compose with `completionForDate` (lib/taskCompletion.ts),
 * which already supplies the dated completion overlay.
 */

import type { Task, TaskException } from "./useScheduleDB";

/** The override (if any) for a specific date. */
export function exceptionFor(task: Task, dateISO: string): TaskException | undefined {
  return task.exceptions?.[dateISO];
}

/**
 * Whether the task should appear on a given date.
 *
 * `weekdayHasTask` is whether the task is present in that date's weekday bucket
 * (the caller already knows this — it read the bucket). A skipped exception
 * removes the occurrence. (Phase 2 will add interval/anchor recurrence here.)
 */
export function isTaskScheduledOn(task: Task, dateISO: string, weekdayHasTask: boolean): boolean {
  if (!weekdayHasTask) return false;
  return !task.exceptions?.[dateISO]?.skipped;
}

/**
 * The task as it should render on `dateISO` — the template with this date's
 * field overrides merged on top. Identity and history are never overridden.
 * Returns the original reference unchanged when there's no exception (so callers
 * can rely on referential stability for memoization).
 */
export function resolveOccurrence(task: Task, dateISO: string): Task {
  const ex = task.exceptions?.[dateISO];
  if (!ex) return task;
  const merged: Task = { ...task };
  if (ex.startTime !== undefined) merged.startTime = ex.startTime;
  if (ex.endTime !== undefined) merged.endTime = ex.endTime;
  if (ex.title !== undefined) merged.title = ex.title;
  if (ex.description !== undefined) merged.description = ex.description;
  return merged;
}

/** The overridable display fields of a task occurrence. */
export type OccurrenceFields = Pick<TaskException, "title" | "startTime" | "endTime" | "description">;

/**
 * The minimal per-date override: only the fields whose `draft` value differs
 * from the `original` task. Writing just the changed fields keeps the exception
 * small and lets unchanged fields keep tracking the recurring template. An empty
 * result means nothing changed (the caller can skip writing an exception).
 */
export function diffException(original: Task, draft: OccurrenceFields): OccurrenceFields {
  const out: OccurrenceFields = {};
  if (draft.title !== undefined && draft.title !== original.title) out.title = draft.title;
  if (draft.startTime !== undefined && draft.startTime !== original.startTime) out.startTime = draft.startTime;
  if (draft.endTime !== undefined && draft.endTime !== original.endTime) out.endTime = draft.endTime;
  if (draft.description !== undefined && draft.description !== original.description) out.description = draft.description;
  return out;
}
