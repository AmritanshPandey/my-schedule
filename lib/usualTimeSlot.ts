/**
 * "Your usual time" — a personalized time-slot suggestion derived from the
 * user's own scheduling habits, distinct from lib/availableSlots.ts's purely
 * geometric "what's currently empty" suggestions.
 *
 * Deliberately NOT built from Task.completionHistory: completedAt records
 * when a task was marked done, not the time it was scheduled for, so it's a
 * reliable signal for streaks (lib/consistency/) but not for time-of-day
 * patterns. The reliable signal is the CURRENT scheduled time of the user's
 * other tasks — how they actually place this kind of thing on the calendar —
 * so this reads Task.startTime/slots the same way lib/availableSlots.ts does.
 *
 * Pure and React-free, mirroring lib/taskCategories.ts's dedup-by-task-id
 * convention: a recurring task shares one id across every weekday bucket it
 * repeats on, so it must only contribute one sample, not one per weekday.
 */
import { DAYS } from "./scheduleConstants";
import type { DayKey, Task } from "./useScheduleDB";
import { getSlots } from "./taskMutations";
import { parseTimeToMinutes } from "./timeUtils";

export interface UsualTimeSlot {
  /** Schedule-day minutes (may exceed 1440 for a slot past midnight). */
  startMinutes: number;
  endMinutes: number;
  /** How many distinct tasks this was computed from — surfaced so the UI
   *  can (optionally) show its confidence rather than presenting it as an
   *  unqualified fact. */
  sampleSize: number;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function roundToNearest5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

/**
 * The user's typical start time + duration for "tasks like this," grouped by
 * categoryId when the task has one, falling back to planId when it doesn't
 * (category is optional, plan is always required). Aggregates across every
 * weekday — a habit like "usually 7am" isn't specific to Monday vs Wednesday.
 *
 * Returns null below `minSamples` matches: mirrors
 * lib/consistency/routineInsights.ts's MIN_STREAK_TO_HIGHLIGHT convention of
 * not confidently surfacing an insight from too thin a sample.
 */
export function computeUsualTimeSlot(
  activities: Partial<Record<DayKey, Task[]>>,
  key: { categoryId?: string; planId: string },
  excludeTaskId: string | undefined,
  minSamples = 2,
): UsualTimeSlot | null {
  const seen = new Set<string>();
  const samples: { startMinutes: number; durationMinutes: number }[] = [];

  for (const day of DAYS) {
    for (const task of activities[day] ?? []) {
      if (task.id === excludeTaskId || seen.has(task.id)) continue;
      const matches = key.categoryId
        ? task.categoryId === key.categoryId
        : task.planId === key.planId;
      if (!matches) continue;
      seen.add(task.id);

      const slot = getSlots(task)[0];
      if (!slot) continue;
      const start = parseTimeToMinutes(slot.startTime);
      const end = parseTimeToMinutes(slot.endTime);
      if (start === null || end === null) continue;
      const duration = end > start ? end - start : end + 24 * 60 - start; // overnight
      samples.push({ startMinutes: start, durationMinutes: duration });
    }
  }

  if (samples.length < minSamples) return null;

  const startMinutes = roundToNearest5(median(samples.map((s) => s.startMinutes)));
  const durationMinutes = roundToNearest5(median(samples.map((s) => s.durationMinutes)));

  return {
    startMinutes,
    endMinutes: startMinutes + Math.max(durationMinutes, 5),
    sampleSize: samples.length,
  };
}
