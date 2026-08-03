"use client";

import { IconArrowUpRight, IconEdit, IconListCheck } from "@tabler/icons-react";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import type { Plan, Task, TaskCategory } from "@/lib/useScheduleDB";
import { calculateTaskProgress, getTaskCheckableItems, getTaskSubtaskSummary, isTrackedTask, resolveTaskState } from "@/lib/taskCompletion";
import { formatSlotsDuration } from "@/lib/timeUtils";
import { getSlots } from "@/lib/taskMutations";
import { haptic } from "@/lib/haptics";

interface IOSLightTaskCardProps {
  task: Task;
  linkedPlan: Plan | null;
  /** Owns the card's accent; null renders neutral (held time / uncategorised). */
  category: TaskCategory | null;
  readOnly?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  /** Long-press the checkbox. Omitted → the gesture is inert. */
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  /** Independent per-phase toggle for a multi-slot task (same-day multiple time blocks). */
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onEdit: () => void;
  onOpenSubtasks?: () => void;
}

export default function IOSLightTaskCard({
  task,
  linkedPlan,
  category,
  readOnly = false,
  onToggleComplete,
  onMissed,
  onToggleSlot,
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
  const tracked = isTrackedTask(task);
  const slots = getSlots(task);
  const isMultiSlot = slots.length > 1;
  const slotCompletions = tracked && isMultiSlot && onToggleSlot
    ? slots.map((_, i) => ({
        done: (task.completedSlotIndices ?? []).includes(i),
        onToggle: () => onToggleSlot(task.id, i),
      }))
    : undefined;
  const duration = formatSlotsDuration(slots);
  const hasItems = itemCount > 0;

  const trailing = (
    <div className="flex items-center gap-2">
      {/* Gated on `tracked`, not `hasItems`: a task with no subtasks still needs
          a route into its detail view, which is where "Missed" lives. Without
          this a subtask-less task could never be marked missed at all. */}
      {tracked && onOpenSubtasks && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            haptic("light");
            onOpenSubtasks();
          }}
          aria-label={hasItems ? "Open subtasks" : "Open task details"}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-3 text-[12px] font-extrabold tabular-nums text-neutral-600 transition-colors active:bg-white/80 dark:border-white/[0.10] dark:bg-white/[0.08] dark:text-neutral-200 dark:active:bg-white/[0.12]"
        >
          {hasItems && <IconListCheck size={14} strokeWidth={2} />}
          {hasItems && `${completedCount}/${totalCount || itemCount}`}
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
      category={category}
      state={state}
      duration={duration}
      readOnly={readOnly}
      slotCompletions={slotCompletions}
      onToggle={() => {
        haptic("medium");
        onToggleComplete(task.id, allSubtaskIds);
      }}
      onLongPressMissed={onMissed ? () => onMissed(task.id, allSubtaskIds) : undefined}
      onClick={() => {
        // Held time can't be completed, so tapping the card must do nothing.
        if (!readOnly && !slotCompletions && tracked) {
          haptic("light");
          onToggleComplete(task.id, allSubtaskIds);
        }
      }}
      trailing={trailing}
    />
  );
}
