/**
 * What success means for a milestone, and finishing it when that's met.
 * Pure — no React.
 *
 * A milestone can set two kinds of target, alone or together:
 *
 *  - tracker targets (`trackerTargets`): the figure each of the plan's
 *    trackers should reach. Met once the latest logged value is there, in the
 *    tracker's good direction (down for a "lower is better" tracker).
 *  - a consistency target (`consistencyTarget`): the share of what's due
 *    inside the milestone's dates — the plan's tasks plus any linked
 *    routines — that has to get done. Judged against the whole window: met
 *    once enough is done that the share can't drop below it, which on the
 *    end date is simply "done ÷ due ≥ target".
 *
 * Success is every target met. When it is, the milestone completes itself
 * (`milestonesReadyToComplete`), unless someone undid an earlier automatic
 * completion (`autoComplete: false`), after which it is completed by hand.
 */
import type { Milestone, MetricEntry, ProgressTracker, Ritual, RitualCompletion, Schedule, Task } from "./scheduleTypes";
import { localISODate } from "./dateUtils";
import { aggregateOccurrences, type RoutineInputs } from "./milestoneHealth";
import { milestoneTrackerTargets, withAutoLinks } from "./milestoneAutoLinks";
import { normalizeMilestoneTimeline } from "./roadmapDates";
import { isPlanRunning } from "./planLifecycle";

export type MilestoneCriterion =
  | {
      kind: "tracker";
      trackerId: string;
      title: string;
      unit: string;
      target: number;
      /** Latest logged value, or null before the first entry. */
      current: number | null;
      /** True when lower is better. */
      decreasing: boolean;
      met: boolean;
    }
  | {
      kind: "consistency";
      /** 0-100. */
      target: number;
      /** Done so far (routine days count their followed share). */
      completed: number;
      /** Everything due in the milestone's dates, start to end. */
      expectedTotal: number;
      /** How many of `expectedTotal` the target asks for. */
      needed: number;
      /** completed ÷ expectedTotal, 0-100. */
      pct: number;
      met: boolean;
    };

export interface CriteriaContext {
  activities: Record<string, Task[]>;
  trackers: readonly ProgressTracker[];
  metricEntries: readonly MetricEntry[];
  rituals?: readonly Ritual[];
  ritualCompletions?: readonly RitualCompletion[];
  /** `preferences.startDate` — entries and due days before it don't count. */
  trackingStart?: string;
}

function latestValue(trackerId: string, entries: readonly MetricEntry[], todayISO: string, trackingStart?: string): number | null {
  let latest: MetricEntry | null = null;
  for (const e of entries) {
    if (e.trackerId !== trackerId || e.date > todayISO || (trackingStart && e.date < trackingStart)) continue;
    if (!latest || e.date >= latest.date) latest = e;
  }
  return latest ? latest.value : null;
}

/** Every target the milestone sets, each with where it stands now. Empty = no targets. */
export function milestoneCriteria(milestone: Milestone, ctx: CriteriaContext, now: Date = new Date()): MilestoneCriterion[] {
  const todayISO = localISODate(now);
  const criteria: MilestoneCriterion[] = [];

  const targets = milestoneTrackerTargets(milestone);
  for (const [trackerId, target] of Object.entries(targets)) {
    const tracker = ctx.trackers.find((t) => t.id === trackerId);
    if (!tracker) continue;
    const current = latestValue(trackerId, ctx.metricEntries, todayISO, ctx.trackingStart);
    const decreasing = tracker.goalDirection === "decrease_good";
    criteria.push({
      kind: "tracker",
      trackerId,
      title: tracker.title,
      unit: tracker.unit ?? "",
      target,
      current,
      decreasing,
      met: current !== null && (decreasing ? current <= target : current >= target),
    });
  }

  if (typeof milestone.consistencyTarget === "number") {
    const resolved = withAutoLinks(milestone, ctx.activities, ctx.trackers);
    const routines: RoutineInputs | undefined = ctx.rituals
      ? { rituals: ctx.rituals, completions: ctx.ritualCompletions ?? [], trackingStart: ctx.trackingStart }
      : undefined;
    const expectedTotal = aggregateOccurrences(resolved, ctx.activities, milestone.plannedEndDate, routines).expected;
    const upTo = todayISO < milestone.plannedEndDate ? todayISO : milestone.plannedEndDate;
    const completed = aggregateOccurrences(resolved, ctx.activities, upTo, routines).completed;
    const needed = Math.ceil((milestone.consistencyTarget / 100) * expectedTotal);
    criteria.push({
      kind: "consistency",
      target: milestone.consistencyTarget,
      completed,
      expectedTotal,
      needed,
      pct: expectedTotal > 0 ? Math.round((completed / expectedTotal) * 100) : 0,
      met: expectedTotal > 0 && completed >= needed,
    });
  }

  return criteria;
}

