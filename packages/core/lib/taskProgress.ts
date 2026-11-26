/**
 * How much of an occurrence got done — the one place a tick becomes a score.
 *
 * "4 of 5" is 80% of that occurrence, not a miss. The trend, the week card and
 * the pattern engine all read the outcomes built here, so they can't disagree
 * with each other about the same day.
 *
 * - Done (or every block, or every checklist item) → 1
 * - Checklist → the share that was ticked
 * - Split across the day → the share of its blocks
 * - Repeating Steps → 1 once any step was finished that day, else 0
 * - One-off Steps → the share of its steps
 *
 * Pure and React-free.
 */

import type { Plan, Schedule, Task, TaskCompletionEvent } from "./scheduleTypes";
import { DAYS, type DayKey } from "./scheduleConstants";
import { localISODate } from "./dateUtils";
import { completionForDate, getTaskCheckableItems, isTrackedTask } from "./taskCompletion";
import { getSlots } from "./taskMutations";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isOneOffTask, isStepsTask, oneOffStepsProgress } from "./subtaskMode";

export interface OccurrenceProgress {
  state: "done" | "partial" | "missed" | "open";
  /** 0 to 1. */
  credit: number;
  /** What the share is made of: items, blocks or steps. */
  done: number;
  total: number;
}

const round = (done: number, total: number) => (total > 0 ? Math.min(1, done / total) : 0);

/** One occurrence's outcome, from its permanent log (and, for Steps, its marks). */
export function occurrenceProgress(task: Task, plan: Plan | null, dateISO: string): OccurrenceProgress {
  const state = completionForDate(task, dateISO);
  const slots = getSlots(task).length;

  let done: number;
  let total: number;
  if (slots > 1) {
    done = state.completedSlotIndices.filter((i) => i < slots).length;
    total = slots;
  } else if (isStepsTask(task)) {
    ({ done, total } = isOneOffTask(task) ? oneOffStepsProgress(task, dateISO) : { done: state.completedSubtaskIds.length, total: task.subtasks?.length ?? 0 });
  } else {
    const items = getTaskCheckableItems(task, plan);
    const ids = new Set(items.map((i) => i.id));
    done = state.completedSubtaskIds.filter((id) => ids.has(id)).length;
    total = items.length;
    // What the list looked like when the day closed, if that was recorded.
    const stored = (task.completionHistory ?? []).find(
      (e) => e.completionType === "missed" && e.credit && localISODate(new Date(e.completedAt)) === dateISO,
    )?.credit;
    if (stored) ({ done, total } = stored);
    // Items deleted since: what was ticked still happened.
    else if (done < state.completedSubtaskIds.length) {
      done = state.completedSubtaskIds.length;
      total = Math.max(total, done + 1);
    }
  }

  if (state.completed) return { state: "done", credit: 1, done: total, total };
  if (state.partial && done > 0) {
    const credit = round(done, total);
    return { state: credit >= 1 ? "done" : "partial", credit, done, total };
  }
  const missed = state.missed || state.missedSlotIndices.length > 0 || hasMiss(task, dateISO);
  return { state: missed ? "missed" : "open", credit: 0, done: 0, total };
}

function hasMiss(task: Task, dateISO: string): boolean {
  return (task.completionHistory ?? []).some(
    (e) => e.completionType === "missed" && !e.subtaskId && localISODate(new Date(e.completedAt)) === dateISO,
  );
}

export function occurrenceKey(taskId: string, dateISO: string): string {
  return `${taskId}|${dateISO}`;
}

function weekdayOf(dateISO: string): DayKey {
  return DAYS[(new Date(`${dateISO}T12:00:00`).getDay() + 6) % 7];
}

/**
 * Every occurrence anything was recorded on, keyed by task and date. A
 * recurring task's weekday copies share one id and may share one log, so their
 * events are pooled: each occurrence counts once however many copies hold it.
 */
export function collectOccurrences(schedule: Pick<Schedule, "activities" | "plans" | "preferences">): Map<string, OccurrenceProgress> {
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const trackingStart = schedule.preferences?.startDate;
  const groups = new Map<string, { copies: Map<DayKey, Task>; events: Map<string, TaskCompletionEvent> }>();

  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      if (!isTrackedTask(task)) continue;
      let group = groups.get(task.id);
      if (!group) groups.set(task.id, (group = { copies: new Map(), events: new Map() }));
      if (!group.copies.has(day)) group.copies.set(day, task);
      for (const e of task.completionHistory ?? []) {
        if (!e.completedAt) continue;
        group.events.set(`${e.id}|${e.completionType}|${e.completedAt}|${e.slotIndex ?? ""}|${e.subtaskId ?? ""}`, e);
      }
    }
  }

  const out = new Map<string, OccurrenceProgress>();
  for (const [taskId, { copies, events }] of groups) {
    const byDate = new Map<string, TaskCompletionEvent[]>();
    for (const e of events.values()) {
      const dateISO = localISODate(new Date(e.completedAt));
      if (trackingStart && dateISO < trackingStart) continue;
      const list = byDate.get(dateISO);
      if (list) list.push(e);
      else byDate.set(dateISO, [e]);
    }
    const first = copies.values().next().value as Task;
    const plan = first.planId ? plansById.get(first.planId) ?? null : null;
    // Only a one-off's log can be the record of its steps, so only it needs all of it.
    const needsFullLog = isOneOffTask(first) && isStepsTask(first);
    const all = needsFullLog ? [...events.values()] : null;

    for (const [dateISO, dayEvents] of byDate) {
      const copy = copies.get(weekdayOf(dateISO));
      const task: Task = { ...(copy ?? first), completionHistory: all ?? dayEvents };
      const progress = occurrenceProgress(task, plan, dateISO);
      // A tick after midnight belongs to no scheduled day: a whole completion
      // still counts as one, part of one doesn't.
      if (progress.state === "partial" && !(copy && isTaskScheduledOn(copy, dateISO, true, trackingStart))) continue;
      if (progress.state !== "open") out.set(occurrenceKey(taskId, dateISO), progress);
    }
  }
  return out;
}
