/**
 * Overnight tasks — the part of a block that belongs to the *next* schedule day.
 *
 * A schedule day runs 4:00 → 28:00. A task like sleep 23:00–07:00 starts at 1380
 * and ends at 1860, which is past the window; before this module existed the tail
 * was simply clamped away, so three hours vanished with no marker and the donut
 * (which counted the full eight hours) disagreed with the grid (which drew five).
 *
 * Pure and React-free.
 */

import type { Task, TaskSlot } from "@/lib/useScheduleDB";
import { getSlots } from "@/lib/taskMutations";
import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";
import { TIMELINE_END_MINUTES } from "./displayWindow";

const MINUTES_PER_DAY = 24 * 60;

/**
 * The clock minute where one schedule day hands over to the next.
 *
 * Equal to `TIMELINE_END_MINUTES - 1440` by construction: 28:00 on day D *is*
 * 4:00 on day D+1 — the same instant named twice. That identity is why a
 * continuation block tiles flush against the block it continues instead of
 * leaving a seam, and it is the same 240 that `mapMinutesToTimeline` already
 * hardcodes as its overnight overflow bound.
 */
export const SCHEDULE_DAY_HANDOVER_MINUTES = TIMELINE_END_MINUTES - MINUTES_PER_DAY;

export interface MinuteInterval {
  start: number;
  end: number;
}

/**
 * The part of `interval` that spills past the end of its schedule day, expressed
 * in the *next* day's window coordinates. Null when nothing spills.
 *
 * Clips rather than chains: the rule engine caps a task at 16h and a start at
 * 28:00, so a legitimate task can overrun by at most one window and the clip is
 * never reached. Imported or hand-edited data that breaks the cap gets truncated
 * at the next day's end instead of cascading — one malformed row must not paint
 * every day of the week.
 */
export function continuationInterval(
  interval: MinuteInterval,
  timelineEndMinutes: number = TIMELINE_END_MINUTES,
): MinuteInterval | null {
  if (interval.end <= timelineEndMinutes) return null;
  return {
    start: timelineEndMinutes - MINUTES_PER_DAY,
    end: Math.min(interval.end - MINUTES_PER_DAY, timelineEndMinutes),
  };
}

export interface TaskContinuation {
  slot: TaskSlot;
  slotIndex: number;
  /** Where the tail sits, in the next day's window coordinates. */
  interval: MinuteInterval;
}

/**
 * Every slot of `task` that runs past the end of its day, positioned for the
 * following day's grid. Empty for the overwhelming majority of tasks.
 *
 * Lives here rather than in either shell because both the week grid and the
 * single-day timeline need the same answer, and getting it subtly different in
 * two places is how the original truncation went unnoticed.
 */
export function taskContinuations(
  task: Task,
  timelineEndMinutes: number = TIMELINE_END_MINUTES,
): TaskContinuation[] {
  const out: TaskContinuation[] = [];
  getSlots(task).forEach((slot, slotIndex) => {
    const rawStart = parseTimeToMinutes(slot.startTime);
    const rawEnd = parseTimeToMinutes(slot.endTime);
    if (rawStart === null || rawEnd === null) return;
    const start = toScheduleDayMinutes(rawStart);
    let end = toScheduleDayMinutes(rawEnd);
    if (end <= start) end += MINUTES_PER_DAY;
    const interval = continuationInterval({ start, end }, timelineEndMinutes);
    if (interval) out.push({ slot, slotIndex, interval });
  });
  return out;
}
