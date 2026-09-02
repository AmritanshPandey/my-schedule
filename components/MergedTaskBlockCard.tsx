"use client";

import type { CSSProperties } from "react";
import { IconMinus, IconX } from "@tabler/icons-react";
import CheckDraw from "@/components/ui/CheckDraw";
import type { Plan, Task, TaskCategory, TaskSlot } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { isTrackedTask, taskStatusLabel } from "@/lib/taskCompletion";
import { formatDisplayTime } from "@/lib/timeUtils";
import { timelineCardStyles, quietTimelineCardStyles, TIMELINE_NEUTRAL_CARD } from "@/lib/colorSystem";

export interface MergedTaskBlockHalf {
  task: Task;
  plan: Plan | null;
  category: TaskCategory | null;
  state: TaskState;
  slot: TaskSlot;
  duration: string | null;
  readOnly?: boolean;
  onToggle: () => void;
  onClick: () => void;
}

interface MergedTaskBlockCardProps {
  primary: MergedTaskBlockHalf;
  partner: MergedTaskBlockHalf;
  /** Total block height in px — split evenly between the two halves. */
  height: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Two tasks sharing a `mergeGroupId` (lib/taskMerge.ts), rendered as one
 * grid block instead of splitting into side-by-side lanes. Each half keeps
 * its own category accent, checkbox, and click-to-edit — merging changes
 * layout only, never completion state or identity. See TaskBlockCard.tsx's
 * "grid" variant, which this deliberately doesn't extend: that component is
 * built around exactly one task/accent throughout, and the design system has
 * no blended/gradient accent to reach for (see DESIGN.md) — two solid halves
 * stacked in one border is the closest fit, so it's simplest as its own
 * small component rather than bolting a second identity onto that one.
 */
export default function MergedTaskBlockCard({ primary, partner, height, className = "", style }: MergedTaskBlockCardProps) {
  const compact = height < 72;
  const halfHeight = Math.max(22, height / 2 - 1); // -1 for the divider

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-[8px] border border-neutral-200 dark:border-white/[0.08] ${className}`}
      style={style}
    >
      <Half {...primary} compact={compact} height={halfHeight} />
      <div className="h-px shrink-0 bg-neutral-200 dark:bg-white/[0.08]" />
      <Half {...partner} compact={compact} height={halfHeight} />
    </div>
  );
}

function Half({
  task,
  category,
  state,
  slot,
  duration,
  readOnly = false,
  onToggle,
  onClick,
  compact,
  height,
}: MergedTaskBlockHalf & { compact: boolean; height: number }) {
  const tracked = isTrackedTask(task);
  const recovery = category?.kind === "sleep" || category?.kind === "rest";
  const accent = category?.color ?? null;
  const styles = !accent || !tracked ? TIMELINE_NEUTRAL_CARD : recovery ? quietTimelineCardStyles(accent) : timelineCardStyles(accent);
  const done = state === "completed";
  const partial = state === "partial";
  const missed = state === "missed";
  const resolved = done || missed;
  const statusLabel = taskStatusLabel(state, readOnly);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className={`group relative flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden px-2 ${styles.cardBg} ${resolved ? "opacity-60" : ""} cursor-pointer`}
      style={{ height }}
    >
      <span className={`pointer-events-none absolute inset-y-1 left-0 w-[3px] rounded-r-full ${styles.dot}`} />
      {tracked && (
        <button
          type="button"
          disabled={readOnly}
          onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggle(); }}
          className={`ml-1 flex h-[16px] w-[16px] shrink-0 select-none items-center justify-center rounded-[5px] border-[1.5px] transition-colors disabled:opacity-100 ${readOnly ? "cursor-default" : ""} ${
            done || partial ? "border-transparent bg-green-500"
            : missed ? "border-transparent bg-rose-500"
            : readOnly ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
            : "border-neutral-300 bg-white/80 dark:border-neutral-500 dark:bg-neutral-800"
          }`}
          aria-label={statusLabel}
          aria-disabled={readOnly}
          aria-pressed={done}
        >
          <CheckDraw visible={done} size={11} strokeWidth={3} className="text-white" />
          {partial && <IconMinus size={11} strokeWidth={3} className="text-white" />}
          {missed && <IconX size={11} strokeWidth={3} className="text-white" />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px">
        <span
          className={`truncate font-extrabold leading-tight ${styles.title} ${compact ? "text-[10.5px]" : "text-[12px]"} ${
            resolved ? "line-through decoration-neutral-400" : ""
          }`}
        >
          {task.title}
        </span>
        {!compact && duration && (
          <span className="truncate text-[9.5px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatDisplayTime(slot.startTime)}{slot.endTime ? ` – ${formatDisplayTime(slot.endTime)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
