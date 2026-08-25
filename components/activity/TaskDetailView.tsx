"use client";

import { useMemo } from "react";
import { m } from "framer-motion";
import { IconArrowBackUp, IconBan, IconCheck, IconClockHour4, IconEdit, IconListCheck, IconX } from "@tabler/icons-react";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import TaskChecklistItem from "@/components/activity/TaskChecklistItem";
import TaskStatusCheckbox from "@/components/task/TaskStatusCheckbox";
import DetailHeader from "@/components/ui/DetailHeader";
import IconButton from "@/components/ui/IconButton";
import Pill from "@/components/ui/Pill";
import ProgressBar from "@/components/ui/ProgressBar";
import { todayISO } from "@/lib/dateUtils";
import { compareDeadline } from "@/lib/subtaskDeadline";
import { calculateTaskProgress, isTrackedTask, phaseProgress, resolveSlotState, resolveTaskState } from "@/lib/taskCompletion";
import { getSlots } from "@/lib/taskMutations";
import { formatDisplayTime, formatDuration } from "@/lib/timeUtils";
import type { Plan, Task } from "@/lib/useScheduleDB";

export interface TaskDetailViewProps {
  task: Task | null;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  /** Per-phase toggle for a task split across several blocks in one day. */
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onSnooze?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  skipped?: boolean;
  canSkip?: boolean;
  onEdit?: () => void;
  presentation?: "sheet" | "page";
}

