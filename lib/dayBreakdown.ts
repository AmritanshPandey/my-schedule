/**
 * "Where the day goes" — today's 24 hours, partitioned.
 *
 * The schedule day is exactly 1440 minutes: [4:00, 28:00), i.e. 4 AM to 4 AM.
 * Every one of those minutes lands in exactly one bucket — sleep, rest, active,
 * or unscheduled — so the donut tiles a real day and the numbers can't lie.
 *
 * This module used to *sum* per-category durations, which double-counted every
 * overlap and reported totals like "25h 30m" on a 24-hour day. It also charged
 * scheduled sleep against a waking window that had already subtracted the
 * user's sleep need, penalising sleep twice. Both are fixed by measuring the
 * union of intervals rather than the sum, and by giving sleep its own bucket
 * outside the active budget.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import type { CategoryKind, Task, TaskCategory } from "./useScheduleDB";
import { getSlots } from "./taskMutations";
import { isTrackedTask } from "./taskCompletion";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";
import { DEFAULT_TIMELINE_START_MINUTES, TIMELINE_END_MINUTES } from "./timeline/displayWindow";
import { getWakingWindowMinutes } from "./timeline/sleepWindow";
import { ownedMinutesByOwner, summedMinutes, type OwnedInterval } from "./timeline/intervals";

// Re-exported for back-compat with existing importers of this constant.
export { DEFAULT_WAKING_START_MINUTES } from "./timeline/sleepWindow";

/** Bucket id used for commitments, which belong to no plan. */
export const HELD_TIME_ID = "__held__";

/** Slice id for the part of the day nothing is booked into. */
export const UNSCHEDULED_ID = "__unscheduled__";

/** The schedule day, in minutes. 4:00 → 28:00 is 24 hours exactly. */
export const SCHEDULE_DAY_MINUTES = TIMELINE_END_MINUTES - DEFAULT_TIMELINE_START_MINUTES;

export interface DaySlice {
  id: string;
  label: string;
  /** Accent colour token, or null for held time / unscheduled (rendered neutral). */
  color: string | null;
  minutes: number;
  /** Share of the whole 24-hour day, 0-100, rounded for display. */
  pct: number;
  /** Which budget this slice belongs to. Unscheduled time is its own thing. */
  kind: CategoryKind | "unscheduled";
}

export interface DayBreakdown {
  /**
   * Every category with time on this day, largest first, followed by the
   * unscheduled remainder. Minutes are disjoint, so they sum to exactly
   * `totalMinutes`.
   */
  slices: DaySlice[];
  /** Always SCHEDULE_DAY_MINUTES (1440) — the ring is the whole day. */
  totalMinutes: number;
  /** Wall-clock minutes with something booked in them: sleep + rest + active. */
  committedMinutes: number;
  sleepMinutes: number;
  restMinutes: number;
  activeMinutes: number;
  unscheduledMinutes: number;
  /**
   * Booked minutes beyond the wall clock — the sum of every block's duration
   * minus the union. Non-zero means blocks overlap, which union math would
   * otherwise absorb without trace.
   */
  overlapMinutes: number;
  /** Was any of `sleepMinutes` actually scheduled, or is it the implied fallback? */
  sleepIsScheduled: boolean;
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
 * This day's slice of a task's blocks, in schedule-day minutes.
 *
 * `window: "sameDay"` takes the part inside [4:00, 28:00); `"overflow"` takes
 * the tail past 28:00 and rebases it onto the *next* day's coordinates, which
 * is where the timeline draws it as a continuation. Same split as
 * `taskDayMinutes`, but keeping the intervals so they can be unioned.
 */
function taskIntervals(task: Task, window: "sameDay" | "overflow"): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const slot of getSlots(task)) {
    const rawStart = parseTimeToMinutes(slot.startTime);
    const rawEnd = parseTimeToMinutes(slot.endTime);
    if (rawStart === null || rawEnd === null) continue;
    const start = toScheduleDayMinutes(rawStart);
    let end = toScheduleDayMinutes(rawEnd);
    if (end <= start) end += 24 * 60; // runs past midnight

    if (window === "sameDay") {
      const clipped = Math.min(end, TIMELINE_END_MINUTES);
      if (clipped > start) out.push({ start, end: clipped });
    } else {
      // The tail lands at the top of the following day, which begins at 4:00 —
      // so 29:00 on this day is 5:00 on the next, i.e. minus 24h.
      if (end > TIMELINE_END_MINUTES) {
        out.push({ start: DEFAULT_TIMELINE_START_MINUTES, end: end - 24 * 60 });
      }
    }
  }
  return out;
}

