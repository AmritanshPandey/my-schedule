"use client";

import { IconArrowUpRight, IconEdit, IconListCheck } from "@tabler/icons-react";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import type { Plan, Task } from "@/lib/useScheduleDB";
import { calculateTaskProgress, getTaskCheckableItems, getTaskSubtaskSummary, resolveTaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";

interface IOSLightTaskCardProps {
  task: Task;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onEdit: () => void;
  onOpenSubtasks?: () => void;
}

export default function IOSLightTaskCard({
  task,
  linkedPlan,
  readOnly = false,
  onToggleComplete,
  onEdit,
  onOpenSubtasks,
}: IOSLightTaskCardProps) {
  const summary = getTaskSubtaskSummary(task, linkedPlan);
  const itemCount = summary.totalCount;
  const allSubtaskIds = getTaskCheckableItems(task, linkedPlan).map((item) => item.id);
  const state = resolveTaskState(task, task.taskType === "session" ? 0 : itemCount);
  const { completedCount, totalCount } = task.taskType === "session"
    ? summary
    : calculateTaskProgress(task, itemCount);
  const duration = formatDuration(task.startTime, task.endTime);
  const hasItems = itemCount > 0;

  const trailing = (
    <div className="flex items-center gap-2">
      {hasItems && onOpenSubtasks && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic("light");
            onOpenSubtasks();
          }}
          aria-label="Open subtasks"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 text-[12px] font-extrabold tabular-nums text-neutral-600 transition-colors active:bg-white/80 dark:border-white/[0.10] dark:bg-white/[0.08] dark:text-neutral-200 dark:active:bg-white/[0.12]"
        >
          <IconListCheck size={14} strokeWidth={2} />
          {completedCount}/{totalCount || itemCount}
          <IconArrowUpRight size={13} strokeWidth={2.2} />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          haptic("light");
          onEdit();
        }}
        aria-label="Edit task"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/60 text-neutral-600 transition-colors active:bg-white/80 dark:border-white/[0.10] dark:bg-white/[0.08] dark:text-neutral-200 dark:active:bg-white/[0.12]"
      >
        <IconEdit size={16} strokeWidth={2} />
      </button>
    </div>
  );

  return (
    <TaskBlockCard
      variant="list"
      task={task}
      plan={linkedPlan}
      state={state}
      duration={duration}
      readOnly={readOnly}
      onToggle={() => {
        haptic("medium");
        onToggleComplete(task.id, allSubtaskIds);
      }}
      onClick={() => {
        if (!readOnly) {
          haptic("light");
          onToggleComplete(task.id, allSubtaskIds);
        }
      }}
      trailing={trailing}
    />
  );
}
