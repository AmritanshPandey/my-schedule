"use client";

import { IconEdit, IconListCheck, IconX } from "@tabler/icons-react";
import CheckDraw from "@/components/ui/CheckDraw";
import Pill from "@/components/ui/Pill";
import type { Plan, Task, TaskCategory } from "@/lib/useScheduleDB";
import {
  calculateTaskProgress,
  getTaskCheckableItems,
  getTaskSubtaskSummary,
  isTrackedTask,
  resolveTaskState,
} from "@/lib/taskCompletion";
import { getSlots } from "@/lib/taskMutations";
import { formatSlotsDuration, formatDisplayTime } from "@/lib/timeUtils";
import { useLongPress } from "@/lib/useLongPress";
import { haptic } from "@/lib/haptics";

interface IOSTimelineRowProps {
  task: Task;
  linkedPlan: Plan | null;
  category: TaskCategory | null;
  /** When set, this row is one slot of a multi-slot task. */
  slotIndex?: number;
  /** True when this row's slot window contains "now" (today only). */
  isCurrent?: boolean;
  /** Last row in the day — draw no connector tail. */
  isLast?: boolean;
  /** First row in the day — draw no connector above the node. */
  isFirst?: boolean;
  readOnly?: boolean;
  /** Reveal the per-row edit pencil (Today edit mode). */
  editMode?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onEdit: () => void;
  onOpenSubtasks?: () => void;
}

