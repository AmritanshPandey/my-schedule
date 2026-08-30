/**
 * Shared plan card calculations.
 * Pure functions — no React, no side-effects.
 */

// DAYS comes from scheduleConstants, not from useScheduleDB's re-export: that
// re-export is a *runtime* import, and it drags React and AuthProvider in behind
// it — which breaks the "no React, no side-effects" promise above and makes this
// file unloadable under the node test runner. The type imports are erased, so
// they can stay.
import { DAYS } from "./scheduleConstants";
import type { Task, Plan, Milestone } from "./useScheduleDB";
import type { DayKey } from "./useScheduleDB";
import { isTaskCompleted, isTrackedTask } from "./taskCompletion";
import { isTaskScheduledOn } from "./taskOccurrence";
import { localISODate } from "./dateUtils";
import { planEffectiveEndDate } from "./roadmapDates";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanDayState = "incomplete" | "partial" | "complete";

// ── Today's execution state ───────────────────────────────────────────────────

/**
 * Determines today's execution state from linked tasks scheduled today.
 * incomplete = nothing done, partial = some done, complete = all done.
 */
export function resolvePlanDayState(
  todayTasks: Task[],
  fallbackSubtaskCount: number
): PlanDayState {
  if (todayTasks.length === 0) return "incomplete";
  const done = todayTasks.filter((task) => {
    const ownSubtaskCount = task.subtasks?.length ?? 0;
    const totalSubtasks = task.taskType === "session" || ownSubtaskCount > 0 ? ownSubtaskCount : fallbackSubtaskCount;
    return isTaskCompleted(task, totalSubtasks);
  }).length;
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
  plan: Plan,
  /** Schedule-wide tracking start — the window never reaches before it. */
  trackingStartISO?: string,
  /** This plan's milestones, so the window can follow the roadmap's real end. */
  milestones?: Milestone[],
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

  // The roadmap's end, not the typed one. A plan whose milestones run past its
  // stored endDate is still running, and truncating the window there would
  // score it as finished — reporting a consistency figure for a period the user
  // is still in the middle of.
  const effectiveEnd = planEffectiveEndDate(plan, milestones ?? []);
  if (effectiveEnd) {
    const planEnd = new Date(effectiveEnd + "T00:00:00");
    if (planEnd < today) windowEnd = planEnd;
  }

  // Never measure across days the user asked us to ignore.
  if (trackingStartISO) {
    const trackingStart = new Date(trackingStartISO + "T00:00:00");
    if (trackingStart > windowStart) windowStart = trackingStart;
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
  todayKey: DayKey,
  /** Schedule-wide tracking start — analytics ignore anything before it. */
  trackingStartISO?: string,
  /** Every milestone in the schedule; filtered to this plan's here. */
  milestones?: Milestone[],
): PlanCardStats {
  const todayISO = localISODate(new Date());
  const todayTasks = (activities[todayKey] ?? []).filter(
    (t) => t.planId === plan.id && isTaskScheduledOn(t, todayISO, true) && isTrackedTask(t)
  );
  const dayState = resolvePlanDayState(todayTasks, plan.items.length);
  const consistency = calculateConsistency(
    plan.id,
    activities,
    plan,
    trackingStartISO,
    milestones?.filter((m) => m.planId === plan.id),
  );
  return { dayState, consistency };
}

// ── Standing ──────────────────────────────────────────────────────────────────

/** `unproven` is not a grade: the plan has nothing to report yet. */
export type PlanStatus = "on_track" | "at_risk" | "delayed" | "unproven";

/**
 * How long a plan gets before its consistency counts as a verdict.
 *
 * `calculateConsistency` returns a flat 0 whenever there are no completions yet,
 * so without this window every plan created today read as "needs focus" — in
 * alarm red on its card, and counted in the Plans sidebar tally. A screen where
 * every plan shouts is a screen where the colour means nothing, and PlanR is not
 * supposed to nag.
 *
 * A week is the rhythm the rest of the app measures in (week bars, weekly
 * progress), so it's the first point at which a run of zeroes is a signal rather
 * than an absence of one.
 */
export const PROVING_DAYS = 7;

/** Whole days since the plan began; negative before it starts, null if undated. */
export function planDaysRunning(plan: Plan, now: Date = new Date()): number | null {
  if (!plan.startDate) return null;
  const start = new Date(`${plan.startDate}T00:00:00`).getTime();
  if (Number.isNaN(start)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start) / 86_400_000);
}

/**
 * The plan's standing, used by both the plan card and the Plans sidebar tally
 * so the two can never disagree about what "needs focus" means.
 */
export function derivePlanStatus(
  dayState: PlanDayState,
  consistency: number,
  plan: Plan,
  now: Date = new Date(),
): PlanStatus {
  if (dayState === "complete" || consistency >= 70) return "on_track";
  // No completions AND no fair run at it yet: report nothing rather than a grade
  // the user had no chance to earn. An undated plan counts as unproven too,
  // because nothing on it says when it was meant to start.
  const elapsed = planDaysRunning(plan, now);
  if (consistency === 0 && (elapsed === null || elapsed < PROVING_DAYS)) return "unproven";
  if (consistency >= 35) return "at_risk";
  return "delayed";
}

/** Plans actually asking for attention — excludes the ones with no signal yet. */
export function needsAttention(status: PlanStatus): boolean {
  return status === "at_risk" || status === "delayed";
}
