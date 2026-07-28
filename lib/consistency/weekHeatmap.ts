/**
 * "When do I actually execute" — the current week as an hour × weekday grid.
 *
 * Each cell answers one question: of the time you blocked in that hour on that
 * day, how much did you actually do? That is a *rate*, not a volume — PlanR has
 * no time tracking, so a cell can only compare what was scheduled against what
 * was completed.
 *
 * ## Why completion is attributed to the scheduled hour
 *
 * `TaskCompletionEvent.completedAt` carries a full timestamp, but its
 * time-of-day is unusable for an hour axis: back-dated completions are
 * hard-stamped at local noon (`taskCompletion.ts` → `datedEvent`), and even a
 * live tick records when the box was *checked*, not when the work happened —
 * a 6 AM workout ticked at 9 PM would land in the 21:00 row. So a completion is
 * credited to the hour the task was *scheduled* in, and the event is only ever
 * used as a yes/no for that date. Every other consumer in the app already
 * discards the time this way via `localISODate`.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import type { DayKey, Task } from "../useScheduleDB";
import { getSlots } from "../taskMutations";
import { isTrackedTask, completionForDate } from "../taskCompletion";
import { isTaskScheduledOn, resolveOccurrence } from "../taskOccurrence";
import { addDaysToISO, localISODate } from "../dateUtils";
import { slotInterval } from "../timeline/overnight";
import { DAY_SHORT, getMondayOfWeek, ORDERED_DAYS } from "./calculateDailyStats";

const DAY_MINUTES = 24 * 60;
const HOURS_PER_DAY = 24;

export type HeatCellState = "empty" | "upcoming" | "missed" | "partial" | "done";

export interface HeatCell {
  dateISO: string;
  dayKey: DayKey;
  /** Real clock hour, 0-23. */
  hour: number;
  scheduledMinutes: number;
  completedMinutes: number;
  state: HeatCellState;
}

export interface HeatDay {
  dayKey: DayKey;
  dateISO: string;
  label: string;
  isToday: boolean;
}

export interface WeekHeatmap {
  days: HeatDay[];
  /** Only the hours something is scheduled in, so the grid isn't 24 empty rows. */
  hours: number[];
  cells: HeatCell[];
  /** Every scheduled minute this week, elapsed or not — the "~120h" figure. */
  totalScheduledMinutes: number;
  /**
   * Scheduled minutes in hours that have already passed. This is `avgRate`'s
   * denominator: scoring hours that haven't happened yet would make every rate
   * fall through the week and recover each Monday.
   */
  scheduledMinutes: number;
  completedMinutes: number;
  /** completed ÷ scheduled over elapsed hours only, 0-100. */
  avgRate: number;
}

/** One task-slot's claim on a day, in minutes from that day's midnight. */
interface Span {
  start: number;
  end: number;
  completed: boolean;
}

/**
 * Minutes scheduled and completed in each hour of one day.
 *
 * Paints a 1440-entry minute array, longest span first so a shorter, more
 * specific block overwrites a wider one — the same overlap rule
 * `occupiedMinutesByCategory` uses, so an hour inside a nested block is never
 * counted twice.
 */
function hourTotals(spans: readonly Span[]): { scheduled: number[]; completed: number[] } {
  const owner = new Array<Span | null>(DAY_MINUTES).fill(null);
  const ordered = [...spans].sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const span of ordered) {
    const from = Math.max(0, span.start);
    const to = Math.min(DAY_MINUTES, span.end);
    for (let m = from; m < to; m++) owner[m] = span;
  }

  const scheduled = new Array<number>(HOURS_PER_DAY).fill(0);
  const completed = new Array<number>(HOURS_PER_DAY).fill(0);
  for (let m = 0; m < DAY_MINUTES; m++) {
    const span = owner[m];
    if (!span) continue;
    const hour = Math.floor(m / 60);
    scheduled[hour] += 1;
    if (span.completed) completed[hour] += 1;
  }
  return { scheduled, completed };
}

/** Whether this task counted as done on this date. Date-level, never hour-level. */
function slotDoneOn(task: Task, dateISO: string, slotIndex: number, isToday: boolean): boolean {
  const totalSlots = getSlots(task).length;
  if (isToday) {
    // The live flags describe today's occurrence only.
    if (task.completed) return true;
    return (task.completedSlotIndices ?? []).includes(slotIndex);
  }
  const state = completionForDate(task, dateISO);
  if (state.completed) return true;
  return totalSlots > 1 && state.completedSlotIndices.includes(slotIndex);
}

/**
 * Every span a date carries: the part of each of its own blocks that falls
 * before midnight, plus the tail of the previous day's overnight blocks.
 */
