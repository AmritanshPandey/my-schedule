"use client";

import { IconEdit } from "@tabler/icons-react";
import CheckDraw from "@/components/ui/CheckDraw";
import type { Plan, Task, TaskCategory } from "@/lib/useScheduleDB";
import { getTaskCheckableItems, isTrackedTask, resolveSlotState, resolveTaskState } from "@/lib/taskCompletion";
import { getSlots } from "@/lib/taskMutations";
import { formatSlotsDuration, formatDisplayTime } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";

export interface IOSMergedTimelineHalf {
  task: Task;
  linkedPlan: Plan | null;
  category: TaskCategory | null;
  slotIndex?: number;
}

interface IOSMergedTimelineRowProps {
  primary: IOSMergedTimelineHalf;
  partner: IOSMergedTimelineHalf;
  isLast?: boolean;
  isFirst?: boolean;
  readOnly?: boolean;
  editMode?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onEdit: (task: Task) => void;
}

/**
 * Two tasks sharing a `mergeGroupId` (lib/taskMerge.ts), sharing one rail
 * node instead of two separate rows. Each half keeps its own completion,
 * category, and edit action — merging only changes layout. Deliberately
 * simpler than IOSTimelineRow: no long-press-to-miss and no "current"/"past"
 * spine tinting per half (which task in the pair counts as "the" current one
 * is ambiguous), matching the same v1 scope cut already made on desktop.
 */
export default function IOSMergedTimelineRow({
  primary,
  partner,
  isLast = false,
  isFirst = false,
  readOnly = false,
  editMode = true,
  onToggleComplete,
  onToggleSlot,
  onEdit,
}: IOSMergedTimelineRowProps) {
  return (
    <div className="flex items-stretch gap-3 pb-3">
      <div className="w-[52px] shrink-0" />

      {/* Rail: a single connector spans both halves, with two nodes on it. */}
      <div className="relative flex w-7 shrink-0 flex-col items-center justify-center gap-2">
        <span
          aria-hidden
          className={`absolute left-1/2 w-[1.5px] -translate-x-1/2 rounded-full bg-neutral-200 dark:bg-white/10 ${
            isFirst ? "top-1/2" : "top-0"
          } ${isLast ? "bottom-1/2" : "-bottom-3"}`}
        />
        <Node half={primary} readOnly={readOnly} onToggleComplete={onToggleComplete} onToggleSlot={onToggleSlot} />
        <Node half={partner} readOnly={readOnly} onToggleComplete={onToggleComplete} onToggleSlot={onToggleSlot} />
      </div>

      {/* Card: one bordered container, two stacked halves. */}
      <div className="min-w-0 flex-1 divide-y divide-neutral-200/70 rounded-2xl border border-neutral-200/70 bg-white dark:divide-white/[0.07] dark:border-white/[0.07] dark:bg-neutral-900">
        <HalfRow half={primary} readOnly={readOnly} editMode={editMode} onEdit={onEdit} />
        <HalfRow half={partner} readOnly={readOnly} editMode={editMode} onEdit={onEdit} />
      </div>
    </div>
  );
}

function halfState(half: IOSMergedTimelineHalf) {
  const summary = getTaskCheckableItems(half.task, half.linkedPlan).length;
  const slots = getSlots(half.task);
  const singleSlot = half.slotIndex != null && half.slotIndex >= 0 && half.slotIndex < slots.length;
  const tracked = isTrackedTask(half.task);
  const state = singleSlot && tracked
    ? resolveSlotState(half.task, half.slotIndex!)
    : resolveTaskState(half.task, half.task.taskType === "session" ? 0 : summary);
  return { tracked, singleSlot, state, done: state === "completed", missed: state === "missed" };
}

function Node({
  half,
  readOnly,
  onToggleComplete,
  onToggleSlot,
}: {
  half: IOSMergedTimelineHalf;
  readOnly: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
}) {
  const { tracked, singleSlot, done, missed } = halfState(half);
  if (!tracked) {
    return (
      <span className="flex h-5 w-5 items-center justify-center">
        <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-white/25" />
      </span>
    );
  }
  const allSubtaskIds = getTaskCheckableItems(half.task, half.linkedPlan).map((i) => i.id);
  return (
    <button
      type="button"
      disabled={readOnly}
      aria-label={done ? "Mark not done" : "Mark done"}
      aria-pressed={done}
      onClick={() => {
        if (readOnly) return;
        haptic("medium");
        if (singleSlot) onToggleSlot?.(half.task.id, half.slotIndex!);
        else onToggleComplete(half.task.id, allSubtaskIds);
      }}
      className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-default ${
        done
          ? "border-transparent bg-emerald-500 text-white"
          : missed
          ? "border-transparent bg-rose-500 text-white"
          : "border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950"
      }`}
    >
      <CheckDraw visible={done} size={13} strokeWidth={3} className="text-white" />
    </button>
  );
}

function HalfRow({
  half,
  readOnly,
  editMode,
  onEdit,
}: {
  half: IOSMergedTimelineHalf;
  readOnly: boolean;
  editMode: boolean;
  onEdit: (task: Task) => void;
}) {
  const { task, linkedPlan, category, slotIndex } = half;
  const { missed } = halfState(half);
  const slots = getSlots(task);
  const singleSlot = slotIndex != null && slotIndex >= 0 && slotIndex < slots.length;
  const slot = singleSlot ? slots[slotIndex!] : slots[0];
  const duration = singleSlot ? formatSlotsDuration([slots[slotIndex!]]) : formatSlotsDuration(slots);
  const timeLabel = formatDisplayTime(slot?.startTime ?? "");
  const label = linkedPlan?.title || category?.title || "";
  const subtitle = [timeLabel, label, duration].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] font-bold leading-tight ${
          missed ? "text-neutral-500 line-through decoration-rose-400 dark:text-neutral-500" : "text-neutral-900 dark:text-white"
        }`}>
          {task.title}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{subtitle}</p>
        )}
      </div>
      {editMode && !readOnly && (
        <button
          type="button"
          onClick={() => { haptic("light"); onEdit(task); }}
          aria-label="Edit task"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/60 text-neutral-600 dark:border-white/[0.10] dark:bg-white/[0.08] dark:text-neutral-200"
        >
          <IconEdit size={13} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
