/**
 * Schedule Rule Engine — deterministic constraints for task scheduling.
 *
 * This module owns ALL scheduling logic. AI suggests; the rule engine enforces.
 * Rules run before any AI-generated task is committed to state.
 *
 * Rules enforced:
 *  1. start < end (or overnight flag)
 *  2. Duration: minimum 5 min, maximum 16 hours
 *  3. Bounds: tasks must be within TIMELINE_START_HOUR–TIMELINE_END_HOUR
 *  4. Overlap prevention: push colliding AI tasks forward in time
 *  5. Deduplication: reject tasks with identical (title + day + startTime)
 */

import type { DayKey } from "@/lib/useScheduleDB";
import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";

// Mirror ScheduleApp constants — timeline bounds
const TIMELINE_START_HOUR = 4;
const TIMELINE_END_HOUR = 28;
const TIMELINE_START_MINUTES = TIMELINE_START_HOUR * 60;
const TIMELINE_END_MINUTES = TIMELINE_END_HOUR * 60;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 16 * 60;

export interface TimeInterval {
  start: number; // minutes since midnight
  end: number;   // minutes since midnight (may exceed 1440 for overnight)
}

export interface SchedulableTask {
  title: string;
  day: DayKey;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
}

/** Existing tasks in the schedule don't carry a `day` field — their day is the map key. */
export interface ExistingTask {
  title: string;
  startTime: string;
  endTime: string;
}

export interface ValidationError {
  code: "invalid-time" | "too-short" | "too-long" | "out-of-bounds" | "duplicate";
  message: string;
}

export interface OverlapConflict {
  taskTitle: string;
  conflictsWith: string;
  day: DayKey;
  originalStart: string;
  adjustedStart: string;
}

export interface RuleEngineResult<T extends SchedulableTask> {
  valid: T[];
  conflicts: OverlapConflict[];
  errors: Array<{ task: T; error: ValidationError }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMinutes(time: string): number | null {
  const minutes = parseTimeToMinutes(time);
  return minutes === null ? null : toScheduleDayMinutes(minutes, TIMELINE_START_MINUTES);
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60).toString().padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateTaskTime(task: SchedulableTask): ValidationError | null {
  const start = toMinutes(task.startTime);
  const end = toMinutes(task.endTime);

  if (start === null || end === null) {
    return { code: "invalid-time", message: `Invalid time format: "${task.startTime}" or "${task.endTime}"` };
  }

  const normalizedEnd = end <= start ? end + 1440 : end; // overnight
  const duration = normalizedEnd - start;

  if (duration < MIN_DURATION_MINUTES) {
    return { code: "too-short", message: `Task duration must be at least ${MIN_DURATION_MINUTES} minutes` };
  }

  if (duration > MAX_DURATION_MINUTES) {
    return { code: "too-long", message: `Task duration cannot exceed ${MAX_DURATION_MINUTES / 60} hours` };
  }

  if (start < TIMELINE_START_MINUTES || start > TIMELINE_END_MINUTES) {
    return {
      code: "out-of-bounds",
      message: `Task start time must be between ${TIMELINE_START_HOUR}:00 and ${TIMELINE_END_HOUR}:00`,
    };
  }

  if (normalizedEnd > TIMELINE_END_MINUTES) {
    return {
      code: "out-of-bounds",
      message: `Task must end by ${TIMELINE_END_HOUR % 24}:00`,
    };
  }

  return null;
}

// ── Overlap detection ─────────────────────────────────────────────────────────

/**
 * Detect overlaps in a list of tasks on the same day.
 * Returns pairs of overlapping task titles.
 */
export function detectOverlaps(tasks: SchedulableTask[]): Array<[string, string]> {
  const intervals = tasks.map((t) => {
    const start = toMinutes(t.startTime) ?? 0;
    const end = toMinutes(t.endTime) ?? start + 30;
    return { title: t.title, start, end: end <= start ? end + 1440 : end };
  });

  const conflicts: Array<[string, string]> = [];
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      if (intervalsOverlap(intervals[i], intervals[j])) {
        conflicts.push([intervals[i].title, intervals[j].title]);
      }
    }
  }
  return conflicts;
}

// ── AI task validation + overlap resolution ───────────────────────────────────

/**
 * Run all scheduling rules against a batch of AI-generated tasks.
 *
 * For overlap conflicts, attempts to push the later task forward to avoid
 * the collision (preserving duration) rather than rejecting it outright.
 *
 * Existing tasks on each day are passed in to also check against live schedule.
 */