/**
 * Partition a day's 24 hours by category.
 *
 * Commitments are categorised like anything else when the user gives them one —
 * "Commute" earns its own wedge rather than vanishing into an anonymous grey
 * blob. Only *uncategorised* commitments pool into the neutral "Held time"
 * slice, which is the fallback rather than the rule. Tasks with no category, or
 * one that has been deleted, are skipped rather than shown as an "Unknown"
 * wedge: a dangling id is a data artefact, not something the user would
 * recognise. Their minutes fall through to unscheduled, which is honest — the
 * app can't say where that time went either.
 *
 * Where blocks overlap, `ownedMinutesByOwner` hands each contested minute to a
 * single category (earliest start wins), so the wedges stay disjoint and the
 * difference against the naive sum surfaces as `overlapMinutes`.
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
  const owned: OwnedInterval<string>[] = [];

  function collect(task: Task, window: "sameDay" | "overflow"): void {
    const categorised = task.categoryId && categoriesById.has(task.categoryId);
    if (!categorised && isTrackedTask(task)) return;
    const key = categorised ? task.categoryId! : HELD_TIME_ID;
    for (const interval of taskIntervals(task, window)) {
      owned.push({ ...interval, owner: key });
    }
  }

  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true)) continue;
    collect(resolveOccurrence(task, dateISO), "sameDay");
  }

  // Gated on the *previous* date so a skipped or retimed occurrence carries in
  // exactly what it actually ran, not what the template says.
  if (carryIn) {
    for (const task of carryIn.tasks) {
      if (!isTaskScheduledOn(task, carryIn.dateISO, true)) continue;
      collect(resolveOccurrence(task, carryIn.dateISO), "overflow");
    }
  }

  const minutesById = ownedMinutesByOwner(owned, (a, b) => a.localeCompare(b));
  const committedMinutes = Array.from(minutesById.values()).reduce((sum, m) => sum + m, 0);
  const overlapMinutes = Math.max(0, summedMinutes(owned) - committedMinutes);

  function kindOf(id: string): CategoryKind {
    return id === HELD_TIME_ID ? "active" : categoriesById.get(id)?.kind ?? "active";
  }

  let sleepMinutes = 0;
  let restMinutes = 0;
  let activeMinutes = 0;
  for (const [id, minutes] of minutesById) {
    const kind = kindOf(id);
    if (kind === "sleep") sleepMinutes += minutes;
    else if (kind === "rest") restMinutes += minutes;
    else activeMinutes += minutes;
  }

  const sleepIsScheduled = sleepMinutes > 0;
  const unscheduledMinutes = Math.max(0, SCHEDULE_DAY_MINUTES - committedMinutes);

  const categorySlices: DaySlice[] = Array.from(minutesById.entries())
    .filter(([, minutes]) => minutes > 0)
    .map(([id, minutes]) => ({
      id,
      label: id === HELD_TIME_ID ? "Held time" : categoriesById.get(id)?.title ?? "",
      color: id === HELD_TIME_ID ? null : categoriesById.get(id)?.color ?? null,
      minutes,
      pct: Math.round((minutes / SCHEDULE_DAY_MINUTES) * 100),
      kind: kindOf(id),
    }))
    // Biggest first, so the eye lands on where the day actually goes. Held time
    // sorts with everything else — if commute is the largest block, that is
    // exactly the thing worth seeing.
    .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label));

  // Pinned last rather than sorted by size: on a light day it would otherwise
  // top the legend, and "you have 19 hours free" is not the headline.
  const slices =
    unscheduledMinutes > 0
      ? [
          ...categorySlices,
          {
            id: UNSCHEDULED_ID,
            label: "Unscheduled",
            color: null,
            minutes: unscheduledMinutes,
            pct: Math.round((unscheduledMinutes / SCHEDULE_DAY_MINUTES) * 100),
            kind: "unscheduled" as const,
          },
        ]
      : categorySlices;

  return {
    slices,
    totalMinutes: SCHEDULE_DAY_MINUTES,
    committedMinutes,
    sleepMinutes,
    restMinutes,
    activeMinutes,
    unscheduledMinutes,
    overlapMinutes,
    sleepIsScheduled,
  };
}

export interface ActiveHours {
  /** Waking minutes in the day: 24h minus sleep (scheduled, or the target). */
  wakingMinutes: number;
  /** Active (non-rest, non-sleep) minutes booked. */
  activeMinutes: number;
  /** Deliberate recovery — scheduled `kind: "rest"` time. */
  restMinutes: number;
  /** Waking minutes with nothing in them. */
  freeMinutes: number;
  /** Sleep the day actually holds: the scheduled blocks, or the target. */
  sleepMinutes: number;
  /** The `sleepHours` setting, in minutes. */
  sleepTargetMinutes: number;
  /**
   * How far the day falls short of the sleep target.
   *
   * With sleep scheduled, this compares the blocks against the target. With
   * none scheduled, it asks whether enough of the day is even *left* for it —
   * which is the real failure mode. Booking 20 of 24 hours doesn't overrun a
   * "17-hour day"; it leaves 4 hours to sleep in.
   */
  sleepShortfallMinutes: number;
  /** Sleep beyond the target. Mutually exclusive with the shortfall. */
  sleepSurplusMinutes: number;
  /** 0–100 shares of the waking window, for the bar. Together they never exceed 100. */
  activePct: number;
  restPct: number;
}

