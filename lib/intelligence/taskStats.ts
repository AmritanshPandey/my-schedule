/**
 * Per-task execution record — the raw material every pattern detector reads.
 *
 * lib/slotReliability.ts aggregates outcomes by time band and weekday across
 * the whole schedule. That answers "when does this person execute". Spotting
 * a task that keeps slipping needs the same outcomes kept per task instead,
 * which is all this module does.
 *
 * It inherits slotReliability's rules for what counts as evidence, for the
 * same reasons:
 *  - Only resolved occurrences (done or missed). An unmarked occurrence may be
 *    a day the app simply wasn't opened, and counting silence as failure would
 *    measure app usage, not execution.
 *  - Today is excluded — a task still ahead of you is not a miss.
 *  - Commitments, paused plans and days before tracking began are skipped.
 *  - The time comes from the slot the work was SCHEDULED into (honouring
 *    per-date retiming), never from `completedAt`, which records when a box
 *    was ticked rather than when the work happened.
 *
 * One addition: `sinceByTask`. When the user accepts a suggestion that changes
 * a task (moving or shortening it), outcomes before that change describe a
 * different arrangement. Feeding them back in would flag the task again the
 * moment it was fixed. The change starts a fresh experiment.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { DayKey, Plan, Schedule, Task, TaskCompletionEvent } from "../useScheduleDB";
import { DAYS } from "../scheduleConstants";
import { isPlanRunning } from "../planLifecycle";
import { isTrackedTask, completionForDate } from "../taskCompletion";
import { getSlots } from "../taskMutations";
import { isTaskScheduledOn, resolveOccurrence } from "../taskOccurrence";
import { localISODate, addDaysToISO } from "../dateUtils";
import { parseTimeToMinutes } from "../timeUtils";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** Four weeks: enough to see a pattern in a weekly task, recent enough to
 *  describe the life the user is living now. */
export const PATTERN_LOOKBACK_DAYS = 28;

/** Below this many resolved occurrences a task's rate is anecdote, not pattern. */
export const MIN_TASK_SAMPLES = 4;

/** "Still happening" is judged on this many most recent outcomes. */
export const RECENT_WINDOW = 3;

// ── Types ────────────────────────────────────────────────────────────────────

export interface OccurrenceOutcome {
  dateISO: string;
  weekday: DayKey;
  done: boolean;
  /** Scheduled start, minutes from midnight. Null when the slot has no time. */
  startMinutes: number | null;
}

export interface WeekdayTally {
  resolved: number;
  completed: number;
}

export interface TaskExecutionStats {
  taskId: string;
  /** The first weekday copy — what the editor would open. */
  task: Task;
  plan: Plan | null;
  /** Resolved outcomes in the window, oldest first. */
  outcomes: OccurrenceOutcome[];
  resolved: number;
  completed: number;
  /** completed / resolved, or null below MIN_TASK_SAMPLES. */
  rate: number | null;
  /** Consecutive completions ending at the most recent outcome. */
  currentRun: number;
  /** Misses among the RECENT_WINDOW most recent outcomes. */
  recentMisses: number;
  byWeekday: Partial<Record<DayKey, WeekdayTally>>;
  /** Weekday buckets the task currently lives in. */
  days: DayKey[];
  /** Whole-task length across every slot, in minutes. */
  durationMinutes: number;
  /**
   * Every weekday copy is one block at the same time — the only shape a
   * suggestion may retime or resize in one step. Multi-phase tasks and tasks
   * with custom per-day times are left to the editor.
   */
  adjustable: boolean;
}

