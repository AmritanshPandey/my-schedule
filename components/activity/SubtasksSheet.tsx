"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { IconCheck, IconMinus, IconListCheck, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import ProgressBar from "@/components/ui/ProgressBar";
import type { Task, Plan } from "@/lib/useScheduleDB";
import type { ScheduleEntry, MetaField } from "@/components/ScheduleItem";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";

interface SubtasksSheetProps {
  open: boolean;
  task: Task | null;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onEdit?: () => void;
}

// Per-subtask detail pill — mirrors the list view ("5min", "25 min | 2km").
function detailPill(entry: ScheduleEntry): string | null {
  const info = entry.info?.trim() || entry.note?.trim();
  const details: string[] = [];
  if (info) details.push(info);
  if (entry.duration) details.push(entry.duration);
  if (details.length > 0) return details.join(" · ");
  const meta = (entry as ScheduleEntry & { meta?: MetaField[] }).meta;
  if (meta && meta.length > 0) return meta.map((m) => m.value).join(" | ");
  if (entry.time) return entry.time;
  return null;
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
  onEdit,
}: SubtasksSheetProps) {
  const isSession = task?.taskType === "session";

  // Checkable items: task-level subtasks, or the plan template as a fallback.
  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    if (isSession) return task.subtasks ?? [];
    return task.subtasks?.length ? task.subtasks : linkedPlan?.items ?? [];
  }, [task, isSession, linkedPlan]);

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
  const eyebrow = (linkedPlan?.title ?? (isSession ? "Session" : "Task")).toUpperCase();

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="relative px-5 pt-5 pb-8 flex flex-col gap-4">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-400"
        >
          <IconX size={18} strokeWidth={2.2} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-2.5 pr-10">
          <button
            type="button"
            onClick={() => { if (!readOnly) onToggleComplete(task.id, allIds); }}
            aria-label={done ? "Mark task not done" : "Mark task done"}
            aria-pressed={done}
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors ${readOnly ? "cursor-default" : "active:scale-95"} ${
              state === "completed" || state === "partial"
                ? "border-transparent bg-green-600"
                : state === "missed"
                ? "border-transparent bg-rose-500"
                : "border-green-600/70 bg-transparent dark:border-green-500/70"
            }`}
          >
            {state === "completed" && <IconCheck size={14} strokeWidth={3} className="text-white" />}
            {state === "partial" && <IconMinus size={14} strokeWidth={3} className="text-white" />}
            {state === "missed" && <IconX size={14} strokeWidth={3} className="text-white" />}
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-bold leading-tight text-neutral-900 dark:text-white">{task.title}</h2>
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">{eyebrow}</p>
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
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-3 py-1 text-[13px] font-semibold text-neutral-600 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-400">
              {duration}
            </span>
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
            {items.map((item) => {
              const isDone = (task.completedSubtaskIds ?? []).includes(item.id);
              const detail = detailPill(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { if (!readOnly) onToggleSubtask(task.id, item.id); }}
                  className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ${
                    isDone ? "bg-transparent" : "bg-neutral-100/70 dark:bg-white/[0.03]"
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors ${
                    isDone ? "border-transparent bg-green-600"
                    : state === "missed" ? "border-transparent bg-rose-500"
                    : "border-green-600/70 bg-transparent dark:border-green-500/70"
                  }`}>
                    {isDone && <IconCheck size={14} strokeWidth={3} className="text-white" />}
                    {!isDone && state === "missed" && <IconX size={14} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className={`flex-1 min-w-0 text-[15px] font-semibold ${
                    isDone ? "text-neutral-400 line-through dark:text-neutral-500"
                    : state === "missed" ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-500"
                    : "text-neutral-800 dark:text-neutral-200"
                  }`}>
                    {item.task}
                  </span>
                  {detail && (
                    <span className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-[13px] font-semibold text-neutral-500 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-400">
                      {detail}
                    </span>
                  )}
                </button>
              );
            })}
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
          <div className="mt-1 flex items-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => { onToggleComplete(task.id, allIds); onClose(); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-green-600 py-3.5 text-[15px] font-bold text-white"
            >
              <IconCheck size={18} strokeWidth={2.6} />
              {done ? "Completed" : "Mark Done"}
            </motion.button>
       
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