export function applyScheduleRules<T extends SchedulableTask>(
  incoming: T[],
  existingByDay: Partial<Record<DayKey, ExistingTask[]>>,
): RuleEngineResult<T> {
  const valid: T[] = [];
  const conflicts: OverlapConflict[] = [];
  const errors: RuleEngineResult<T>["errors"] = [];

  // Track already-accepted tasks so within-batch overlaps are also caught
  const acceptedByDay: Record<DayKey, TimeInterval[]> = {
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: [], saturday: [], sunday: [],
  };

  // Seed with existing schedule data
  for (const [day, tasks] of Object.entries(existingByDay) as [DayKey, SchedulableTask[]][]) {
    for (const t of tasks ?? []) {
      const start = toMinutes(t.startTime);
      const end = toMinutes(t.endTime);
      if (start !== null && end !== null) {
        acceptedByDay[day].push({ start, end: end <= start ? end + 1440 : end });
      }
    }
  }

  // Dedup key: same task shouldn't appear twice across the batch
  const seenKeys = new Set<string>();

  for (const task of incoming) {
    const dupKey = `${task.title.trim().toLowerCase()}|${task.day}|${task.startTime}`;
    if (seenKeys.has(dupKey)) {
      errors.push({ task, error: { code: "duplicate", message: `Duplicate task: "${task.title}" on ${task.day} at ${task.startTime}` } });
      continue;
    }
    seenKeys.add(dupKey);

    // Time validation
    const timeError = validateTaskTime(task);
    if (timeError) {
      errors.push({ task, error: timeError });
      continue;
    }

    let start = toMinutes(task.startTime)!;
    let end = toMinutes(task.endTime)!;
    const isOvernight = end <= start;
    if (isOvernight) end += 1440;
    const duration = end - start;

    // Try to place the task, nudging forward on overlap (up to 4 attempts)
    let placed = false;
    let originalStart = task.startTime;
    let adjustedTask = { ...task };
    const intervals = acceptedByDay[task.day];

    for (let attempt = 0; attempt < 5; attempt++) {
      const interval: TimeInterval = { start, end: start + duration };
      const collision = intervals.find((iv) => intervalsOverlap(iv, interval));
      if (!collision) {
        placed = true;
        break;
      }
      // Push to after the colliding interval
      start = collision.end;
      end = start + duration;
      if (start > TIMELINE_END_MINUTES) break; // no room left in the day
    }

    if (!placed) {
      errors.push({
        task,
        error: { code: "out-of-bounds", message: `No room to fit "${task.title}" on ${task.day} — schedule too full` },
      });
      continue;
    }

    const adjustedStart = minutesToTime(start);
    const adjustedEnd = minutesToTime(isOvernight ? (end % 1440) : end);

    if (adjustedStart !== originalStart) {
      conflicts.push({
        taskTitle: task.title,
        conflictsWith: "existing task",
        day: task.day,
        originalStart,
        adjustedStart,
      });
    }

    adjustedTask = { ...task, startTime: adjustedStart, endTime: adjustedEnd };
    acceptedByDay[task.day].push({ start, end: start + duration });
    valid.push(adjustedTask as T);
  }

  return { valid, conflicts, errors };
}

/**
 * Validate a single manually-entered task against the current day's schedule.
 * Returns null if valid, or a ValidationError to surface to the user.
 */
export function validateManualTask(
  task: SchedulableTask,
  existingTasks: SchedulableTask[],
): ValidationError | null {
  const timeError = validateTaskTime(task);
  if (timeError) return timeError;

  const start = toMinutes(task.startTime)!;
  const end = toMinutes(task.endTime)!;
  const normalizedEnd = end <= start ? end + 1440 : end;
  const incoming: TimeInterval = { start, end: normalizedEnd };

  for (const existing of existingTasks) {
    if (existing.title === task.title && existing.day === task.day && existing.startTime === task.startTime) {
      return { code: "duplicate", message: "An identical task already exists at this time" };
    }
    const eStart = toMinutes(existing.startTime);
    const eEnd = toMinutes(existing.endTime);
    if (eStart === null || eEnd === null) continue;
    const eInterval: TimeInterval = { start: eStart, end: eEnd <= eStart ? eEnd + 1440 : eEnd };
    if (intervalsOverlap(incoming, eInterval)) {
      return {
        code: "invalid-time",
        message: `Overlaps with "${existing.title}" (${existing.startTime}–${existing.endTime})`,
      };
    }
  }

  return null;
}
