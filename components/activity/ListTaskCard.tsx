"use client";

import { memo, useMemo, useState } from "react";
import { m, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { IconArrowUpRight, IconCheck, IconChevronDown, IconEdit, IconListCheck, IconMinus, IconTrash, IconX } from "@tabler/icons-react";
import type { Task, Plan } from "@/lib/useScheduleDB";
import type { ScheduleEntry, MetaField } from "@/components/ScheduleItem";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
import type { TaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import ProgressBar from "@/components/ui/ProgressBar";
import IconButton from "@/components/ui/IconButton";

// ── Plan accent dot colors ────────────────────────────────────────────────────

const PLAN_DOT: Record<string, string> = {
  blue:    "bg-blue-500",
  emerald: "bg-emerald-500",
  violet:  "bg-violet-500",
  pink:    "bg-pink-500",
  amber:   "bg-amber-500",
  cyan:    "bg-cyan-500",
};

// ── Subtask detail pill text ──────────────────────────────────────────────────

function subtaskDetailPill(entry: ScheduleEntry): string | null {
  const info = entry.info?.trim() || entry.note?.trim();
  const details = [] as string[];
  if (info) details.push(info);
  if (entry.duration) details.push(entry.duration);
  if (details.length > 0) return details.join(" · ");

  const meta = (entry as ScheduleEntry & { meta?: MetaField[] }).meta;
  if (meta && meta.length > 0) return meta.map((m) => m.value).join(" | ");
  if (entry.time) return entry.time;
  return null;
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

interface CheckboxProps {
  state: TaskState;
  size?: "lg" | "md";
  readOnly?: boolean;
  onChange: () => void;
}

function TaskCheckbox({ state, size = "lg", readOnly = false, onChange }: CheckboxProps) {
  const dim      = size === "lg" ? "w-5 h-5"      : "w-4 h-4";
  const round    = size === "lg" ? "rounded-[6px]" : "rounded-[4px]";
  const iconSize = size === "lg" ? 14              : 12;
  const filled   = state === "completed" || state === "partial";
  const missed = state === "missed";
  const statusLabel = readOnly
    ? state === "completed"
      ? "Completed"
      : missed
      ? "Missed"
      : state === "partial"
      ? "Partially completed"
      : "Not completed"
    : state === "completed"
    ? "Mark incomplete"
    : "Mark complete";

  return (
    <m.button
      type="button"
      disabled={readOnly}
      whileTap={readOnly ? undefined : { scale: 0.84 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      onClick={(e) => { e.stopPropagation(); if (!readOnly) onChange(); }}
      aria-label={statusLabel}
      aria-disabled={readOnly}
      aria-pressed={filled}
      className={`shrink-0 ${dim} ${round} border-2 flex items-center justify-center transition-colors duration-150 disabled:opacity-100 ${readOnly ? "cursor-default" : ""} ${
        filled
          ? "border-transparent bg-green-500"
          : missed
          ? "border-transparent bg-rose-500"
          : readOnly
          ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
          : "border-neutral-300 bg-transparent dark:border-neutral-500"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === "completed" && (
          <m.span
            key="check"
            initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <IconCheck size={iconSize} strokeWidth={3} className="text-white" />
          </m.span>
        )}
        {state === "partial" && (
          <m.span
            key="partial"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
          >
            <IconMinus size={iconSize} strokeWidth={3} className="text-white" />
          </m.span>
        )}
        {state === "missed" && (
          <m.span
            key="missed"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
          >
            <IconX size={iconSize} strokeWidth={3} className="text-white" />
          </m.span>
        )}
      </AnimatePresence>
    </m.button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ListTaskCardProps {
  task: Task;
  linkedPlan: Plan | null;
  editMode?: boolean;
  /** Past/future day — show completion but don't allow toggling. */
  readOnly?: boolean;
  onToggleComplete: (taskId: string, allIds: string[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenRoutine?: () => void;
  /** Open the subtasks/session bottom sheet (preferred over inline expand). */
  onOpenSubtasks?: () => void;
}

const SWIPE_THRESHOLD = 72;

function ListTaskCardInner({
  task,
  linkedPlan,
  editMode = false,
  readOnly = false,
  onToggleComplete,
  onToggleSubtask,
  onEdit,
  onDelete,
  onOpenRoutine,
  onOpenSubtasks,
}: ListTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  // ── Swipe-to-complete ───────────────────────────────────────────────────────
  const dragX = useMotionValue(0);
  const revealOpacity = useTransform(dragX, [0, 24, SWIPE_THRESHOLD], [0, 0, 1]);
  const revealScale   = useTransform(dragX, [0, SWIPE_THRESHOLD], [0.5, 1]);

  function handleDragEnd() {
    if (dragX.get() >= SWIPE_THRESHOLD) {
      haptic("medium");
      onToggleComplete(task.id, allSubtaskIds);
    }
    animate(dragX, 0, { type: "spring", stiffness: 400, damping: 30 });
  }

  // ── Derived state ───────────────────────────────────────────────────────────
  const isRoutine = task.taskType === "session";

  const subtasks: ScheduleEntry[] = useMemo(() => task.subtasks ?? [], [task.subtasks]);
  // For session tasks, steps are always task-level. For task type, fall back to
  // the plan template when no task-level subtasks have been saved yet.
  const templateItems: ScheduleEntry[] = useMemo(
    () => (!isRoutine && !task.subtasks?.length && linkedPlan ? linkedPlan.items : []),
    [isRoutine, task.subtasks, linkedPlan]
  );
  // Unified list of checkable items for this task
  const effectiveItems: ScheduleEntry[] = useMemo(
    () => (isRoutine ? subtasks : (subtasks.length > 0 ? subtasks : templateItems)),
    [isRoutine, subtasks, templateItems]
  );
  const allSubtaskIds = useMemo(() => effectiveItems.map((s) => s.id), [effectiveItems]);

  const { completedCount, totalCount, pct } = useMemo(
    () => calculateTaskProgress(task, isRoutine ? 0 : effectiveItems.length),
    [task, isRoutine, effectiveItems.length]
  );
  // Session tasks are never "partial" — pass 0 subtasks to skip that branch
  const taskState = useMemo(
    () => resolveTaskState(task, isRoutine ? 0 : effectiveItems.length),
    [task, isRoutine, effectiveItems.length]
  );
  const done = taskState === "completed";

  const duration = useMemo(
    () => formatDuration(task.startTime, task.endTime),
    [task.startTime, task.endTime]
  );

  const hasEffectiveItems = effectiveItems.length > 0;
  const hasRoutine = isRoutine && subtasks.length > 0;
  const canExpand  = !isRoutine && hasEffectiveItems;
  const itemCount  = effectiveItems.length;
  const displayPct = canExpand ? pct : 0;
  // Show 100% bar for done tasks with no expandable items (confirms completion visually)
  const barPct = done && !canExpand ? 100 : displayPct;

  // Card tap: a task with subtasks expands INLINE so steps can be checked in
  // place mid-execution (no modal round-trip) — the trailing count chip still
  // opens the detailed sheet. Session/routine tasks keep their richer sheet;
  // a plain task with nothing to show just toggles complete.
  function handleCardTap() {
    haptic("light");
    if (canExpand) {
      setExpanded((v) => !v);
    } else if (hasRoutine && onOpenSubtasks) {
      onOpenSubtasks();
    } else if (isRoutine && onOpenRoutine) {
      onOpenRoutine();
    } else if (!readOnly) {
      onToggleComplete(task.id, allSubtaskIds);
    }
  }

  // ── Right-of-checkbox action (subtask chip / view / chevron / edit-delete) ──
  const trailingNode = editMode ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
      >
        <IconEdit size={16} />
      </button>
      <IconButton
        label="Delete task"
        variant="dangerGhost"
        size="xs"
        radius="xl"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        <IconTrash size={16} />
      </IconButton>
    </div>
  ) : (canExpand || hasRoutine) && onOpenSubtasks ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenSubtasks(); }}
      aria-label="Open subtasks"
      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1.5 text-[12px] font-bold tabular-nums text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-300 dark:hover:bg-white/[0.12]"
    >
      <IconListCheck size={14} strokeWidth={2} />
      {completedCount}/{totalCount || itemCount}
      <IconArrowUpRight size={13} strokeWidth={2.2} />
    </button>
  ) : isRoutine && hasRoutine && onOpenRoutine ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpenRoutine(); }}
      className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-300 dark:hover:bg-white/[0.12]"
    >
      View
    </button>
  ) : canExpand ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-white/[0.12]"
    >
      <m.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.22, ease: "easeInOut" }} style={{ display: "flex" }}>
        <IconChevronDown size={18} strokeWidth={2} />
      </m.span>
    </button>
  ) : null;

  // ── Note + progress bar (below the time row) ────────────────────────────────
  const footerNode = (task.description || canExpand || done) ? (
    <div className="flex flex-col gap-2">
      {task.description && (
        <p className={`text-[13px] leading-relaxed ${done ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-500 dark:text-neutral-400"}`}>
          {task.description}
        </p>
      )}
      {(canExpand || done) && (
        <div className="flex items-center gap-3">
          <ProgressBar pct={barPct} height={8} fillClassName="bg-green-500" className="min-w-0 flex-1" />
          <span className="w-9 shrink-0 text-right text-[13px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
            {barPct}%
          </span>
        </div>
      )}
    </div>
  ) : null;

  // ── Expandable subtasks ─────────────────────────────────────────────────────
  const expandContent = expanded && !editMode ? (
    <m.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      transition={{ duration: 0.24, ease: "easeInOut" }}
      style={{ overflow: "hidden" }}
    >
      <div className="mt-1 flex gap-0 border-t border-neutral-100 pt-3 dark:border-white/[0.06]">
        <div className="mr-3 w-[3px] shrink-0 rounded-full bg-neutral-200 dark:bg-white/[0.08]" />
        <div className="flex-1 space-y-2">
          {effectiveItems.map((item) => {
            const isDone = (task.completedSubtaskIds ?? []).includes(item.id);
            const detail = subtaskDetailPill(item);
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 ${
                  isDone ? "bg-neutral-50 dark:bg-white/[0.02]" : "bg-neutral-100/70 dark:bg-white/[0.03]"
                }`}
              >
                <TaskCheckbox
                  state={isDone ? "completed" : "incomplete"}
                  size="md"
                  readOnly={readOnly}
                  onChange={() => onToggleSubtask(task.id, item.id)}
                />
                <p
                  className={`min-w-0 flex-1 text-[14px] font-medium ${
                    isDone ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {item.task}
                </p>
                {detail && (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-[13px] font-semibold text-neutral-500 dark:border-white/[0.10] dark:bg-transparent dark:text-neutral-400">
                    {detail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </m.div>
  ) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* ── Swipe reveal layer ─────────────────────────────────────────────── */}
      {!editMode && !readOnly && (
        <div className={`absolute inset-0 flex items-center rounded-2xl pl-5 ${done ? "bg-neutral-100 dark:bg-white/[0.04]" : "bg-green-500"}`}>
          <m.div
            style={{ opacity: revealOpacity, scale: revealScale }}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${done ? "bg-neutral-300/60 dark:bg-white/[0.10]" : "bg-white/25"}`}
          >
            <IconCheck size={16} strokeWidth={done ? 1.5 : 2.5} className={done ? "text-neutral-500 dark:text-neutral-400" : "text-white"} />
          </m.div>
        </div>
      )}

      {/* ── Card (draggable) — shared TaskBlockCard visual ─────────────────── */}
      <m.div
        layout
        drag={editMode || readOnly ? false : "x"}
        dragConstraints={{ left: 0, right: 100 }}
        dragElastic={{ left: 0, right: 0.05 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x: editMode ? 0 : dragX, touchAction: "pan-y" }}
        transition={{ layout: { duration: 0.22, ease: "easeInOut" } }}
        className="relative z-10"
      >
        <TaskBlockCard
          variant="list"
          task={task}
          plan={linkedPlan}
          state={taskState}
          duration={duration}
          readOnly={readOnly}
          onToggle={() => onToggleComplete(task.id, allSubtaskIds)}
          onClick={editMode ? undefined : handleCardTap}
          trailing={trailingNode}
          footer={footerNode}
        >
          {expandContent}
        </TaskBlockCard>
      </m.div>
    </div>
  );
}

export const ListTaskCard = memo(ListTaskCardInner);