export default function TaskDetailView({
  task,
  linkedPlan,
  readOnly = false,
  onClose,
  onToggleSubtask,
  onToggleComplete,
  onToggleSlot,
  onMissed,
  onSnooze,
  onSkip,
  skipped = false,
  canSkip = false,
  onEdit,
  presentation = "sheet",
}: TaskDetailViewProps) {
  const isSession = task?.taskType === "session";

  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    // Held time has nothing to check off, and must not inherit the plan's
    // template items (which would give it a phantom progress bar).
    if (!isTrackedTask(task)) return [];
    if (isSession) return task.subtasks ?? [];
    const base = task.subtasks !== undefined ? task.subtasks : linkedPlan?.items ?? [];
    return [...base].sort(compareDeadline);
  }, [task, isSession, linkedPlan]);

  const today = todayISO();
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const { completedCount, totalCount, pct } = useMemo(
    () => calculateTaskProgress(task ?? ({} as Task), items.length),
    [task, items.length],
  );
  const state = task ? resolveTaskState(task, items.length) : "incomplete";
  const phases = task ? phaseProgress(task) : { total: 1, done: 0, isMultiPhase: false, nextIndex: 0, allDone: false };
  const slots = task ? getSlots(task) : [];

  /**
   * What "Done" means here. For a split task it advances ONE block — the next
   * unfinished one — rather than closing out blocks that have not happened.
   * Three separate Done affordances in this view each called the whole-task
   * toggle, so any of them finished every block at once.
   */
  const completePrimary = () => {
    if (!task) return;
    if (phases.isMultiPhase && onToggleSlot) onToggleSlot(task.id, phases.nextIndex);
    else onToggleComplete(task.id, allIds);
  };
  const done = state === "completed";
  const duration = task ? formatDuration(task.startTime, task.endTime) : "";
  const barPct = done && items.length === 0 ? 100 : pct;

  if (!task) return null;

  // Held time offers no completion actions — only rescheduling and editing.
  const tracked = isTrackedTask(task);
  const eyebrow = linkedPlan?.title ?? (isSession ? "Session" : tracked ? "Task" : "Commitment");
  const skipToggle = onSkip && canSkip ? (
    <button
      type="button"
      onClick={() => { onSkip(task.id); onClose(); }}
      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
    >
      {skipped ? <IconArrowBackUp size={16} strokeWidth={2.2} /> : <IconBan size={16} strokeWidth={2.2} />}
      {skipped ? "Restore this day" : "Skip this day"}
    </button>
  ) : null;

  const summary = (
    <>
      {presentation === "page" && (
        <div className="flex items-start gap-3">
          {tracked && (
            <TaskStatusCheckbox
              state={state}
              readOnly={readOnly}
              label={done ? "Mark task not done" : "Mark task done"}
              onClick={() => { completePrimary(); onClose(); }}
            />
          )}
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-[16px] font-semibold text-neutral-400 dark:text-neutral-500">{eyebrow}</p>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <ProgressBar pct={barPct} height={10} fillClassName="bg-green-600" className="min-w-0 flex-1" />
          <span className="w-10 shrink-0 text-right text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{barPct}%</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* A split task showed only `startTime – endTime`, which mirrors the
            EARLIEST block — so the later blocks were invisible here, and the
            Done buttons below completed all of them at once. Phases now get
            their own row and their own checkbox (rendered under this header). */}
        {(task.startTime || task.endTime) && !phases.isMultiPhase && (
          <span className="text-[16px] font-bold text-neutral-900 dark:text-white">
            {formatDisplayTime(task.startTime)}{task.endTime ? ` – ${formatDisplayTime(task.endTime)}` : ""}
          </span>
        )}
        {phases.isMultiPhase && (
          <span className="text-[16px] font-bold text-neutral-900 dark:text-white">
            {phases.done}/{phases.total} blocks done
          </span>
        )}
        {duration && (
          <Pill variant="neutral" size="md" className="text-neutral-600 dark:text-neutral-400">
            {duration}
          </Pill>
        )}
        {items.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
            <IconListCheck size={16} strokeWidth={2} />
            {completedCount}/{totalCount}
          </span>
        )}
      </div>

      {/* Each block gets its own row and its own checkbox. Finishing the
          morning block must not tick an afternoon one that has not happened. */}
      {phases.isMultiPhase && (
        <div className="mt-3 space-y-1.5">
          {slots.map((slot, i) => {
            const slotDone = resolveSlotState(task, i) === "completed";
            return (
              <button
                key={`${slot.startTime}-${i}`}
                type="button"
                disabled={readOnly || !onToggleSlot}
                onClick={() => onToggleSlot?.(task.id, i)}
                aria-label={`${slotDone ? "Mark not done" : "Mark done"}: block ${i + 1} of ${phases.total}, ${formatDisplayTime(slot.startTime)} to ${formatDisplayTime(slot.endTime)}`}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                  slotDone ? "bg-neutral-50 dark:bg-white/[0.02]" : "bg-neutral-100/70 dark:bg-white/[0.03]"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    slotDone ? "border-transparent bg-green-500" : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {slotDone && <IconCheck size={12} strokeWidth={3} className="text-white" />}
                </span>
                <span className={`text-[14px] font-semibold ${slotDone ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-800 dark:text-neutral-100"}`}>
                  {formatDisplayTime(slot.startTime)} – {formatDisplayTime(slot.endTime)}
                </span>
                <span className="ml-auto text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                  Block {i + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  const checklist = (
    <>
      {task.description && (
        <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{task.description}</p>
      )}

      {/* No empty state when there are no subtasks. The panel that used to sit
          here read "No subtasks — mark the whole task done below", which only
          restated the button directly beneath it. */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <TaskChecklistItem
              key={item.id}
              item={item}
              isDone={(task.completedSubtaskIds ?? []).includes(item.id)}
              // Each subtask carries its OWN state, not the parent's: a partial
              // parent must never render its unchecked subtasks as a "partial"
              // (green minus) — they're simply not done. A missed day still
              // shows unchecked subtasks as missed.
              state={state === "missed" ? "missed" : "incomplete"}
              today={today}
              readOnly={readOnly}
              onToggle={() => onToggleSubtask(task.id, item.id)}
            />
          ))}
        </div>
      )}
    </>
  );

  const snoozeButton = tracked && !done && onSnooze ? (
    <button
      type="button"
      onClick={() => { onSnooze(task.id); onClose(); }}
      className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-neutral-200 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
    >
      <IconClockHour4 size={16} strokeWidth={2.2} />
      Later today
    </button>
  ) : null;

  /**
   * One action block for BOTH presentations.
   *
   * These used to be two near-identical blocks, which is exactly how "Later
   * today" ended up rendering in the sheet only: the page variant was handed
   * `onSnooze` and silently dropped it. Sharing one block means a new action
   * cannot reach one surface and miss the other.
   *
   * Ordered by outcome rather than by prominence: the single positive action,
   * then the two ways to defer, then the negative one — quiet and last, since
   * it is the one you least often want and can least easily undo.
   */
  const actions = readOnly ? (
    skipToggle ? (
      <div className="mt-1 flex">{skipToggle}</div>
    ) : (
      <p className="mt-1 rounded-full bg-neutral-100 py-3 text-center text-[13px] font-semibold text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400">
        Read-only — past day
      </p>
    )
  ) : (
    <div className="mt-1 space-y-2">
      {/* `onToggleComplete` is a TOGGLE, so an unconditional "Done" reversed a
          task that was already finished and then closed on top of it — the
          user watched their work come undone on the way back to Overview.
          Note the Missed button below already carries a `!done` guard for
          exactly this reason; the primary never got one.

          Once complete this reports state instead of offering an action: it
          reads "Completed", is tinted rather than solid (it is no longer a
          call to action), and only dismisses. Undoing stays on the header
          checkbox, which is already labelled "Mark task not done". */}
      {tracked && (
        <m.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => { if (!done) completePrimary(); onClose(); }}
          className={`flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-bold transition-colors ${
            done
              ? "bg-green-600/10 text-green-700 dark:bg-emerald-400/[0.12] dark:text-emerald-300"
              : "bg-[#00A63E] text-white hover:bg-[#008236] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
          }`}
        >
          <IconCheck size={18} strokeWidth={2.6} />
          {done ? "Completed" : "Done"}
        </m.button>
      )}

      {/* The two deferrals share a row — they answer the same question ("not
          now"), and pairing them stops either being mistaken for an outcome.
          Each is flex-1, so one alone still fills the width. */}
      {(snoozeButton || skipToggle) && (
        <div className="flex items-center gap-2.5">
          {snoozeButton}
          {skipToggle}
        </div>
      )}

      {/* `!done` guard retained: Missed on a completed task silently
          un-completes it and strips today's history events. */}
      {tracked && !done && onMissed && (
        <m.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => { onMissed(task.id, allIds); onClose(); }}
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-rose-500/[0.06] hover:text-rose-600 dark:text-neutral-400 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-400"
        >
          <IconX size={16} strokeWidth={2.2} />
          Mark as missed
        </m.button>
      )}
    </div>
  );

  const content = (
    <div className="relative flex flex-col gap-4 px-5 pb-8 pt-5">
      {presentation === "sheet" && (
        // Edit sits with Close, not among the action buttons below. It is a
        // utility — it changes the task, not today's outcome — and as an
        // unlabelled icon it read as a third peer of Done and Missed.
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
          {onEdit && (
            <IconButton
              label="Edit task"
              variant="soft"
              size="md"
              radius="full"
              onClick={() => { onEdit(); onClose(); }}
            >
              <IconEdit size={18} strokeWidth={2.2} />
            </IconButton>
          )}
          <IconButton
            label="Close"
            variant="soft"
            size="md"
            radius="full"
            onClick={onClose}
          >
            <IconX size={18} strokeWidth={2.2} />
          </IconButton>
        </div>
      )}

      {presentation === "sheet" && (
        <div className="flex items-start gap-2.5 pr-9">
          {tracked && (
            <div className="mt-0.5">
              <TaskStatusCheckbox
                state={state}
                readOnly={readOnly}
                label={done ? "Mark task not done" : "Mark task done"}
                onClick={() => { completePrimary(); onClose(); }}
              />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-bold leading-tight text-neutral-900 dark:text-white">{task.title}</h2>
            <p className="text-[13px] font-semibold text-neutral-400 dark:text-neutral-500">{eyebrow}</p>
          </div>
        </div>
      )}

      {summary}
      {checklist}
      {actions}
    </div>
  );

  if (presentation === "page") {
    return (
      <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
        <DetailHeader
          title={task.title}
          onBack={onClose}
          // Same placement as the sheet: Edit belongs with the chrome, not with
          // the outcome buttons.
          actions={onEdit ? [{ icon: IconEdit, label: "Edit task", onClick: () => { onEdit(); onClose(); } }] : undefined}
        />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 px-5 pb-4 pt-5">
            {summary}
            {checklist}
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {actions}
        </div>
      </div>
    );
  }

  return content;
}
