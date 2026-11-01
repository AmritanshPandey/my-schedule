/**
 * "Your day" — how today's waking hours are spent, for the phone Overview.
 *
 * The desktop donut (dayBreakdown.ts) partitions all 24 hours by category and
 * skips anything uncategorised. On a phone, most people never categorise, so
 * that view would read as one empty ring. This one groups by category when a
 * task has one, then by the task's plan, then "Other", and keeps each block's
 * position so the card can show *when* the time goes, not just how much.
 *
 * Minutes are owned, not summed (ownedMinutesByOwner): an overlap counts once,
 * so the groups plus free time add up to the waking window exactly. Sleep
 * categories are left out; the window already excludes the night.
 */

import type { DayKey, Plan, Schedule, Task, TaskCategory } from "./scheduleTypes";
import type { AccentColor } from "./colorSystem";
import { taskIntervals } from "./dayBreakdown";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { resolveWakingWindow } from "./timeline/sleepWindow";
import { mergeIntervals, ownedMinutesByOwner, type OwnedInterval } from "./timeline/intervals";

/** Owner id for a task with neither a category nor a plan. */
export const OTHER_SPREAD_ID = "__other__";

export interface DaySpreadGroup {
  id: string;
  label: string;
  /** Accent token for the dot and blocks; null renders neutral. */
  color: AccentColor | string | null;
  minutes: number;
}

export interface DaySpreadBlock {
  /** Schedule-day minutes, clipped to the window. */
  start: number;
  end: number;
  groupId: string;
}

export interface DaySpread {
  /** The waking window in schedule-day minutes (may run past 1440, i.e. midnight). */
  windowStart: number;
  windowEnd: number;
  /** Same-group blocks merged, in time order. */
  blocks: DaySpreadBlock[];
  /** Largest first. */
  groups: DaySpreadGroup[];
  /** Waking minutes with something booked (an overlap counts once). */
  plannedMinutes: number;
  freeMinutes: number;
}

function ownerOf(
  task: Task,
  categoriesById: ReadonlyMap<string, TaskCategory>,
  plansById: ReadonlyMap<string, Plan>,
): { id: string; label: string; color: string | null } | "skip" {
  const category = task.categoryId ? categoriesById.get(task.categoryId) : undefined;
  if (category) {
    if (category.kind === "sleep") return "skip";
    return { id: `cat:${category.id}`, label: category.title, color: category.color ?? null };
  }
  const plan = task.planId ? plansById.get(task.planId) : undefined;
  if (plan) return { id: `plan:${plan.id}`, label: plan.title, color: plan.color ?? null };
  return { id: OTHER_SPREAD_ID, label: "Other", color: null };
}

export function buildDaySpread(
  schedule: Pick<Schedule, "activities" | "categories" | "plans" | "preferences">,
  dayKey: DayKey,
  dateISO: string,
): DaySpread {
  const { startMinutes: windowStart, endMinutes: windowEnd } = resolveWakingWindow(
    schedule.preferences?.dayStartTime,
    schedule.preferences?.sleepHours,
  );
  const categoriesById = new Map((schedule.categories ?? []).map((c) => [c.id, c]));
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const trackingStart = schedule.preferences?.startDate;

  const groups = new Map<string, DaySpreadGroup>();
  const owned: OwnedInterval<string>[] = [];

  for (const template of schedule.activities[dayKey] ?? []) {
    if (!isTaskScheduledOn(template, dateISO, true, trackingStart)) continue;
    const task = resolveOccurrence(template, dateISO);
    const owner = ownerOf(task, categoriesById, plansById);
    if (owner === "skip") continue;
    for (const { start, end } of taskIntervals(task, "sameDay", windowStart)) {
      const s = Math.max(start, windowStart);
      const e = Math.min(end, windowEnd);
      if (e <= s) continue;
      owned.push({ start: s, end: e, owner: owner.id });
      if (!groups.has(owner.id)) groups.set(owner.id, { id: owner.id, label: owner.label, color: owner.color, minutes: 0 });
    }
  }

  for (const [id, minutes] of ownedMinutesByOwner(owned, (a, b) => a.localeCompare(b))) {
    groups.get(id)!.minutes = minutes;
  }

  const blocks: DaySpreadBlock[] = [];
  for (const id of groups.keys()) {
    for (const merged of mergeIntervals(owned.filter((o) => o.owner === id))) {
      blocks.push({ start: merged.start, end: merged.end, groupId: id });
    }
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);

  const sorted = Array.from(groups.values())
    .filter((g) => g.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));
  const plannedMinutes = sorted.reduce((sum, g) => sum + g.minutes, 0);

  return {
    windowStart,
    windowEnd,
    blocks,
    groups: sorted,
    plannedMinutes,
    freeMinutes: Math.max(0, windowEnd - windowStart - plannedMinutes),
  };
}
