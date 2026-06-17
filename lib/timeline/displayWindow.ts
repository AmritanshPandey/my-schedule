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
}: {
  dayStartTime?: string;
  tasks: ReadonlyArray<SchedulePreferenceTasksScope>;
}): number {
  const configured = getConfiguredDayStartMinutes(dayStartTime);
  const earliestTask = getEarliestTimedTaskStartMinutes(tasks);
  const anchor = configured ?? earliestTask ?? DEFAULT_TIMELINE_START_MINUTES;
  return Math.max(TIMELINE_MIN_DISPLAY_START_MINUTES, anchor - TIMELINE_LEAD_IN_MINUTES);
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
