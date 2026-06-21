"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { IconCheck, IconListCheck, IconX, IconClockHour4 } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import IconButton from "@/components/ui/IconButton";
import Pill from "@/components/ui/Pill";
import ProgressBar from "@/components/ui/ProgressBar";
import TaskStatusCheckbox from "@/components/task/TaskStatusCheckbox";
import type { Task, Plan } from "@/lib/useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";
import { todayISO } from "@/lib/dateUtils";
import { compareDeadline } from "@/lib/subtaskDeadline";
import TaskChecklistItem from "@/components/activity/TaskChecklistItem";

interface SubtasksSheetProps {
  open: boolean;
  task: Task | null;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onSnooze?: (taskId: string) => void;
  onEdit?: () => void;
}

export default function SubtasksSheet({
  open,
  task,
  linkedPlan,
  readOnly = false,
  onClose,
  onToggleSubtask,
  onToggleComplete,
  onMissed,
  onSnooze,
  onEdit,
}: SubtasksSheetProps) {
  const isSession = task?.taskType === "session";

  // Checkable items: task-level subtasks, or the plan template as a fallback.
  // Task subtasks sort by deadline (soonest first); Session steps keep their order.
  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    if (isSession) return task.subtasks ?? [];
    const base = task.subtasks?.length ? task.subtasks : linkedPlan?.items ?? [];
    return [...base].sort(compareDeadline);
  }, [task, isSession, linkedPlan]);

  const today = todayISO();

  const allIds = useMemo(() => items.map((i) => i.id), [items]);
  const { completedCount, totalCount, pct } = useMemo(
    () => calculateTaskProgress(task ?? ({} as Task), items.length),
    [task, items.length]
  );
  const state = task ? resolveTaskState(task, items.length) : "incomplete";
  const done = state === "completed";
  const duration = task ? formatDuration(task.startTime, task.endTime) : "";
  const barPct = done && items.length === 0 ? 100 : pct;

  if (!task) return null;
  const eyebrow = linkedPlan?.title ?? (isSession ? "Session" : "Task");

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="relative px-5 pt-5 pb-8 flex flex-col gap-4">
        {/* Close */}
        <IconButton
          label="Close"
          variant="soft"
          size="md"
          radius="full"
          onClick={onClose}
          className="absolute right-4 top-4"
        >
          <IconX size={18} strokeWidth={2.2} />
        </IconButton>

        {/* Header */}
        <div className="flex items-start gap-2.5 pr-10">
          <div className="mt-0.5">
            <TaskStatusCheckbox
              state={state}
              readOnly={readOnly}
              label={done ? "Mark task not done" : "Mark task done"}
              onClick={() => onToggleComplete(task.id, allIds)}
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-bold leading-tight text-neutral-900 dark:text-white">{task.title}</h2>
            <p className="text-[13px] font-semibold text-neutral-400 dark:text-neutral-500">{eyebrow}</p>
          </div>
        </div>

        {/* Progress */}
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <ProgressBar pct={barPct} height={10} fillClassName="bg-green-600" className="min-w-0 flex-1" />
            <span className="w-10 shrink-0 text-right text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{barPct}%</span>
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3">
          {(task.startTime || task.endTime) && (
            <span className="text-[16px] font-bold text-neutral-900 dark:text-white">
              {task.startTime}{task.endTime ? ` - ${task.endTime}` : ""}
            </span>
          )}
          {duration && (
            <Pill variant="neutral" size="md" className="text-neutral-600 dark:text-neutral-400">
              {duration}
            </Pill>
          )}
          {items.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
              <IconListCheck size={16} strokeWidth={2} />
              {completedCount}/{totalCount}
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{task.description}</p>
        )}

        {/* Subtask checklist */}
        {items.length > 0 ? (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <TaskChecklistItem
                key={item.id}
                item={item}
                isDone={(task.completedSubtaskIds ?? []).includes(item.id)}
                state={state}
                today={today}
                readOnly={readOnly}
                onToggle={() => onToggleSubtask(task.id, item.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-[13px] text-neutral-400 dark:bg-white/[0.03] dark:text-neutral-500">
            No subtasks — mark the whole task done below.
          </p>
        )}

        {/* Actions — only today is editable */}
        {readOnly ? (
          <p className="mt-1 rounded-full bg-neutral-100 py-3 text-center text-[13px] font-semibold text-neutral-400 dark:bg-white/[0.04] dark:text-neutral-500">
            Read-only — past day
          </p>
        ) : (
          <div className="mt-1 flex flex-col gap-2.5">
            <m.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => { onToggleComplete(task.id, allIds); onClose(); }}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#00A63E] py-3.5 text-[15px] font-bold text-white hover:bg-[#008236] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
            >
              <IconCheck size={18} strokeWidth={2.6} />
              {done ? "Completed" : "Mark done"}
            </m.button>

            {/* Honest alternatives to completing: defer or acknowledge a miss. */}
            {!done && (onSnooze || onMissed) && (
              <div className="flex items-center gap-2.5">
                {onSnooze && (
                  <button
                    type="button"
                    onClick={() => { onSnooze(task.id); onClose(); }}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
                  >
                    <IconClockHour4 size={16} strokeWidth={2.2} />
                    Later today
                  </button>
                )}
                {onMissed && (
                  <button
                    type="button"
                    onClick={() => { onMissed(task.id, allIds); onClose(); }}
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-500 transition-colors hover:border-rose-200 hover:bg-rose-500/[0.06] hover:text-rose-500 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-400"
                  >
                    <IconX size={16} strokeWidth={2.2} />
                    Mark missed
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={() => { onEdit(); onClose(); }}
            className="mx-auto text-[13px] font-semibold text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            Edit task
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
