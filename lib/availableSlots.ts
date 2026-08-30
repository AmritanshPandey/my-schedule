/**
 * Open time windows in a day, for suggesting where a new task could fit.
 *
 * Kept separate from lib/scheduleRules.ts, which is scoped to validating and
 * placing tasks about to be committed (and deliberately stays free of
 * lib/taskOccurrence.ts/lib/taskMutations.ts imports — see its own comments).
 * This module answers a different question — "what's currently empty,
 * before any task exists" — for a different caller (manual task creation),
 * and needs exactly those imports.
 *
 * Bounded by the day's configured start and the sleep-adjusted waking-window
 * end (lib/timeline/sleepWindow.ts), so a suggestion never lands inside the
 * user's declared sleep window.
 */
import type { Schedule, Task } from "./useScheduleDB";
import { getSlots } from "./taskMutations";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";
import { getConfiguredDayStartMinutes, DEFAULT_TIMELINE_START_MINUTES } from "./timeline/displayWindow";
import { resolveWakingWindow } from "./timeline/sleepWindow";
import { mergeIntervals } from "./timeline/intervals";

export interface AvailableSlot {
  /** Schedule-day minutes (may exceed 1440 for a window past midnight). */
  startMinutes: number;
  endMinutes: number;
}

export interface FindAvailableSlotsOptions {
  /** Smallest gap worth reporting. Default 15. */
  minDurationMinutes?: number;
  /** Override the computed day-start bound (mainly for tests). */
  dayStartMinutes?: number;
  /** Override the computed day-end bound (mainly for tests). */
  dayEndMinutes?: number;
}

/**
 * Open windows on `dateISO`, given one weekday's task bucket (the caller
 * already knows which weekday `dateISO` falls on — e.g. `schedule.activities[day]`).
 * Does not look at the previous day's overnight carry-in (a known, accepted
 * v1 limitation — see PlanR's slot-recommendation plan notes).
 */
export function findAvailableSlots(
  tasks: readonly Task[],
  dateISO: string,
  preferences: Schedule["preferences"] | undefined,
  options?: FindAvailableSlotsOptions,
): AvailableSlot[] {
  const dayStart =
    options?.dayStartMinutes
    ?? getConfiguredDayStartMinutes(preferences?.dayStartTime)
    ?? DEFAULT_TIMELINE_START_MINUTES;
  const dayEnd =
    options?.dayEndMinutes
    ?? resolveWakingWindow(preferences?.dayStartTime, preferences?.sleepHours).endMinutes;
  const minDuration = options?.minDurationMinutes ?? 15;

  const busy: Array<{ start: number; end: number }> = [];
  for (const task of tasks) {
    if (!isTaskScheduledOn(task, dateISO, true, preferences?.startDate)) continue;
    const occurrence = resolveOccurrence(task, dateISO);
    for (const slot of getSlots(occurrence)) {
      const rawStart = parseTimeToMinutes(slot.startTime);
      const rawEnd = parseTimeToMinutes(slot.endTime);
      if (rawStart === null || rawEnd === null) continue;
      const start = toScheduleDayMinutes(rawStart);
      let end = toScheduleDayMinutes(rawEnd);
      if (end <= start) end += 24 * 60; // spans midnight
      const clippedStart = Math.max(start, dayStart);
      const clippedEnd = Math.min(end, dayEnd);
      if (clippedEnd > clippedStart) busy.push({ start: clippedStart, end: clippedEnd });
    }
  }

  const merged = mergeIntervals(busy);

  const gaps: AvailableSlot[] = [];
  let cursor = dayStart;
  for (const interval of merged) {
    if (interval.start > cursor) gaps.push({ startMinutes: cursor, endMinutes: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < dayEnd) gaps.push({ startMinutes: cursor, endMinutes: dayEnd });

  return gaps.filter((g) => g.endMinutes - g.startMinutes >= minDuration);
}

/**
 * Turn open gaps into concrete, chip-ready start/end suggestions of a fixed
 * duration — the largest N gaps first (most likely useful), returned in
 * chronological order for display.
 */
export function suggestSlots(
  gaps: readonly AvailableSlot[],
  durationMinutes: number,
  maxSuggestions = 3,
): AvailableSlot[] {
  return gaps
    .filter((g) => g.endMinutes - g.startMinutes >= durationMinutes)
    .slice()
    .sort((a, b) => (b.endMinutes - b.startMinutes) - (a.endMinutes - a.startMinutes))
    .slice(0, maxSuggestions)
    .map((g) => ({ startMinutes: g.startMinutes, endMinutes: g.startMinutes + durationMinutes }))
    .sort((a, b) => a.startMinutes - b.startMinutes);
}
