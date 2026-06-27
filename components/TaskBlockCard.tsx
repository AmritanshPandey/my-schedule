"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconCheck, IconMinus, IconX, IconListCheck, IconArrowUpRight } from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { getTaskSubtaskSummary } from "@/lib/taskCompletion";
import { resolveAccentColor, timelineCardStyles } from "@/lib/colorSystem";

/**
 * Shared colored category block used in BOTH surfaces:
 *  - desktop week grid (`variant="grid"`, absolutely positioned to a time slot)
 *  - mobile day list   (`variant="list"`, natural-height stacked card)
 *
 * Card background: pastel (color-100) in light mode, deep dark (color-950) in
 * dark mode. Left border bar is the 500-level accent. Time/duration text uses
 * the hex color inline so it always matches regardless of theme.
 */
export interface TaskBlockCardProps {
  task: Task;
  plan: Plan | null;
  variant: "grid" | "list";
  state: TaskState;
  duration: string | null;
  readOnly?: boolean;
  /** grid: short slot (shrink text + padding). */
  compact?: boolean;
  /** grid: overlapping lane / short — drop eyebrow + duration. */
  narrow?: boolean;
  /** grid: tiny slot — render just the title chip. */
  minimal?: boolean;
  onToggle: () => void;
  onClick?: () => void;
  /**
   * Timeline (grid) only: when set and the task has subtasks/steps, a tappable
   * "N/M" pill appears under the title to open the subtasks sheet.
   */
  onOpenSubtasks?: () => void;
  /**
   * Accepted for compatibility but intentionally not rendered on the card —
   * an on-card trash sat next to the checkbox and was easy to mis-tap (on iOS
   * the hover state sticks after a tap). Delete lives in the task edit sheet.
   */
  onDelete?: () => void;
  /** Right-of-checkbox content (list: subtask chip / chevron / edit-delete). */
  trailing?: ReactNode;
  /** Full-width content below the time row (list: progress bar). */
  footer?: ReactNode;
  /** Expandable area (list: subtasks). */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function TaskBlockCard({
  task,
  plan,
  variant,
  state,
  duration,
  readOnly = false,
  compact = false,
  narrow = false,
  onToggle,
  onClick,
  onOpenSubtasks,
  trailing,
  footer,
  children,
  className = "",
  style,
  minimal = false,
}: TaskBlockCardProps) {
  const accent = resolveAccentColor(task.color, task.icon);
  const styles = timelineCardStyles(accent);
  const done = state === "completed";
  const partial = state === "partial";
  const missed = state === "missed";
  const resolved = done || missed;
  const isList = variant === "list";
  const showEyebrow = !!plan && !narrow && !minimal;
  // Timeline (grid) subtask/session pill — only when wired and the task has items.
  const subtaskPill = onOpenSubtasks && !isList && !minimal ? getTaskSubtaskSummary(task, plan) : null;
  const statusLabel = readOnly
    ? done
      ? "Completed"
      : missed
      ? "Missed"
      : partial
      ? "Partially completed"
      : "Not completed"
    : done
    ? "Mark incomplete"
    : "Mark complete";

  // Tiny grid slot — colored chip with just the title.
  if (minimal) {
    return (
      <div
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={`group relative flex items-center overflow-hidden rounded-[8px] px-2 ${styles.cardBg} ${styles.blockBorder} ${resolved ? "opacity-60" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
        style={style}
      >
        <span className={`relative truncate text-[10px] font-bold leading-none text-neutral-900 dark:text-white ${resolved ? "line-through decoration-neutral-400" : ""}`}>
          {task.title}
        </span>
      </div>
    );
  }

  const header = (
    <div className={`relative flex items-start justify-between ${isList ? "gap-3" : "gap-2"}`}>
      <div className={`flex min-w-0 flex-col ${isList ? "gap-1" : "gap-px"}`}>
        {showEyebrow && (
          <span className={`truncate font-extrabold ${styles.planLabel} ${isList ? "text-[12px] leading-none" : "text-[9px] leading-none"}`}>
            {plan!.title}
          </span>
        )}
        <span
          className={`truncate font-extrabold leading-tight tracking-normal ${styles.title} ${
            isList ? "text-[17px]" : compact ? "text-[11px]" : "text-[12.5px]"
          } ${resolved && isList ? `line-through ${missed ? "decoration-rose-400" : "decoration-neutral-400"}` : ""}`}
        >
          {task.title}
        </span>
        {subtaskPill?.hasItems && (
          <button
            type="button"
            aria-label="Open subtasks"
            onClick={(e) => { e.stopPropagation(); onOpenSubtasks?.(); }}
            className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-black/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-neutral-700 dark:border-white/20 dark:text-neutral-200"
          >
            <IconListCheck size={12} strokeWidth={2} />
            {subtaskPill.completedCount}/{subtaskPill.totalCount}
            {!narrow && <IconArrowUpRight size={11} strokeWidth={2.2} />}
          </button>
        )}
      </div>

      <div className={`flex shrink-0 items-center ${isList ? "gap-2" : "gap-1"}`}>
        {trailing}
        <button
          type="button"
          disabled={readOnly}
          onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggle(); }}
          className={`flex shrink-0 items-center justify-center border-[1.5px] transition-colors disabled:opacity-100 ${readOnly ? "cursor-default" : ""} ${
            isList ? "h-7 w-7 rounded-[8px]" : "h-[18px] w-[18px] rounded-[5px]"
          } ${
            done || partial ? "border-transparent bg-green-500"
            : missed ? "border-transparent bg-rose-500"
            : readOnly ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
            : "border-neutral-300 bg-white/80 dark:border-neutral-500 dark:bg-neutral-800"
          }`}
          aria-label={statusLabel}
          aria-disabled={readOnly}
          aria-pressed={done || partial}
        >
          {done && <IconCheck size={isList ? 16 : 12} strokeWidth={3} className="text-white" />}
          {partial && <IconMinus size={isList ? 16 : 12} strokeWidth={3} className="text-white" />}
          {missed && <IconX size={isList ? 16 : 12} strokeWidth={3} className="text-white" />}
        </button>
      </div>
    </div>
  );

  const timeRow = (task.startTime || task.endTime) ? (
    <div className={`relative flex flex-wrap items-center ${isList ? "gap-2" : "gap-1.5"}`}>
      <span
        className={`whitespace-nowrap font-extrabold tabular-nums ${isList ? styles.time : "text-neutral-500 dark:text-neutral-400"} ${isList ? "text-[14px]" : compact ? "text-[10px]" : "text-[11px]"}`}
      >
        {task.startTime}{task.endTime ? ` – ${task.endTime}` : ""}
      </span>
      {duration && !narrow && (
        <span className={`rounded-full border border-current px-2 font-extrabold ${styles.durationBadge} ${isList ? "text-[11px] leading-5" : "text-[9px] leading-[15px]"}`}>
          {duration}
        </span>
      )}
    </div>
  ) : null;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      className={`group relative flex flex-col overflow-hidden transition-all ${styles.cardBg} ${styles.blockBorder} ${
        resolved ? "opacity-60" : ""
      } ${
        isList
          ? "rounded-2xl gap-3 px-5 py-4 active:scale-[0.995]"
          : "rounded-[8px] justify-between " + (compact ? "gap-1 px-2.5 py-1.5" : "gap-1.5 pl-3 pr-2 py-2")
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
    >
      {isList && (
        <>
          <div className={`pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full ${styles.dot}`} />
        </>
      )}
      {header}
      {timeRow}
      {footer && <div className="relative">{footer}</div>}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
