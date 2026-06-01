/**
 * Shared task completion utilities.
 *
 * All completion logic lives here so Timeline, List, and Plan views
 * derive state from the same deterministic functions. Do NOT duplicate
 * these calculations in components.
 */

import type { Task, TaskCompletionEvent } from "./useScheduleDB";
import { uid } from "./taskMutations";
import { localISODate } from "./dateUtils";

// Drop today's whole-task completion events so unchecking actually reverses
// progress in the append-only history (keeps prior days' history intact).
function stripTodayTaskEvents(history: TaskCompletionEvent[] | undefined): TaskCompletionEvent[] {
  const today = localISODate(new Date());
  return (history ?? []).filter(
    (ev) => !(ev.completionType === "task" && localISODate(new Date(ev.completedAt)) === today)
  );
}

// ── Event factory ────────────────────────────────────────────────────────────

export function createCompletionEvent(
  taskId: string,
  type: "task" | "subtask",
  subtaskId?: string
): TaskCompletionEvent {
  return {
    id: uid(),
    taskId,
    completedAt: new Date().toISOString(),
    completionType: type,
    subtaskId,
  };
}

// ── Progress calculation ─────────────────────────────────────────────────────

export interface TaskProgress {
  completedCount: number;
  totalCount: number;
  pct: number;
}

/**
 * Derives completion progress from task state + the total number of subtasks.
 * totalSubtasks = 0 means the task has no subtasks (binary complete/incomplete).
 */
export function calculateTaskProgress(task: Task, totalSubtasks: number): TaskProgress {
  if (totalSubtasks === 0) {
    const done = task.completed ? 1 : 0;
    return { completedCount: done, totalCount: 1, pct: done * 100 };
  }
  const ids = task.completedSubtaskIds ?? [];
  const completedCount = Math.min(ids.length, totalSubtasks);
  const pct = Math.round((completedCount / totalSubtasks) * 100);
  return { completedCount, totalCount: totalSubtasks, pct };
}

// ── Completion predicate ─────────────────────────────────────────────────────

export function isTaskCompleted(task: Task, totalSubtasks: number): boolean {
  if (totalSubtasks === 0) return !!task.completed;
  return (task.completedSubtaskIds?.length ?? 0) >= totalSubtasks;
}

// ── Three-state resolver ─────────────────────────────────────────────────────

export type TaskState = "incomplete" | "partial" | "completed";

export function resolveTaskState(task: Task, totalSubtasks: number): TaskState {
  if (isTaskCompleted(task, totalSubtasks)) return "completed";
  if (totalSubtasks > 0 && (task.completedSubtaskIds?.length ?? 0) > 0) return "partial";
  return "incomplete";
}

// ── Toggle task (whole task) ─────────────────────────────────────────────────

/**
 * Returns the Task fields that should be merged after toggling whole-task
 * completion. Does NOT mutate the original task.
 *
 * Behaviour:
 * - If currently completed → clear all completion fields (uncomplete)
 * - If not completed → mark complete, mark all subtasks done, append event
 */
export function toggleTaskComplete(
  task: Task,
  allSubtaskIds: string[]
): Partial<Task> {
  const wasComplete = isTaskCompleted(task, allSubtaskIds.length);
  const now = new Date().toISOString();

  if (wasComplete) {
    return {
      completed: false,
      completedAt: undefined,
      completedSubtaskIds: [],
      completionHistory: stripTodayTaskEvents(task.completionHistory),
    };
  }

  const event = createCompletionEvent(task.id, "task");
  return {
    completed: true,
    completedAt: now,
    completedSubtaskIds: allSubtaskIds,
    completionHistory: [...(task.completionHistory ?? []), event],
  };
}

// ── Toggle individual subtask ────────────────────────────────────────────────

/**
 * Returns the Task fields to merge after toggling one subtask.
 *
 * Behaviour:
 * - Toggles the subtask ID in completedSubtaskIds
 * - Auto-completes the task if all subtasks are now done
 * - Auto-uncompletes the task if any subtask is undone
 * - Appends completion events for subtask (and auto-task) when marking done
 */
export function toggleSubtaskComplete(
  task: Task,
  subtaskId: string,
  totalSubtasks: number
): Partial<Task> {
  const current = task.completedSubtaskIds ?? [];
  const isDone = current.includes(subtaskId);
  const next = isDone
    ? current.filter((id) => id !== subtaskId)
    : [...current, subtaskId];

  const allNowDone = totalSubtasks > 0 && next.length >= totalSubtasks;
  const now = new Date().toISOString();
  const history = task.completionHistory ?? [];

  if (!isDone) {
    // Marking subtask complete
    const events: TaskCompletionEvent[] = [
      createCompletionEvent(task.id, "subtask", subtaskId),
    ];
    if (allNowDone) {
      events.push(createCompletionEvent(task.id, "task"));
    }
    return {
      completedSubtaskIds: next,
      completed: allNowDone,
      completedAt: allNowDone ? now : undefined,
      completionHistory: [...history, ...events],
    };
  }

  // Marking subtask incomplete — also drop today's auto-task completion event
  return {
    completedSubtaskIds: next,
    completed: false,
    completedAt: undefined,
    completionHistory: stripTodayTaskEvents(history),
  };
}
