/**
 * Automatic milestone links — a milestone counts its plan's own work without
 * anyone wiring it up.
 *
 * A milestone is a stretch of its plan's timeline. Asking people to also pick,
 * by hand, which of the plan's tasks and trackers "belong" to that stretch made
 * the goal → plan → milestone roll-up read 0% for anyone who skipped the step,
 * however much they actually did. So, per link kind:
 *
 *  - tasks: a milestone with no hand-made task links counts every tracked task
 *    in its plan that is due at least once between its start and end dates.
 *  - tracker: a milestone with no hand-made tracker link uses the plan's
 *    tracker when the plan has exactly one. With several, which one measures
 *    this stretch is a real choice, so it stays the person's to make.
 *
 * Hand-made links always win — they are the override, kind by kind — so every
 * milestone someone already linked reads exactly as before. Routines have no
 * plan to belong to yet, so they are only ever linked by hand.
 *
 * Nothing here is stored: the automatic set is derived on read, so a task
 * added to the plan next week starts counting the moment it exists. Only a
 * manual edit writes, and `materializeLinks` makes that edit start from what
 * the person was already seeing rather than from an empty list.
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

/** Which links of this milestone would be filled automatically. */
export function autoLinkedKinds(milestone: Milestone): AutoLinked {
  return {
    tasks: (milestone.linkedActivities?.length ?? 0) === 0 && !milestone.autoLinkOff?.tasks,
    tracker: (milestone.linkedTrackers?.length ?? 0) === 0 && !milestone.autoLinkOff?.tracker,
  };
}

/**
 * The milestone as every progress number should read it: hand-made links
 * where there are any, the automatic set where there aren't. Returns the same
 * object when nothing needed filling.
 */
export function withAutoLinks(
  milestone: Milestone,
  activities: Activities | undefined,
  trackers?: readonly ProgressTracker[],
): Milestone {
  const auto = autoLinkedKinds(milestone);
  const tasks = auto.tasks && activities ? autoTaskIds(milestone, activities) : null;
  const tracker = auto.tracker && trackers ? autoTrackerIds(milestone, trackers) : null;
  if (!tasks?.length && !tracker?.length) return milestone;
  return {
    ...milestone,
    ...(tasks?.length ? { linkedActivities: tasks } : {}),
    ...(tracker?.length ? { linkedTrackers: tracker, linkedTrackerId: tracker[0] } : {}),
  };
}

/** `withAutoLinks` across a list — for surfaces that show which milestones an item advances. */
export function resolveMilestoneLinks(
  milestones: readonly Milestone[],
  activities: Activities | undefined,
  trackers?: readonly ProgressTracker[],
): Milestone[] {
  return milestones.map((m) => withAutoLinks(m, activities, trackers));
}

/**
 * Before a hand edit to one kind of link on an automatic milestone, write the
 * automatic set down so the edit starts from it. Without this, linking one
 * extra task to a milestone that was counting six would leave it counting one.
 */
export function materializeLinks(
  milestones: Milestone[],
  milestoneId: string,
  kind: "task" | "tracker",
  activities: Activities | undefined,
  trackers?: readonly ProgressTracker[],
): Milestone[] {
  return milestones.map((m) => {
    if (m.id !== milestoneId) return m;
    const auto = autoLinkedKinds(m);
    if (kind === "task" && auto.tasks && activities) {
      const ids = autoTaskIds(m, activities);
      return ids.length ? { ...m, linkedActivities: ids } : m;
    }
    if (kind === "tracker" && auto.tracker && trackers) {
      const ids = autoTrackerIds(m, trackers);
      return ids.length ? { ...m, linkedTrackers: ids, linkedTrackerId: ids[0] } : m;
    }
    return m;
  });
}

/**
 * The one way to hand-edit a milestone link: links or unlinks the item, first
 * writing down the automatic set when this kind of link was still automatic.
 * Takes the whole schedule so every caller resolves "automatic" the same way.
 */
export function setMilestoneLink(
  schedule: { milestones?: Milestone[]; activities?: Activities; progressTrackers?: ProgressTracker[] },
  milestoneId: string,
  kind: MilestoneLinkKind,
  itemId: string,
  linked: boolean,
): Milestone[] {
  const milestones = schedule.milestones ?? [];
  if (kind === "ritual") return (linked ? linkItem : unlinkItem)(milestones, milestoneId, kind, itemId);
  const base = materializeLinks(milestones, milestoneId, kind, schedule.activities, schedule.progressTrackers);
  const next = (linked ? linkItem : unlinkItem)(base, milestoneId, kind, itemId);
  const key = kind === "task" ? "tasks" : "tracker";
  return next.map((m) => {
    if (m.id !== milestoneId) return m;
    const ids = kind === "task" ? m.linkedActivities : m.linkedTrackers;
    // Unlinking the last one is a choice to count none; linking one again
    // simply takes over, since hand-made links always win.
    const off = !linked && (ids?.length ?? 0) === 0;
    if (off === !!m.autoLinkOff?.[key]) return m;
    return { ...m, autoLinkOff: { ...m.autoLinkOff, [key]: off } };
  });
}
