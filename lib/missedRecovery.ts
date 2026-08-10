/**
 * Recovery actions for a missed task shown in "Needs attention".
 *
 * A missed occurrence is a durable `"missed"` event in the task's
 * `completionHistory` — it stays there so trends/analytics keep counting it.
 * "Handling" a miss therefore never edits that event; it either:
 *
 *  - **dismisses** it (records `taskId|dateISO` in `preferences.acknowledgedMisses`
 *    so `selectNeedsAttention` hides it), or
 *  - **reschedules** it — clones the task as a fresh one-off on a chosen date/time
 *    and dismisses the original miss.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import type { Schedule, Task } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { getSlots } from "./taskMutations";
import { parseTimeToMinutes, minutesToInputTime, inputToDisplayTime } from "./timeUtils";
import { uid } from "./id";

/** The stable key identifying one missed occurrence. */
export function missKey(taskId: string, dateISO: string): string {
  return `${taskId}|${dateISO}`;
}

/** The weekday bucket ("monday"…"sunday") a calendar date falls in. */
function weekdayKeyOf(dateISO: string): (typeof DAYS)[number] {
  return DAYS[(new Date(`${dateISO}T00:00:00`).getDay() + 6) % 7];
}

/**
 * Hide a missed occurrence from Needs Attention without deleting its history
 * event. Idempotent.
 */
export function acknowledgeMiss(schedule: Schedule, taskId: string, dateISO: string): Schedule {
  const key = missKey(taskId, dateISO);
  const existing = schedule.preferences?.acknowledgedMisses ?? [];
  if (existing.includes(key)) return schedule;
  return {
    ...schedule,
    preferences: { ...schedule.preferences, acknowledgedMisses: [...existing, key] },
  };
}

/**
 * Reschedule a missed task: add a fresh one-off occurrence on `targetDateISO`
 * starting at `startMinutes` (preserving the original duration), and dismiss the
 * original miss (`missedDateISO`). The clone keeps identity (title, category,
 * plan, subtasks, kind) but resets all completion state.
 */
export function rescheduleMissedTaskOnce(
  schedule: Schedule,
  task: Task,
  missedDateISO: string,
  targetDateISO: string,
  startMinutes: number,
): Schedule {
  const first = getSlots(task)[0];
  const srcStart = parseTimeToMinutes(first?.startTime ?? "") ?? startMinutes;
  let srcEnd = parseTimeToMinutes(first?.endTime ?? "") ?? srcStart;
  if (srcEnd < srcStart) srcEnd += 24 * 60; // overnight
  const duration = Math.max(0, srcEnd - srcStart);

  const startDisp = inputToDisplayTime(minutesToInputTime(startMinutes));
  const endDisp = inputToDisplayTime(minutesToInputTime(startMinutes + duration));

  const clone: Task = {
    ...task,
    id: uid(),
    startTime: startDisp,
    endTime: endDisp,
    slots: [{ startTime: startDisp, endTime: endDisp }],
    recurrence: { type: "once", dateISO: targetDateISO },
    // A catch-up copy stands on its own — drop the source's per-date overrides
    // and active window, and start with clean completion state.
    exceptions: undefined,
    activeFrom: undefined,
    activeUntil: undefined,
    completed: false,
    completedAt: undefined,
    completedSubtaskIds: [],
    completedSlotIndices: [],
    missed: false,
    missedAt: undefined,
    completionHistory: [],
  };

  const weekday = weekdayKeyOf(targetDateISO);
  const activities = {
    ...schedule.activities,
    [weekday]: [...(schedule.activities[weekday] ?? []), clone],
  };
  return acknowledgeMiss({ ...schedule, activities }, task.id, missedDateISO);
}