function spansForDate(
  activities: Partial<Record<DayKey, readonly Task[]>>,
  dateISO: string,
  todayISO: string,
): Span[] {
  const spans: Span[] = [];

  const collect = (sourceDateISO: string, rebase: boolean) => {
    const dayKey = ORDERED_DAYS[(new Date(sourceDateISO + "T00:00:00").getDay() + 6) % 7];
    const isToday = sourceDateISO === todayISO;
    for (const task of activities[dayKey] ?? []) {
      if (!isTrackedTask(task)) continue;
      if (!isTaskScheduledOn(task, sourceDateISO, true)) continue;
      const occurrence = resolveOccurrence(task, sourceDateISO);
      getSlots(occurrence).forEach((slot, slotIndex) => {
        const interval = slotInterval(slot);
        if (!interval) return;
        const completed = slotDoneOn(task, sourceDateISO, slotIndex, isToday);
        if (rebase) {
          // Yesterday's spill-over, rebased so midnight is 0.
          if (interval.end <= DAY_MINUTES) return;
          spans.push({
            start: Math.max(interval.start, DAY_MINUTES) - DAY_MINUTES,
            end: interval.end - DAY_MINUTES,
            completed,
          });
        } else {
          // `slotInterval` runs start through the 4 AM schedule-day boundary, so
          // a 1 AM block arrives as [1500, 1560). Clamping at DAY_MINUTES drops
          // it here and `rebase` picks it up on the following day, which is the
          // calendar day it actually belongs to.
          if (interval.start >= DAY_MINUTES) return;
          spans.push({
            start: interval.start,
            end: Math.min(interval.end, DAY_MINUTES),
            completed,
          });
        }
      });
    }
  };

  collect(dateISO, false);
  collect(addDaysToISO(dateISO, -1), true);
  return spans;
}

export function buildWeekHeatmap({
  activities,
  todayISO,
  nowMinutes,
}: {
  activities: Partial<Record<DayKey, readonly Task[]>>;
  todayISO: string;
  /** Minutes since midnight, used to decide which of today's hours have elapsed. */
  nowMinutes: number;
}): WeekHeatmap {
  const monday = getMondayOfWeek(new Date(todayISO + "T00:00:00"));

  const days: HeatDay[] = ORDERED_DAYS.map((dayKey, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateISO = localISODate(date);
    return { dayKey, dateISO, label: DAY_SHORT[dayKey], isToday: dateISO === todayISO };
  });

  const cells: HeatCell[] = [];
  const usedHours = new Set<number>();
  let totalScheduled = 0;
  let scheduledTotal = 0;
  let completedTotal = 0;

  for (const day of days) {
    const { scheduled, completed } = hourTotals(spansForDate(activities, day.dateISO, todayISO));

    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      const scheduledMinutes = scheduled[hour];
      if (scheduledMinutes === 0) continue;
      usedHours.add(hour);
      totalScheduled += scheduledMinutes;

      // An hour counts as elapsed only once it has fully passed, so work in
      // progress right now is never reported as missed.
      const hourEnded =
        day.dateISO < todayISO || (day.dateISO === todayISO && (hour + 1) * 60 <= nowMinutes);

      const completedMinutes = hourEnded ? completed[hour] : 0;
      const state: HeatCellState = !hourEnded
        ? "upcoming"
        : completedMinutes >= scheduledMinutes
          ? "done"
          : completedMinutes > 0
            ? "partial"
            : "missed";

      if (hourEnded) {
        scheduledTotal += scheduledMinutes;
        completedTotal += completedMinutes;
      }

      cells.push({
        dateISO: day.dateISO,
        dayKey: day.dayKey,
        hour,
        scheduledMinutes,
        completedMinutes,
        state,
      });
    }
  }

  return {
    days,
    hours: Array.from(usedHours).sort((a, b) => a - b),
    cells,
    totalScheduledMinutes: totalScheduled,
    scheduledMinutes: scheduledTotal,
    completedMinutes: completedTotal,
    avgRate: scheduledTotal > 0 ? Math.round((completedTotal / scheduledTotal) * 100) : 0,
  };
}

/**
 * This week's completed ÷ scheduled minutes for one plan — the figure the
 * ranked list's ring shows, so the ring and the grid measure the same thing.
 *
 * Deliberately not `calculateConsistency` (`lib/planInsights.ts`), which reports
 * "share of days you touched this plan at all" over a rolling 30 days: a
 * different unit over a different period, which would disagree with the grid
 * directly above it with no way for the reader to tell why.
 */
export function planWeekRate(
  activities: Partial<Record<DayKey, readonly Task[]>>,
  planId: string,
  todayISO: string,
  nowMinutes: number,
): { scheduledMinutes: number; completedMinutes: number; rate: number } {
  const filtered: Partial<Record<DayKey, Task[]>> = {};
  for (const dayKey of ORDERED_DAYS) {
    filtered[dayKey] = (activities[dayKey] ?? []).filter((t) => t.planId === planId);
  }
  const week = buildWeekHeatmap({ activities: filtered, todayISO, nowMinutes });
  return {
    // The list shows the whole week's commitment; the ring scores only what has
    // already happened.
    scheduledMinutes: week.totalScheduledMinutes,
    completedMinutes: week.completedMinutes,
    rate: week.avgRate,
  };
}
