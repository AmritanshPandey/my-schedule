"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { IconArrowBackUp, IconBan, IconCheck, IconClockHour4, IconEdit, IconListCheck, IconX } from "@tabler/icons-react";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import TaskChecklistItem from "@/components/activity/TaskChecklistItem";
import TaskStatusCheckbox from "@/components/task/TaskStatusCheckbox";
import DetailHeader from "@/components/ui/DetailHeader";
import IconButton from "@/components/ui/IconButton";
import Pill from "@/components/ui/Pill";
import ProgressBar from "@/components/ui/ProgressBar";
import { todayISO } from "@/lib/dateUtils";
import { compareDeadline } from "@/lib/subtaskDeadline";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";
import type { Plan, Task } from "@/lib/useScheduleDB";

export interface TaskDetailViewProps {
  task: Task | null;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onSnooze?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  skipped?: boolean;
  canSkip?: boolean;
  onEdit?: () => void;
  presentation?: "sheet" | "page";
}

export default function TaskDetailView({
  task,
  linkedPlan,
  readOnly = false,
  onClose,
  onToggleSubtask,
  onToggleComplete,
  onMissed,
  onSnooze,
  onSkip,
  skipped = false,
  canSkip = false,
  onEdit,
  presentation = "sheet",
}: TaskDetailViewProps) {
  const isSession = task?.taskType === "session";

  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    if (isSession) return task.subtasks ?? [];
    const base = task.subtasks?.length ? task.subtasks : linkedPlan?.items ?? [];
    return [...base].sort(compareDeadline);
  }, [task, isSession, linkedPlan]);

  const today = todayISO();
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const { completedCount, totalCount, pct } = useMemo(
    () => calculateTaskProgress(task ?? ({} as Task), items.length),
    [task, items.length],
  );
  const state = task ? resolveTaskState(task, items.length) : "incomplete";
  const done = state === "completed";
  const duration = task ? formatDuration(task.startTime, task.endTime) : "";
  const barPct = done && items.length === 0 ? 100 : pct;

  if (!task) return null;

  const eyebrow = linkedPlan?.title ?? (isSession ? "Session" : "Task");
  const skipToggle = onSkip && canSkip ? (
    <button
      type="button"
      onClick={() => { onSkip(task.id); onClose(); }}
      className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
    >
      {skipped ? <IconArrowBackUp size={16} strokeWidth={2.2} /> : <IconBan size={16} strokeWidth={2.2} />}
      {skipped ? "Restore this day" : "Skip this day"}
    </button>
  ) : null;

  const summary = (
    <>
      {presentation === "page" && (
        <div className="flex items-start gap-3">
          <TaskStatusCheckbox
            state={state}
            readOnly={readOnly}
            label={done ? "Mark task not done" : "Mark task done"}
            onClick={() => onToggleComplete(task.id, allIds)}
          />
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-[15px] font-semibold text-neutral-400 dark:text-neutral-500">{eyebrow}</p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <ProgressBar pct={barPct} height={10} fillClassName="bg-green-600" className="min-w-0 flex-1" />
          <span className="w-10 shrink-0 text-right text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{barPct}%</span>
        </div>
      )}

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
    </>
  );

  const checklist = (
    <>
      {task.description && (
        <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{task.description}</p>
      )}

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
    </>
  );

  const actions = readOnly ? (
    skipToggle ? (
      <div className="mt-1">{skipToggle}</div>
    ) : (
      <p className="mt-1 rounded-full bg-neutral-100 py-3 text-center text-[13px] font-semibold text-neutral-400 dark:bg-white/[0.04] dark:text-neutral-500">
        Read-only — past day
      </p>
    )
  ) : (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2.5">
      <m.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => { onToggleComplete(task.id, allIds); onClose(); }}
        className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#00A63E] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#008236] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
      >
        <IconCheck size={18} strokeWidth={2.6} />
        Done
      </m.button>

      {!done && onMissed && (
        <m.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => { onMissed(task.id, allIds); onClose(); }}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[14px] font-bold text-neutral-600 transition-colors hover:border-rose-200 hover:bg-rose-500/[0.06] hover:text-rose-500 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-400"
        >
          <IconX size={18} strokeWidth={2.6} />
          Missed
        </m.button>
      )}

      {onEdit && (
        <m.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => { onEdit(); onClose(); }}
          aria-label="Edit task"
          className="flex min-h-[48px] w-14 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
        >
          <IconEdit size={18} strokeWidth={2.4} />
        </m.button>
      )}
      </div>

      {!done && onSnooze && (
        <button
          type="button"
          onClick={() => { onSnooze(task.id); onClose(); }}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
        >
          <IconClockHour4 size={16} strokeWidth={2.2} />
          Later today
        </button>
      )}
      {skipToggle}
    </div>
  );

  const editAction = null;

  const pageActions = readOnly ? (
    actions
  ) : (
    <div className="mt-1 flex items-center gap-2.5">
      <m.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => { onToggleComplete(task.id, allIds); onClose(); }}
        className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#00A63E] px-4 text-[14px] font-bold text-white transition-colors hover:bg-[#008236] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
      >
        <IconCheck size={18} strokeWidth={2.6} />
        Done
      </m.button>
      {onMissed && (
        <m.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => { onMissed(task.id, allIds); onClose(); }}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[14px] font-bold text-neutral-600 transition-colors hover:border-rose-200 hover:bg-rose-500/[0.06] hover:text-rose-500 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-400"
        >
          <IconX size={18} strokeWidth={2.6} />
          Missed
        </m.button>
      )}
      {onEdit && (
        <m.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={() => { onEdit(); onClose(); }}
          aria-label="Edit task"
          className="flex min-h-[48px] w-14 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
        >
          <IconEdit size={18} strokeWidth={2.4} />
        </m.button>
      )}
    </div>
  );

  const content = (
    <div className="relative flex flex-col gap-4 px-5 pb-8 pt-5">
      {presentation === "sheet" && (
        <div className="absolute right-4 top-4 z-10">
          <IconButton
            label="Close"
            variant="soft"
            size="md"
            radius="full"
            onClick={onClose}
          >
            <IconX size={18} strokeWidth={2.2} />
          </IconButton>
        </div>
      )}

      {presentation === "sheet" && (
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
      )}

      {summary}
      {checklist}
      {actions}
      {editAction}
    </div>
  );

  if (presentation === "page") {
    return (
      <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
        <DetailHeader title={task.title} onBack={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 px-5 pb-4 pt-5">
            {summary}
            {checklist}
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {pageActions}
          {!readOnly && skipToggle && <div className="mt-2">{skipToggle}</div>}
        </div>
      </div>
    );
  }

  return content;
}