export interface TaskStatsOptions {
  lookbackDays?: number;
  /** Ignore outcomes before this ISO date, per task id — see the header. */
  sinceByTask?: ReadonlyMap<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function weekdayOf(dateISO: string): DayKey {
  return DAYS[(new Date(`${dateISO}T12:00:00`).getDay() + 6) % 7];
}

function slotLength(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
}

export function taskDurationMinutes(task: Pick<Task, "startTime" | "endTime" | "slots">): number {
  return getSlots(task).reduce((sum, slot) => sum + slotLength(slot.startTime, slot.endTime), 0);
}

interface TaskGroup {
  copies: Map<DayKey, Task>;
  events: TaskCompletionEvent[];
  eventIds: Set<string>;
}

/**
 * Every weekday copy of each task, with their completion events merged. A
 * recurring task shares one id across buckets and each copy keeps its own log,
 * so a date's outcome may sit on a copy other than that weekday's.
 */
function groupTasks(schedule: Pick<Schedule, "activities">): Map<string, TaskGroup> {
  const groups = new Map<string, TaskGroup>();
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      let group = groups.get(task.id);
      if (!group) {
        group = { copies: new Map(), events: [], eventIds: new Set() };
        groups.set(task.id, group);
      }
      if (!group.copies.has(day)) group.copies.set(day, task);
      for (const event of task.completionHistory ?? []) {
        const key = event.id || `${event.completionType}|${event.completedAt}|${event.slotIndex ?? ""}|${event.subtaskId ?? ""}`;
        if (group.eventIds.has(key)) continue;
        group.eventIds.add(key);
        group.events.push(event);
      }
    }
  }
  return groups;
}

// ── The model ────────────────────────────────────────────────────────────────

export function computeTaskStats(
  schedule: Schedule,
  now: Date = new Date(),
  options: TaskStatsOptions = {},
): TaskExecutionStats[] {
  const lookbackDays = options.lookbackDays ?? PATTERN_LOOKBACK_DAYS;
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const trackingStart = schedule.preferences?.startDate;
  const todayISO = localISODate(now);
  const out: TaskExecutionStats[] = [];

  for (const [taskId, group] of groupTasks(schedule)) {
    const first = group.copies.values().next().value as Task;
    if (!isTrackedTask(first)) continue;
    const plan = first.planId ? plansById.get(first.planId) ?? null : null;
    if (first.planId && !isPlanRunning(plan ?? undefined)) continue;

    const since = options.sinceByTask?.get(taskId);
    const outcomes: OccurrenceOutcome[] = [];

    for (let i = 1; i <= lookbackDays; i++) {
      const dateISO = addDaysToISO(todayISO, -i);
      if (trackingStart && dateISO < trackingStart) break;
      if (since && dateISO < since) break;
      const weekday = weekdayOf(dateISO);
      const copy = group.copies.get(weekday);
      if (!copy || !isTaskScheduledOn(copy, dateISO, true, trackingStart)) continue;

      const state = completionForDate({ ...copy, completionHistory: group.events }, dateISO);
      if (!state.completed && !state.missed) continue;

      const slot = getSlots(resolveOccurrence(copy, dateISO))[0];
      outcomes.push({
        dateISO,
        weekday,
        done: state.completed,
        startMinutes: parseTimeToMinutes(slot?.startTime ?? ""),
      });
    }

    outcomes.reverse(); // walked newest-first; callers read oldest-first

    const completed = outcomes.filter((o) => o.done).length;
    const byWeekday: Partial<Record<DayKey, WeekdayTally>> = {};
    for (const o of outcomes) {
      const tally = (byWeekday[o.weekday] ??= { resolved: 0, completed: 0 });
      tally.resolved += 1;
      if (o.done) tally.completed += 1;
    }

    let currentRun = 0;
    for (let i = outcomes.length - 1; i >= 0 && outcomes[i].done; i--) currentRun++;

    out.push({
      taskId,
      task: first,
      plan,
      outcomes,
      resolved: outcomes.length,
      completed,
      rate: outcomes.length >= MIN_TASK_SAMPLES ? completed / outcomes.length : null,
      currentRun,
      recentMisses: outcomes.slice(-RECENT_WINDOW).filter((o) => !o.done).length,
      byWeekday,
      days: [...group.copies.keys()],
      durationMinutes: taskDurationMinutes(first),
      adjustable: [...group.copies.values()].every(
        (copy) => getSlots(copy).length === 1 && copy.startTime === first.startTime && copy.endTime === first.endTime,
      ),
    });
  }

  return out;
}
