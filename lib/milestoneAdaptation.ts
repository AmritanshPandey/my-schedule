/**
 * What to actually *do* about a milestone that is off pace.
 *
 * lib/milestoneHealth.ts already answers "is this going to make it, and when
 * will it really finish". It stops there — and a product that tells someone
 * they will finish twelve days late and offers no button is diagnosis without
 * treatment. This module is the treatment: it turns a `MilestoneState` into
 * concrete, reviewable adjustments, and applies the one the user picks.
 *
 * Two hard rules, both from the product principles:
 *
 *  - **PlanR proposes, the user decides (PP-06).** Nothing here mutates on its
 *    own. `proposeAdaptations` is pure and read-only; `applyAdaptation` runs
 *    only on an option the user explicitly chose, and every option describes
 *    its own changes in plain language first.
 *  - **Adapt, don't punish (PP-05).** The options are an escalation ladder —
 *    recover the work, then move the line, then step away — so the cheapest
 *    honest fix is offered before the most drastic one. None of them deletes
 *    anything.
 *
 * Scope note: §10.3 lists eight adaptation options. This implements the three
 * that the current data model supports exactly and explainably — reschedule
 * missed work, extend the target, pause the plan. Redistributing workload,
 * changing routine frequency and reprioritising across goals need structural
 * edits this module deliberately does not attempt to guess at.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { Milestone, Plan, Schedule, Task } from "./useScheduleDB";
import type { MilestoneState } from "./milestoneHealth";
import { pausePlan } from "./planLifecycle";
import { rescheduleMissedTaskOnce, missKey } from "./missedRecovery";
import { cascadeMilestoneDates, calculateMilestoneEndDate } from "./roadmapDates";
import { DAYS } from "./scheduleConstants";
import { localISODate, formatDateShort } from "./dateUtils";
import { getSlots } from "./taskMutations";
import { parseTimeToMinutes } from "./timeUtils";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** How far back a missed occurrence is still worth offering to recover. */
export const RECOVERABLE_LOOKBACK_DAYS = 14;

/**
 * Extension used when there is no forecast to anchor to. Two weeks is a
 * deliberate middle: long enough to be worth doing, short enough that it is
 * still a commitment rather than an abandonment.
 */
export const DEFAULT_EXTENSION_DAYS = 14;

/** Never offer to recover more than this in one go — past it, the honest
 *  answer is extending or pausing, not a wall of catch-up work. */
export const MAX_RECOVERABLE_OCCURRENCES = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface MissedOccurrence {
  taskId: string;
  taskTitle: string;
  /** The date the occurrence was missed. */
  dateISO: string;
  /** The day it would be moved to. */
  targetDateISO: string;
}

export interface ExtendTargetAdaptation {
  kind: "extend_target";
  milestoneId: string;
  newEndDate: string;
  /** Days added versus the current `plannedEndDate`. Always >= 1. */
  daysAdded: number;
  /** True = every later milestone on the plan shifts by the same amount. */
  cascade: boolean;
  /** How many later milestones move when `cascade` is on. */
  downstreamCount: number;
  /** Whether the new date came from the real forecast or a flat default. */
  basis: "forecast" | "default";
}

export interface RescheduleMissedAdaptation {
  kind: "reschedule_missed";
  milestoneId: string;
  occurrences: MissedOccurrence[];
}

export interface PausePlanAdaptation {
  kind: "pause_plan";
  planId: string;
  planTitle: string;
}

export type Adaptation =
  | ExtendTargetAdaptation
  | RescheduleMissedAdaptation
  | PausePlanAdaptation;

