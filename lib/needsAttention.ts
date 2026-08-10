/**
 * What slipped — the things the app would have told you about if it could.
 *
 * PlanR has no push notifications, so it can never reach out in the moment a
 * deadline passes or a task goes unmarked. Overview is the only re-engagement
 * surface there is, which means it has to answer "what did I let slip?" the
 * moment it opens. This module computes that, and nothing else surfaces it.
 *
 * Deliberately excludes today: today's misses are already visible, and styled
 * as missed, in the Today's Task card. Repeating them here would read as
 * nagging rather than catching the user up.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { Milestone, Plan, Ritual, Schedule, Task, DayKey } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { localISODate } from "./dateUtils";
import { resolveMilestoneStatus } from "./roadmapDates";

/** How far back a missed task still counts as worth catching up on. */
export const MISSED_LOOKBACK_DAYS = 7;

export interface OverdueMilestone {
  milestone: Milestone;
  plan: Plan | null;
  /** Whole days past `plannedEndDate`, always >= 1. */
  daysOverdue: number;
}

export interface MissedTask {
  task: Task;
  plan: Plan | null;
  /** ISO date of the occurrence that was marked missed. */
  dateISO: string;
  /** Whole days ago, always >= 1 (today is excluded). */
  daysAgo: number;
}

export interface AtRiskRitual {
  ritual: Ritual;
  /** Consecutive days completed up to yesterday; only >= 2 is worth naming. */
  streak: number;
}

export interface NeedsAttention {
  /** Still savable today — listed first for exactly that reason. */
  atRiskRituals: AtRiskRitual[];
  overdueMilestones: OverdueMilestone[];
  missedTasks: MissedTask[];
  /** Combined count — the card renders only when this is > 0. */
  total: number;
}

/** Minimum run before losing it is worth interrupting someone over. */
export const MIN_STREAK_TO_WARN = 2;

/** Consecutive completions ending yesterday. Today is deliberately excluded —
 *  a streak is only "at risk" because today has not happened yet. */
function ritualStreak(ritualId: string, completions: readonly { ritualId: string; date: string }[], yesterdayISO: string): number {
  const done = new Set(completions.filter((c) => c.ritualId === ritualId).map((c) => c.date));
  let streak = 0;
  let cursor = yesterdayISO;
  while (done.has(cursor)) {
    streak++;
    cursor = shiftISO(cursor, -1);
  }
  return streak;
}

/** Whole days between two ISO dates (b - a), via UTC noon to dodge DST. */
function daysBetweenISO(a: string, b: string): number {
  const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

export function selectNeedsAttention(
  schedule: Schedule,
  todayISO: string,
  todayKey?: DayKey,
  completedRitualIds: ReadonlySet<string> = new Set(),
): NeedsAttention {
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));

  // ── Rituals whose run ends tonight unless acted on ───────────────────────
  const yesterdayISO = shiftISO(todayISO, -1);
  const atRiskRituals: AtRiskRitual[] = (schedule.rituals ?? [])
    .filter((r) => {
      const dueToday = !r.repeatDays || r.repeatDays.length === 0 || (todayKey ? r.repeatDays.includes(todayKey) : true);
      return dueToday && !completedRitualIds.has(r.id);
    })
    .map((ritual) => ({ ritual, streak: ritualStreak(ritual.id, schedule.ritualCompletions ?? [], yesterdayISO) }))
    .filter(({ streak }) => streak >= MIN_STREAK_TO_WARN)
    .sort((a, b) => b.streak - a.streak);

  // ── Overdue milestones ───────────────────────────────────────────────────
  // resolveMilestoneStatus is the same helper the roadmap uses, so a milestone
  // can never read "delayed" here and something else on the plan page.
  const overdueMilestones: OverdueMilestone[] = (schedule.milestones ?? [])
    .filter((m) => resolveMilestoneStatus(m, todayISO) === "delayed")
    .map((milestone) => ({
      milestone,
      plan: plansById.get(milestone.planId) ?? null,
      daysOverdue: daysBetweenISO(milestone.plannedEndDate, todayISO),
    }))
    .filter((row) => row.daysOverdue >= 1)
    // Most overdue first: the thing that has been slipping longest is the thing
    // most worth naming.
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  // ── Recently missed tasks ────────────────────────────────────────────────
  // "Missed" lives in completionHistory as a dated event, so this reads real
  // occurrences rather than the task template's live `missed` flag (which only
  // ever describes today).
  const cutoff = shiftISO(todayISO, -MISSED_LOOKBACK_DAYS);
  const seen = new Set<string>();
  // Misses the user has handled (dismissed or rescheduled) — hidden here, but
  // their "missed" history event stays, so analytics remain accurate.
  const acknowledged = new Set(schedule.preferences?.acknowledgedMisses ?? []);
  const missedTasks: MissedTask[] = [];

  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      for (const event of task.completionHistory ?? []) {
        if (event.completionType !== "missed" || event.subtaskId) continue;
        const dateISO = localISODate(new Date(event.completedAt));
        if (dateISO >= todayISO || dateISO < cutoff) continue;
        // A recurring task shares one id across weekday buckets, so the same
        // event would otherwise be counted once per bucket it appears in.
        const key = `${task.id}|${dateISO}`;
        if (seen.has(key) || acknowledged.has(key)) continue;
        seen.add(key);
        missedTasks.push({
          task,
          plan: task.planId ? plansById.get(task.planId) ?? null : null,
          dateISO,
          daysAgo: daysBetweenISO(dateISO, todayISO),
        });
      }
    }
  }

  // Most recent first — the closer it is, the more recoverable it feels.
  missedTasks.sort((a, b) => a.daysAgo - b.daysAgo || a.task.title.localeCompare(b.task.title));

  return {
    atRiskRituals,
    overdueMilestones,
    missedTasks,
    total: atRiskRituals.length + overdueMilestones.length + missedTasks.length,
  };
}

/** "yesterday" / "3 days ago" — the card reads as prose, not as a date log. */
export function formatDaysAgo(days: number): string {
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "1 day over" / "5 days over" — compact enough for a trailing pill. */
export function formatDaysOverdue(days: number): string {
  return days === 1 ? "1 day over" : `${days} days over`;
}
