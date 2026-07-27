/**
 * "Where the day goes" — today's scheduled minutes grouped by plan.
 *
 * Pure and dependency-light so it can be unit-tested directly. The dashboard
 * renders the result as a donut; this module owns all the arithmetic.
 */

import type { DayKey, Plan, Task } from "./useScheduleDB";
import { getSlots } from "./taskMutations";
import { isTrackedTask } from "./taskCompletion";
import { isTaskScheduledOn } from "./taskOccurrence";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";

/** Bucket id used for commitments, which belong to no plan. */
export const HELD_TIME_ID = "__held__";

export interface DaySlice {
  id: string;
  label: string;
  /** Accent colour token, or null for held time (rendered neutral). */
  color: string | null;
  minutes: number;
  /** Share of the day's scheduled minutes, 0-100, rounded for display. */
  pct: number;
}

export interface DayBreakdown {
  slices: DaySlice[];
  totalMinutes: number;
}

/** Minutes a task occupies on the day, summed across every slot. */
export function taskScheduledMinutes(task: Task): number {
  let total = 0;
  for (const slot of getSlots(task)) {
    const rawStart = parseTimeToMinutes(slot.startTime);
    const rawEnd = parseTimeToMinutes(slot.endTime);
    if (rawStart === null || rawEnd === null) continue;
    const start = toScheduleDayMinutes(rawStart);
    let end = toScheduleDayMinutes(rawEnd);
    if (end <= start) end += 24 * 60; // runs past midnight
    total += end - start;
  }
  return total;
}

/**
 * Group a day's scheduled time by plan, largest first, with commitments
 * collected into a single neutral "Held time" slice.
 *
 * Tasks whose plan no longer exists are skipped rather than shown as an
 * "Unknown" wedge — a dangling planId is a data artefact, not a category the
 * user would recognise.
 */
export function buildDayBreakdown(
  tasks: readonly Task[],
  plans: readonly Plan[],
  dateISO: string,
): DayBreakdown {
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const minutesById = new Map<string, number>();

  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true)) continue;
    const minutes = taskScheduledMinutes(task);
    if (minutes <= 0) continue;

    const key = isTrackedTask(task) ? task.planId : HELD_TIME_ID;
    if (key !== HELD_TIME_ID && !plansById.has(key)) continue;
    minutesById.set(key, (minutesById.get(key) ?? 0) + minutes);
  }

  const totalMinutes = Array.from(minutesById.values()).reduce((sum, m) => sum + m, 0);
  if (totalMinutes === 0) return { slices: [], totalMinutes: 0 };

  const slices: DaySlice[] = Array.from(minutesById.entries())
    .map(([id, minutes]) => ({
      id,
      label: id === HELD_TIME_ID ? "Held time" : plansById.get(id)?.title ?? "",
      color: id === HELD_TIME_ID ? null : plansById.get(id)?.color ?? null,
      minutes,
      pct: Math.round((minutes / totalMinutes) * 100),
    }))
    // Biggest first, so the eye lands on where the day actually goes. Held time
    // sorts with everything else — if commute is the largest block, that is
    // exactly the thing worth seeing.
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
