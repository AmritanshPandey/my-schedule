/**
 * Derived Goal progress — the rollup that turns a Goal from a label into a
 * measurable outcome.
 *
 * A Goal deliberately stores nothing about its own progress (see the `Goal`
 * interface in lib/useScheduleDB.ts): the authoritative relationship is
 * `Plan.goalId`, so everything here is computed downward — goal → its plans →
 * their milestones → the existing milestone health engine. Nothing is stored
 * and nothing is written; like lib/milestoneHealth.ts and lib/planProgress.ts
 * this is a pure read-only layer recomputed on render, so it can never drift
 * from the tasks and trackers it summarizes.
 *
 * It deliberately adds no new signal of its own. Every number here comes from
 * `calculateMilestoneState`, which already blends behavioural completion,
 * rolling consistency, outcome metrics and pace-vs-plan. Aggregating an
 * independently-invented "goal score" on top of that would produce a second
 * number that disagrees with the milestone rows underneath it — exactly the
 * inconsistency the product cannot afford.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { Goal, Milestone, Plan, Schedule } from "./useScheduleDB";
import { isPlanRunning } from "./planLifecycle";
import { calculateMilestoneState, type MilestoneHealth } from "./milestoneHealth";
import { resolveMilestoneStatus } from "./roadmapDates";
import { localISODate, formatDateShort } from "./dateUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Goal-level health. Shares milestone health's vocabulary on purpose — a goal
 * reading "at risk" while every milestone under it reads "at risk" is the only
 * way the two surfaces can agree. `no_plans` is the one addition: a goal with
 * nothing linked is a setup gap, not a failing goal, and must never be
 * coloured like one.
 */
export type GoalHealth = MilestoneHealth | "no_plans";

export interface GoalNextMilestone {
  milestone: Milestone;
  plan: Plan;
  /** Whole days until `plannedEndDate`. Negative = already past it. */
  daysUntil: number;
}

