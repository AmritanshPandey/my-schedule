/**
 * "Where the day goes" — a day's scheduled minutes grouped by category.
 *
 * Grouped by category rather than by plan: a plan answers "what am I working
 * toward", which is the wrong question for a chart about where time went. It
 * also removes a duplicate-slice trap — a "Work" plan and a "Work" category
 * would otherwise both appear, splitting the same hours across two wedges.
 *
 * Overnight blocks are split at midnight. Sleep 11 PM → 7 AM contributes 60
 * minutes to the day it starts and 420 to the next, so a day's donut reflects
 * the hours actually lived in that day and can never total more than 24.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import type { Category, Task } from "./useScheduleDB";
import type { AccentColor } from "./colorSystem";
import { getSlots } from "./taskMutations";
import { resolveCategory } from "./categories";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { addDaysToISO } from "./dateUtils";
import { headMinutes, slotInterval, tailMinutes } from "./timeline/overnight";

export interface DaySlice {
  id: string;
  label: string;
  color: AccentColor;
  minutes: number;
  /** Share of the day's scheduled minutes, 0-100, rounded for display. */
  pct: number;
}

export interface DayBreakdown {
  slices: DaySlice[];
  totalMinutes: number;
}

/**
 * Total minutes a task occupies, summed across every slot, midnight crossings
 * included. This is the task's own length — for per-day accounting the
 * breakdown below splits it instead.
 */
export function taskScheduledMinutes(task: Task): number {
  let total = 0;
  for (const slot of getSlots(task)) {
    const interval = slotInterval(slot);
    if (interval) total += interval.end - interval.start;
  }
  return total;
}

export interface DayBreakdownInput {
  dateISO: string;
  /** The weekday bucket for `dateISO`. */
  tasks: readonly Task[];
  /** The weekday bucket for the day before — supplies overnight carry-in. */
  previousTasks: readonly Task[];
  categories: readonly Category[];
}

/**
 * Group a day's scheduled time by category, largest slice first.
 *
 * Takes an options object: two of the four arguments are `Task[]`, and getting
 * them the wrong way round would silently report yesterday's day.
 */
export function buildDayBreakdown({
  dateISO,
  tasks,
  previousTasks,
  categories,
}: DayBreakdownInput): DayBreakdown {
  const minutesById = new Map<string, number>();

  const add = (task: Task, minutes: number) => {
    if (minutes <= 0) return;
    // Always through resolveCategory: a task pointing at a deleted category must
    // still be counted, or the chart quietly stops adding up.
    const id = resolveCategory(categories, task.categoryId, task.icon).id;
    minutesById.set(id, (minutesById.get(id) ?? 0) + minutes);
  };

  // Today's blocks contribute the part that falls before midnight.
  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true)) continue;
    for (const slot of getSlots(resolveOccurrence(task, dateISO))) {
      const interval = slotInterval(slot);
      if (interval) add(task, headMinutes(interval));
    }
  }

  // Yesterday's blocks contribute whatever spilled past midnight into today.
  // Re-checking `isTaskScheduledOn` against the previous date matters: an
  // every-other-week overnight task must not leak a tail on its off week.
  const previousISO = addDaysToISO(dateISO, -1);
  for (const task of previousTasks) {
    if (!isTaskScheduledOn(task, previousISO, true)) continue;
    for (const slot of getSlots(resolveOccurrence(task, previousISO))) {
      const interval = slotInterval(slot);
      if (interval) add(task, tailMinutes(interval));
    }
  }

  const totalMinutes = Array.from(minutesById.values()).reduce((sum, m) => sum + m, 0);
  if (totalMinutes === 0) return { slices: [], totalMinutes: 0 };

  const slices: DaySlice[] = Array.from(minutesById.entries())
    .map(([id, minutes]) => {
      const category = resolveCategory(categories, id);
      return {
        id,
        label: category.name,
        color: category.color,
        minutes,
        pct: Math.round((minutes / totalMinutes) * 100),
      };
    })
    // Biggest first, so the eye lands on where the day actually goes.
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));

  return { slices, totalMinutes };
}

/** "6h 30m" / "45m" — compact, for the centre readout and legend. */
export function formatMinutesCompact(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Cumulative arc offsets for a donut rendered with stroke-dasharray on a
 * circle of the given circumference. Returns one entry per slice, in order.
 *
 * Uses exact minute ratios rather than the rounded `pct`, so the arcs always
 * close the circle even when the displayed percentages sum to 99 or 101.
 */
export function donutSegments(
  slices: readonly DaySlice[],
  totalMinutes: number,
  circumference: number,
): Array<{ id: string; dash: number; offset: number }> {
  if (totalMinutes <= 0) return [];
  let consumed = 0;
  return slices.map((slice) => {
    const dash = (slice.minutes / totalMinutes) * circumference;
    const offset = consumed;
    consumed += dash;
    return { id: slice.id, dash, offset };
  });
}
