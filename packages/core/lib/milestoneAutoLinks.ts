/**
 * Which of its plan's work a milestone counts — derived, never hand-picked.
 *
 * A milestone is a stretch of its plan's timeline, so:
 *
 *  - tasks: every tracked task in its plan that is due at least once between
 *    its start and end dates. Always — there is no per-task linking.
 *  - trackers: the ones it sets a target for (`trackerTargets`, or the legacy
 *    single `targetValue` on `linkedTrackers[0]`). With no target at all, the
 *    plan's only tracker counts, measured against its goal spread across the
 *    milestones by date; with several and no target, none does.
 *  - routines: hand-picked in the milestone sheet (`linkedRituals`), since a
 *    routine doesn't belong to a plan.
 *
 * Nothing here is stored: the set is derived on read, so a task added to the
 * plan next week starts counting the moment it exists.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { DayKey, Milestone, ProgressTracker, Task } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isTrackedTask } from "./taskCompletion";
import { addDaysToISO } from "./dateUtils";
import { linkItem, unlinkItem, type MilestoneLinkKind } from "./milestoneLinks";

/** Which of a milestone's links are derived rather than hand-made. */
export interface AutoLinked {
  tasks: boolean;
  tracker: boolean;
}

type Activities = Record<string, Task[]>;

// Derived per `activities` object: the app replaces it on every edit, so a
// stale entry is never read back, and renders between edits stay cheap.
const taskCache = new WeakMap<Activities, Map<string, string[]>>();

/** Monday-first, like DAYS; JS getDay() is Sunday-first. */
function dayKeyOf(dateISO: string): DayKey {
  return DAYS[(new Date(`${dateISO}T00:00:00`).getDay() + 6) % 7];
}

/** Whether this weekday copy of a task is due on any date in the window. */
function dueBetween(task: Task, day: DayKey, fromISO: string, toISO: string): boolean {
  // Start on the first date that falls on this copy's weekday, then step a week.
  let cursor = fromISO;
  for (let i = 0; i < 7 && cursor <= toISO && dayKeyOf(cursor) !== day; i++) cursor = addDaysToISO(cursor, 1);
  for (; cursor <= toISO; cursor = addDaysToISO(cursor, 7)) {
    if (isTaskScheduledOn(task, cursor, true)) return true;
  }
  return false;
}

/** The plan's tracked tasks due at least once inside the milestone's dates. */
export function autoTaskIds(milestone: Milestone, activities: Activities): string[] {
  const key = `${milestone.planId}|${milestone.startDate}|${milestone.plannedEndDate}`;
  let byMilestone = taskCache.get(activities);
  const cached = byMilestone?.get(key);
  if (cached) return cached;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const day of DAYS) {
    for (const task of activities[day] ?? []) {
      if (seen.has(task.id) || task.planId !== milestone.planId || !isTrackedTask(task)) continue;
      // A weekly task lives in one bucket per weekday it runs on; any one of
      // them being due in the window is enough.
      if (dueBetween(task, day, milestone.startDate, milestone.plannedEndDate)) {
        seen.add(task.id);
        ids.push(task.id);
      }
    }
  }

  if (!byMilestone) {
    byMilestone = new Map();
    taskCache.set(activities, byMilestone);
  }
  byMilestone.set(key, ids);
  return ids;
}

/** The plan's only tracker, or none when it has zero or several. */
export function autoTrackerIds(milestone: Milestone, trackers: readonly ProgressTracker[]): string[] {
  const own = trackers.filter((t) => t.planId === milestone.planId);
  return own.length === 1 ? [own[0].id] : [];
}

/**
 * The targets this milestone sets, tracker id → figure. Reads the legacy
 * single `targetValue` (on `linkedTrackers[0]`) when there is no map yet.
 */
export function milestoneTrackerTargets(milestone: Milestone): Record<string, number> {
  if (milestone.trackerTargets && Object.keys(milestone.trackerTargets).length > 0) return milestone.trackerTargets;
  const legacy = milestone.linkedTrackers?.[0];
  if (legacy && typeof milestone.targetValue === "number" && Number.isFinite(milestone.targetValue)) {
    return { [legacy]: milestone.targetValue };
  }
  return {};
}

/** Whether the tracker set came from the plan rather than from targets. */
export function autoLinkedKinds(milestone: Milestone): AutoLinked {
  return { tasks: true, tracker: Object.keys(milestoneTrackerTargets(milestone)).length === 0 };
}

/**
 * The milestone as every progress number should read it: the plan's tasks due
 * in its dates, and the trackers it sets targets for (else the plan's only
 * tracker). `targetValue` mirrors the first tracker's target, which is what
 * the planned-path code reads for the primary tracker.
 *
 * `activities` undefined leaves the task set as stored — for sibling lists
 * that only need their trackers resolved.
 */
export function withAutoLinks(
  milestone: Milestone,
  activities: Activities | undefined,
  trackers?: readonly ProgressTracker[],
): Milestone {
  const targets = milestoneTrackerTargets(milestone);
  const targetIds = Object.keys(targets).filter((id) => !trackers || trackers.some((t) => t.id === id));
  const trackerIds = targetIds.length ? targetIds : trackers ? autoTrackerIds(milestone, trackers) : milestone.linkedTrackers ?? [];
  const tasks = activities ? autoTaskIds(milestone, activities) : milestone.linkedActivities ?? [];
  return {
    ...milestone,
    linkedActivities: tasks,
    linkedTrackers: trackerIds,
    linkedTrackerId: trackerIds[0],
    trackerTargets: targetIds.length ? Object.fromEntries(targetIds.map((id) => [id, targets[id]])) : undefined,
    targetValue: trackerIds[0] !== undefined ? targets[trackerIds[0]] : undefined,
  };
}

/**
 * Link or unlink an item on a milestone by hand. Only routines are linked
 * this way (a routine doesn't belong to a plan); a tracker counts by its
 * target and tasks by their dates, so links of those kinds are stored but
 * never read for progress.
 */
export function setMilestoneLink(
  schedule: { milestones?: Milestone[] },
  milestoneId: string,
  kind: MilestoneLinkKind,
  itemId: string,
  linked: boolean,
): Milestone[] {
  return (linked ? linkItem : unlinkItem)(schedule.milestones ?? [], milestoneId, kind, itemId);
}
