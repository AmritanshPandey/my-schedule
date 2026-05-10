"use client";

import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconCheck, IconChevronDown, IconEdit, IconListCheck, IconMinus, IconTrash } from "@tabler/icons-react";
import type { Task, Plan } from "@/lib/useScheduleDB";
import type { ScheduleEntry, MetaField } from "@/components/ScheduleItem";
import { calculateTaskProgress, resolveTaskState } from "@/lib/taskCompletion";
import type { TaskState } from "@/lib/taskCompletion";
import { formatDuration } from "@/lib/timeUtils";

// ── Subtask detail pill text ──────────────────────────────────────────────────

function subtaskDetailPill(entry: ScheduleEntry): string | null {
  const meta = (entry as ScheduleEntry & { meta?: MetaField[] }).meta;
  if (meta && meta.length > 0) return meta.map((m) => m.value).join(" | ");
  if (entry.time) return entry.time;
  return null;
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
// Emerald green when partial or completed; neutral outline when incomplete.

interface CheckboxProps {
  state: TaskState;
  size?: "lg" | "md"; // lg = main task (36px), md = subtask (32px)
  onChange: () => void;
}

function TaskCheckbox({ state, size = "lg", onChange }: CheckboxProps) {
  const dim      = size === "lg" ? "w-7 h-7"      : "w-6 h-6";
  const round    = size === "lg" ? "rounded-[8px]" : "rounded-[6px]";
  const iconSize = size === "lg" ? 14              : 12;
  const filled   = state === "completed" || state === "partial";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.84 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`shrink-0 ${dim} ${round} border-2 flex items-center justify-center transition-colors duration-150 ${
        filled
          ? "border-transparent bg-green-500"
          : "border-neutral-300 bg-transparent dark:border-neutral-500"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === "completed" && (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <IconCheck size={iconSize} strokeWidth={3} className="text-white" />
          </motion.span>
        )}
        {state === "partial" && (
          <motion.span
            key="partial"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.15 }}
          >
            <IconMinus size={iconSize} strokeWidth={3} className="text-white" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ListTaskCardProps {
  task: Task;
  linkedPlan: Plan | null;
  editMode?: boolean;
  onToggleComplete: (taskId: string, allIds: string[]) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ListTaskCardInner({
  task,
  linkedPlan,
  editMode = false,
  onToggleComplete,
  onToggleSubtask,
  onEdit,
  onDelete,
}: ListTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const subtasks: ScheduleEntry[] = useMemo(() => linkedPlan?.items ?? [], [linkedPlan]);
  const allSubtaskIds = useMemo(() => subtasks.map((s) => s.id), [subtasks]);

  const { completedCount, totalCount, pct } = useMemo(
    () => calculateTaskProgress(task, subtasks.length),
    [task, subtasks.length]
  );
  const taskState = useMemo(
    () => resolveTaskState(task, subtasks.length),
    [task, subtasks.length]
  );
  const done = taskState === "completed";

  const duration = useMemo(
    () => formatDuration(task.startTime, task.endTime),
    [task.startTime, task.endTime]
  );

  const hasSubtasks = subtasks.length > 0;
  const canExpand   = hasSubtasks || !!task.description;
  const displayPct  = hasSubtasks ? pct : done ? 100 : 0;

  return (
    <motion.div
      layout
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className={`rounded-[24px] bg-white dark:bg-neutral-900 border transition-colors duration-300 ${
        done
          ? "border-neutral-200/50 dark:border-white/[0.04]"
          : "border-neutral-200 dark:border-white/[0.08]"
      }`}
    >
      <div className="px-5 pt-5 pb-5">

        {/* ── Row 1: Checkbox · Title · Expand/Edit ─────────────────────────── */}
        <div className="flex items-start gap-4">

          {/* Checkbox */}
          <TaskCheckbox
            state={taskState}
            size="lg"
            onChange={() => onToggleComplete(task.id, allSubtaskIds)}
          />

          {/* Title + plan label */}
          <div className="flex-1 min-w-0 pt-0.5">
            <motion.p
              animate={{ opacity: done ? 0.5 : 1 }}
              transition={{ duration: 0.25 }}
              className={`text-[22px] font-bold leading-tight text-neutral-900 dark:text-white ${
                done ? "line-through decoration-neutral-400 dark:decoration-neutral-500" : ""
              }`}
            >
              {task.title}
            </motion.p>

            {/* Plan label */}
            {linkedPlan && (
              <p className={`mt-1 text-[12px] font-semibold uppercase tracking-[0.08em] ${
                done ? "text-neutral-400 dark:text-neutral-600" : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {linkedPlan.title}
              </p>
            )}
          </div>

          {/* Action: expand circle / edit+delete */}
          <div className="shrink-0 mt-0.5">
            {editMode ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  <IconEdit size={16} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:text-rose-500 dark:hover:text-rose-400"
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ) : canExpand ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-white/[0.12]"
              >
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  style={{ display: "flex" }}
                >
                  <IconChevronDown size={20} strokeWidth={2} />
                </motion.span>
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Row 2: Progress bar + percentage ─────────────────────────────── */}
        <div className="mt-4 flex items-center gap-3">
          <div className="relative flex-1 h-2.5 overflow-hidden rounded-full bg-neutral-150 dark:bg-white/[0.06]" style={{ backgroundColor: "rgb(229 231 235)" }}>
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-green-500"
              initial={false}
              animate={{ width: `${displayPct}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <motion.span
            key={displayPct}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 w-10 text-right text-[15px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400"
          >
            {displayPct}%
          </motion.span>
        </div>

        {/* ── Row 3: Time · Duration pill · Subtask count ───────────────────── */}
        <div className="mt-4 flex items-center gap-3">
          {(task.startTime || task.endTime) && (
            <p className={`text-[15px] font-medium ${
              done ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-600 dark:text-neutral-400"
            }`}>
              {task.startTime}
              {task.endTime && ` – ${task.endTime}`}
            </p>
          )}
          {duration && (
            <span className="inline-flex items-center rounded-full border border-neutral-300 bg-white px-3.5 py-1 text-[14px] font-semibold text-neutral-600 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-400">
              {duration}
            </span>
          )}
          {hasSubtasks && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
              {completedCount}/{totalCount}
              <IconListCheck size={16} strokeWidth={2} />
            </span>
          )}
        </div>
      </div>

      {/* ── Expandable section ────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && !editMode && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {/* Divider */}
            <div className="mx-5 border-t border-neutral-100 dark:border-white/[0.05]" />

            <div className="px-5 pt-4 pb-5 space-y-4">
              {/* Description */}
              {task.description && (
                <p className="text-[15px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {task.description}
                </p>
              )}

              {/* Subtask list with left accent bar */}
              {hasSubtasks && (
                <div className="flex gap-0">
                  {/* Left accent bar */}
                  <div className="w-[3px] rounded-full bg-neutral-200 dark:bg-white/[0.08] shrink-0 mr-4" />

                  {/* Subtask rows */}
                  <div className="flex-1 space-y-2.5">
                    {subtasks.map((subtask) => {
                      const isDone = (task.completedSubtaskIds ?? []).includes(subtask.id);
                      const detail = subtaskDetailPill(subtask);
                      return (
                        <div
                          key={subtask.id}
                          className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-200 ${
                            isDone
                              ? "bg-neutral-50 dark:bg-white/[0.02]"
                              : "bg-neutral-100/70 dark:bg-white/[0.03]"
                          }`}
                        >
                          <TaskCheckbox
                            state={isDone ? "completed" : "incomplete"}
                            size="md"
                            onChange={() => onToggleSubtask(task.id, subtask.id)}
                          />
                          <motion.p
                            animate={{ opacity: isDone ? 0.45 : 1 }}
                            transition={{ duration: 0.2 }}
                            className={`flex-1 min-w-0 text-[15px] font-medium ${
                              isDone
                                ? "text-neutral-400 line-through dark:text-neutral-500"
                                : "text-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            {subtask.task}
                          </motion.p>
                          {detail && (
                            <span className="shrink-0 inline-flex items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-[13px] font-semibold text-neutral-500 dark:border-white/[0.10] dark:bg-transparent dark:text-neutral-400">
                              {detail}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const ListTaskCard = memo(ListTaskCardInner);
