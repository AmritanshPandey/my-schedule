"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconCheck, IconMinus, IconTrash, IconX } from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { categoryHex, resolveAccentColor } from "@/lib/colorSystem";

/**
 * Shared colored category block used in BOTH surfaces:
 *  - desktop week grid (`variant="grid"`, absolutely positioned to a time slot)
 *  - mobile day list   (`variant="list"`, natural-height stacked card)
 *
 * The visual identity (category border + tint, plan eyebrow, title, time,
 * duration pill, checkbox) is identical; only sizing + the extra slots
 * (trailing/footer/children) differ between variants.
 *
 * Grid blocks mirror the design reference: eyebrow + title pinned to the top,
 * time + duration pinned to the bottom (space-between within the time slot).
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
  const hex = categoryHex(resolveAccentColor(task.color, task.icon));
  const done = state === "completed";
  const partial = state === "partial";
  const missed = state === "missed";
  const resolved = done || missed;            // dimmed + struck either way
  const isList = variant === "list";
  const showEyebrow = !!plan && !narrow && !minimal;

  // Tiny grid slot — colored chip with just the title.
  if (minimal) {
    return (
      <div
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={`group relative flex items-center overflow-hidden rounded-[8px] bg-white px-2 dark:bg-neutral-900 ${resolved ? "opacity-60" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
        style={{ border: `1px solid ${hex}`, boxShadow: `inset 3px 0 0 ${hex}`, ...style }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 dark:opacity-[0.18]" style={{ background: hex, opacity: 0.08 }} />
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
          <span className={`truncate font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400 ${isList ? "text-[10px]" : "text-[8px] leading-none"}`}>
            {plan!.title}
          </span>
        )}
        <span
          className={`truncate font-bold leading-tight text-neutral-900 dark:text-white ${
            isList ? "text-[16px]" : compact ? "text-[11px]" : "text-[12.5px]"
          } ${resolved && isList ? `line-through ${missed ? "decoration-rose-400" : "decoration-neutral-400"}` : ""}`}
        >
          {task.title}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {trailing}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete task"
            className="hidden h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-neutral-400 transition-colors hover:bg-rose-500/10 hover:text-rose-500 group-hover:flex dark:text-neutral-500"
          >
            <IconTrash size={12} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggle(); }}
          className={`flex shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${readOnly ? "cursor-default" : ""} ${
            isList ? "h-[22px] w-[22px]" : "h-[18px] w-[18px]"
          } ${
            done || partial ? "border-transparent bg-green-500"
            : missed ? "border-transparent bg-rose-500"
            : "border-neutral-300 bg-white/80 dark:border-neutral-500 dark:bg-neutral-800"
          }`}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
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
        className={`whitespace-nowrap font-extrabold tabular-nums ${isList ? "text-[13px]" : compact ? "text-[10px]" : "text-[11px]"}`}
        style={{ color: hex }}
      >
        {task.startTime}{task.endTime ? ` – ${task.endTime}` : ""}
      </span>
      {duration && !narrow && (
        <span className="rounded-full px-1.5 text-[9px] font-bold leading-[15px]" style={{ color: hex, border: `1px solid ${hex}` }}>
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
      className={`group relative flex flex-col overflow-hidden bg-white transition-all dark:bg-neutral-900 ${
        resolved ? "opacity-60" : ""
      } ${
        isList
          ? "rounded-[18px] gap-2 px-4 py-3.5"
          : "rounded-[8px] justify-between hover:-translate-y-px hover:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.25)] " + (compact ? "gap-1 px-2.5 py-1.5" : "gap-1.5 pl-3 pr-2 py-2")
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ border: `1px solid ${hex}`, boxShadow: `inset 3px 0 0 ${hex}`, ...style }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 dark:opacity-[0.18]" style={{ background: hex, opacity: 0.08 }} />

      {header}
      {timeRow}
      {footer && <div className="relative">{footer}</div>}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
