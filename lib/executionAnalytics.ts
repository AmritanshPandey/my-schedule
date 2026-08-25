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
import { DAYS } from "./scheduleConstants";
import { localISODate } from "./dateUtils";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isTrackedTask } from "./taskCompletion";

export interface ExecutionWeek {
  monStr: string;        // ISO date of that week's Monday
  sunStr: string;        // ISO date of that week's Sunday
  label: string;         // "May 12"
  completed: number;     // distinct tasks completed that week
  missed: number;        // distinct tasks missed that week (auto or manual)
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
  totalMissed: number;    // sum of missed across the window
  currentMissed: number;  // tasks missed this week
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

/**
 * `now` is injectable so callers that build a schedule around a fixed date can
 * measure against that same date. Reading the real clock unconditionally made
 * this untestable against any fixture: the demo dataset is generated relative
 * to a pinned date, so as real time moved past it the trend window drifted off
 * the end of the data and the test started failing on a calendar boundary
 * rather than on a code change. Production callers pass nothing and get the
 * real clock, exactly as before.
 */
export function computeExecutionTrend(schedule: Schedule, weeksCount = 8, now: Date = new Date()): ExecutionTrend {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const currentMonday = mondayOf(today);

  // Scheduled occurrences in a week = sum over that week's 7 dates of the tasks
  // due on each (honors skips + recurrence intervals/one-off, so a biweekly task
  // only counts on its weeks). mon is a Monday → DAYS[di] is that date's weekday.
  const scheduledInWeek = (mon: Date): number => {
    let count = 0;
    for (let di = 0; di < 7; di++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + di);
      const dateISO = localISODate(d);
      for (const task of schedule.activities[DAYS[di]] ?? []) {
        if (isTaskScheduledOn(task, dateISO, true) && isTrackedTask(task)) count++;
      }
    }
    return count;
  };

  // Bucket distinct completed / missed task ids by their week's Monday. Both are
  // de-duped per occurrence per week, so a task toggled repeatedly counts once.
  const weekDone = new Map<string, Set<string>>();
  const weekMissed = new Map<string, Set<string>>();
  const markInto = (map: Map<string, Set<string>>, weekMon: string, occurrenceId: string) => {
    let set = map.get(weekMon);
    if (!set) { set = new Set(); map.set(weekMon, set); }
    set.add(occurrenceId);
  };
  const weekMondayOf = (iso: string): string => localISODate(mondayOf(new Date(iso + "T00:00:00")));

  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      const doneDates = new Set<string>();
      const missedDates = new Set<string>();
      if (Array.isArray(task.completionHistory)) {
        for (const ev of task.completionHistory) {
          if (!ev.completedAt) continue;
          if (ev.completionType === "task") {
            doneDates.add(localISODate(new Date(ev.completedAt)));
          } else if (ev.completionType === "missed" && !ev.subtaskId) {
            missedDates.add(localISODate(new Date(ev.completedAt)));
          }
        }
      }
      // Legacy fallback: completed flag with no event history.
      if (doneDates.size === 0 && task.completed && task.completedAt) {
        doneDates.add(localISODate(new Date(task.completedAt)));
      }
      const occurrenceId = `${day}:${task.id}`;
      for (const d of doneDates) markInto(weekDone, weekMondayOf(d), occurrenceId);
      // A completion wins over a missed mark for the same occurrence/week.
      for (const d of missedDates) {
        const wk = weekMondayOf(d);
        if (!(weekDone.get(wk)?.has(occurrenceId))) markInto(weekMissed, wk, occurrenceId);
      }
    }
  }

  // Weeks that finish before the schedule's tracking start are dropped: they
  // predate the user's adoption and would drag the average down with zeroes.
  const trackingStart = schedule.preferences?.startDate;

  const weeks: ExecutionWeek[] = [];
  for (let i = weeksCount - 1; i >= 0; i--) {
    const mon = new Date(currentMonday);
    mon.setDate(currentMonday.getDate() - i * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const monStr = localISODate(mon);
    // The current week always survives, so the trend is never empty even if
    // the tracking start is set to a future date.
    if (i !== 0 && trackingStart && localISODate(sun) < trackingStart) continue;
    const scheduled = scheduledInWeek(mon);
    const completed = Math.min(weekDone.get(monStr)?.size ?? 0, scheduled || Infinity);
    const missed = Math.min(weekMissed.get(monStr)?.size ?? 0, scheduled || Infinity);
    const pct = scheduled > 0 ? Math.min(100, Math.round((completed / scheduled) * 100)) : 0;
    weeks.push({
      monStr,
      sunStr: localISODate(sun),
      label: mon.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      completed,
      missed,
      scheduled,
      pct,
      isCurrentWeek: i === 0,
    });
  }

  const current = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2] ?? current;
  const averagePct = weeks.length > 0
    ? Math.round(weeks.reduce((s, w) => s + w.pct, 0) / weeks.length)
    : 0;
  const bestPct = weeks.reduce((m, w) => Math.max(m, w.pct), 0);
  const totalCompleted = weeks.reduce((s, w) => s + w.completed, 0);
  const totalMissed = weeks.reduce((s, w) => s + w.missed, 0);

  return {
    weeks,
    current,
    previous,
    deltaPct: current.pct - previous.pct,
    averagePct,
    bestPct,
    totalCompleted,
    totalMissed,
    currentMissed: current.missed,
    scheduled: current.scheduled,
  };
}

/**
 * One honest, motivating sentence summarizing the trend — or null when there's
 * no real signal (nothing scheduled / no completions yet), so the caller hides
 * the line. Earned, not gamified: it never invents momentum that isn't there.
 */
export function trendNarrative(trend: ExecutionTrend): string | null {
  const { weeks, current, previous, averagePct, bestPct, scheduled, totalCompleted } = trend;
  if (scheduled <= 0 || totalCompleted <= 0) return null;

  // Rises among the most recent four week-over-week transitions.
  const recent = weeks.slice(-5); // up to 5 weeks → 4 transitions
  let recentRises = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].pct > recent[i - 1].pct) recentRises++;
  }
  const minPct = weeks.reduce((m, w) => Math.min(m, w.pct), 100);

  if (current.pct === bestPct && current.pct > averagePct) {
    return `Best week in ${weeks.length} weeks.`;
  }
  if (recentRises >= 3) {
    return `Up ${recentRises} of the last 4 weeks.`;
  }
  if (current.pct >= 80 && previous.pct >= 80) {
    return "On a strong run.";
  }
  if (current.pct < averagePct && current.pct < previous.pct) {
    return "In a dip — you've bounced back before.";
  }
  if (bestPct - minPct <= 12 && current.pct > 0) {
    return "Steady rhythm.";
  }
  return null;
}
