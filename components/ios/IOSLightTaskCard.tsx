"use client";

import { IconArrowUpRight, IconEdit, IconListCheck } from "@tabler/icons-react";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import type { Plan, Task } from "@/lib/useScheduleDB";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
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
  const itemCount = task.taskType === "session"
    ? task.subtasks?.length ?? 0
    : task.subtasks?.length || linkedPlan?.items.length || 0;
  const allSubtaskIds = task.subtasks?.map((subtask) => subtask.id) ?? linkedPlan?.items.map((item) => item.id) ?? [];
  const state = resolveTaskState(task, task.taskType === "session" ? 0 : itemCount);
  const { completedCount, totalCount } = calculateTaskProgress(task, task.taskType === "session" ? 0 : itemCount);
  const duration = formatDuration(task.startTime, task.endTime);
  const hasItems = itemCount > 0;

  const trailing = (
    <div className="flex items-center gap-1">
      {hasItems && onOpenSubtasks && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic("light");
            onOpenSubtasks();
          }}
          aria-label="Open subtasks"
          className="inline-flex h-8 items-center gap-1 rounded-full bg-neutral-100 px-2.5 text-[12px] font-bold tabular-nums text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300"
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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-300"
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
