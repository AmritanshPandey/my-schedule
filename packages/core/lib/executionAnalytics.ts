/**
 * Execution analytics — weekly task-completion trend.
 *
 * Derives an N-week (default 8) completion-rate series from the append-only
 * task completion log. One source of truth for the Overview + Review trend.
 *
 * Method & honest limitations:
 * - `completed` for a week = the number of *distinct* occurrences (task id +
 *   date) with a whole-task completion (`completionType === "task"`) dated in
 *   that week. A task toggled done several times on a day counts once, and a
 *   log shared by a task's weekday copies counts once, not once per copy.
 * - `partial` = occurrences with some of it done. They add their share to `pct`
 *   ("4 of 5" is 80% of one task) and are never counted as missed.
 * - `missed` = distinct occurrences with a dated miss and nothing done, capped so
 *   `completed + partial + missed` never exceeds `scheduled`.
 * - Nothing dated before the tracking start (`preferences.startDate`) counts.
 * - `scheduled` = the current count of scheduled tasks across all weekday
 *   buckets. The data model stores recurring weekday templates with no history,
 *   so we cannot reconstruct what the schedule looked like weeks ago — every
 *   week is measured against today's task set. This is the one approximation.
 */

import type { Schedule } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { localISODate } from "./dateUtils";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isTrackedTask } from "./taskCompletion";
import { collectOccurrences, occurrenceKey } from "./taskProgress";

export interface ExecutionWeek {
  monStr: string;        // ISO date of that week's Monday
  sunStr: string;        // ISO date of that week's Sunday
  label: string;         // "May 12"
  completed: number;     // distinct tasks completed that week
  partial: number;       // occurrences partly done, once their day was over
  missed: number;        // occurrences with nothing done (auto or manual)
  scheduled: number;     // scheduled tasks per week (current schedule)
  pct: number;           // 0..100, clamped; a partly done task adds its share
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
  currentPartial: number; // tasks partly done this week
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
  // Settings → Tracking → "Tracking starts": nothing before it counts — not
  // its scheduled days, and not done or missed events dated before it.
  const trackingStart = schedule.preferences?.startDate;

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
        if (isTaskScheduledOn(task, dateISO, true, trackingStart) && isTrackedTask(task)) count++;
      }
    }
    return count;
  };

  // An occurrence is a task on a date; lib/taskProgress.ts counts each once
  // however many weekday copies hold it, and gives a partly done one its share.
  const weekMondayOf = (iso: string): string => localISODate(mondayOf(new Date(iso + "T00:00:00")));
  const todayISO = localISODate(today);
  interface Tally { completed: number; missed: number; partial: number; partialCredit: number }
  const byWeek = new Map<string, Tally>();
  const tally = (dateISO: string): Tally => {
    const wk = weekMondayOf(dateISO);
    let t = byWeek.get(wk);
    if (!t) byWeek.set(wk, (t = { completed: 0, missed: 0, partial: 0, partialCredit: 0 }));
    return t;
  };
  const occurrences = collectOccurrences(schedule);
  for (const [key, { state, credit }] of occurrences) {
    const dateISO = key.slice(key.lastIndexOf("|") + 1);
    const t = tally(dateISO);
    if (state === "done") t.completed++;
    else if (state === "missed") t.missed++;
    else {
      // Today's share counts as it grows, but today isn't "partly done" yet.
      t.partialCredit += credit;
      if (dateISO < todayISO) t.partial++;
    }
  }
  // Legacy fallback: completed flag with no event history.
  const legacyDone = new Set<string>();
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      if (!isTrackedTask(task) || !task.completed || !task.completedAt) continue;
      if ((task.completionHistory ?? []).some((e) => e.completionType === "task")) continue;
      const dateISO = localISODate(new Date(task.completedAt));
      const key = occurrenceKey(task.id, dateISO);
      if ((trackingStart && dateISO < trackingStart) || legacyDone.has(key)) continue;
      legacyDone.add(key);
      const seen = occurrences.get(key);
      if (seen?.state === "done") continue;
      const t = tally(dateISO);
      t.completed++;
      if (seen?.state === "missed") t.missed--;
      if (seen?.state === "partial") {
        t.partialCredit -= seen.credit;
        if (dateISO < todayISO) t.partial--;
      }
    }
  }

  // Weeks that finish before the schedule's tracking start are dropped: they
  // predate the user's adoption and would drag the average down with zeroes.

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
    const t = byWeek.get(monStr) ?? { completed: 0, missed: 0, partial: 0, partialCredit: 0 };
    // Done + partial + missed can never exceed what was scheduled.
    const cap = scheduled || Infinity;
    const completed = Math.min(t.completed, cap);
    const partial = Math.min(t.partial, Math.max(0, cap - completed));
    const missed = Math.min(t.missed, Math.max(0, cap - completed - partial));
    const credit = Math.min(completed + t.partialCredit, cap);
    const pct = scheduled > 0 ? Math.min(100, Math.round((credit / scheduled) * 100)) : 0;
    weeks.push({
      monStr,
      sunStr: localISODate(sun),
      label: mon.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      completed,
      partial,
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
    currentPartial: current.partial,
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
