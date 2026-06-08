/**
 * Execution analytics — weekly task-completion trend.
 *
 * Derives an N-week (default 8) completion-rate series from the append-only
 * task completion log. One source of truth for the Overview + Review trend.
 *
 * Method & honest limitations:
 * - `completed` for a week = the number of *distinct* scheduled tasks that have
 *   at least one whole-task completion (`completionType === "task"`) dated in
 *   that week. De-duping per task means a task toggled done several times in a
 *   week counts once, so `completed` can never exceed `scheduled` (no >100%).
 * - `scheduled` = the current count of scheduled tasks across all weekday
 *   buckets. The data model stores recurring weekday templates with no history,
 *   so we cannot reconstruct what the schedule looked like weeks ago — every
 *   week is measured against today's task set. This is the one approximation.
 */

import type { Schedule } from "./useScheduleDB";
import { DAYS } from "./useScheduleDB";
import { localISODate } from "./dateUtils";

export interface ExecutionWeek {
  monStr: string;        // ISO date of that week's Monday
  sunStr: string;        // ISO date of that week's Sunday
  label: string;         // "May 12"
  completed: number;     // distinct tasks completed that week
  scheduled: number;     // scheduled tasks per week (current schedule)
  pct: number;           // 0..100, clamped
  isCurrentWeek: boolean;
}

export interface ExecutionTrend {
  weeks: ExecutionWeek[]; // oldest → newest
  current: ExecutionWeek;
  previous: ExecutionWeek;
  deltaPct: number;       // current.pct − previous.pct
  averagePct: number;     // mean pct across the window
  bestPct: number;        // best single week
  totalCompleted: number; // sum of completed across the window
  scheduled: number;      // tasks scheduled per week
}

function mondayOf(d: Date): Date {
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  const m = new Date(d);
  m.setDate(d.getDate() - back);
  m.setHours(0, 0, 0, 0);
  return m;
}

export function computeExecutionTrend(schedule: Schedule, weeksCount = 8): ExecutionTrend {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentMonday = mondayOf(today);

  // Scheduled tasks per week = current count across weekday buckets.
  let scheduled = 0;
  for (const day of DAYS) scheduled += (schedule.activities[day] ?? []).length;

  // Bucket distinct completed task ids by their week's Monday.
  const weekDone = new Map<string, Set<string>>();
  const markDone = (weekMon: string, taskId: string) => {
    let set = weekDone.get(weekMon);
    if (!set) { set = new Set(); weekDone.set(weekMon, set); }
    set.add(taskId);
  };
  const weekMondayOf = (iso: string): string => localISODate(mondayOf(new Date(iso + "T00:00:00")));

  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      const dates = new Set<string>();
      if (Array.isArray(task.completionHistory)) {
        for (const ev of task.completionHistory) {
          if (ev.completionType === "task" && ev.completedAt) {
            dates.add(localISODate(new Date(ev.completedAt)));
          }
        }
      }
      // Legacy fallback: completed flag with no event history.
      if (dates.size === 0 && task.completed && task.completedAt) {
        dates.add(localISODate(new Date(task.completedAt)));
      }
      for (const d of dates) markDone(weekMondayOf(d), task.id);
    }
  }

  const weeks: ExecutionWeek[] = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const mon = new Date(currentMonday);
    mon.setDate(currentMonday.getDate() - i * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const monStr = localISODate(mon);
    const completed = Math.min(weekDone.get(monStr)?.size ?? 0, scheduled || Infinity);
    const pct = scheduled > 0 ? Math.min(100, Math.round((completed / scheduled) * 100)) : 0;
    weeks.push({
      monStr,
      sunStr: localISODate(sun),
      label: mon.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      completed,
      scheduled,
      pct,
      isCurrentWeek: i === 0,
    });
  }

  const current = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2] ?? current;
  const averagePct = Math.round(weeks.reduce((s, w) => s + w.pct, 0) / weeks.length);
  const bestPct = weeks.reduce((m, w) => Math.max(m, w.pct), 0);
  const totalCompleted = weeks.reduce((s, w) => s + w.completed, 0);

  return {
    weeks,
    current,
    previous,
    deltaPct: current.pct - previous.pct,
    averagePct,
    bestPct,
    totalCompleted,
    scheduled,
  };
}
