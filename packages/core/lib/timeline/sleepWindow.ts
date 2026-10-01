/**
 * Sleep-aware waking-window math — the single shared place this lives, so
 * lib/dayBreakdown.ts's "Active hours" bar and lib/availableSlots.ts's
 * time-slot recommender both bound themselves against the same waking day
 * instead of each growing their own copy.
 *
 * Deliberately takes primitive params (`dayStartTime`, `sleepHours`), not a
 * whole `SchedulePreferences` object, so this module never has to know that
 * type's shape — matching the discipline lib/ai/validation/businessRules.ts
 * already uses for the same reason.
 */
import { getConfiguredDayStartMinutes } from "./displayWindow";

export const MIN_SLEEP_HOURS = 4;
export const MAX_SLEEP_HOURS = 12;
export const DEFAULT_SLEEP_HOURS = 8;

/**
 * Where a waking day starts when the user has not configured one.
 *
 * Deliberately *not* `DEFAULT_TIMELINE_START_MINUTES` (4:00). That constant is
 * the schedule-day boundary — the point where one day's grid hands over to the
 * next — not a wake time. Reusing it would tell an unconfigured user their day
 * runs 4:00 AM to 8:00 PM and make every evening block read as falling outside
 * their waking hours.
 */
export const DEFAULT_WAKING_START_MINUTES = 7 * 60;

export function clampSleepHours(hours: number): number {
  return Math.min(MAX_SLEEP_HOURS, Math.max(MIN_SLEEP_HOURS, hours));
}

/** 24h minus the configured (or default) sleep need, in minutes. */
export function getWakingWindowMinutes(sleepHours?: number): number {
  const hours =
    typeof sleepHours === "number" && Number.isFinite(sleepHours)
      ? clampSleepHours(sleepHours)
      : DEFAULT_SLEEP_HOURS;
  return 24 * 60 - hours * 60;
}

/** The waking day's [start, end) in minutes, given a configured day-start and sleep need. */
export function resolveWakingWindow(
  dayStartTime: string | undefined,
  sleepHours: number | undefined,
): { startMinutes: number; endMinutes: number; wakingMinutes: number } {
  const startMinutes = getConfiguredDayStartMinutes(dayStartTime) ?? DEFAULT_WAKING_START_MINUTES;
  const wakingMinutes = getWakingWindowMinutes(sleepHours);
  return { startMinutes, endMinutes: startMinutes + wakingMinutes, wakingMinutes };
}
