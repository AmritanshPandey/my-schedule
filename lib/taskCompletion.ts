/**
 * Shared task completion utilities.
 *
 * All completion logic lives here so Timeline, List, and Plan views
 * derive state from the same deterministic functions. Do NOT duplicate
 * these calculations in components.
 */

import type { Task, TaskCompletionEvent, Plan } from "./useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { uid } from "./id";
import { localISODate } from "./dateUtils";
import { parseTimeToMinutes, currentMinutes } from "./timeUtils";
import { minutesToDisplayTime } from "./timeline/dragTimeUtils";
import { getSlots } from "./taskMutations";

/** True when a task has more than one time slot — the multi-phase-same-day case. */
export function isMultiSlot(task: Task): boolean {
  return getSlots(task).length > 1;
}

/**
 * Whether this task participates in execution tracking.
 *
 * A "commitment" is held time (commute, fixed office hours): it blocks the
 * calendar and renders on the timeline like anything else, but it has no
 * checkbox and must not appear in any statistic — completion %, streaks,
 * consistency, or remaining workload.
 *
 * Use this at every site that counts task ROWS toward a denominator. The
 * numerators need no guard: a commitment has no checkbox, so it never emits a
 * completion event, so every history-driven "done" figure already ignores it.
 *
 * Do NOT fold this into `isTaskScheduledOn` — that predicate also decides what
 * gets DRAWN, and a commitment must still be drawn.
 */
export function isTrackedTask(task: Task): boolean {
  return task.taskType !== "commitment";
}

function slotsAllDone(task: Task): boolean {
  const total = getSlots(task).length;
  if (total <= 1) return true;
  return new Set(task.completedSlotIndices ?? []).size >= total;
}

function stripTodayCompletionEvents(history: TaskCompletionEvent[] | undefined): TaskCompletionEvent[] {
  const today = localISODate(new Date());
  return (history ?? []).filter(
    (ev) =>
      !(
        (ev.completionType === "task" || ev.completionType === "subtask" || ev.completionType === "slot") &&
        localISODate(new Date(ev.completedAt)) === today
      )
  );
}

/** All slot indices of a task — what "the whole task is done" means for slots. */
function allSlotIndices(task: Task): number[] {
  const total = getSlots(task).length;
  return total > 1 ? Array.from({ length: total }, (_, i) => i) : [];
}

function stripTodaySubtaskEvent(
  history: TaskCompletionEvent[] | undefined,
  subtaskId: string
): TaskCompletionEvent[] {
  const today = localISODate(new Date());
  return (history ?? []).filter((ev) => {
    if (localISODate(new Date(ev.completedAt)) !== today) return true;
    if (ev.completionType === "task") return false;
    return !(ev.completionType === "subtask" && ev.subtaskId === subtaskId);
  });
}

function stripTodaySlotEvent(
  history: TaskCompletionEvent[] | undefined,
  slotIndex: number
): TaskCompletionEvent[] {
  const today = localISODate(new Date());
  return (history ?? []).filter((ev) => {
    if (localISODate(new Date(ev.completedAt)) !== today) return true;
    if (ev.completionType === "task") return false;
    return !(ev.completionType === "slot" && ev.slotIndex === slotIndex);
  });
}

function createSlotEvent(taskId: string, slotIndex: number): TaskCompletionEvent {
  return { id: uid(), taskId, completedAt: new Date().toISOString(), completionType: "slot", slotIndex };
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
  const completedIds = new Set(task.completedSubtaskIds ?? []);
  const completedCount = task.subtasks?.length
    ? task.subtasks.filter((subtask) => completedIds.has(subtask.id)).length
    : Math.min(completedIds.size, totalSubtasks);
  const pct = Math.round((completedCount / totalSubtasks) * 100);
  return { completedCount, totalCount: totalSubtasks, pct };
}

// ── Subtask / session summary (for the timeline + list pill) ─────────────────

export interface TaskSubtaskSummary {
  isSession: boolean;     // taskType === "session"
  hasItems: boolean;      // has any checkable subtasks/steps
  completedCount: number;
  totalCount: number;
}

export function getTaskCheckableItems(task: Task, plan: Plan | null): ScheduleEntry[] {
  // A commitment has nothing to check off. Returning early also stops it
  // inheriting the parent plan's template items, which would otherwise give a
  // commute a phantom progress bar just for living in a plan that has subtasks.
  if (!isTrackedTask(task)) return [];
  const isSession = task.taskType === "session";
  const hasOwnSubtasks = task.subtasks !== undefined;
  const subtasks = task.subtasks ?? [];
  const templateItems = !isSession && !hasOwnSubtasks ? plan?.items ?? [] : [];
  return isSession ? subtasks : hasOwnSubtasks ? subtasks : templateItems;
}

