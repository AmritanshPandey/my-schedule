"use client";

import { IconCheck, IconEdit, IconMinus } from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import { accentStyles } from "@/lib/colorSystem";
import { resolveTaskState } from "@/lib/taskCompletion";

interface CompactTaskCardProps {
  task: Task;
  plan: Plan | null;
  readOnly?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onEdit: (task: Task) => void;
}

export function CompactTaskCard({ task, plan, readOnly = false, onToggleComplete, onEdit }: CompactTaskCardProps) {
  const allSubtaskIds = task.subtasks?.map((s) => s.id) ?? [];
  const taskState = resolveTaskState(task, task.subtasks?.length ?? 0);
  const done = taskState === "completed";
  const partial = taskState === "partial";
  const accent = accentStyles(plan?.color ?? "cyan");

  return (
    <div
      className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors ${
        done
          ? "border-neutral-100 bg-neutral-50/50 dark:border-white/[0.04] dark:bg-white/[0.02]"
          : "border-neutral-200/80 bg-white hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/[0.14]"
      }`}
    >
      {/* Plan color dot */}
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-neutral-300 dark:bg-neutral-600" : accent.dot}`} />

      {/* Title + time */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[12px] font-semibold leading-tight ${
          done
            ? "text-neutral-400 line-through dark:text-neutral-600"
            : "text-neutral-800 dark:text-neutral-200"
        }`}>
          {task.title}
        </p>
        {(task.startTime || task.endTime) && (
          <p className="mt-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
            {task.startTime}{task.endTime ? `–${task.endTime}` : ""}
          </p>
        )}
      </div>

      {/* Edit button — visible on hover */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
        className="hidden shrink-0 h-6 w-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 group-hover:flex dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-neutral-300"
        aria-label="Edit task"
      >
        <IconEdit size={12} strokeWidth={2} />
      </button>

      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggleComplete(task.id, allSubtaskIds); }}
        className={`shrink-0 flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 transition-colors ${readOnly ? "cursor-default" : ""} ${
          done || partial
            ? "border-transparent bg-green-500"
            : "border-neutral-300 bg-transparent dark:border-neutral-500"
        }`}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && <IconCheck size={10} strokeWidth={3} className="text-white" />}
        {partial && <IconMinus size={10} strokeWidth={3} className="text-white" />}
      </button>
    </div>
  );
}
