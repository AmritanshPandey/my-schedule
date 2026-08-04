import { parseTimeToMinutes } from "@/lib/timeUtils";

export const DEFAULT_TIMELINE_START_MINUTES = 4 * 60;
export const TIMELINE_END_HOUR = 28;
export const TIMELINE_END_MINUTES = TIMELINE_END_HOUR * 60;
export const TIMELINE_LEAD_IN_MINUTES = 60;
export const TIMELINE_GRID_STEP_MINUTES = 30;
export const TIMELINE_MIN_DISPLAY_START_MINUTES = 0;

export interface SchedulePreferenceTasksScope {
  startTime: string;
}

function padTime(value: number): string {
  return value.toString().padStart(2, "0");
}

export function normalizeDayStartTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const minutes = parseTimeToMinutes(value);
  if (minutes === null || minutes % TIMELINE_GRID_STEP_MINUTES !== 0) return undefined;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${padTime(hour)}:${padTime(minute)}`;
}

export function getConfiguredDayStartMinutes(dayStartTime?: string): number | null {
  if (!dayStartTime) return null;
  const normalized = normalizeDayStartTime(dayStartTime);
  if (!normalized) return null;
  return parseTimeToMinutes(normalized);
}

export function getEarliestTimedTaskStartMinutes(
  tasks: ReadonlyArray<SchedulePreferenceTasksScope>,
): number | null {
  let earliest: number | null = null;
  for (const task of tasks) {
    const start = parseTimeToMinutes(task.startTime);
    if (start === null) continue;
    earliest = earliest === null ? start : Math.min(earliest, start);
  }
  return earliest;
}

export function getTimelineDisplayStartMinutes({
  dayStartTime,
  tasks,
  mustShowFromMinutes,
}: {
  dayStartTime?: string;
  tasks: ReadonlyArray<SchedulePreferenceTasksScope>;
  /**
   * A minute the window must include, whatever the anchor says. Used for
   * overnight continuations, which begin at the 4:00 handover: the computed
   * start is normally later than that (it defaults to 6:00 with a 7:00 first
   * task), so without this floor a carried-in block would be clipped off the
   * top — the same silent truncation, moved to the other end of the day.
   */
  mustShowFromMinutes?: number;
}): number {
  const configured = getConfiguredDayStartMinutes(dayStartTime);
  const earliestTask = getEarliestTimedTaskStartMinutes(tasks);
  const anchor = configured ?? earliestTask ?? DEFAULT_TIMELINE_START_MINUTES;
  const computed = Math.max(TIMELINE_MIN_DISPLAY_START_MINUTES, anchor - TIMELINE_LEAD_IN_MINUTES);
  // No lead-in for a carry-in: it starts exactly at the handover, and an extra
  // empty hour above it would just be scroll.
  if (mustShowFromMinutes === undefined) return computed;
  return Math.min(computed, Math.max(TIMELINE_MIN_DISPLAY_START_MINUTES, mustShowFromMinutes));
}

export function buildTimelineGridMarks(startMin: number, endMin: number): number[] {
  const firstMark =
    Math.ceil(startMin / TIMELINE_GRID_STEP_MINUTES) * TIMELINE_GRID_STEP_MINUTES;
  const marks: number[] = [];
  for (let minute = firstMark; minute <= endMin; minute += TIMELINE_GRID_STEP_MINUTES) {
    marks.push(minute);
  }
  return marks;
}

export function mapMinutesToTimeline(
  minutes: number,
  timelineStartMinutes: number,
  timelineEndMinutes: number = TIMELINE_END_MINUTES,
): number {
  const overnightOverflowMinutes = Math.max(0, timelineEndMinutes - 24 * 60);
  if (minutes < timelineStartMinutes && minutes <= overnightOverflowMinutes) {
    return minutes + 24 * 60;
  }
  return minutes;
}

/**
 * Where "now" sits on the timeline, or null when the current time falls outside
 * the visible window.
 *
 * Deliberately does NOT go through `mapMinutesToTimeline`. That wrap exists so a
 * task running past midnight is drawn at the tail of the day, but it must never
 * apply to the clock: at 1 AM with a 3 AM day start, wrapping turns 60 into 1500,
 * which then passes a naive `<= endMinutes` bounds check and paints the red line
 * near the bottom of the day. 1 AM is *before* today's window opens (the day
 * key has already rolled over), so the honest answer is "not on screen".
 */
export function getNowOnTimeline(
  nowMinutes: number,
  timelineStartMinutes: number,
  timelineEndMinutes: number = TIMELINE_END_MINUTES,
): number | null {
  if (nowMinutes < timelineStartMinutes) return null;
  if (nowMinutes > timelineEndMinutes) return null;
  return nowMinutes;
}