export interface AdaptationOffer {
  adaptation: Adaptation;
  /** Verb-first button text, per the product's voice. */
  label: string;
  /** One sentence naming this milestone's real numbers — never canned. */
  rationale: string;
  /** Human-readable rows describing exactly what will change. Never raw JSON. */
  changes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysBetweenISO(a: string, b: string): number {
  const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Every weekday-bucket copy of the tasks this milestone is measured by. */
function linkedTasks(milestone: Milestone, activities: Record<string, Task[]>): Task[] {
  const wanted = new Set(milestone.linkedActivities ?? []);
  if (wanted.size === 0) return [];
  const byId = new Map<string, Task>();
  for (const day of DAYS) {
    for (const task of activities[day] ?? []) {
      if (wanted.has(task.id) && !byId.has(task.id)) byId.set(task.id, task);
    }
  }
  return [...byId.values()];
}

/**
 * Missed occurrences of this milestone's linked tasks that are still worth
 * recovering — recent, not already handled, and not today (today is still
 * live, so it is not a miss to recover yet).
 */
function recoverableMisses(
  milestone: Milestone,
  schedule: Pick<Schedule, "activities" | "preferences">,
  todayISO: string,
): Array<{ task: Task; dateISO: string }> {
  const acknowledged = new Set(schedule.preferences?.acknowledgedMisses ?? []);
  const cutoff = shiftISO(todayISO, -RECOVERABLE_LOOKBACK_DAYS);
  const out: Array<{ task: Task; dateISO: string }> = [];
  const seen = new Set<string>();

  for (const task of linkedTasks(milestone, schedule.activities)) {
    for (const event of task.completionHistory ?? []) {
      if (event.completionType !== "missed" || event.subtaskId) continue;
      const dateISO = localISODate(new Date(event.completedAt));
      if (dateISO >= todayISO || dateISO < cutoff) continue;
      const key = missKey(task.id, dateISO);
      if (seen.has(key) || acknowledged.has(key)) continue;
      seen.add(key);
      out.push({ task, dateISO });
    }
  }

  // Oldest first: catching up in the order it was missed reads as a queue
  // rather than an arbitrary pile.
  out.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return out.slice(0, MAX_RECOVERABLE_OCCURRENCES);
}

/** The task's own start time, in minutes, for replaying a missed occurrence. */
function startMinutesOf(task: Task): number {
  const slot = getSlots(task)[0];
  return parseTimeToMinutes(slot?.startTime ?? "") ?? 9 * 60;
}

// ── Proposal ─────────────────────────────────────────────────────────────────

export interface ProposeParams {
  milestone: Milestone;
  plan: Plan;
  state: MilestoneState;
  schedule: Pick<Schedule, "activities" | "preferences" | "milestones" | "plans">;
  now?: Date;
}

/**
 * The adjustments worth offering for this milestone, best-first.
 *
 * Returns an empty list when there is nothing meaningful to adjust — a
 * completed milestone, or one with no data yet, where the honest answer is to
 * link some work rather than to adapt a plan that isn't running.
 */
export function proposeAdaptations(params: ProposeParams): AdaptationOffer[] {
  const { milestone, plan, state, schedule } = params;
  const now = params.now ?? new Date();
  const todayISO = localISODate(now);

  if (state.health === "completed" || milestone.actualCompletedDate) return [];
  if (!state.hasData) return [];

  const offers: AdaptationOffer[] = [];

  // ── 1. Recover the work ───────────────────────────────────────────────────
  // Offered first because it is the only option that keeps the original
  // commitment intact. Moving the target or pausing both concede something.
  const misses = recoverableMisses(milestone, schedule, todayISO);
  if (misses.length > 0) {
    const occurrences: MissedOccurrence[] = misses.map((miss, index) => ({
      taskId: miss.task.id,
      taskTitle: miss.task.title,
      dateISO: miss.dateISO,
      // One per day from tomorrow, so recovery never stacks several sessions
      // onto a single day and manufactures a day nobody could complete.
      targetDateISO: shiftISO(todayISO, index + 1),
    }));
    offers.push({
      adaptation: { kind: "reschedule_missed", milestoneId: milestone.id, occurrences },
      label: `Reschedule ${plural(occurrences.length, "missed session")}`,
      rationale:
        `${plural(occurrences.length, "session")} linked to this milestone ${occurrences.length === 1 ? "was" : "were"} missed in the last ${RECOVERABLE_LOOKBACK_DAYS} days.`,
      changes: occurrences.map(
        (o) => `${o.taskTitle} — ${formatDateShort(o.dateISO)} → ${formatDateShort(o.targetDateISO)}`,
      ),
    });
  }

  // ── 2. Move the line ──────────────────────────────────────────────────────
  // Anchored to the real forecast where there is one: "move it to where you
  // are actually going to finish" is a far better offer than an arbitrary
  // two weeks, and it is the number the health engine already computed.
  const forecastIsLater =
    state.forecastDate !== null && state.forecastDate > milestone.plannedEndDate;
  const newEndDate = forecastIsLater
    ? state.forecastDate!
    : shiftISO(milestone.plannedEndDate, DEFAULT_EXTENSION_DAYS);
  const daysAdded = daysBetweenISO(milestone.plannedEndDate, newEndDate);

  if (daysAdded >= 1) {
    const downstream = (schedule.milestones ?? []).filter(
      (m) => m.planId === milestone.planId && m.sortOrder > milestone.sortOrder,
    );
    offers.push({
      adaptation: {
        kind: "extend_target",
        milestoneId: milestone.id,
        newEndDate,
        daysAdded,
        // Cascading is the safer default: leaving later milestones where they
        // are silently compresses them, which is how one slip quietly becomes
        // three. The UI lets the user turn it off.
        cascade: downstream.length > 0,
        downstreamCount: downstream.length,
        basis: forecastIsLater ? "forecast" : "default",
      },
      label: `Extend target by ${plural(daysAdded, "day")}`,
      rationale: forecastIsLater
        ? `Your current pace projects finishing ${formatDateShort(newEndDate)}. This moves the target to match.`
        : `There is no reliable forecast yet, so this adds ${plural(DEFAULT_EXTENSION_DAYS, "day")} to the current target.`,
      changes: [
        `Target ${formatDateShort(milestone.plannedEndDate)} → ${formatDateShort(newEndDate)}`,
        ...(downstream.length > 0
          ? [`${plural(downstream.length, "later milestone")} ${downstream.length === 1 ? "shifts" : "shift"} by the same ${plural(daysAdded, "day")}`]
          : []),
      ],
    });
  }

  // ── 3. Step away ──────────────────────────────────────────────────────────
  // Last, and never dressed up as failure. Offered only for a running plan.
  if ((plan.status ?? "active") === "active") {
    offers.push({
      adaptation: { kind: "pause_plan", planId: plan.id, planTitle: plan.title },
      label: "Pause this plan",
      rationale:
        "Put the whole plan on hold. Nothing is deleted, nothing is marked missed, and resuming puts it back exactly as it was.",
      changes: [
        `"${plan.title}" stops appearing in Today`,
        "Its tasks stop counting toward streaks and consistency",
      ],
    });
  }

  return offers;
}

// ── Application ──────────────────────────────────────────────────────────────

/**
 * Apply one chosen adaptation. Returns the schedule unchanged when the
 * adaptation no longer makes sense (the milestone or plan was deleted, the
 * misses were already handled) — the same staleness guard
 * lib/proposalMutations.ts applies to AI proposals, for the same reason: the
 * user may have acted between seeing the offer and accepting it.
 */
export function applyAdaptation(schedule: Schedule, adaptation: Adaptation): Schedule {
  switch (adaptation.kind) {
    case "pause_plan": {
      return pausePlan(schedule, adaptation.planId);
    }

    case "reschedule_missed": {
      const byId = new Map<string, Task>();
      for (const day of DAYS) {
        for (const task of schedule.activities[day] ?? []) {
          if (!byId.has(task.id)) byId.set(task.id, task);
        }
      }
      let next = schedule;
      for (const occurrence of adaptation.occurrences) {
        const task = byId.get(occurrence.taskId);
        if (!task) continue; // deleted since the offer was built
        next = rescheduleMissedTaskOnce(
          next,
          task,
          occurrence.dateISO,
          occurrence.targetDateISO,
          startMinutesOf(task),
        );
      }
      return next;
    }

    case "extend_target": {
      const milestones = schedule.milestones ?? [];
      const target = milestones.find((m) => m.id === adaptation.milestoneId);
      if (!target) return schedule;

      // End date is derived from start + duration, so extending the end means
      // lengthening the duration — writing plannedEndDate directly would be
      // overwritten by the next normalization pass.
      const newDuration = daysBetweenISO(target.startDate, adaptation.newEndDate) + 1;
      if (newDuration < 1) return schedule;

      const samePlan = milestones.filter((m) => m.planId === target.planId);
      const others = milestones.filter((m) => m.planId !== target.planId);

      if (adaptation.cascade) {
        return {
          ...schedule,
          milestones: [
            ...others,
            ...cascadeMilestoneDates(samePlan, target.id, { plannedDurationDays: newDuration }),
          ],
        };
      }

      // No cascade: this milestone alone moves, later ones keep their dates.
      const plannedEndDate = calculateMilestoneEndDate(target.startDate, newDuration);
      return {
        ...schedule,
        milestones: milestones.map((m) =>
          m.id === target.id
            ? {
                ...m,
                plannedDurationDays: newDuration,
                plannedEndDate,
                // Legacy mirror fields, kept in step with the roadmap helpers.
                targetDate: plannedEndDate,
                estimatedDays: newDuration,
                updatedAt: new Date().toISOString(),
              }
            : m,
        ),
      };
    }
  }
}
