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
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
        done ? "border-emerald-500 bg-emerald-500"
        : missed ? "border-rose-500 bg-rose-500"
        : "border-emerald-600/70 bg-transparent hover:border-emerald-600 dark:border-emerald-500/55"
      }`}
    >
      <CheckDraw visible={done} size={17} strokeWidth={3} className="text-white" />
      {missed && <IconX size={17} strokeWidth={3} className="text-white" />}
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
    <section data-testid="overview-today-card" className={`${CARD} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <IconChecklist size={15} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
          <h2 className="truncate text-[13px] font-extrabold text-neutral-800 dark:text-neutral-200">
            Today&apos;s Task
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-black tabular-nums text-neutral-500 dark:border-white/[0.10] dark:bg-white/[0.05] dark:text-neutral-400">
          {done}/{total}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center dark:border-white/[0.10]">
          <p className="text-[15px] font-black text-neutral-950 dark:text-white">No tasks scheduled</p>
          <p className="mt-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
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
              <div key={task.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-0">
                <TaskStatusButton
                  done={isDone}
                  missed={isMissed}
                  onClick={() => { haptic("light"); onMarkDone(task.id, taskCheckableIds(task)); }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[15px] font-black leading-tight ${
                      isDone ? "text-neutral-400 line-through dark:text-neutral-600"
                      : isMissed ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
                      : "text-neutral-950 dark:text-white"
                    }`}
                  >
                    {task.title}
                  </p>
                  {(task.startTime || plan) && (
                    <p className="mt-1 truncate text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {isMultiSlot
                        ? slots.map((s) => formatTaskTime(s.startTime)).join(" · ")
                        : task.startTime && formatTaskTime(task.startTime)}
                      {task.startTime && plan && " - "}
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
                    <span className="text-[12px] font-black tabular-nums">{slotsDone}/{slots.length}</span>
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
                    <span className="text-[12px] font-black tabular-nums">{subDone}/{subTotal}</span>
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