export default function IOSTimelineRow({
  task,
  linkedPlan,
  category,
  slotIndex,
  isCurrent = false,
  isLast = false,
  isFirst = false,
  readOnly = false,
  editMode = true,
  onToggleComplete,
  onMissed,
  onToggleSlot,
  onEdit,
  onOpenSubtasks,
}: IOSTimelineRowProps) {
  const summary = getTaskSubtaskSummary(task, linkedPlan);
  const itemCount = summary.totalCount;
  const allSubtaskIds = getTaskCheckableItems(task, linkedPlan).map((i) => i.id);
  const { completedCount, totalCount } = task.taskType === "session"
    ? summary
    : calculateTaskProgress(task, itemCount);
  const tracked = isTrackedTask(task);

  const slots = getSlots(task);
  const singleSlot = slotIndex != null && slotIndex >= 0 && slotIndex < slots.length;
  const slot = singleSlot ? slots[slotIndex!] : slots[0];
  const slotDone = singleSlot ? (task.completedSlotIndices ?? []).includes(slotIndex!) : false;

  const state = singleSlot && tracked
    ? (slotDone ? "completed" : "incomplete")
    : resolveTaskState(task, task.taskType === "session" ? 0 : itemCount);
  const done = state === "completed";
  const missed = state === "missed";

  const duration = singleSlot ? formatSlotsDuration([slots[slotIndex!]]) : formatSlotsDuration(slots);
  const timeLabel = formatDisplayTime(slot?.startTime ?? "");
  // Plan name is the identity; commitments have no plan, so fall back to the
  // category name ("Commute", "Held time").
  const label = linkedPlan?.title || category?.title || "";
  const subtitle = [label, duration].filter(Boolean).join(" · ");

  const hasItems = itemCount > 0;
  const hasDetail = hasItems || !!task.description?.trim();

  // Node = the completion toggle (replaces the inline checkbox).
  const toggle = () => {
    if (readOnly || !tracked) return;
    haptic("medium");
    if (singleSlot) onToggleSlot?.(task.id, slotIndex!);
    else onToggleComplete(task.id, allSubtaskIds);
  };
  const canMiss = tracked && !readOnly && !done && !singleSlot && !!onMissed;
  const longPress = useLongPress(canMiss ? () => onMissed?.(task.id, allSubtaskIds) : undefined);

  const openDetail = () => {
    if (hasDetail && onOpenSubtasks) { haptic("light"); onOpenSubtasks(); }
  };

  // ── Rail node ───────────────────────────────────────────────────────────────
  let node: React.ReactNode;
  if (!tracked) {
    // Held time — a quiet, non-actionable marker.
    node = (
      <span className="flex h-7 w-7 items-center justify-center">
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-300 dark:bg-white/25" />
      </span>
    );
  } else {
    const nodeClass = done
      ? "border-transparent bg-emerald-500 text-white"
      : missed
      ? "border-transparent bg-rose-500 text-white"
      : isCurrent
      ? "border-2 border-emerald-500 bg-white dark:bg-neutral-950"
      : "border-2 border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950";
    node = (
      <button
        type="button"
        disabled={readOnly}
        aria-label={done ? "Mark not done" : "Mark done"}
        aria-pressed={done}
        onClick={toggle}
        {...longPress.pressHandlers}
        className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors before:absolute before:-inset-2 before:content-[''] disabled:cursor-default ${nodeClass}`}
      >
        <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
        {missed && <IconX size={14} strokeWidth={3} className="text-white" />}
        {isCurrent && !done && !missed && (
          <span className="h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        )}
      </button>
    );
  }

  // The connector reads as a progress spine: completed segments glow emerald, the
  // live segment breathes (the app's calm "alive" primitive — no shimmer/gradient),
  // upcoming stays neutral.
  const connectorClass = isCurrent
    ? "bg-emerald-500/60 animate-status-pulse"
    : done
    ? "bg-emerald-500/40"
    : "bg-neutral-200 dark:bg-white/10";

  // ── Trailing status ─────────────────────────────────────────────────────────
  let trailing: React.ReactNode = null;
  if (done) {
    trailing = <Pill variant="success" size="sm">Completed</Pill>;
  } else if (missed) {
    trailing = <Pill variant="danger" size="sm">Missed</Pill>;
  } else if (isCurrent) {
    trailing = (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/[0.08] px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        In progress
      </span>
    );
  } else if (hasItems) {
    trailing = (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-neutral-400">
        <IconListCheck size={13} strokeWidth={2} />
        {completedCount}/{totalCount || itemCount}
      </span>
    );
  }

  // ── Card tint ────────────────────────────────────────────────────────────────
  const cardClass = !tracked
    ? "border-neutral-200/70 bg-neutral-100/60 dark:border-white/[0.07] dark:bg-white/[0.03]"
    : done
    ? "border-emerald-500/25 bg-emerald-500/[0.06]"
    : missed
    ? "border-rose-500/25 bg-rose-500/[0.06]"
    : isCurrent
    ? "border-emerald-500/40 bg-white ring-1 ring-emerald-500/30 shadow-now dark:bg-neutral-900"
    : "border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900";

  return (
    <div className="flex items-stretch gap-3 pb-3" {...longPress.clickGuard}>
      {/* Time — centered on the card so the whole row shares one baseline. */}
      <div className="flex w-[52px] shrink-0 items-center justify-end text-right text-[13px] font-semibold tabular-nums leading-none text-neutral-500 dark:text-neutral-400">
        {timeLabel}
      </div>

      {/* Rail: one continuous line behind a vertically-centered node. The line
          spans the card height and reaches -bottom-3 into the next row's top so
          segments join; it's clipped at the node centre on the first/last row. */}
      <div className="relative flex w-7 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={`absolute left-1/2 w-[1.5px] -translate-x-1/2 rounded-full ${connectorClass} ${
            isFirst ? "top-1/2" : "top-0"
          } ${isLast ? "bottom-1/2" : "-bottom-3"}`}
        />
        <div className="relative z-10">{node}</div>
      </div>

      {/* Card */}
      <div className="min-w-0 flex-1">
        <div
          role={hasDetail ? "button" : undefined}
          tabIndex={hasDetail ? 0 : undefined}
          onClick={openDetail}
          {...(hasDetail ? longPress.clickGuard : {})}
          data-glass={isCurrent ? "" : undefined}
          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${cardClass} ${hasDetail ? "cursor-pointer active:scale-[0.995]" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className={`truncate text-[16px] font-bold leading-tight ${
              !tracked ? "text-neutral-500 dark:text-neutral-400"
              : missed ? "text-neutral-500 line-through decoration-rose-400 dark:text-neutral-500"
              : "text-neutral-900 dark:text-white"
            }`}>
              {task.title}
            </p>
            {subtitle && (
              <p className="mt-0.5 truncate text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {trailing}
            {editMode && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); haptic("light"); onEdit(); }}
                aria-label="Edit task"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/60 text-neutral-600 transition-colors active:bg-white/80 dark:border-white/[0.10] dark:bg-white/[0.08] dark:text-neutral-200"
              >
                <IconEdit size={15} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