/**
 * Resolves a task's effective checkable items and their done/total count, with
 * the same precedence the list view uses: a task's own subtasks, else the linked
 * plan's template items (sessions always use their own steps, never the template).
 * Used to render the "N/M" subtask pill on a card.
 */
export function getTaskSubtaskSummary(task: Task, plan: Plan | null): TaskSubtaskSummary {
  const isSession = task.taskType === "session";
  const effectiveItems = getTaskCheckableItems(task, plan);
  const totalCount = effectiveItems.length;

  const completedIds = new Set(task.completedSubtaskIds ?? []);
  let completedCount = effectiveItems.reduce((n, item) => n + (completedIds.has(item.id) ? 1 : 0), 0);
  // A whole-task completion implies every item is done (the per-item ids may not
  // all be recorded individually).
  if (task.completed && totalCount > 0) completedCount = totalCount;

  return { isSession, hasItems: totalCount > 0, completedCount, totalCount };
}

// ── Completion predicate ─────────────────────────────────────────────────────

export function isTaskCompleted(task: Task, totalSubtasks: number): boolean {
  // A commitment is never "done" — there's nothing to complete. This also
  // covers converting an already-completed task into a commitment, which would
  // otherwise keep a stale `completed: true` and render green forever.
  if (!isTrackedTask(task)) return false;
  if (totalSubtasks === 0) return !!task.completed;
  if (task.completed !== undefined) return task.completed;
  return new Set(task.completedSubtaskIds ?? []).size >= totalSubtasks;
}

// ── State resolver ───────────────────────────────────────────────────────────

export type TaskState = "incomplete" | "partial" | "completed" | "missed";

export function resolveTaskState(task: Task, totalSubtasks: number): TaskState {
  // Held time reports no progress state at all — not done, not missed, not
  // partial. Per the One Signal Rule, nothing green or rose may appear on it.
  if (!isTrackedTask(task)) return "incomplete";
  if (isTaskCompleted(task, totalSubtasks)) return "completed";
  if (task.missed) return "missed";
  if (totalSubtasks > 0 && calculateTaskProgress(task, totalSubtasks).completedCount > 0) return "partial";
  return "incomplete";
}

/** A task is "resolved" for the day once it's either done or explicitly missed. */
export function isTaskResolved(task: Task, totalSubtasks: number): boolean {
  return isTaskCompleted(task, totalSubtasks) || !!task.missed;
}

/**
 * The accessible name for a task status control.
 *
 * State is carried in the NAME rather than in `aria-pressed`, because pressed is
 * binary and cannot express "partial" or "missed" — every editable control used
 * to announce "Mark done" with pressed=false regardless of state, so a missed
 * task was indistinguishable from an untouched one to a screen reader.
 *
 * `action` overrides the verb for callers that own their own wording; read-only
 * returns the bare state, since there is nothing to invite.
 */
export function taskStatusLabel(state: TaskState, readOnly: boolean, action?: string): string {
  const stateText =
    state === "completed"
      ? "Completed"
      : state === "missed"
      ? "Missed"
      : state === "partial"
      ? "Partially completed"
      : "Not completed";
  if (readOnly) return stateText;
  const verb =
    action ??
    (state === "completed"
      ? "Mark not done"
      : state === "missed"
      ? "Clear missed mark"
      : "Mark done");
  return `${stateText}, ${verb}`;
}

/**
 * What a tap on a status checkbox means: a missed task un-marks, anything else
 * toggles completion.
 *
 * Extracted because the desktop shell had this branch inline and the iOS shell
 * did not, so the same tap on the same shared card cleared the missed mark on
 * one surface and completed the task on the other.
 */
export function toggleTaskFromCheckbox(task: Task, allSubtaskIds: string[]): Partial<Task> {
  return task.missed
    ? markTaskMissed(task, allSubtaskIds)
    : toggleTaskComplete(task, allSubtaskIds);
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
      // Un-completing the whole task un-completes each of its phases too.
      completedSlotIndices: [],
      completionHistory: stripTodayCompletionEvents(task.completionHistory),
    };
  }

  const slotIndices = allSlotIndices(task);
  const events: TaskCompletionEvent[] = [
    ...slotIndices.map((i) => createSlotEvent(task.id, i)),
    createCompletionEvent(task.id, "task"),
  ];
  return {
    completed: true,
    completedAt: now,
    completedSubtaskIds: allSubtaskIds,
    // "Mark the whole task done" implies every phase is done — otherwise the
    // timeline/list would show unchecked phases on a task that reads complete.
    completedSlotIndices: slotIndices,
    // Completing clears a prior "missed" mark for today.
    missed: false,
    missedAt: undefined,
    completionHistory: [...stripTodayEvents(task.completionHistory, ["missed"]), ...events],
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
  const cleared = stripTodayEvents(task.completionHistory, ["task", "subtask", "slot", "missed"]);
  const events: TaskCompletionEvent[] = [
    createCompletionEvent(task.id, "missed"),
    ...allSubtaskIds.map((sid) => createCompletionEvent(task.id, "missed", sid)),
  ];
  return {
    completed: false,
    completedAt: undefined,
    completedSubtaskIds: [],
    // A missed day is whole-task: no phase survives as done.
    completedSlotIndices: [],
    missed: true,
    missedAt: new Date().toISOString(),
    completionHistory: [...cleared, ...events],
  };
}

