/**
 * Checklist or Steps — what a subtask's tick means.
 *
 * - **Checklist**: starts fresh every occurrence (a gym session, a grocery run).
 *   Ticks live in `Task.completedSubtaskIds` and are cleared each day.
 * - **Steps**: one-time work that stays done and carries forward (a portfolio,
 *   a course). Each step's state lives on the step itself, in
 *   `ScheduleEntry.mark`, because the cloud payload trims completion history to
 *   90 days and a finished step has to outlive that.
 *
 * In a Steps task `completedSubtaskIds` still exists, but only as "ticked
 * today" — what the any-step rule reads. Never read it as the list of finished
 * steps; that is `doneSubtaskIds`.
 *
 * Pure and dependency-light: everything that reasons about a tick sits on top.
 */

import type { Task } from "./scheduleTypes";
import type { ScheduleEntry } from "./scheduleEntry";
import { localISODate } from "./dateUtils";

export type SubtaskMode = "checklist" | "steps";

export function isOneOffTask(task: Pick<Task, "recurrence">): boolean {
  return task.recurrence?.type === "once";
}

/** What a task defaults to when the user hasn't chosen. */
export function defaultSubtaskMode(oneOff: boolean): SubtaskMode {
  return oneOff ? "steps" : "checklist";
}

/**
 * The mode a task is actually in. Sessions run in order every time and
 * commitments have nothing to tick, so both are always a checklist — as is a
 * task with no subtasks of its own, whose items belong to the plan's template.
 */
export function subtaskModeOf(task: Pick<Task, "taskType" | "subtasks" | "subtaskMode" | "recurrence">): SubtaskMode {
  if (task.taskType === "session" || task.taskType === "commitment") return "checklist";
  if (!task.subtasks?.length) return "checklist";
  return task.subtaskMode ?? defaultSubtaskMode(isOneOffTask(task));
}

export function isStepsTask(task: Pick<Task, "taskType" | "subtasks" | "subtaskMode" | "recurrence">): boolean {
  return subtaskModeOf(task) === "steps";
}

/**
 * Whether a step is finished. A one-off from before marks existed has none, so
 * its own log is the fallback — a deliberate mark always wins over it.
 */
export function stepDone(task: Task, entry: ScheduleEntry): boolean {
  if (entry.mark) return entry.mark.done;
  if (!isOneOffTask(task)) return false;
  return (task.completionHistory ?? []).some((e) => e.completionType === "subtask" && e.subtaskId === entry.id);
}

/** The local date a step was finished, or null when it isn't. */
export function stepDoneOn(task: Task, entry: ScheduleEntry): string | null {
  if (entry.mark) return entry.mark.done ? localISODate(new Date(entry.mark.at)) : null;
  if (!isOneOffTask(task)) return null;
  const event = (task.completionHistory ?? []).find((e) => e.completionType === "subtask" && e.subtaskId === entry.id);
  return event ? localISODate(new Date(event.completedAt)) : null;
}

/** The subtasks to show as ticked: today's for a checklist, finished ones for Steps. */
export function doneSubtaskIds(task: Task): string[] {
  if (!isStepsTask(task)) return task.completedSubtaskIds ?? [];
  return (task.subtasks ?? []).filter((entry) => stepDone(task, entry)).map((entry) => entry.id);
}

export function allStepsDone(task: Task): boolean {
  const steps = task.subtasks ?? [];
  return steps.length > 0 && steps.every((entry) => stepDone(task, entry));
}

/**
 * How far a one-off Steps task had got by the end of `dateISO`. A catch-up copy
 * doesn't get credit for what was finished before its own day: that work was
 * already counted on the occurrence it continues.
 */
export function oneOffStepsProgress(task: Task, dateISO: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const entry of task.subtasks ?? []) {
    const on = stepDoneOn(task, entry);
    if (task.continuesTaskId && on !== null && on < dateISO) continue;
    total++;
    if (on !== null && on <= dateISO) done++;
  }
  return { done, total };
}

/** A copy of `entry` marked done or not done at `nowISO`. */
export function withMark(entry: ScheduleEntry, done: boolean, nowISO: string): ScheduleEntry {
  return { ...entry, mark: { done, at: nowISO } };
}

/** `entry` as if nobody had ever ticked it. */
export function withoutMark(entry: ScheduleEntry): ScheduleEntry {
  if (!entry.mark) return entry;
  const { mark: _mark, ...rest } = entry;
  void _mark;
  return rest;
}

/** Clear every step mark on a task — duplicates and "clear progress". */
export function clearStepMarks<T extends Pick<Task, "subtasks">>(task: T): T {
  if (!task.subtasks?.some((entry) => entry.mark)) return task;
  return { ...task, subtasks: task.subtasks.map(withoutMark) };
}

/**
 * Merge two replicas' marks for one step: the later one wins, so two devices
 * ticking different steps offline both keep their tick. An exact tie goes to
 * done, which both sides compute the same way.
 */
export function laterMark(a: ScheduleEntry["mark"], b: ScheduleEntry["mark"]): ScheduleEntry["mark"] {
  if (!a) return b;
  if (!b) return a;
  const at = Date.parse(a.at);
  const bt = Date.parse(b.at);
  if (at !== bt) return at > bt ? a : b;
  if (a.done !== b.done) return a.done ? a : b;
  return a;
}
