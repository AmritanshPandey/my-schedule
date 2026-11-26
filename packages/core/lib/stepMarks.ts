/**
 * Keeping a step the same step everywhere it appears.
 *
 * A recurring task is several weekday copies under one id, and a one-off made
 * with "Continue on…" carries the same steps under a new id. Finishing a step
 * on any of them finishes it on all of them.
 */

import type { Schedule, Task } from "./scheduleTypes";
import type { ScheduleEntry } from "./scheduleEntry";
import { DAYS } from "./scheduleConstants";
import { isStepsTask, laterMark, stepDone, stepDoneOn, withMark } from "./subtaskMode";

/** The id shared by a task and everything that continues it. */
function chainId(task: Task): string {
  return task.continuesTaskId ?? task.id;
}

/** Give every copy of `taskId` (and its continuations) each step's latest mark. */
export function unifyStepMarks(schedule: Schedule, taskId: string): Schedule {
  let chain: string | null = null;
  for (const day of DAYS) {
    const hit = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
    if (hit) { chain = chainId(hit); break; }
  }
  if (chain === null) return schedule;

  const latest = new Map<string, ScheduleEntry["mark"]>();
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      if (chainId(task) !== chain || !isStepsTask(task)) continue;
      for (const entry of task.subtasks ?? []) {
        if (entry.mark) latest.set(entry.id, laterMark(latest.get(entry.id), entry.mark));
      }
    }
  }
  if (latest.size === 0) return schedule;

  let changed = false;
  const activities = { ...schedule.activities };
  for (const day of DAYS) {
    let dayChanged = false;
    const next = (schedule.activities[day] ?? []).map((task) => {
      if (chainId(task) !== chain || !isStepsTask(task)) return task;
      let taskChanged = false;
      const subtasks = (task.subtasks ?? []).map((entry) => {
        const mark = latest.get(entry.id);
        if (!mark || (entry.mark?.at === mark.at && entry.mark.done === mark.done)) return entry;
        taskChanged = true;
        return { ...entry, mark };
      });
      if (!taskChanged) return task;
      dayChanged = true;
      return { ...task, subtasks };
    });
    if (dayChanged) {
      activities[day] = next;
      changed = true;
    }
  }
  return changed ? { ...schedule, activities } : schedule;
}

/**
 * The task's steps with every finished one carrying a real mark, so a copy that
 * starts with an empty log still knows what was done.
 */
export function stepsWithMarks(task: Task): ScheduleEntry[] | undefined {
  return task.subtasks?.map((entry) => {
    if (entry.mark || !stepDone(task, entry)) return entry;
    return withMark(entry, true, new Date(`${stepDoneOn(task, entry)}T12:00:00`).toISOString());
  });
}
