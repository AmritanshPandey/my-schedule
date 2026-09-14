/**
 * A Plan's explicit lifecycle — whether it is running at all — plus the pure
 * operations that change it.
 *
 * Deliberately NOT called `PlanStatus`: lib/planInsights.ts already exports a
 * `PlanStatus` ("on_track" | "at_risk" | "delayed" | "unproven"), and the two
 * answer different questions. That one is *derived* health — how is this
 * going. This one is *declared* lifecycle — is this expected at all. A plan
 * can be `active` and `at_risk` at the same time, so the names must not
 * suggest they are interchangeable.
 *
 * Free of value imports from lib/useScheduleDB.ts on purpose — importing that
 * module pulls in React and contexts/AuthProvider, which would make every
 * consumer of `isPlanRunning` unloadable under the node test runner. Only the
 * `Plan` type comes from there, and types are erased. Same discipline as
 * lib/ai/targets.ts; see its header.
 */

import type { Plan, Schedule } from "./useScheduleDB";

/** Absent on a stored Plan is equivalent to "active", so nothing migrates. */
export type PlanLifecycle = "active" | "paused" | "completed";

/**
 * Whether a Plan's tasks should still be expected today.
 *
 * The single predicate every counting site must use, so "paused" can never
 * mean one thing on the timeline and another in the streak. Mirrors
 * `isTrackedTask` in lib/taskCompletion.ts, which answers the same shape of
 * question one level down.
 */
export function isPlanRunning(plan: Pick<Plan, "status"> | undefined): boolean {
  return (plan?.status ?? "active") === "active";
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// Each takes a `Schedule` and returns a new one, mirroring lib/goalMutations.ts
// so callers just do `setSchedule((prev) => pausePlan(prev, id))`.
//
// Nothing here touches Tasks, Milestones or Trackers. Pausing is reversible
// precisely because it writes one field and destroys nothing: resuming
// restores the plan exactly as it was, which is what makes it safe to offer as
// a recovery option (PP-05 — adapt, don't punish).

function setLifecycle(schedule: Schedule, planId: string, status: PlanLifecycle): Schedule {
  const existing = schedule.plans.find((p) => p.id === planId);
  if (!existing || (existing.status ?? "active") === status) return schedule;
  return {
    ...schedule,
    plans: schedule.plans.map((p) => (p.id === planId ? { ...p, status } : p)),
  };
}

/**
 * Hold a plan. Its tasks stay on the plan and keep their history, but stop
 * being expected — no misses accrue and no consistency figure counts them.
 */
export function pausePlan(schedule: Schedule, planId: string): Schedule {
  return setLifecycle(schedule, planId, "paused");
}

/** Put a paused or completed plan back into normal execution. */
export function resumePlan(schedule: Schedule, planId: string): Schedule {
  return setLifecycle(schedule, planId, "active");
}

/**
 * Explicit user action only — never inferred from task or milestone
 * completion, matching how `completeGoal` works in lib/goalMutations.ts.
 */
export function completePlan(schedule: Schedule, planId: string): Schedule {
  return setLifecycle(schedule, planId, "completed");
}

/** Convenience for the UI's single toggle affordance. */
export function togglePlanPaused(schedule: Schedule, planId: string): Schedule {
  const existing = schedule.plans.find((p) => p.id === planId);
  if (!existing) return schedule;
  return (existing.status ?? "active") === "paused"
    ? resumePlan(schedule, planId)
    : pausePlan(schedule, planId);
}

/** Human label for a plan's lifecycle state. */
export function planLifecycleLabel(plan: Pick<Plan, "status">): string {
  switch (plan.status ?? "active") {
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    default:
      return "Active";
  }
}
