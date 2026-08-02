/**
 * The single definition of "today's tasks" for the Overview dashboard.
 *
 * Desktop and the iOS shell each grew their own copy of this selector and drifted
 * apart in three ways that were real bugs, not styling. This module takes the
 * correct half of each divergence:
 *
 *  - **Occurrence overrides are applied** (iOS did, desktop didn't). A task
 *    retimed or renamed for a single date used to show its stale template values
 *    on desktop.
 *  - **Only tracked tasks are listed** (desktop did, iOS didn't). iOS rendered
 *    commitments but excluded them from the count, so its list length and its
 *    `done/total` badge disagreed. Held time still shows on Today and in the
 *    day-breakdown donut, which is where it belongs.
 *  - **`sortTasksByTime` orders the list** (iOS did, desktop didn't). Desktop's
 *    hand-rolled comparator ignored explicit `sortOrder`, so a manually
 *    reordered task stayed put on the dashboard, and it broke ties arbitrarily.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { DayKey, Schedule, Task } from "./useScheduleDB";
import { getTaskSubtaskSummary, isTaskCompleted, isTrackedTask } from "./taskCompletion";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { sortTasksByTime } from "./taskMutations";

export interface TodayTasks {
  /** Occurrence-resolved, tracked-only, sorted by schedule-day start time. */
  tasks: Task[];
  done: number;
  total: number;
}

export function selectTodayTasks(
  schedule: Schedule,
  todayISO: string,
  todayKey: DayKey,
): TodayTasks {
  const plansById = new Map(schedule.plans.map((plan) => [plan.id, plan]));

  // Resolve before sorting: a per-date exception can retime the occurrence, and
  // sorting the template's time would place the row in the wrong slot.
  const tasks = sortTasksByTime(
    (schedule.activities[todayKey] ?? [])
      .filter((task) => isTaskScheduledOn(task, todayISO, true) && isTrackedTask(task))
      .map((task) => resolveOccurrence(task, todayISO)),
  );

  const done = tasks.filter((task) => {
    const plan = task.planId ? plansById.get(task.planId) ?? null : null;
    return isTaskCompleted(task, getTaskSubtaskSummary(task, plan).totalCount);
  }).length;

  return { tasks, done, total: tasks.length };
}
