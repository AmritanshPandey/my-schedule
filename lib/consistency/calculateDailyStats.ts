/**
 * Core daily consistency calculations.
 * All functions are pure — no React, no side-effects.
 */

import type { DayKey, Task } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { isTaskScheduledOn } from "@/lib/taskOccurrence";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ORDERED_DAYS: DayKey[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

export const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayStats {
  date: string;
  dayKey: DayKey;
  label: string;
  scheduled: number;
  completed: number;
  pct: number;
  isFuture: boolean;
  isToday: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the Monday of the week containing `date`. */
export function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Count how many of `tasks` were completed on `dateISO`.
 * For today, uses the live `completed` flag.
 * For past days, walks `completionHistory` for task-level events.
 */
export function completedOnDate(tasks: Task[], dateISO: string, isToday: boolean): number {
  return tasks.reduce((sum, task) => {
    if (isToday) return sum + (task.completed ? 1 : 0);

    if (Array.isArray(task.completionHistory) && task.completionHistory.length > 0) {
      const hit = task.completionHistory.some(
        (e) => e.completionType === "task" && localISODate(new Date(e.completedAt)) === dateISO,
      );
      return sum + (hit ? 1 : 0);
    }

    // Fallback: single completedAt timestamp
    if (task.completed && task.completedAt) {
      return sum + (localISODate(new Date(task.completedAt)) === dateISO ? 1 : 0);
    }

    return sum;
  }, 0);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns per-day stats for the calendar week containing `todayISO` (Mon→Sun).
 * Future days are flagged and have pct=0.
 */
export function calculateCurrentWeekStats(
  planId: string,
  activities: Record<DayKey, Task[]>,
  todayISO: string,
): DayStats[] {
  const today = new Date(todayISO + "T00:00:00");
  const monday = getMondayOfWeek(today);

  return ORDERED_DAYS.map((dayKey, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateISO = localISODate(date);

    const isToday = dateISO === todayISO;
    const isFuture = date > today;

    const tasks = (activities[dayKey] ?? []).filter(
      (t) => t.planId === planId && isTaskScheduledOn(t, dateISO, true)
    );
    const scheduled = tasks.length;
    const completed = scheduled > 0 && !isFuture ? completedOnDate(tasks, dateISO, isToday) : 0;
    const pct = scheduled > 0 && !isFuture ? Math.round((completed / scheduled) * 100) : 0;

    return { date: dateISO, dayKey, label: DAY_SHORT[dayKey], scheduled, completed, pct, isFuture, isToday };
  });
}

/**
 * Builds the set of ISO date strings where at least one task-level completion
 * was recorded for this plan. Used for streak calculation.
 */
export function buildPlanCompletionDates(
  planId: string,
  activities: Record<DayKey, Task[]>,
): Set<string> {
  const dates = new Set<string>();
  for (const day of ORDERED_DAYS) {
    for (const task of activities[day] ?? []) {
      if (task.planId !== planId) continue;
      if (Array.isArray(task.completionHistory)) {
        for (const e of task.completionHistory) {
          if (e.completionType === "task") dates.add(localISODate(new Date(e.completedAt)));
        }
      } else if (task.completed && task.completedAt) {
        dates.add(localISODate(new Date(task.completedAt)));
      }
    }
  }
  return dates;
}

/**
 * Count consecutive days (up to and including today) with at least one
 * completion. If today has no completions, counts backwards from yesterday.
 */
export function calculateStreak(completionDates: Set<string>, todayISO: string): number {
  if (completionDates.size === 0) return 0;
  const cursor = new Date(todayISO + "T00:00:00");
  if (!completionDates.has(todayISO)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const ds = localISODate(cursor);
    if (completionDates.has(ds)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
