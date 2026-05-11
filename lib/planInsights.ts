/**
 * Shared plan card calculations.
 * Pure functions — no React, no side-effects.
 */

import { DAYS } from "./useScheduleDB";
import type { Task, Plan } from "./useScheduleDB";
import type { DayKey } from "./useScheduleDB";
import { isTaskCompleted } from "./taskCompletion";
import { localISODate } from "./dateUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanDayState = "incomplete" | "partial" | "complete";

// ── Today's execution state ───────────────────────────────────────────────────

/**
 * Determines today's execution state from linked tasks scheduled today.
 * incomplete = nothing done, partial = some done, complete = all done.
 */
export function resolvePlanDayState(
  todayTasks: Task[],
  totalSubtasks: number
): PlanDayState {
  if (todayTasks.length === 0) return "incomplete";
  const done = todayTasks.filter((t) => isTaskCompleted(t, totalSubtasks)).length;
  if (done === 0) return "incomplete";
  if (done >= todayTasks.length) return "complete";
  return "partial";
}

// ── Consistency ───────────────────────────────────────────────────────────────

/**
 * Builds a Set of ISO date strings where at least one task-level
 * completion event was recorded for this plan.
 */
function buildCompletionDateSet(
  planId: string,
  activities: Record<string, Task[]>
): Set<string> {
  const dates = new Set<string>();

  for (const day of DAYS) {
    for (const task of activities[day as DayKey] ?? []) {
      if (task.planId !== planId) continue;

      if (Array.isArray(task.completionHistory)) {
        for (const event of task.completionHistory) {
          if (event.completionType === "task") {
            dates.add(localISODate(new Date(event.completedAt)));
          }
        }
      } else if (task.completedAt && task.completed) {
        dates.add(localISODate(new Date(task.completedAt)));
      }
    }
  }

  return dates;
}

/**
 * Returns 0–100 representing the % of days (within the plan period)
 * that had at least one task completion.
 *
 * Fixed-date plans: window = startDate → min(endDate, today).
 * Indefinite plans: window = last 30 days.
 */
export function calculateConsistency(
  planId: string,
  activities: Record<string, Task[]>,
  plan: Plan
): number {
  const completedDates = buildCompletionDateSet(planId, activities);
  if (completedDates.size === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let windowStart: Date;
  let windowEnd: Date = today;

  if (plan.startDate) {
    windowStart = new Date(plan.startDate + "T00:00:00");
  } else {
    windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 29);
  }

  if (plan.endDate) {
    const planEnd = new Date(plan.endDate + "T00:00:00");
    if (planEnd < today) windowEnd = planEnd;
  }

  if (windowStart > windowEnd) return 0;

  const totalDays =
    Math.round((windowEnd.getTime() - windowStart.getTime()) / 86_400_000) + 1;
  if (totalDays <= 0) return 0;

  let activeDays = 0;
  for (const dateStr of completedDates) {
    const d = new Date(dateStr + "T00:00:00");
    if (d >= windowStart && d <= windowEnd) activeDays++;
  }

  return Math.min(100, Math.round((activeDays / totalDays) * 100));
}

// ── Combined stats ────────────────────────────────────────────────────────────

export interface PlanCardStats {
  dayState: PlanDayState;
  consistency: number;
}

export function getPlanCardStats(
  plan: Plan,
  activities: Record<string, Task[]>,
  todayKey: DayKey
): PlanCardStats {
  const todayTasks = (activities[todayKey] ?? []).filter(
    (t) => t.planId === plan.id
  );
  const dayState = resolvePlanDayState(todayTasks, plan.items.length);
  const consistency = calculateConsistency(plan.id, activities, plan);
  return { dayState, consistency };
}
