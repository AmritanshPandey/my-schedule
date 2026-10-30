/**
 * Server-side milestone health — the same calculateMilestoneState the client
 * already runs (packages/core/lib/milestoneHealth.ts), just running here so a
 * result exists without any device having the app open. Both entry points in
 * index.ts (the callable and the scheduled digest) share this walk so there
 * is exactly one place that turns a Schedule into a list of milestone states.
 */

import { calculateMilestoneState, type MilestoneState } from "@planr/core/lib/milestoneHealth";
import type { Plan, Schedule } from "@planr/core/lib/scheduleTypes";

export interface MilestoneStateResult {
  milestoneId: string;
  planId: string;
  planTitle: string;
  milestoneTitle: string;
  state: MilestoneState;
}

/** Every milestone in `schedule` with its live state, skipping any whose
 *  plan has gone missing (a deleted plan whose milestones haven't been
 *  cleaned up yet — same defensive check the client's own views make). */
export function computeAllMilestoneStates(schedule: Schedule, now = new Date()): MilestoneStateResult[] {
  const plansById = new Map<string, Plan>(schedule.plans.map((p) => [p.id, p]));
  const results: MilestoneStateResult[] = [];

  for (const milestone of schedule.milestones ?? []) {
    const plan = plansById.get(milestone.planId);
    if (!plan) continue;
    const state = calculateMilestoneState({
      milestone,
      plan,
      activities: schedule.activities,
      trackers: schedule.progressTrackers,
      metricEntries: schedule.metricEntries,
      now,
      trackingStart: schedule.preferences?.startDate,
      milestones: schedule.milestones,
      rituals: schedule.rituals,
      ritualCompletions: schedule.ritualCompletions,
    });
    results.push({
      milestoneId: milestone.id,
      planId: plan.id,
      planTitle: plan.title,
      milestoneTitle: milestone.title,
      state,
    });
  }

  return results;
}
