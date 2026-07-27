/**
 * The single source of truth for "when does this block actually run".
 *
 * A slot like Sleep 11 PM → 7 AM crosses midnight, and until now every consumer
 * re-derived that with its own `while (end <= start) end += 1440` — the donut,
 * the week grid, the mobile timeline and `formatDuration` each had a copy, and
 * they did not agree at the edges (`end === start` meant "24 hours" in three of
 * them and "0m" in the fourth). This module owns the arithmetic; everything
 * else calls it.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";

const DAY = 24 * 60;

/**
 * A block's span in *schedule-day minutes* relative to the day it is authored
 * on. `end` may exceed 1440, which is exactly what marks it as running into the
 * next calendar day.
 */
export interface SlotInterval {
  start: number;
  end: number;
}

/** A slot with no end time is treated as this long. Matches the week grid. */
const DEFAULT_SLOT_MINUTES = 30;

/**
 * Resolve a slot's span, or null when it has no usable start or is zero-length.
 *
 * `toScheduleDayMinutes` pushes times before the 4 AM day boundary to the end of
 * the day, which is what makes a 1 AM block authored on Monday resolve to
 * [1500, 1560) — i.e. entirely within Tuesday once split at midnight. That
 * falls out of the existing day model with no special-casing.
 */
export function slotInterval(slot: { startTime: string; endTime: string }): SlotInterval | null {
  const rawStart = parseTimeToMinutes(slot.startTime);
  if (rawStart === null) return null;
  const start = toScheduleDayMinutes(rawStart);

  const rawEnd = parseTimeToMinutes(slot.endTime);
  if (rawEnd === null) return { start, end: start + DEFAULT_SLOT_MINUTES };
  // Identical start and end is a zero-length block, not a 24-hour one. The old
  // `while (end <= start) end += 1440` read it as a full day, which disagreed
  // with `formatDuration` calling the same slot "0m".
  if (rawEnd === rawStart) return null;

  let end = toScheduleDayMinutes(rawEnd);
  if (end <= start) end += DAY;
  return { start, end };
}

/** Does this block run into the next calendar day? */
export function crossesMidnight(interval: SlotInterval): boolean {
  return interval.end > DAY;
}

/** Minutes that fall on the day the block is authored on. */
export function headMinutes(interval: SlotInterval): number {
  return Math.max(0, Math.min(interval.end, DAY) - interval.start);
}

/** Minutes that spill into the following calendar day. */
export function tailMinutes(interval: SlotInterval): number {
  return Math.max(0, interval.end - Math.max(interval.start, DAY));
}

/** Total length of the block, midnight crossings included. */
export function intervalMinutes(interval: SlotInterval): number {
  return Math.max(0, interval.end - interval.start);
}
