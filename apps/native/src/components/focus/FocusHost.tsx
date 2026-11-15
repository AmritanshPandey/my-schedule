import type { ScheduleEntry } from '@planr/core/lib/scheduleEntry';
import type { DayKey, Plan, Schedule } from '@planr/core/lib/scheduleTypes';
import { upsertSetLog } from '@planr/core/lib/setLogs';
import { currentTargets } from '@planr/core/lib/subtaskTargets';
import { decideProgression, pendingProgression } from '@planr/core/lib/subtaskProgression';
import { todayISO } from '@planr/core/lib/dateUtils';
import { isTrackedTask, resolveTaskState } from '@planr/core/lib/taskCompletion';
import type { useFocusSession } from '../../lib/useFocusSession';
import FocusMode, { type FocusFinish } from './FocusMode';

/** The subtasks a focus session steps through — the same list task detail shows. */
export function focusItems(task: { subtasks?: ScheduleEntry[]; taskType?: string; planId?: string }, plansById: Map<string, Plan>): ScheduleEntry[] {
  if (task.taskType === 'session') return task.subtasks ?? [];
  if (task.subtasks !== undefined) return task.subtasks;
  return (task.planId ? plansById.get(task.planId)?.items : undefined) ?? [];
}

/**
 * Native port of components/focus/FocusHost.tsx — mounts focus mode for the
 * session's task and settles the outcome through the shell's own completion
 * handlers.
 */
export default function FocusHost({
  focus,
  schedule,
  setSchedule,
  plansById,
  onToggleSubtask,
  onToggleComplete,
}: {
  focus: ReturnType<typeof useFocusSession>;
  schedule: Schedule;
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  plansById: Map<string, Plan>;
  onToggleSubtask: (taskId: string, subtaskId: string, day: DayKey, dateISO: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[], day: DayKey, dateISO: string) => void;
}) {
  const { state } = focus;
  if (!focus.open || !state) return null;
  const day = state.day as DayKey;
  const task = schedule.activities[day]?.find((t) => t.id === state.taskId);
  if (!task || !isTrackedTask(task)) return null;
  const items = focusItems(task, plansById);

  function handleFinish({ logs, doneStepIds }: FocusFinish) {
    if (!task || !state) return;
    if (logs.length > 0) setSchedule((prev) => logs.reduce((acc, log) => upsertSetLog(acc, log), prev));
    const alreadyDone = task.completedSubtaskIds ?? [];
    if (resolveTaskState(task, items.length) !== 'completed') {
      const allIds = items.map((i) => i.id);
      if (items.length === 0 || allIds.every((id) => doneStepIds.includes(id))) {
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
