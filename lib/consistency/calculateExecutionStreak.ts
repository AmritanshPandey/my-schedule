/**
 * Unified execution streak — the single "did I show up" number across the whole
 * system (any plan task OR any ritual). This is the honest momentum signal the
 * product is built on: consecutive days the user actually executed something,
 * not a per-plan or per-ritual fragment. Pure — no React, no side-effects.
 */

import type { Schedule } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { ORDERED_DAYS, calculateStreak } from "@/lib/consistency/calculateDailyStats";

// Earned thresholds worth acknowledging — time-based and objective, never
// arbitrary points. Kept sparse so a "milestone" actually means something.
export const STREAK_MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];

export interface ExecutionStreak {
  /** Consecutive active days up to today (or anchored at yesterday if today is empty). */
  streak: number;
  /** Did the user complete at least one task or ritual today. */
  doneToday: boolean;
  /** Streak is alive but nothing has been done yet today — at risk of breaking. */
  atRisk: boolean;
  /** Set when today's streak length lands exactly on a milestone (and was earned today). */
  milestone: number | null;
}

/**
 * The set of ISO dates on which the user executed *anything* — a completed task
 * or subtask (from the permanent completionHistory), or a logged ritual. Missed
 * marks do not count as showing up.
 */
export function buildActiveDates(schedule: Schedule): Set<string> {
  const dates = new Set<string>();
  const activities = schedule.activities ?? ({} as Schedule["activities"]);
  for (const day of ORDERED_DAYS) {
    for (const task of activities[day] ?? []) {
      for (const ev of task.completionHistory ?? []) {
        if (ev.completionType === "task" || ev.completionType === "subtask") {
          dates.add(localISODate(new Date(ev.completedAt)));
        }
      }
    }
  }
  for (const c of schedule.ritualCompletions ?? []) {
    if (c?.date) dates.add(c.date);
  }
  return dates;
}

export function calculateExecutionStreak(schedule: Schedule, todayISO: string): ExecutionStreak {
  const active = buildActiveDates(schedule);
  const streak = calculateStreak(active, todayISO);
  const doneToday = active.has(todayISO);
  const atRisk = streak > 0 && !doneToday;
  const milestone = doneToday && STREAK_MILESTONES.includes(streak) ? streak : null;
  return { streak, doneToday, atRisk, milestone };
}
