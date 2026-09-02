"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconMinus, IconX, IconListCheck, IconArrowUpRight } from "@tabler/icons-react";
import CheckDraw from "@/components/ui/CheckDraw";
import type { Plan, Task, TaskCategory, TaskSlot } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { getTaskSubtaskSummary, isTrackedTask, taskStatusLabel } from "@/lib/taskCompletion";
import { useLongPress } from "@/lib/useLongPress";
import { getSlots } from "@/lib/taskMutations";
import { formatDisplayTime } from "@/lib/timeUtils";
import { timelineCardStyles, quietTimelineCardStyles, TIMELINE_NEUTRAL_CARD } from "@/lib/colorSystem";

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
  /**
   * The task's category, resolved by the parent (which already looks up `plan`
   * the same way). Supplies the block's accent — held time and uncategorised
   * tasks pass null and render neutral.
   *
   * Required, not optional: as an optional prop a caller that forgot it still
   * type-checked and silently rendered every block neutral.
   */
  category: TaskCategory | null;
  variant: "grid" | "list";
  state: TaskState;
  duration: string | null;
  readOnly?: boolean;
  /**
   * grid only: square off the edge where an overnight block is cut by the day
   * boundary — "bottom" on the block that runs out of day, "top" on the
   * continuation that picks it up the next morning. The standard calendar
   * idiom: the flat edges read as one interrupted block without any extra
   * chrome. Set as a prop rather than passed through `className` because
   * Tailwind emits both radius utilities at equal specificity, so which one
   * wins depends on stylesheet order rather than the order of the strings.
   */
  edgeCut?: "top" | "bottom";
  /** grid: short slot (shrink text + padding). */
  compact?: boolean;
  /** grid: overlapping lane / short — drop eyebrow + duration. */
  narrow?: boolean;
  /** grid: tiny slot — render just the title chip. */
  minimal?: boolean;
  /**
   * grid only: the single slot this positioned block represents. When set, the
   * time row shows just this slot; when absent (list), all of the task's slots
   * are shown.
   */
  slotOverride?: TaskSlot;
  /**
   * Index of `slotOverride` into getSlots(task) — paired with it so a "1/2"
   * phase badge can render when a repeated-same-day task is split into
   * separate blocks. Without this, two blocks of the same task sitting back
   * to back (e.g. a morning and an afternoon session) look identical apart
   * from their time, easy to mistake for a scheduling duplicate rather than
   * two phases of one task.
   */
  slotIndex?: number;
  /**
   * list only: independent completion state + toggle per slot, aligned 1:1
   * with getSlots(task). When the task has more than one slot and this is
   * provided, each phase renders its own row and checkbox — "N things to
   * check off today" — instead of one shared header checkbox for every phase.
   * Ignored for grid (slotOverride already isolates one slot per block) and
   * for a "missed" task (a missed day is whole-task, not per-phase).
   */
  slotCompletions?: Array<{ done: boolean; onToggle: () => void }>;
  onToggle: () => void;
  /**
   * list variant only: long-press the status checkbox to mark the day missed.
   * Omitted → the gesture is inert. Never wired for the grid variant, where the
   * timeline already owns a 300ms long-press for drag-move.
   */
  onLongPressMissed?: () => void;
  /**
   * grid only: THE hover/focus-revealed icon button in the block's top-right
   * corner — one slot, never two. Normally it is the grid variant's equivalent
   * of the list variant's long-press-to-miss (which is inert here; see
   * onLongPressMissed above): "mark missed" / "handle missed → reschedule", so
   * a WeekGrid block can reach that flow without a gesture that would collide
   * with drag-to-retime (WeekGrid's pointerdown handler already excludes
   * button targets). While Cmd/Ctrl is held the caller swaps in "delete task"
   * (`danger`) instead — a trash that showed on every plain hover was too easy
   * to hit while sweeping the mouse across a dense week, and the modifier is
   * one this surface already asks the user to hold for drag-to-move.
   *
   * `danger` only tints the hover state; the corner stays a single button
   * either way, so the two actions can never be mistaken for one another.
   */
  gridMenuAction?: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean };
  onClick?: () => void;
  /**
   * Timeline (grid) only: when set and the task has subtasks/steps, a tappable
   * "N/M" pill appears under the title to open the subtasks sheet.
   */
  onOpenSubtasks?: () => void;
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
  category,
  variant,
  state,
  duration,
  readOnly = false,
  edgeCut,
  compact = false,
  narrow = false,
  onToggle,
  onLongPressMissed,
  gridMenuAction,
  onClick,
  onOpenSubtasks,
  trailing,
  footer,
  children,
  className = "",
  style,
  minimal = false,
  slotOverride,
  slotIndex,
  slotCompletions,
}: TaskBlockCardProps) {
  // A commitment is held time, not work: it reports no completion state, so it
  // carries no checkbox at all. Derived from the task itself so every surface
  // that renders through this card inherits the behaviour without a prop.
  const tracked = isTrackedTask(task);
  // Held time is neutral grey in both themes — never a category hue, even when
  // the commitment is categorised — so it always reads as a muted, non-actionable
  // block. An uncategorised task is neutral for the same reason (no identity to
  // spend). Tracked + categorised tasks keep their accent.
  const accent = category?.color ?? null;
  // Sleep and rest are recovery, not work: they keep their plan's hue but lose
  // the saturated fill, so a night's sleep never shouts as loudly as the
  // session you are trying to hold yourself to. Read straight off the
  // category — the card already has it, so no caller has to pass a flag.
  const recovery = category?.kind === "sleep" || category?.kind === "rest";
  const styles = !accent || !tracked
    ? TIMELINE_NEUTRAL_CARD
    : recovery
    ? quietTimelineCardStyles(accent)
    : timelineCardStyles(accent);
  const done = state === "completed";
  const partial = state === "partial";
  const missed = state === "missed";
  const resolved = done || missed;
  const isList = variant === "list";
  // A commitment renders as a thinner, quieter slab so tracked tasks read as
  // primary. Chiefly for the list (iOS) surface; on the grid it just tightens
  // the internal padding (height stays time-proportional).
  const slim = !tracked;
  // Grid blocks show only the slot being positioned; list cards show every slot.
  const displaySlots = slotOverride ? [slotOverride] : getSlots(task);
  const isMultiSlotList =
    tracked && isList && !slotOverride && !missed && !!slotCompletions && slotCompletions.length === displaySlots.length && displaySlots.length > 1;
  const showEyebrow = !!plan && !narrow && !minimal;
  // "1/2" phase badge — the only thing that told two blocks of a repeated-
  // same-day task apart used to be their time, so two back-to-back blocks
  // (say, a morning and an afternoon session) read as identical at a glance
  // and were easy to mistake for an accidental scheduling duplicate.
  const totalTaskSlots = getSlots(task).length;
  const showPhaseBadge = slotIndex !== undefined && totalTaskSlots > 1 && !narrow && !minimal;
  const gridRadius =
    edgeCut === "bottom" ? "rounded-t-[8px]" : edgeCut === "top" ? "rounded-b-[8px]" : "rounded-[8px]";
  // Timeline (grid) subtask/session pill — only when wired and the task has items.
  const subtaskPill = onOpenSubtasks && !isList && !minimal ? getTaskSubtaskSummary(task, plan) : null;
  const statusLabel = taskStatusLabel(state, readOnly);

  // Long-press the checkbox to mark the day missed. List variant only: the
  // timeline already owns a 300ms long-press on the whole grid block (including
  // its checkbox) for drag-move, and a second one would race it. Inert on a
  // completed task, since marking missed would silently un-complete it.
  const canMiss =
    !!onLongPressMissed && isList && tracked && !readOnly && !done && !isMultiSlotList;
  const longPress = useLongPress(canMiss ? onLongPressMissed : undefined);

  // Tiny grid slot — colored chip with just the title.
  if (minimal) {
    return (
      <div
        role={onClick ? "button" : undefined}
        onClick={onClick}
        className={`group relative flex items-center overflow-hidden rounded-[10px] px-2 ${styles.cardBg} ${styles.blockBorder} ${resolved ? "opacity-60" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
        style={style}
      >
        <span className={`relative truncate text-[10px] font-bold leading-none text-neutral-900 dark:text-white ${resolved ? "line-through decoration-neutral-400" : ""}`}>
          {task.title}
        </span>
      </div>
    );
  }

  // The checkbox (or, for held time, the lock marker) — exactly one of the two.
  // Rendered beside the title in every variant so the control always sits with
  // the thing it completes, rather than drifting to the far corner of the card.
  const statusControl =
    !isMultiSlotList && tracked ? (
      <button
        type="button"
        disabled={readOnly}
        onClick={(e) => { e.stopPropagation(); if (!readOnly) onToggle(); }}
        {...longPress.pressHandlers}
        className={`flex shrink-0 select-none items-center justify-center border-[1.5px] transition-colors [-webkit-touch-callout:none] disabled:opacity-100 motion-safe:duration-500 ${readOnly ? "cursor-default" : ""} ${
          isList ? "h-7 w-7 rounded-[8px]" : "h-[18px] w-[18px] rounded-pr-sm"
        } ${
          done || partial ? "border-transparent bg-green-500"
          : missed ? "border-transparent bg-rose-500"
          : readOnly ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
          // Tints toward rose across the hold, landing exactly as it fires.
          : longPress.pressing ? "bg-white/80 motion-safe:border-rose-400 dark:bg-neutral-800 dark:motion-safe:border-rose-400"
          : "border-neutral-300 bg-white/80 dark:border-neutral-500 dark:bg-neutral-800"
        }`}
        aria-label={statusLabel}
        aria-disabled={readOnly}
        aria-pressed={done}
      >
        <CheckDraw visible={done} size={isList ? 16 : 12} strokeWidth={3} className="text-white" />
        {partial && <IconMinus size={isList ? 16 : 12} strokeWidth={3} className="text-white" />}
        {missed && <IconX size={isList ? 16 : 12} strokeWidth={3} className="text-white" />}
      </button>
    ) : null;

  const title = (
    <span
      className={`min-w-0 truncate font-extrabold leading-tight tracking-normal ${styles.title} ${
        isList ? (slim ? "text-[14px]" : "text-[17px]") : compact ? "text-[11px]" : "text-[12.5px]"
      } ${resolved && isList ? `line-through ${missed ? "decoration-rose-400" : "decoration-neutral-400"}` : ""}`}
    >
      {task.title}
    </span>
  );

  const header = (
    <div className={`relative flex items-start justify-between ${isList ? "gap-3" : "gap-2"}`}>
      {/* The control sits left of the whole text column, not inline with the
          title, so the plan eyebrow and the task name keep one shared left
          edge instead of the title being indented under the eyebrow. */}
      <div className={`flex min-w-0 items-center ${isList ? "gap-2.5" : "gap-1.5"}`}>
        {statusControl}
        <div className={`flex min-w-0 flex-col ${isList ? "gap-1" : "gap-px"}`}>
          {(showEyebrow || showPhaseBadge) && (
            <div className="flex min-w-0 items-center gap-1">
              {showEyebrow && (
                <span className={`truncate font-extrabold ${styles.planLabel} ${isList ? "text-[12px] leading-none" : "text-[9px] leading-none"}`}>
                  {plan!.title}
                </span>
              )}
              {showPhaseBadge && (
                <span
                  aria-label={`Phase ${slotIndex! + 1} of ${totalTaskSlots}`}
                  className={`shrink-0 rounded-full border border-current/40 font-extrabold tabular-nums ${styles.durationBadge} ${
                    isList ? "px-1.5 text-[10px] leading-4" : "px-1 text-[8px] leading-[13px]"
                  }`}
                >
                  {slotIndex! + 1}/{totalTaskSlots}
                </span>
              )}
            </div>
          )}
          {title}
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
      </div>

      <div className={`flex shrink-0 items-center ${isList ? "gap-2" : "gap-1"}`}>
        {trailing}
      </div>
    </div>
  );

  const hasTime = displaySlots.some((s) => s.startTime || s.endTime);

  // Multi-slot list card: each phase is its own row with its own checkbox —
  // "N things to check off today" — instead of one combined time line.
  const slotRows = isMultiSlotList ? (
    <div className="relative flex flex-col gap-2">
      {displaySlots.map((slot, i) => {
        const slotDone = slotCompletions![i].done;
        return (
          <div key={i} className="flex items-center gap-3">
            <button
              type="button"
              disabled={readOnly}
              onClick={(e) => { e.stopPropagation(); if (!readOnly) slotCompletions![i].onToggle(); }}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border-[1.5px] transition-colors disabled:opacity-100 ${readOnly ? "cursor-default" : ""} ${
                slotDone
                  ? "border-transparent bg-green-500"
                  : readOnly
                  ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
                  : "border-neutral-300 bg-white/80 dark:border-neutral-500 dark:bg-neutral-800"
              }`}
              aria-label={slotDone ? "Mark phase incomplete" : "Mark phase complete"}
              aria-pressed={slotDone}
            >
              <CheckDraw visible={slotDone} size={14} strokeWidth={3} className="text-white" />
            </button>
            <span
              className={`whitespace-nowrap text-[14px] font-extrabold tabular-nums ${styles.time} ${
                slotDone ? "line-through decoration-neutral-400 opacity-70" : ""
              }`}
            >
              {formatDisplayTime(slot.startTime)}{slot.endTime ? ` – ${formatDisplayTime(slot.endTime)}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  ) : null;

  const timeRow = !isMultiSlotList && hasTime ? (
    <div className={`relative flex flex-wrap items-center ${isList ? "gap-2" : "gap-1.5"}`}>
      <span
        className={`whitespace-nowrap font-extrabold tabular-nums ${isList ? styles.time : "text-neutral-500 dark:text-neutral-400"} ${isList ? "text-[14px]" : compact ? "text-[10px]" : "text-[11px]"}`}
      >
        {displaySlots
          .map((s) => `${formatDisplayTime(s.startTime)}${s.endTime ? ` – ${formatDisplayTime(s.endTime)}` : ""}`)
          .join("  ·  ")}
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
      // Swallows the click that follows a fired long-press — including one that
      // lands on the card body after the finger drifted off the checkbox, which
      // would otherwise open the task right after marking it missed.
      {...longPress.clickGuard}
      className={`group relative flex flex-col overflow-hidden transition-all ${styles.cardBg} ${styles.blockBorder} ${
        resolved ? "opacity-60" : ""
      } ${
        isList
          ? (slim ? "rounded-2xl gap-1.5 px-4 py-2.5 active:scale-[0.995]" : "rounded-2xl gap-3 px-5 py-4 active:scale-[0.995]")
          : `${gridRadius} justify-between ` + (slim ? "gap-1 pl-3 pr-2 py-1" : compact ? "gap-1 px-2.5 py-1.5" : "gap-1.5 pl-3 pr-2 py-2")
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
    >
      {isList && (
        <>
          <div className={`pointer-events-none absolute ${slim ? "inset-y-2" : "inset-y-4"} left-0 w-1 rounded-r-full ${styles.dot}`} />
        </>
      )}
      {!isList && !minimal && gridMenuAction && (
        <button
          type="button"
          aria-label={gridMenuAction.label}
          onClick={(e) => { e.stopPropagation(); gridMenuAction.onClick(); }}
          // cursor-pointer, not inherited: while Cmd/Ctrl is held the block
          // wrapper sets cursor-grab for drag-to-retime, which would otherwise
          // bleed through and make this button look like part of the drag.
          //
          // No backdrop-blur: `data-glass` is for floating chrome (nav, header,
          // sheets), not a button sitting on a card, so this tripped the e2e
          // banned-effects guard. The 90% fill carries the affordance on its
          // own — the blur was doing nothing a slightly more opaque background
          // doesn't do, behind a 24px icon.
          className={`absolute right-1 top-1 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/90 text-neutral-500 opacity-0 transition-opacity hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-neutral-900/90 dark:text-neutral-400 dark:hover:bg-neutral-900 ${
            gridMenuAction.danger
              ? "hover:text-rose-600 dark:hover:text-rose-400"
              : "hover:text-neutral-800 dark:hover:text-white"
          }`}
        >
          {gridMenuAction.icon}
        </button>
      )}
      {header}
      {timeRow}
      {slotRows}
      {footer && <div className="relative">{footer}</div>}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