// ── Snooze ("Later today") ───────────────────────────────────────────────────

/**
 * Shift a task later in the day — an honest alternative to "missed" when you
 * slip but still intend to do it. Moves start/end forward by `byMinutes`
 * (default 60), but never earlier than the current time, and clamps inside the
 * day (23:59), preserving the original duration. Clears any "missed" mark for
 * today, since a deferred task isn't missed. Returns {} (no change) if the task
 * has no parseable start time. Times stay in the app's display format.
 */
export function snoozeTaskLater(task: Task, byMinutes = 60): Partial<Task> {
  // `?? ""` guards against an untimed task — parseTimeToMinutes throws on
  // undefined (it calls `.trim()`), and the "Later today" action is reachable
  // for tasks with no start time.
  const start = parseTimeToMinutes(task.startTime ?? "");
  if (start == null) return {};

  // Real duration, accounting for tasks that run past midnight (end < start).
  let end = parseTimeToMinutes(task.endTime ?? "");
  let duration = 60;
  if (end != null) {
    if (end < start) end += 1440;
    duration = end - start > 0 ? end - start : 60;
  }

  const DAY_END = 23 * 60 + 59;
  // Aim for `byMinutes` later than both the original start and now, but keep the
  // whole task inside today.
  let newStart = Math.max(start + byMinutes, currentMinutes() + byMinutes);
  newStart = Math.min(newStart, DAY_END - duration);

  // No room left later today — never shove the task earlier than it already is.
  if (newStart <= start) return {};

  return {
    startTime: minutesToDisplayTime(newStart),
    endTime: minutesToDisplayTime(newStart + duration),
    // A deferred task is not missed.
    missed: false,
    missedAt: undefined,
    completionHistory: stripTodayEvents(task.completionHistory, ["missed"]),
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
    : Array.from(new Set([...current, subtaskId]));

  const allNowDone = totalSubtasks > 0 && new Set(next).size >= totalSubtasks && slotsAllDone(task);
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
  // and materialize any remaining implied subtask completions. Whole-task
  // completion stores one task event, so without this conversion the partial
  // state would disappear from history after the day rolls over.
  const strippedHistory = stripTodaySubtaskEvent(history, subtaskId);
  const today = localISODate(new Date());
  const recordedToday = new Set(
    strippedHistory
      .filter(
        (event) =>
          event.completionType === "subtask" &&
          event.subtaskId &&
          localISODate(new Date(event.completedAt)) === today
      )
      .map((event) => event.subtaskId as string)
  );
  const impliedEvents = next
    .filter((id) => !recordedToday.has(id))
    .map((id) => createCompletionEvent(task.id, "subtask", id));
  return {
    completedSubtaskIds: next,
    completed: false,
    completedAt: undefined,
    completionHistory: [...strippedHistory, ...impliedEvents],
  };
}

// ── Toggle individual slot (multi-phase-same-day tasks) ──────────────────────

/**
 * Returns the Task fields to merge after toggling one time slot's completion —
 * the multi-slot analogue of toggleSubtaskComplete, keyed by index into
 * getSlots(task) instead of a subtask id. Each slot gets its own independent
 * checkbox; the whole task auto-completes once every slot (and every subtask,
 * if any) is done, and auto-uncompletes as soon as one is undone.
 */
export function toggleSlotComplete(
  task: Task,
  slotIndex: number,
  totalSubtasks: number
): Partial<Task> {
  const totalSlots = getSlots(task).length;
  const current = task.completedSlotIndices ?? [];
  const isDone = current.includes(slotIndex);
  const next = isDone
    ? current.filter((i) => i !== slotIndex)
    : Array.from(new Set([...current, slotIndex]));

  const subtasksDone =
    totalSubtasks === 0 || new Set(task.completedSubtaskIds ?? []).size >= totalSubtasks;
  const allNowDone = next.length >= totalSlots && subtasksDone;
  const now = new Date().toISOString();
  const history = task.completionHistory ?? [];

  if (!isDone) {
    const events: TaskCompletionEvent[] = [createSlotEvent(task.id, slotIndex)];
    if (allNowDone) events.push(createCompletionEvent(task.id, "task"));
    return {
      completedSlotIndices: next,
      completed: allNowDone,
      completedAt: allNowDone ? now : undefined,
      // Any progress clears a prior "missed" mark for today.
      missed: false,
      missedAt: undefined,
      completionHistory: [...stripTodayEvents(history, ["missed"]), ...events],
    };
  }

  // Marking a slot incomplete — also drop today's auto-task completion event
  // and materialize any remaining implied slot completions (mirrors the
  // subtask "un-toggle" branch above).
  const strippedHistory = stripTodaySlotEvent(history, slotIndex);
  const today = localISODate(new Date());
  const recordedToday = new Set(
    strippedHistory
      .filter(
        (event) =>
          event.completionType === "slot" &&
          event.slotIndex !== undefined &&
          localISODate(new Date(event.completedAt)) === today
      )
      .map((event) => event.slotIndex as number)
  );
  const impliedEvents = next
    .filter((i) => !recordedToday.has(i))
    .map((i) => createSlotEvent(task.id, i));
  return {
    completedSlotIndices: next,
    completed: false,
    completedAt: undefined,
    completionHistory: [...strippedHistory, ...impliedEvents],
  };
}

// ── Date-aware completion (viewing a day other than today) ───────────────────
// The live `completed`/`completedSubtaskIds` flags only describe TODAY's
// occurrence. For any other day we read the permanent `completionHistory`.

/** Derive a task's completion state for a specific date from its history. */
export function completionForDate(
  task: Task,
  dateISO: string
): { completed: boolean; completedSubtaskIds: string[]; completedSlotIndices: number[]; missed: boolean } {
  const onDate = (task.completionHistory ?? []).filter(
    (e) => localISODate(new Date(e.completedAt)) === dateISO
  );
  const allSubIds = task.subtasks?.map((s) => s.id) ?? [];
  const totalSlots = getSlots(task).length;
  const slotIndices = Array.from(
    new Set(
      onDate
        .filter((e) => e.completionType === "slot" && e.slotIndex !== undefined)
        .map((e) => e.slotIndex as number)
    )
  );
  if (onDate.some((e) => e.completionType === "task")) {
    return {
      completed: true,
      completedSubtaskIds: allSubIds,
      completedSlotIndices: totalSlots > 1 ? Array.from({ length: totalSlots }, (_, i) => i) : slotIndices,
      missed: false,
    };
  }
  const missed = onDate.some((e) => e.completionType === "missed" && !e.subtaskId);
  const subIds = Array.from(
    new Set(onDate.filter((e) => e.completionType === "subtask" && e.subtaskId).map((e) => e.subtaskId as string))
  );
  return {
    completed: allSubIds.length > 0 && subIds.length >= allSubIds.length,
    completedSubtaskIds: subIds,
    completedSlotIndices: slotIndices,
    missed,
  };
}

function datedEvent(taskId: string, dateISO: string, type: "task" | "subtask", subtaskId?: string): TaskCompletionEvent {
  return { id: uid(), taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: type, subtaskId };
}

function datedSlotEvent(taskId: string, dateISO: string, slotIndex: number): TaskCompletionEvent {
  return { id: uid(), taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: "slot", slotIndex };
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
    // Whole-task completion implies every phase, so completionForDate reports
    // the same thing whether it's read via the task or the slot events.
    ...allSlotIndices(task).map((i) => datedSlotEvent(task.id, dateISO, i)),
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

/** Toggle one time slot for a non-today date — history only (multi-slot tasks). */
export function toggleSlotCompleteForDate(
  task: Task,
  slotIndex: number,
  totalSlots: number,
  dateISO: string
): Partial<Task> {
  const history = task.completionHistory ?? [];
  const onDate = (e: TaskCompletionEvent) => localISODate(new Date(e.completedAt)) === dateISO;
  const dayEvents = history.filter(onDate);
  const hasSlot = dayEvents.some((e) => e.completionType === "slot" && e.slotIndex === slotIndex);

  if (hasSlot) {
    // Remove this slot's event for the date + any auto-task event (no longer all-done).
    return {
      completionHistory: history.filter(
        (e) => !(onDate(e) && ((e.completionType === "slot" && e.slotIndex === slotIndex) || e.completionType === "task"))
      ),
    };
  }

  const doneSlots = new Set(
    dayEvents.filter((e) => e.completionType === "slot" && e.slotIndex !== undefined).map((e) => e.slotIndex as number)
  );
  doneSlots.add(slotIndex);
  const add = [datedSlotEvent(task.id, dateISO, slotIndex)];
  if (totalSlots > 0 && doneSlots.size >= totalSlots && !dayEvents.some((e) => e.completionType === "task")) {
    add.push(datedEvent(task.id, dateISO, "task"));
  }
  return { completionHistory: [...history, ...add] };
}
