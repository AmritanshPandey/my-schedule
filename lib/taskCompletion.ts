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
  type: "task" | "subtask" | "missed",
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

// Strip ALL of today's events whose type is in `types`.
function stripTodayEvents(
  history: TaskCompletionEvent[] | undefined,
  types: TaskCompletionEvent["completionType"][],
): TaskCompletionEvent[] {
  const today = localISODate(new Date());
  return (history ?? []).filter(
    (ev) => !(types.includes(ev.completionType) && localISODate(new Date(ev.completedAt)) === today)
  );
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

// ── State resolver ───────────────────────────────────────────────────────────

export type TaskState = "incomplete" | "partial" | "completed" | "missed";

export function resolveTaskState(task: Task, totalSubtasks: number): TaskState {
  if (isTaskCompleted(task, totalSubtasks)) return "completed";
  if (task.missed) return "missed";
  if (totalSubtasks > 0 && (task.completedSubtaskIds?.length ?? 0) > 0) return "partial";
  return "incomplete";
}

/** A task is "resolved" for the day once it's either done or explicitly missed. */
export function isTaskResolved(task: Task, totalSubtasks: number): boolean {
  return isTaskCompleted(task, totalSubtasks) || !!task.missed;
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
    // Completing clears a prior "missed" mark for today.
    missed: false,
    missedAt: undefined,
    completionHistory: [...stripTodayEvents(task.completionHistory, ["missed"]), event],
  };
}

// ── Mark task (and its subtasks) "missed" ────────────────────────────────────

/**
 * Toggle a whole-task "missed" mark for TODAY. Marking missed clears any
 * completion for today and records a missed event for the task + each subtask;
 * tapping again un-marks it.
 */
export function markTaskMissed(task: Task, allSubtaskIds: string[]): Partial<Task> {
  if (task.missed) {
    return {
      missed: false,
      missedAt: undefined,
      completionHistory: stripTodayEvents(task.completionHistory, ["missed"]),
    };
  }
  const cleared = stripTodayEvents(task.completionHistory, ["task", "subtask", "missed"]);
  const events: TaskCompletionEvent[] = [
    createCompletionEvent(task.id, "missed"),
    ...allSubtaskIds.map((sid) => createCompletionEvent(task.id, "missed", sid)),
  ];
  return {
    completed: false,
    completedAt: undefined,
    completedSubtaskIds: [],
    missed: true,
    missedAt: new Date().toISOString(),
    completionHistory: [...cleared, ...events],
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
      // Any progress clears a prior "missed" mark for today.
      missed: false,
      missedAt: undefined,
      completionHistory: [...stripTodayEvents(history, ["missed"]), ...events],
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

// ── Date-aware completion (viewing a day other than today) ───────────────────
// The live `completed`/`completedSubtaskIds` flags only describe TODAY's
// occurrence. For any other day we read the permanent `completionHistory`.

/** Derive a task's completion state for a specific date from its history. */
export function completionForDate(
  task: Task,
  dateISO: string
): { completed: boolean; completedSubtaskIds: string[]; missed: boolean } {
  const onDate = (task.completionHistory ?? []).filter(
    (e) => localISODate(new Date(e.completedAt)) === dateISO
  );
  const allSubIds = task.subtasks?.map((s) => s.id) ?? [];
  if (onDate.some((e) => e.completionType === "task")) {
    return { completed: true, completedSubtaskIds: allSubIds, missed: false };
  }
  const missed = onDate.some((e) => e.completionType === "missed" && !e.subtaskId);
  const subIds = Array.from(
    new Set(onDate.filter((e) => e.completionType === "subtask" && e.subtaskId).map((e) => e.subtaskId as string))
  );
  return {
    completed: allSubIds.length > 0 && subIds.length >= allSubIds.length,
    completedSubtaskIds: subIds,
    missed,
  };
}

function datedEvent(taskId: string, dateISO: string, type: "task" | "subtask", subtaskId?: string): TaskCompletionEvent {
  return { id: uid(), taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: type, subtaskId };
}

/** Toggle whole-task completion for a non-today date — history only. */
export function toggleTaskCompleteForDate(
  task: Task,
  allSubtaskIds: string[],
  dateISO: string
): Partial<Task> {
  const history = task.completionHistory ?? [];
  const onDate = (e: TaskCompletionEvent) => localISODate(new Date(e.completedAt)) === dateISO;
  const wasComplete = history.some((e) => e.completionType === "task" && onDate(e));
  if (wasComplete) {
    return { completionHistory: history.filter((e) => !onDate(e)) };
  }
  const events = [
    datedEvent(task.id, dateISO, "task"),
    ...allSubtaskIds.map((sid) => datedEvent(task.id, dateISO, "subtask", sid)),
  ];
  return { completionHistory: [...history, ...events] };
}

/** Toggle one subtask for a non-today date — history only. */
export function toggleSubtaskCompleteForDate(
  task: Task,
  subtaskId: string,
  totalSubtasks: number,
  dateISO: string
): Partial<Task> {
  const history = task.completionHistory ?? [];
  const onDate = (e: TaskCompletionEvent) => localISODate(new Date(e.completedAt)) === dateISO;
  const dayEvents = history.filter(onDate);
  const hasSub = dayEvents.some((e) => e.completionType === "subtask" && e.subtaskId === subtaskId);

  if (hasSub) {
    // Remove this subtask's event for the date + any auto-task event (no longer all-done).
    return {
      completionHistory: history.filter(
        (e) => !(onDate(e) && ((e.completionType === "subtask" && e.subtaskId === subtaskId) || e.completionType === "task"))
      ),
    };
  }

  const doneSubs = new Set(dayEvents.filter((e) => e.completionType === "subtask" && e.subtaskId).map((e) => e.subtaskId as string));
  doneSubs.add(subtaskId);
  const add = [datedEvent(task.id, dateISO, "subtask", subtaskId)];
  if (totalSubtasks > 0 && doneSubs.size >= totalSubtasks && !dayEvents.some((e) => e.completionType === "task")) {
    add.push(datedEvent(task.id, dateISO, "task"));
  }
  return { completionHistory: [...history, ...add] };
}