/**
 * The waking day: what's left after sleep, and how it was spent.
 *
 * Sleep is deliberately outside this budget in both directions. It is not
 * charged against the waking window (it defines it), and the window is not
 * shortened a second time by the `sleepHours` setting when real sleep blocks
 * exist. Doing both is what produced "25h 30m / 17h": 7h 45m of sleep counted
 * against a window that had already had 7h taken out for it.
 *
 * Because the four buckets partition 24 hours by construction, `active + rest`
 * can never exceed `waking` — the old "overbooked" state is unreachable. What
 * replaces it is the sleep shortfall, which names the actual problem.
 */
export function buildActiveHours(breakdown: DayBreakdown, sleepHours?: number): ActiveHours {
  const sleepTargetMinutes = 24 * 60 - getWakingWindowMinutes(sleepHours);
  const { sleepMinutes: scheduledSleep, restMinutes, activeMinutes, sleepIsScheduled } = breakdown;

  // No sleep on the calendar: reserve the target out of what's still open, so
  // a packed day reports how much of its sleep it has eaten.
  const sleepMinutes = sleepIsScheduled
    ? scheduledSleep
    : Math.min(sleepTargetMinutes, breakdown.unscheduledMinutes);

  const wakingMinutes = Math.max(1, SCHEDULE_DAY_MINUTES - sleepMinutes);
  const freeMinutes = Math.max(0, wakingMinutes - activeMinutes - restMinutes);

  const sleepDelta = sleepMinutes - sleepTargetMinutes;
  const activePct = Math.min(100, (activeMinutes / wakingMinutes) * 100);

  return {
    wakingMinutes,
    activeMinutes,
    restMinutes,
    freeMinutes,
    sleepMinutes,
    sleepTargetMinutes,
    sleepShortfallMinutes: Math.max(0, -sleepDelta),
    sleepSurplusMinutes: Math.max(0, sleepDelta),
    activePct,
    // Clamped against what active already took, so the two fills can never
    // total more than the track even if a rounding edge would push them over.
    restPct: Math.min(100 - activePct, (restMinutes / wakingMinutes) * 100),
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
