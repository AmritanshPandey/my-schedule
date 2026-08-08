"use client";

import { IconArrowUpRight, IconEdit, IconListCheck } from "@tabler/icons-react";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import type { Plan, Task, TaskCategory } from "@/lib/useScheduleDB";
import { calculateTaskProgress, getTaskCheckableItems, getTaskSubtaskSummary, isTrackedTask, resolveTaskState, type TaskState } from "@/lib/taskCompletion";
import { formatSlotsDuration } from "@/lib/timeUtils";
import { getSlots } from "@/lib/taskMutations";
import { haptic } from "@/lib/haptics";

interface IOSLightTaskCardProps {
  task: Task;
  linkedPlan: Plan | null;
  /** Owns the card's accent; null renders neutral (held time / uncategorised). */
  category: TaskCategory | null;
  readOnly?: boolean;
  /** When false, the per-card edit (pencil) affordance is hidden (Today edit mode off). */
  editMode?: boolean;
  /**
   * When set, render only this one slot of a multi-slot task, with its own
   * checkbox — so a task scheduled at several times appears as a separate entry
   * at each time in the day list (sorted chronologically by the caller).
   */
  slotIndex?: number;
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
  editMode = true,
  slotIndex,
  onToggleComplete,
  onMissed,
  onToggleSlot,
  onEdit,
  onOpenSubtasks,
}: IOSLightTaskCardProps) {
  const summary = getTaskSubtaskSummary(task, linkedPlan);
  const itemCount = summary.totalCount;
  const allSubtaskIds = getTaskCheckableItems(task, linkedPlan).map((item) => item.id);
  const { completedCount, totalCount } = task.taskType === "session"
    ? summary
    : calculateTaskProgress(task, itemCount);
  const tracked = isTrackedTask(task);
  const slots = getSlots(task);
  const isMultiSlot = slots.length > 1;

  // Rendering a single slot of a multi-slot task as its own entry.
  const singleSlot = slotIndex != null && slotIndex >= 0 && slotIndex < slots.length;
  const slotDone = singleSlot ? (task.completedSlotIndices ?? []).includes(slotIndex!) : false;

  const state: TaskState = singleSlot && tracked
    ? (slotDone ? "completed" : "incomplete")
    : resolveTaskState(task, task.taskType === "session" ? 0 : itemCount);

  // Per-phase checkboxes-within-one-card only apply when NOT already split into
  // one card per slot.
  const slotCompletions = !singleSlot && tracked && isMultiSlot && onToggleSlot
    ? slots.map((_, i) => ({
        done: (task.completedSlotIndices ?? []).includes(i),
        onToggle: () => onToggleSlot(task.id, i),
      }))
    : undefined;

  const duration = singleSlot ? formatSlotsDuration([slots[slotIndex!]]) : formatSlotsDuration(slots);
  const hasItems = itemCount > 0;
  // Nothing to open when the task has no subtasks and no note/detail — hide the
  // arrow rather than routing to an empty detail page.
  const hasDetail = hasItems || !!task.description?.trim();
  // Shared subtasks belong to the task, not a phase — only surface the route
  // into them on the first slot card so it isn't repeated per phase.
  const showSubtasksButton = tracked && !!onOpenSubtasks && hasDetail && (!singleSlot || slotIndex === 0);
  const toggleSlot = () => { haptic("medium"); onToggleSlot?.(task.id, slotIndex!); };

  const trailing = (
    <div className="flex items-center gap-2">
      {/* Gated on `tracked`, not `hasItems`: a task with no subtasks still needs
          a route into its detail view, which is where "Missed" lives. Without
          this a subtask-less task could never be marked missed at all. */}
      {showSubtasksButton && onOpenSubtasks && (
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
      {editMode && (
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
      )}
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
      slotOverride={singleSlot ? slots[slotIndex!] : undefined}
      slotCompletions={slotCompletions}
      onToggle={singleSlot
        ? toggleSlot
        : () => {
            haptic("medium");
            onToggleComplete(task.id, allSubtaskIds);
          }}
      // A single-slot card's checkbox is the phase toggle; whole-day "missed"
      // stays on the unsplit card only.
      onLongPressMissed={!singleSlot && onMissed ? () => onMissed(task.id, allSubtaskIds) : undefined}
      onClick={() => {
        if (readOnly || !tracked) return; // held time / past days aren't tappable
        if (singleSlot) { toggleSlot(); return; }
        // Multi-slot (unsplit) uses per-row checkboxes, so a body tap is inert.
        if (!slotCompletions) {
          haptic("light");
          onToggleComplete(task.id, allSubtaskIds);
        }
      }}
      trailing={trailing}
    />
  );
}
