"use client";

import {
  IconArrowUpRight,
  IconChecklist,
  IconClock,
  IconListCheck,
  IconX,
} from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import { getTaskSubtaskSummary, isTaskCompleted } from "@/lib/taskCompletion";
import { getSlots } from "@/lib/taskMutations";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import CheckDraw from "@/components/ui/CheckDraw";

type TaskSummary = ReturnType<typeof getTaskSubtaskSummary>;

export interface TodayTaskListProps {
  /** Already occurrence-resolved, tracked-only and sorted — see selectTodayTasks. */
  tasks: Task[];
  done: number;
  total: number;
  plans: Plan[];
  taskSummary: (task: Task) => TaskSummary;
  taskCheckableIds: (task: Task) => string[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
}

/** "6 AM" / "12:30 PM" — the dashboard reads as prose, not as a 24-hour log. */
export function formatTaskTime(t?: string): string {
  if (!t) return "";
  const mins = parseTimeToMinutes(t);
  if (mins === null) return t;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function TaskStatusButton({
  done,
  missed,
  onClick,
}: {
  done: boolean;
  missed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={done ? "Mark not done" : "Mark done"}
      aria-pressed={done}
      onClick={onClick}
      className={`tap-target grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 transition-colors active:scale-95 ${
        done ? "border-transparent bg-emerald-500"
        : missed ? "border-transparent bg-rose-500"
        : "border-neutral-500 bg-transparent hover:border-neutral-600 dark:border-white/[0.30] dark:hover:border-white/50"
      }`}
    >
      <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
      {missed && <IconX size={15} strokeWidth={3} className="text-white" />}
    </button>
  );
}

/**
 * The Overview "Today's Task" card, shared by the desktop dashboard and the iOS
 * shell. Both used to keep their own copy of this markup; the copies drifted in
 * both look and behaviour. Behaviour now lives in `selectTodayTasks`, and this
 * component is purely presentational.
 */
export default function TodayTaskList({
  tasks,
  done,
  total,
  plans,
  taskSummary,
  taskCheckableIds,
  onMarkDone,
  onOpenSubtasks,
}: TodayTaskListProps) {
  return (
    <section data-testid="overview-today-card" className={`${CARD} px-4 pt-4 pb-1`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <IconChecklist size={15} strokeWidth={2} className="shrink-0" />
          <h2 className="truncate text-[13px] font-bold">Today&apos;s Task</h2>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-200/70 px-2 py-0.5 text-[12px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.07] dark:text-neutral-400">
          {done}/{total}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="mb-3 rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center dark:border-white/[0.10]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">Nothing to check off today</p>
          <p className="mt-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            Add the first block from Today.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {tasks.map((task) => {
            const { completedCount: subDone, totalCount: subTotal } = taskSummary(task);
            const isDone = isTaskCompleted(task, subTotal);
            const isMissed = !isDone && !!task.missed;
            const plan = plans.find((p) => p.id === task.planId);
            // Multi-slot tasks run in several phases today; the summary shows
            // every start time and how many phases are left, so the dashboard
            // never under-reports the day. Checking off individual phases
            // happens on Today (the execution surface), not here.
            const slots = getSlots(task);
            const isMultiSlot = slots.length > 1;
            const slotsDone = isMultiSlot
              ? isDone
                ? slots.length
                : new Set(task.completedSlotIndices ?? []).size
              : 0;
            return (
              <div key={task.id} className="flex items-center gap-3 py-3">
                <TaskStatusButton
                  done={isDone}
                  missed={isMissed}
                  onClick={() => { haptic("medium"); onMarkDone(task.id, taskCheckableIds(task)); }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[15px] font-bold leading-tight ${
                      isDone ? "text-neutral-400 line-through dark:text-neutral-600"
                      : isMissed ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
                      : "text-neutral-950 dark:text-white"
                    }`}
                  >
                    {task.title}
                  </p>
                  {(task.startTime || plan) && (
                    <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                      {/* Times are a set, so they join with a comma; the middot
                          then separates the times from the plan without reading
                          as one more time in the list. */}
                      <span className="tabular-nums">
                        {isMultiSlot
                          ? slots.map((s) => formatTaskTime(s.startTime)).join(", ")
                          : task.startTime && formatTaskTime(task.startTime)}
                      </span>
                      {task.startTime && plan && " · "}
                      {plan && plan.title}
                    </p>
                  )}
                </div>
                {isMultiSlot && (
                  <span
                    aria-label={`${slotsDone} of ${slots.length} phases done`}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-neutral-500 dark:border-white/[0.10] dark:text-neutral-400"
                  >
                    <IconClock size={14} strokeWidth={2} className="shrink-0" />
                    <span className="text-[12px] font-bold tabular-nums">{slotsDone}/{slots.length}</span>
                  </span>
                )}
                {subTotal > 0 && onOpenSubtasks && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onOpenSubtasks(task.id); }}
                    aria-label={`Open subtasks (${subDone} of ${subTotal} done)`}
                    className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.05]"
                  >
                    <IconListCheck size={14} strokeWidth={2} className="shrink-0" />
                    <span className="text-[12px] font-bold tabular-nums">{subDone}/{subTotal}</span>
                    <IconArrowUpRight size={13} strokeWidth={2.2} className="shrink-0" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
