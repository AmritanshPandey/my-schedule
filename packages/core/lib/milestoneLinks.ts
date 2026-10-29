/**
 * The two-way view of milestone links. Links are stored only on the milestone
 * (`linkedActivities` / `linkedTrackers` / `linkedRituals`) so each one has a
 * single representation that syncs with the milestone itself; the item side
 * ("which milestones does this task advance?") is derived here.
 *
 * Pure — the apps call these and hand the result to `setSchedule`.
 */

import type { Milestone } from "./scheduleTypes";

export type MilestoneLinkKind = "task" | "tracker" | "ritual";

type LinkField = "linkedActivities" | "linkedTrackers" | "linkedRituals";

const FIELD: Record<MilestoneLinkKind, LinkField> = {
  task: "linkedActivities",
  tracker: "linkedTrackers",
  ritual: "linkedRituals",
};

function idsOf(milestone: Milestone, kind: MilestoneLinkKind): string[] {
  return milestone[FIELD[kind]] ?? [];
}

/** Milestones that link this item, in roadmap order. */
export function milestonesForItem(milestones: readonly Milestone[], kind: MilestoneLinkKind, itemId: string): Milestone[] {
  return milestones
    .filter((m) => idsOf(m, kind).includes(itemId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder);
}

export const milestonesForTask = (milestones: readonly Milestone[], taskId: string) =>
  milestonesForItem(milestones, "task", taskId);
export const milestonesForTracker = (milestones: readonly Milestone[], trackerId: string) =>
  milestonesForItem(milestones, "tracker", trackerId);
export const milestonesForRitual = (milestones: readonly Milestone[], ritualId: string) =>
  milestonesForItem(milestones, "ritual", ritualId);

/** Milestones still open to link: not completed. Optionally scoped to one plan. */
export function linkableMilestones(milestones: readonly Milestone[], planId?: string): Milestone[] {
  return milestones
    .filter((m) => m.status !== "completed" && !m.actualCompletedDate && (!planId || m.planId === planId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sortOrder - b.sortOrder);
}

function stamp(milestone: Milestone, field: LinkField, ids: string[]): Milestone {
  const next = { ...milestone, [field]: ids, updatedAt: new Date().toISOString() } as Milestone;
  // Keep the deprecated mirror in step, as every other tracker-link write does.
  if (field === "linkedTrackers") next.linkedTrackerId = ids[0];
  return next;
}

/** Link an item to one milestone. A no-op (same array back) when already linked. */
export function linkItem(milestones: Milestone[], milestoneId: string, kind: MilestoneLinkKind, itemId: string): Milestone[] {
  const field = FIELD[kind];
  let changed = false;
  const next = milestones.map((m) => {
    if (m.id !== milestoneId || idsOf(m, kind).includes(itemId)) return m;
    changed = true;
    return stamp(m, field, [...idsOf(m, kind), itemId]);
  });
  return changed ? next : milestones;
}

/** Unlink an item from one milestone. A no-op (same array back) when it wasn't linked. */
export function unlinkItem(milestones: Milestone[], milestoneId: string, kind: MilestoneLinkKind, itemId: string): Milestone[] {
  const field = FIELD[kind];
  let changed = false;
  const next = milestones.map((m) => {
    if (m.id !== milestoneId || !idsOf(m, kind).includes(itemId)) return m;
    changed = true;
    return stamp(m, field, idsOf(m, kind).filter((id) => id !== itemId));
  });
  return changed ? next : milestones;
}

/** Drop a deleted item from every milestone, so none keeps pointing at it. */
export function unlinkEverywhere(milestones: Milestone[], kind: MilestoneLinkKind, itemId: string): Milestone[] {
  const field = FIELD[kind];
  let changed = false;
  const next = milestones.map((m) => {
    if (!idsOf(m, kind).includes(itemId)) return m;
    changed = true;
    return stamp(m, field, idsOf(m, kind).filter((id) => id !== itemId));
  });
  return changed ? next : milestones;
}