/** Every target met — and there is at least one. */
export function criteriaMet(criteria: readonly MilestoneCriterion[]): boolean {
  return criteria.length > 0 && criteria.every((c) => c.met);
}

/**
 * Open milestones whose targets are all met and that may complete on their
 * own (not paused, not handed back by an undo).
 */
export function milestonesReadyToComplete(schedule: Schedule, now: Date = new Date()): Milestone[] {
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const ctx: CriteriaContext = {
    activities: schedule.activities as unknown as Record<string, Task[]>,
    trackers: schedule.progressTrackers ?? [],
    metricEntries: schedule.metricEntries ?? [],
    rituals: schedule.rituals,
    ritualCompletions: schedule.ritualCompletions,
    trackingStart: schedule.preferences?.startDate,
  };
  return (schedule.milestones ?? []).filter((m) => {
    if (m.status === "completed" || m.actualCompletedDate || m.autoComplete === false) return false;
    const plan = plansById.get(m.planId);
    if (!plan || !isPlanRunning(plan)) return false;
    return criteriaMet(milestoneCriteria(m, ctx, now));
  });
}

function relayPlans(milestones: Milestone[], schedule: Schedule, planIds: Set<string>): Milestone[] {
  const untouched = milestones.filter((m) => !planIds.has(m.planId));
  const relaid = [...planIds].flatMap((planId) => {
    const plan = schedule.plans.find((p) => p.id === planId);
    return normalizeMilestoneTimeline(milestones.filter((m) => m.planId === planId), plan?.startDate);
  });
  return [...untouched, ...relaid];
}

/** Mark these milestones complete on `dateISO`, the same way the Complete button does. */
export function completeMilestones(schedule: Schedule, ids: readonly string[], dateISO: string): Schedule {
  const wanted = new Set(ids);
  const stamp = new Date().toISOString();
  const planIds = new Set<string>();
  const milestones = (schedule.milestones ?? []).map((m) => {
    if (!wanted.has(m.id)) return m;
    planIds.add(m.planId);
    return {
      ...m,
      status: "completed" as const,
      actualCompletedDate: dateISO,
      completionStatus: "completed" as const,
      completedDate: dateISO,
      updatedAt: stamp,
    };
  });
  if (planIds.size === 0) return schedule;
  return { ...schedule, milestones: relayPlans(milestones, schedule, planIds) };
}

/**
 * Undo an automatic completion: put each milestone back as it was and hand
 * it to the person (`autoComplete: false`), so meeting the targets again
 * doesn't complete it straight back.
 */
export function undoAutoComplete(schedule: Schedule, before: readonly Milestone[]): Schedule {
  const byId = new Map(before.map((m) => [m.id, m]));
  const planIds = new Set<string>();
  const stamp = new Date().toISOString();
  const milestones = (schedule.milestones ?? []).map((m) => {
    const prior = byId.get(m.id);
    if (!prior) return m;
    planIds.add(m.planId);
    return { ...prior, autoComplete: false as const, updatedAt: stamp };
  });
  if (planIds.size === 0) return schedule;
  return { ...schedule, milestones: relayPlans(milestones, schedule, planIds) };
}

/** "72 → 70 kg" style figure for a tracker target row. */
export function formatCriterionFigure(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}