export interface GoalProgressState {
  goalId: string;
  health: GoalHealth;
  /** Plans pointing at this goal via `Plan.goalId`, paused ones included. */
  planCount: number;
  /**
   * How many of those are paused. Paused plans contribute no milestones to
   * the rollup — a goal must not read "delayed" because of work the user
   * explicitly put on hold — so this is reported separately to keep
   * `planCount` factually honest.
   */
  pausedPlanCount: number;
  /** Milestones across all those plans. */
  milestoneTotal: number;
  milestonesCompleted: number;
  /** Milestones currently reading at_risk or delayed — the actionable count. */
  milestonesOffTrack: number;
  /**
   * False = nothing measurable is linked yet (no plans, or plans with no
   * milestones). Callers must render setup guidance rather than a 0% bar,
   * which would read as failure where there is simply nothing to measure.
   */
  hasData: boolean;
  /**
   * 0-100, the equal-weight mean of each milestone's own headline progress.
   * Equal weight (rather than by duration) is a deliberate legibility choice:
   * "3 of 6 milestones' worth of progress" is a sentence a user can verify by
   * looking at the list. Null — never a false 0 — when nothing is measurable.
   */
  progress: number | null;
  /** The soonest unfinished milestone across the goal's plans. */
  nextMilestone: GoalNextMilestone | null;
  /** Whole days until `goal.targetDate`. Negative = past it. Null = no target set. */
  daysToTarget: number | null;
  /** A sentence referencing this goal's real counts and dates — never canned. */
  statusMessage: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Whole days between two ISO dates (b - a), via UTC noon to dodge DST. */
function daysBetweenISO(a: string, b: string): number {
  const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/**
 * Worst-wins, with "no signal" states losing to real ones.
 *
 * A goal is only as healthy as its weakest meaningful part: one delayed
 * milestone inside four on-track ones is precisely the thing the user needs
 * told, and averaging it away would hide it. The ordering is severity-first so
 * `delayed` beats `at_risk` beats the healthy states, while `not_started` /
 * `getting_started` never outrank a milestone that has actual data.
 */
const HEALTH_SEVERITY: Record<MilestoneHealth, number> = {
  delayed: 6,
  at_risk: 5,
  getting_started: 4,
  not_started: 3,
  on_track: 2,
  ahead: 1,
  completed: 0,
};

function worstHealth(healths: readonly MilestoneHealth[]): MilestoneHealth {
  return healths.reduce((worst, h) => (HEALTH_SEVERITY[h] > HEALTH_SEVERITY[worst] ? h : worst), "completed");
}

function buildStatusMessage(
  state: Omit<GoalProgressState, "statusMessage">,
  goal: Goal,
): string {
  const { health, planCount, milestoneTotal, milestonesCompleted, milestonesOffTrack, nextMilestone, daysToTarget } = state;

  if (goal.status === "completed") return "Goal completed.";
  if (goal.status === "archived") return "Archived.";
  if (goal.status === "paused") return "Paused — nothing is being tracked while this is on hold.";

  if (health === "no_plans") {
    if (planCount === 0) return "No plans linked yet — link a plan to start tracking this goal.";
    // Every linked plan is on hold. Saying "no milestones yet" here would be a
    // lie about the cause and would push the user to add milestones they
    // already have.
    if (state.pausedPlanCount === planCount) {
      return planCount === 1
        ? "Its only plan is paused — nothing is being tracked until you resume it."
        : `All ${planCount} linked plans are paused — nothing is being tracked until you resume one.`;
    }
    return `${planCount} plan${planCount === 1 ? "" : "s"} linked, but no milestones yet — add milestones to track progress.`;
  }

  const target = goal.targetDate ? formatDateShort(goal.targetDate) : null;
  const targetClause =
    daysToTarget === null || target === null
      ? ""
      : daysToTarget < 0
        ? ` Your ${target} target passed ${Math.abs(daysToTarget)} day${Math.abs(daysToTarget) === 1 ? "" : "s"} ago.`
        : ` ${daysToTarget} day${daysToTarget === 1 ? "" : "s"} until your ${target} target.`;

  if (health === "completed") {
    return `All ${milestoneTotal} milestone${milestoneTotal === 1 ? "" : "s"} complete — mark the goal done when you're ready.`;
  }

  if (health === "not_started") {
    return nextMilestone
      ? `Nothing started yet — first up is "${nextMilestone.milestone.title}".${targetClause}`
      : `Nothing started yet.${targetClause}`;
  }

  if (health === "getting_started") {
    return `Getting started — ${milestonesCompleted} of ${milestoneTotal} milestones done.${targetClause}`;
  }

  const done = `${milestonesCompleted} of ${milestoneTotal} milestones done`;

  if (health === "at_risk" || health === "delayed") {
    const offTrack = `${milestonesOffTrack} milestone${milestonesOffTrack === 1 ? " is" : "s are"} off pace`;
    return nextMilestone
      ? `${done}, and ${offTrack} — starting with "${nextMilestone.milestone.title}".${targetClause}`
      : `${done}, and ${offTrack}.${targetClause}`;
  }

  const pace = health === "ahead" ? "You're ahead of pace" : "You're on track";
  return nextMilestone
    ? `${pace} — ${done}. Next up: "${nextMilestone.milestone.title}".${targetClause}`
    : `${pace} — ${done}.${targetClause}`;
}

// ── Top-level selector ───────────────────────────────────────────────────────

/**
 * Roll a Goal's linked plans up into one progress state.
 *
 * Takes the whole `Schedule` (rather than pre-resolved plans) because the
 * milestone engine needs activities, trackers and metric entries anyway, and
 * making the caller assemble those is how the two surfaces drift apart.
 */
export function calculateGoalProgress(
  schedule: Schedule,
  goal: Goal,
  now: Date = new Date(),
): GoalProgressState {
  const todayISO = localISODate(now);
  const plans = schedule.plans.filter((p) => p.goalId === goal.id);
  // Only running plans feed the rollup; see `pausedPlanCount`.
  const runningPlans = plans.filter(isPlanRunning);
  const plansById = new Map(runningPlans.map((p) => [p.id, p]));

  const milestones = (schedule.milestones ?? []).filter((m) => plansById.has(m.planId));

  const base = {
    goalId: goal.id,
    planCount: plans.length,
    pausedPlanCount: plans.length - runningPlans.length,
    milestoneTotal: milestones.length,
    daysToTarget: goal.targetDate ? daysBetweenISO(todayISO, goal.targetDate) : null,
  };

  if (milestones.length === 0) {
    const empty: Omit<GoalProgressState, "statusMessage"> = {
      ...base,
      health: "no_plans" as const,
      milestonesCompleted: 0,
      milestonesOffTrack: 0,
      hasData: false,
      progress: null,
      nextMilestone: null,
    };
    return { ...empty, statusMessage: buildStatusMessage(empty, goal) };
  }

  const states = milestones.map((milestone) => ({
    milestone,
    plan: plansById.get(milestone.planId)!,
    state: calculateMilestoneState({
      milestone,
      plan: plansById.get(milestone.planId)!,
      activities: schedule.activities,
      trackers: schedule.progressTrackers ?? [],
      metricEntries: schedule.metricEntries ?? [],
      now,
      trackingStart: schedule.preferences?.startDate,
    }),
  }));

  const milestonesCompleted = states.filter(({ state }) => state.health === "completed").length;
  const milestonesOffTrack = states.filter(
    ({ state }) => state.health === "at_risk" || state.health === "delayed",
  ).length;

  // A completed milestone is 100% by definition — its own `overallProgress`
  // can still be null when it was finished without linked tasks or a tracker,
  // and letting that null drop out of the mean would make finishing a
  // milestone *lower* the goal's percentage.
  const contributions = states
    .map(({ state }) => (state.health === "completed" ? 100 : state.overallProgress))
    .filter((value): value is number => value !== null);

  const progress =
    contributions.length > 0
      ? Math.round(contributions.reduce((sum, v) => sum + v, 0) / contributions.length)
      : null;

  const nextMilestone =
    states
      .filter(({ milestone }) => resolveMilestoneStatus(milestone, todayISO) !== "completed")
      .sort((a, b) => a.milestone.plannedEndDate.localeCompare(b.milestone.plannedEndDate))
      .map(({ milestone, plan }) => ({
        milestone,
        plan,
        daysUntil: daysBetweenISO(todayISO, milestone.plannedEndDate),
      }))[0] ?? null;

  const health: GoalHealth =
    goal.status === "completed"
      ? "completed"
      : worstHealth(states.map(({ state }) => state.health));

  const resolved: Omit<GoalProgressState, "statusMessage"> = {
    ...base,
    health,
    milestonesCompleted,
    milestonesOffTrack,
    hasData: true,
    progress,
    nextMilestone,
  };

  return { ...resolved, statusMessage: buildStatusMessage(resolved, goal) };
}

/** Whether this goal is worth surfacing in a "needs attention" context. */
export function goalNeedsAttention(state: GoalProgressState): boolean {
  return state.health === "at_risk" || state.health === "delayed";
}
