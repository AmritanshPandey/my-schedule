/**
 * Weekly consistency history calculations.
 * Pure functions — no React, no side-effects.
 */

import type { DayKey, Task } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { isTaskScheduledOn } from "@/lib/taskOccurrence";
import { ORDERED_DAYS, getMondayOfWeek, completedOnDate } from "./calculateDailyStats";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WeekStats {
  weekIndex: number;    // 0 = current week, 1 = last week, etc. (before reversal)
  weekStart: string;    // ISO Monday date
  weekEnd: string;      // ISO Sunday date
  label: string;        // "Week 1", "Week 2", …, "This Week"
  scheduled: number;
  completed: number;
  pct: number;
  /** pct delta vs the immediately preceding week (null = no prior data). */
  trendVsPrev: number | null;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function computeWeekStats(
  planId: string,
  activities: Record<DayKey, Task[]>,
  weekMonday: Date,
  realToday: Date,
): Pick<WeekStats, "weekStart" | "weekEnd" | "scheduled" | "completed" | "pct"> {
  const realTodayISO = localISODate(realToday);
  let totalScheduled = 0;
  let totalCompleted = 0;

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekMonday);
    dayDate.setDate(weekMonday.getDate() + i);

    // Never count future days
    if (dayDate > realToday) continue;

    const dayISO = localISODate(dayDate);
    const dayKey = ORDERED_DAYS[i];
    const isToday = dayISO === realTodayISO;

    const tasks = (activities[dayKey] ?? []).filter(
      (t) => t.planId === planId && isTaskScheduledOn(t, dayISO, true)
    );
    if (tasks.length === 0) continue;

    totalScheduled += tasks.length;
    totalCompleted += completedOnDate(tasks, dayISO, isToday);
  }

  const pct = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
  const weekEnd = new Date(weekMonday);
  weekEnd.setDate(weekMonday.getDate() + 6);

  return {
    weekStart: localISODate(weekMonday),
    weekEnd: localISODate(weekEnd),
    scheduled: totalScheduled,
    completed: totalCompleted,
    pct,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns up to `weeksBack` weekly summary rows ordered oldest→newest.
 * Stops early once a historical week has no scheduled tasks.
 * The most recent entry represents the current (in-progress) week.
 */
export function calculateWeeklyHistory(
  planId: string,
  activities: Record<DayKey, Task[]>,
  todayISO: string,
  weeksBack = 8,
): WeekStats[] {
  const realToday = new Date(todayISO + "T00:00:00");
  const currentMonday = getMondayOfWeek(realToday);

  // Build newest→oldest then reverse
  const raw: WeekStats[] = [];

  for (let w = 0; w < weeksBack; w++) {
    const weekMonday = new Date(currentMonday);
    weekMonday.setDate(currentMonday.getDate() - w * 7);

    const stats = computeWeekStats(planId, activities, weekMonday, realToday);

    // Stop looking further back if no tasks were scheduled
    if (stats.scheduled === 0 && w > 0) break;

    raw.push({ weekIndex: w, ...stats, label: "", trendVsPrev: null });
  }

  // Fill trendVsPrev: raw[0] is current, raw[1] is last week
  for (let i = 0; i < raw.length - 1; i++) {
    const curr = raw[i];
    const prev = raw[i + 1];
    if (prev.scheduled > 0) curr.trendVsPrev = curr.pct - prev.pct;
  }

  // Reverse so oldest is first, then add display labels
  const sorted = [...raw].reverse();
  return sorted.map((w, i, arr) => ({
    ...w,
    label: i === arr.length - 1 ? "This Week" : `Week ${i + 1}`,
  }));
}
