/**
 * "Where the day goes" — today's scheduled minutes grouped by category.
 *
 * Pure and dependency-light so it can be unit-tested directly. The dashboard
 * renders the result as a donut; this module owns all the arithmetic.
 */

import type { Task, TaskCategory } from "./useScheduleDB";
import { getSlots } from "./taskMutations";
import { isTrackedTask } from "./taskCompletion";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";
import { TIMELINE_END_MINUTES } from "./timeline/displayWindow";
import { resolveWakingWindow } from "./timeline/sleepWindow";

// Re-exported for back-compat with existing importers of this constant.
export { DEFAULT_WAKING_START_MINUTES } from "./timeline/sleepWindow";

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

export interface TaskDayMinutes {
  /** Minutes landing inside this schedule day's 4:00 → 28:00 window. */
  sameDay: number;
  /**
   * Minutes past 28:00. They belong to the *next* schedule day, which is where
   * the timeline draws them as a continuation block — so this is where the
   * donut counts them too, and the two finally agree.
   */
  overflow: number;
}

/** Minutes a task occupies, split at the day boundary, summed across slots. */
export function taskDayMinutes(task: Task): TaskDayMinutes {
  let sameDay = 0;
  let overflow = 0;
  for (const slot of getSlots(task)) {
    const rawStart = parseTimeToMinutes(slot.startTime);
    const rawEnd = parseTimeToMinutes(slot.endTime);
    if (rawStart === null || rawEnd === null) continue;
    const start = toScheduleDayMinutes(rawStart);
    let end = toScheduleDayMinutes(rawEnd);
    if (end <= start) end += 24 * 60; // runs past midnight
    sameDay += Math.min(end, TIMELINE_END_MINUTES) - start;
    overflow += Math.max(0, end - TIMELINE_END_MINUTES);
  }
  return { sameDay, overflow };
}

/**
 * The task's whole duration, both sides of the boundary. Kept for callers that
 * want "how long is this task" rather than "how much of it lands on this day".
 */
export function taskScheduledMinutes(task: Task): number {
  const { sameDay, overflow } = taskDayMinutes(task);
  return sameDay + overflow;
}

/**
 * Group a day's scheduled time by category, largest first.
 *
 * Commitments are categorised like anything else when the user gives them one —
 * "Commute" earns its own wedge rather than vanishing into an anonymous grey
 * blob. Only *uncategorised* commitments pool into the neutral "Held time"
 * slice, which is the fallback rather than the rule.
 *
 * Grouping by category rather than by plan is what makes the wedge colours
 * match the blocks on the timeline — both now resolve through the same
 * category. Tasks with no category, or one that has been deleted, are skipped
 * rather than shown as an "Unknown" wedge: a dangling id is a data artefact,
 * not something the user would recognise.
 */
export function buildDayBreakdown(
  tasks: readonly Task[],
  categories: readonly TaskCategory[],
  dateISO: string,
  /**
   * The previous schedule day. Its overnight tails land on *this* day, so they
   * are counted here rather than there — matching where the timeline draws them.
   */
  carryIn?: { tasks: readonly Task[]; dateISO: string },
): DayBreakdown {
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const minutesById = new Map<string, number>();

  // A categorised task — commitment or not — gets its own wedge. An
  // uncategorised commitment pools into "Held time"; an uncategorised or
  // dangling tracked task is skipped, since a missing id is a data artefact
  // rather than a category the user would recognise.
  function add(task: Task, minutes: number): void {
    if (minutes <= 0) return;
    const categorised = task.categoryId && categoriesById.has(task.categoryId);
    if (!categorised && isTrackedTask(task)) return;
    const key = categorised ? task.categoryId! : HELD_TIME_ID;
    minutesById.set(key, (minutesById.get(key) ?? 0) + minutes);
  }

  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true)) continue;
    add(task, taskDayMinutes(resolveOccurrence(task, dateISO)).sameDay);
  }

  // Gated on the *previous* date so a skipped or retimed occurrence carries in
  // exactly what it actually ran, not what the template says.
  if (carryIn) {
    for (const task of carryIn.tasks) {
      if (!isTaskScheduledOn(task, carryIn.dateISO, true)) continue;
      add(task, taskDayMinutes(resolveOccurrence(task, carryIn.dateISO)).overflow);
    }
  }

  const totalMinutes = Array.from(minutesById.values()).reduce((sum, m) => sum + m, 0);
  if (totalMinutes === 0) return { slices: [], totalMinutes: 0 };

  const slices: DaySlice[] = Array.from(minutesById.entries())
    .map(([id, minutes]) => ({
      id,
      label: id === HELD_TIME_ID ? "Held time" : categoriesById.get(id)?.title ?? "",
      color: id === HELD_TIME_ID ? null : categoriesById.get(id)?.color ?? null,
      minutes,
      pct: Math.round((minutes / totalMinutes) * 100),
    }))
    // Biggest first, so the eye lands on where the day actually goes. Held time
    // sorts with everything else — if commute is the largest block, that is
    // exactly the thing worth seeing.
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));

  return { slices, totalMinutes };
}

export interface ActiveHours {
  startMinutes: number;
  endMinutes: number;
  wakingMinutes: number;
  scheduledMinutes: number;
  freeMinutes: number;
  /** Minutes booked beyond the waking window; 0 unless overbooked. */
  overbookedMinutes: number;
  /** 0–100, already clamped — the fill can never leave its track. */
  pct: number;
}

/**
 * Scheduled time against the waking day, so free time becomes visible.
 *
 * A standalone function rather than a field on `DayBreakdown`: making it part of
 * the breakdown would thread a preference through `buildDayBreakdown` purely to
 * compute a derived scalar, couple category grouping to user settings, and have
 * to survive that function's `totalMinutes === 0` early return. Keeping it apart
 * also keeps free time *out* of `slices`, so the donut still tiles a full circle.
 *
 * The waking window itself (start + length) comes from
 * lib/timeline/sleepWindow.ts's `resolveWakingWindow`, shared with
 * lib/availableSlots.ts's gap-finder so both respect the same configured
 * sleep need instead of each assuming their own.
 */
export function buildActiveHours(scheduledMinutes: number, dayStartTime?: string, sleepHours?: number): ActiveHours {
  const { startMinutes, endMinutes, wakingMinutes } = resolveWakingWindow(dayStartTime, sleepHours);
  const scheduled = Math.max(0, scheduledMinutes);
  return {
    startMinutes,
    endMinutes,
    wakingMinutes,
    scheduledMinutes: scheduled,
    freeMinutes: Math.max(0, wakingMinutes - scheduled),
    overbookedMinutes: Math.max(0, scheduled - wakingMinutes),
    pct: Math.min(100, (scheduled / wakingMinutes) * 100),
  };
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
