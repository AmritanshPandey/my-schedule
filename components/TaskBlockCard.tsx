"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconCheck, IconMinus, IconTrash, IconX } from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { resolveAccentColor, timelineCardStyles } from "@/lib/colorSystem";
import IconButton from "@/components/ui/IconButton";

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
  /** When set, a hover trash button appears next to the checkbox (grid). */
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
  onDelete,
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
    <div className="relative flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-px">
        {showEyebrow && (
          <span className={`truncate font-bold ${styles.planLabel} ${isList ? "text-[11px]" : "text-[9px] leading-none"}`}>
            {plan!.title}
          </span>
        )}
        <span
          className={`truncate font-bold leading-tight ${styles.title} ${
            isList ? "text-[16px]" : compact ? "text-[11px]" : "text-[12.5px]"
          } ${resolved && isList ? `line-through ${missed ? "decoration-rose-400" : "decoration-neutral-400"}` : ""}`}
        >
          {task.title}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {trailing}
        {onDelete && (
          <IconButton
            label="Delete task"
            variant="dangerGhost"
            size="tiny"
            radius="lg"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="hidden rounded-[5px] group-hover:flex"
          >
            <IconTrash size={12} strokeWidth={2} />
          </IconButton>
        )}
        <button
          type="button"
          disabled={readOnly}
          onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggle(); }}
          className={`flex shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors disabled:opacity-100 ${readOnly ? "cursor-default" : ""} ${
            isList ? "h-[22px] w-[22px]" : "h-[18px] w-[18px]"
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
          {done && <IconCheck size={isList ? 14 : 12} strokeWidth={3} className="text-white" />}
          {partial && <IconMinus size={isList ? 14 : 12} strokeWidth={3} className="text-white" />}
          {missed && <IconX size={isList ? 14 : 12} strokeWidth={3} className="text-white" />}
        </button>
      </div>
    </div>
  );

  const timeRow = (task.startTime || task.endTime) ? (
    <div className="relative flex flex-wrap items-center gap-1.5">
      <span
        className={`whitespace-nowrap font-extrabold tabular-nums text-neutral-500 dark:text-neutral-400 ${isList ? "text-[13px]" : compact ? "text-[10px]" : "text-[11px]"}`}
      >
        {task.startTime}{task.endTime ? ` – ${task.endTime}` : ""}
      </span>
      {duration && !narrow && (
        <span className={`rounded-full px-1.5 text-[9px] font-bold leading-[15px] border ${styles.durationBadge}`}>
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
          ? "rounded-[18px] gap-2 px-4 py-3.5"
          : "rounded-[8px] justify-between hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.25)] " + (compact ? "gap-1 px-2.5 py-1.5" : "gap-1.5 pl-3 pr-2 py-2")
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
    >
      {header}
      {timeRow}
      {footer && <div className="relative">{footer}</div>}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
