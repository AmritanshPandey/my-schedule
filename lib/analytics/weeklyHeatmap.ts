/**
 * Weekly heatmap — scheduled minutes by weekday × time-of-day band.
 *
 * Pure and dependency-light so it can be unit-tested directly. The dashboard
 * renders the result as a 7×6 grid; this module owns all the arithmetic.
 *
 * "When does the week get busy?" — the companion question to the donut's "where
 * does the day go?". Rows are 4-hour clock bands (12 AM … 8 PM), columns are the
 * seven weekdays. Intensity is scheduled time, read from the same weekday
 * template the donut and timeline use, so a populated schedule always fills in.
 */

import type { Schedule } from "../useScheduleDB";
import { DAYS, type DayKey } from "../scheduleConstants";
import { addDaysToISO } from "../dateUtils";
import { getSlots } from "../taskMutations";
import { isTaskScheduledOn, resolveOccurrence } from "../taskOccurrence";
import { parseTimeToMinutes } from "../timeUtils";

/** Number of rows: six 4-hour clock bands covering a 24h day. */
export const BAND_COUNT = 6;
const BAND_MINUTES = (24 * 60) / BAND_COUNT; // 240

/** Row labels, top → bottom, matching the reference (12 AM … 8 PM). */
export const BAND_LABELS = ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"] as const;

export interface WeeklyHeatmap {
  /** grid[weekdayIndex][bandIndex] = scheduled minutes. 7 rows of 6. */
  grid: number[][];
  /** The busiest single cell's minutes — the normalisation ceiling. */
  maxMinutes: number;
  /** Sum across every cell — 0 means "nothing scheduled", drives the empty state. */
  totalMinutes: number;
  /** Column (weekday) totals, for a future summary; cheap to compute here. */
  columnTotals: number[];
}

/** The ISO date of `day` within the same Mon–Sun week as `todayISO`. */
function isoForWeekday(todayISO: string, todayKey: DayKey, day: DayKey): string {
  return addDaysToISO(todayISO, DAYS.indexOf(day) - DAYS.indexOf(todayKey));
}

/**
 * Add a slot's minutes into the day's band buckets, splitting at every 4-hour
 * clock boundary and wrapping past midnight — so a 10 PM→1 AM block lands partly
 * in the "8 PM" band and partly in "12 AM", exactly where the clock puts it.
 *
 * Minutes are attributed to the weekday the task is scheduled on; an overnight
 * tail stays on its start day rather than bleeding into the next column, which
 * keeps each block accounted for once.
 */
function addSlotToBands(bands: number[], startTime: string, endTime: string): void {
  const rawStart = parseTimeToMinutes(startTime);
  const rawEnd = parseTimeToMinutes(endTime);
  if (rawStart === null || rawEnd === null) return;
  let end = rawEnd;
  if (end <= rawStart) end += 24 * 60; // runs past midnight
  let m = rawStart;
  while (m < end) {
    const clock = ((m % 1440) + 1440) % 1440;
    const band = Math.floor(clock / BAND_MINUTES); // 0..5
    const minutesToBandEnd = (band + 1) * BAND_MINUTES - clock;
    const step = Math.min(minutesToBandEnd, end - m);
    bands[band] += step;
    m += step;
  }
}

/**
 * Build the scheduled-minutes heatmap for the current Mon–Sun week.
 *
 * Occurrences are resolved per date (honouring recurrence, skips and retimes)
 * the same way `buildDayBreakdown` does, so a biweekly or one-off task only
 * contributes on the weeks it actually runs.
 */
export function buildWeeklyHeatmap(
  activities: Schedule["activities"],
  todayISO: string,
  todayKey: DayKey,
): WeeklyHeatmap {
  const grid: number[][] = DAYS.map(() => Array(BAND_COUNT).fill(0));

  DAYS.forEach((day, di) => {
    const dateISO = isoForWeekday(todayISO, todayKey, day);
    for (const task of activities[day] ?? []) {
      if (!isTaskScheduledOn(task, dateISO, true)) continue;
      const occ = resolveOccurrence(task, dateISO);
      for (const slot of getSlots(occ)) {
        addSlotToBands(grid[di], slot.startTime, slot.endTime);
      }
    }
  });

  let maxMinutes = 0;
  let totalMinutes = 0;
  const columnTotals = grid.map((row) => {
    let colTotal = 0;
    for (const minutes of row) {
      colTotal += minutes;
      if (minutes > maxMinutes) maxMinutes = minutes;
    }
    totalMinutes += colTotal;
    return colTotal;
  });

  return { grid, maxMinutes, totalMinutes, columnTotals };
}

/**
 * Map a cell's minutes to a 0–4 intensity level, normalised to the week's own
 * busiest cell. 0 = nothing scheduled; 1–4 are relative quartile buckets, so
 * both a light week and a packed one get a readable gradient rather than one
 * flat colour. Mirrors the ratio bands in `lib/heatmapUtils.normalizeIntensity`.
 */
export function levelForMinutes(minutes: number, maxMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxMinutes <= 0) return 0;
  const ratio = minutes / maxMinutes;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
