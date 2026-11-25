"use client";

import { allStepsDone, doneSubtaskIds, isStepsTask } from "@planr/core/lib/subtaskMode";
import FocusMode, { type FocusFinish } from "@/components/focus/FocusMode";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import type { DayKey, Plan, Schedule } from "@/lib/useScheduleDB";
import type { useFocusSession } from "@/lib/useFocusSession";
import { upsertSetLog } from "@/lib/setLogs";
import { currentTargets } from "@/lib/subtaskTargets";
import { decideProgression, pendingProgression } from "@/lib/subtaskProgression";
import { todayISO } from "@/lib/dateUtils";
import { isTrackedTask, resolveTaskState } from "@/lib/taskCompletion";

interface FocusHostProps {
  focus: ReturnType<typeof useFocusSession>;
  schedule: Schedule;
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  plansById: Map<string, Plan>;
  onToggleSubtask: (taskId: string, subtaskId: string, day: DayKey, dateISO: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[], day: DayKey, dateISO: string) => void;
}

/** The subtasks a focus session steps through — the same list task detail shows. */
export function focusItems(task: { subtasks?: ScheduleEntry[]; taskType?: string; planId?: string }, plansById: Map<string, Plan>): ScheduleEntry[] {
  if (task.taskType === "session") return task.subtasks ?? [];
  if (task.subtasks !== undefined) return task.subtasks;
  return (task.planId ? plansById.get(task.planId)?.items : undefined) ?? [];
}

/**
 * Mounts focus mode for whichever task the session belongs to, and settles
 * the outcome through the shell's own completion handlers — the same guarded
 * paths task detail uses, so history and auto-complete rules stay in one place.
 */
export default function FocusHost({ focus, schedule, setSchedule, plansById, onToggleSubtask, onToggleComplete }: FocusHostProps) {
  const { state } = focus;
  if (!focus.open || !state) return null;
  const day = state.day as DayKey;
  const task = schedule.activities[day]?.find((t) => t.id === state.taskId);
  if (!task || !isTrackedTask(task)) return null;
  const items = focusItems(task, plansById);

  /** Steps are ticked one by one — completing the block never ticks them, and a
   *  block already done today can still have more steps finished in it. */
  function finishSteps(newlyDone: string[], taskDone: boolean) {
    if (!task || !state) return;
    for (const id of newlyDone) onToggleSubtask(task.id, id, day, state.dateISO);
    if (newlyDone.length === 0 && !taskDone && allStepsDone(task)) onToggleComplete(task.id, items.map((i) => i.id), day, state.dateISO);
  }

  function handleFinish({ logs, doneStepIds }: FocusFinish) {
    if (!task || !state) return;
    if (logs.length > 0) setSchedule((prev) => logs.reduce((acc, log) => upsertSetLog(acc, log), prev));

    const alreadyDone = doneSubtaskIds(task);
    const taskDone = resolveTaskState(task, items.length) === "completed";
    if (isStepsTask(task)) {
      finishSteps(doneStepIds.filter((id) => !alreadyDone.includes(id)), taskDone);
    } else if (!taskDone) {
      const allIds = items.map((i) => i.id);
      if (items.length === 0 || allIds.every((id) => doneStepIds.includes(id))) {
        // Everything done: complete the task in one step (it ticks every subtask).
        onToggleComplete(task.id, allIds, day, state.dateISO);
      } else {
        for (const id of doneStepIds) if (!alreadyDone.includes(id)) onToggleSubtask(task.id, id, day, state.dateISO);
      }
    }
    focus.end();
  }

  return (
    <FocusMode
      focus={state}
      dispatch={focus.dispatch}
      task={task}
      items={items}
      valuesFor={(item) => currentTargets(item, task.id, schedule.progressionSteps)}
      setLogs={schedule.setLogs}
      suggestionFor={(item) => (state.dateISO === todayISO() ? pendingProgression(schedule, task, item, state.dateISO) : null)}
      onDecide={(suggestion, decision) => setSchedule((prev) => decideProgression(prev, suggestion, decision))}
      onHide={focus.hide}
      onFinish={handleFinish}
    />
  );
}
