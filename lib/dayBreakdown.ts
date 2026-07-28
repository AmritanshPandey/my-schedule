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

const DAY_MINUTES = 24 * 60;

/** One block's claim on the day, in minutes-from-midnight of `dateISO`. */
interface Span {
  categoryId: string;
  start: number;
  end: number;
}

/**
 * Minutes each category actually *occupies*, counting every minute of the day
 * at most once.
 *
 * Summing block durations is the obvious implementation and it is wrong: an
 * "Office hours" commitment from 9–6 with real work tasks scheduled inside it
 * counts those hours twice, and a day can report 21h of 24h — or more — while
 * the user is only busy from nine to six. A chart headed "where the day goes"
 * has to answer in wall-clock time or it means nothing.
 *
 * Overlaps resolve to the *shortest* block covering a minute: a one-hour
 * meeting nested inside a nine-hour work block should read as the meeting,
 * which is the more specific claim on that hour.
 */
function occupiedMinutesByCategory(spans: readonly Span[]): Map<string, number> {
  // Longest first, so shorter (more specific) spans paint over them.
  const ordered = [...spans].sort((a, b) => b.end - b.start - (a.end - a.start));
  const owner = new Array<string | null>(DAY_MINUTES).fill(null);
  for (const span of ordered) {
    const from = Math.max(0, span.start);
    const to = Math.min(DAY_MINUTES, span.end);
    for (let m = from; m < to; m++) owner[m] = span.categoryId;
  }

  const minutesById = new Map<string, number>();
  for (const id of owner) {
    if (id === null) continue;
    minutesById.set(id, (minutesById.get(id) ?? 0) + 1);
  }
  return minutesById;
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
  const spans: Span[] = [];

  const push = (task: Task, start: number, end: number) => {
    if (end <= start) return;
    // Always through resolveCategory: a task pointing at a deleted category must
    // still be counted, or the chart quietly stops adding up.
    const categoryId = resolveCategory(categories, task.categoryId, task.icon).id;
    spans.push({ categoryId, start, end });
  };

  // Today's blocks contribute the part that falls before midnight.
  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true)) continue;
    for (const slot of getSlots(resolveOccurrence(task, dateISO))) {
      const interval = slotInterval(slot);
      if (!interval || headMinutes(interval) <= 0) continue;
      push(task, interval.start, Math.min(interval.end, DAY_MINUTES));
    }
  }

  // Yesterday's blocks contribute whatever spilled past midnight into today,
  // rebased so midnight is 0. Re-checking `isTaskScheduledOn` against the
  // previous date matters: an every-other-week overnight task must not leak a
  // tail on its off week.
  const previousISO = addDaysToISO(dateISO, -1);
  for (const task of previousTasks) {
    if (!isTaskScheduledOn(task, previousISO, true)) continue;
    for (const slot of getSlots(resolveOccurrence(task, previousISO))) {
      const interval = slotInterval(slot);
      if (!interval || tailMinutes(interval) <= 0) continue;
      push(task, Math.max(interval.start, DAY_MINUTES) - DAY_MINUTES, interval.end - DAY_MINUTES);
    }
  }

  const minutesById = occupiedMinutesByCategory(spans);
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
