/**
 * Schedule-level task actions: what a tap on a checkbox does to the whole
 * schedule, shared by the desktop, phone and native shells.
 *
 * The per-task math is in taskCompletion.ts. What lives here is the part a
 * single task can't do for itself — a finished step belongs to every weekday
 * copy of its task, and to the one-off that continues it.
 *
 * Every function returns a `(prev) => next` updater, like taskMutations.ts.
 */

import type { Schedule, Task } from "./scheduleTypes";
import type { ScheduleEntry } from "./scheduleEntry";
import { DAYS, type DayKey } from "./scheduleConstants";
import { getTaskSubtaskSummary, markTaskMissed, toggleSlotComplete, toggleSubtaskComplete, toggleTaskFromCheckbox } from "./taskCompletion";
import { unifyStepMarks } from "./stepMarks";

type Updater = (prev: Schedule) => Schedule;

/** Merge `change` into one day's copy of a task, then bring its siblings' steps in line. */
export function updateTaskOn(day: DayKey, taskId: string, change: (task: Task, totalSubtasks: number) => Partial<Task>): Updater {
  return (prev) => {
    let steps: ScheduleEntry[] | undefined;
    const bucket = (prev.activities[day] ?? []).map((task) => {
      if (task.id !== taskId) return task;
      const plan = task.planId ? prev.plans.find((p) => p.id === task.planId) ?? null : null;
      const patch = change(task, getTaskSubtaskSummary(task, plan).totalCount);
      steps = patch.subtasks;
      return { ...task, ...patch };
    });
    const next = { ...prev, activities: { ...prev.activities, [day]: bucket } };
    return steps ? unifyStepMarks(next, taskId) : next;
  };
}

/** Tap on a task's checkbox: clears a miss, otherwise toggles done. */
export function toggleTaskOn(day: DayKey, taskId: string, allSubtaskIds: string[]): Updater {
  return updateTaskOn(day, taskId, (task) => toggleTaskFromCheckbox(task, allSubtaskIds));
}

/** Tap on a subtask's checkbox. */
export function toggleSubtaskOn(day: DayKey, taskId: string, subtaskId: string): Updater {
  return updateTaskOn(day, taskId, (task, total) => toggleSubtaskComplete(task, subtaskId, total));
}

/** Tap on one block of a task split across the day. */
export function toggleSlotOn(day: DayKey, taskId: string, slotIndex: number): Updater {
  return updateTaskOn(day, taskId, (task, total) => toggleSlotComplete(task, slotIndex, total));
}

/** Mark (or un-mark) today's occurrence missed. */
export function markMissedOn(day: DayKey, taskId: string, allSubtaskIds: string[]): Updater {
  return updateTaskOn(day, taskId, (task) => markTaskMissed(task, allSubtaskIds));
}

/**
 * Stop a repeating task after `lastISO` — offered once every step is done, and
 * never done without asking. History and finished steps stay.
 */
export function finishTaskAfter(taskId: string, lastISO: string): Updater {
  return (prev) => ({
    ...prev,
    activities: Object.fromEntries(
      DAYS.map((day) => [day, (prev.activities[day] ?? []).map((t) => (t.id === taskId ? { ...t, activeUntil: lastISO } : t))]),
    ) as Schedule["activities"],
  });
}
