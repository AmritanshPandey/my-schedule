"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconArrowUpRight,
  IconChecklist,
  IconClock,
  IconListCheck,
  IconX,
} from "@tabler/icons-react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import type { TaskState } from "@/lib/taskCompletion";
import { getTaskSubtaskSummary, resolveTaskState, taskStatusLabel } from "@/lib/taskCompletion";
import { getSlots } from "@/lib/taskMutations";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import { useLongPress } from "@/lib/useLongPress";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import CheckDraw from "@/components/ui/CheckDraw";

type TaskSummary = ReturnType<typeof getTaskSubtaskSummary>;

const HINT_KEY = "planr-missed-hint-seen";

export interface TodayTaskListProps {
  /** Already occurrence-resolved, tracked-only and sorted — see selectTodayTasks. */
  tasks: Task[];
  done: number;
  total: number;
  plans: Plan[];
  taskSummary: (task: Task) => TaskSummary;
  taskCheckableIds: (task: Task) => string[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  /** Omitted → the missed affordances are absent and the gesture is inert. */
  onMissed?: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
}

/** "6 AM" / "12:30 PM" — the dashboard reads as prose, not as a 24-hour log. */
export function formatTaskTime(t?: string): string {
  if (!t) return "";
  const mins = parseTimeToMinutes(t);
  if (mins === null) return t;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function TaskStatusButton({
  state,
  onClick,
  pressHandlers,
  pressing,
}: {
  state: TaskState;
  onClick: () => void;
  pressHandlers: ReturnType<typeof useLongPress>["pressHandlers"];
  pressing: boolean;
}) {
  const done = state === "completed";
  const missed = state === "missed";
  return (
    <button
      type="button"
      aria-label={taskStatusLabel(state, false)}
      aria-pressed={done}
      onClick={onClick}
      {...pressHandlers}
      className={`tap-target grid h-7 w-7 shrink-0 select-none place-items-center rounded-lg border-2 transition-colors [-webkit-touch-callout:none] active:scale-95 motion-safe:duration-500 ${
        done
          ? "border-transparent bg-emerald-500"
          : missed
          ? "border-transparent bg-rose-500"
          : pressing
          ? // Lands on rose exactly as the hold fires, so a quick tap barely
            // tints and a full hold reads unmistakably. motion-safe keeps it
            // from flashing on every ordinary tap under reduced motion.
            "border-neutral-500 bg-transparent motion-safe:border-rose-400 dark:border-white/[0.30] dark:motion-safe:border-rose-400"
          : "border-neutral-500 bg-transparent hover:border-neutral-600 dark:border-white/[0.30] dark:hover:border-white/50"
      }`}
    >
      <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
      {missed && <IconX size={15} strokeWidth={3} className="text-white" />}
    </button>
  );
}

function TodayTaskRow({
  task,
  plans,
  taskSummary,
  taskCheckableIds,
  onMarkDone,
  onMissed,
  onOpenSubtasks,
  onMissedFired,
}: {
  task: Task;
  plans: Plan[];
  taskSummary: (task: Task) => TaskSummary;
  taskCheckableIds: (task: Task) => string[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  onMissed?: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
  onMissedFired: () => void;
}) {
  const { completedCount: subDone, totalCount: subTotal } = taskSummary(task);
  // One derivation, so the checkbox, the strikethrough, the label and the
  // header count can never disagree about what state this row is in.
  const state = resolveTaskState(task, subTotal);
  const isDone = state === "completed";
  const isMissed = state === "missed";
  const plan = plans.find((p) => p.id === task.planId);

  // Marking a completed task missed would silently un-complete it and strip
  // today's history, so the gesture is inert there — matching the guard on
  // TaskDetailView's Missed button.
  const canMiss = !!onMissed && !isDone;
  const toggleMissed = () => {
    onMissed?.(task.id, taskCheckableIds(task));
    onMissedFired();
  };
  const longPress = useLongPress(canMiss ? toggleMissed : undefined);

  // Multi-slot tasks run in several phases today; the summary shows every start
  // time and how many phases are left, so the dashboard never under-reports the
  // day. Checking off individual phases happens on Today, not here.
  const slots = getSlots(task);
  const isMultiSlot = slots.length > 1;
  const slotsDone = isMultiSlot
    ? isDone
      ? slots.length
      : new Set(task.completedSlotIndices ?? []).size
    : 0;

  return (
    <div className="flex items-center gap-3 py-3" {...longPress.clickGuard}>
      <TaskStatusButton
        state={state}
        onClick={() => {
          haptic("medium");
          onMarkDone(task.id, taskCheckableIds(task));
        }}
        pressHandlers={longPress.pressHandlers}
        pressing={longPress.pressing}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[15px] font-bold leading-tight ${
            isDone
              ? "text-neutral-400 line-through dark:text-neutral-600"
              : isMissed
              ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
              : "text-neutral-950 dark:text-white"
          }`}
        >
          {task.title}
        </p>
        {(task.startTime || plan) && (
          <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            {/* Times are a set, so they join with a comma; the middot then
                separates the times from the plan without reading as one more
                time in the list. */}
            <span className="tabular-nums">
              {isMultiSlot
                ? slots.map((s) => formatTaskTime(s.startTime)).join(", ")
                : task.startTime && formatTaskTime(task.startTime)}
            </span>
            {task.startTime && plan && " · "}
            {plan && plan.title}
          </p>
        )}
      </div>
      {isMultiSlot && (
        <span
          aria-label={`${slotsDone} of ${slots.length} phases done`}
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-neutral-500 dark:border-white/[0.10] dark:text-neutral-400"
        >
          <IconClock size={14} strokeWidth={2} className="shrink-0" />
          <span className="text-[12px] font-bold tabular-nums">
            {slotsDone}/{slots.length}
          </span>
        </span>
      )}
      {/* Present for every task, not just those with subtasks: this is the
          keyboard and screen-reader route into the detail view, where the
          labelled "Missed" button lives. Long-press covers the same action on
          touch. Mirrors IOSLightTaskCard's trailing chip. */}
      {onOpenSubtasks && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            onOpenSubtasks(task.id);
          }}
          aria-label={
            subTotal > 0 ? `Open subtasks (${subDone} of ${subTotal} done)` : "Open task details"
          }
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.05]"
        >
          {subTotal > 0 && <IconListCheck size={14} strokeWidth={2} className="shrink-0" />}
          {subTotal > 0 && (
            <span className="text-[12px] font-bold tabular-nums">
              {subDone}/{subTotal}
            </span>
          )}
          <IconArrowUpRight size={13} strokeWidth={2.2} className="shrink-0" />
        </button>
      )}
    </div>
  );
}

/**
 * The Overview "Today's Task" card, shared by the desktop dashboard and the iOS
 * shell. Both used to keep their own copy of this markup; the copies drifted in
 * both look and behaviour. Behaviour lives in `selectTodayTasks`; the only
 * state held here is the one-time gesture hint, which is a local UI preference
 * rather than schedule data.
 */
export default function TodayTaskList({
  tasks,
  done,
  total,
  plans,
  taskSummary,
  taskCheckableIds,
  onMarkDone,
  onMissed,
  onOpenSubtasks,
}: TodayTaskListProps) {
  // Starts hidden and flips in an effect: reading storage during render would
  // mismatch the statically exported HTML.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    if (onMissed && safeGetItem(HINT_KEY) !== "1") setShowHint(true);
  }, [onMissed]);

  const dismissHint = () => {
    setShowHint(false);
    safeSetItem(HINT_KEY, "1");
  };

  // Counted from the same resolver the rows use, so the number always equals
  // the rose rows on screen.
  const missedCount = useMemo(
    () => tasks.filter((t) => resolveTaskState(t, taskSummary(t).totalCount) === "missed").length,
    [tasks, taskSummary]
  );

  return (
    <section data-testid="overview-today-card" className={`${CARD} px-4 pt-4 pb-1`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <IconChecklist size={15} strokeWidth={2} className="shrink-0" />
          <h2 className="truncate text-[13px] font-bold">Today&apos;s Task</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-neutral-200/70 px-2 py-0.5 text-[12px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.07] dark:text-neutral-400">
            {done}/{total}
          </span>
          {missedCount > 0 && (
            <span
              data-testid="overview-today-missed"
              className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[12px] font-bold tabular-nums text-rose-600 dark:text-rose-400"
            >
              <IconX size={11} strokeWidth={3} aria-hidden="true" className="shrink-0" />
              {missedCount} missed
            </span>
          )}
        </div>
      </div>

      {showHint && tasks.length > 0 && (
        <div className={`mb-2 flex items-center gap-2 ${SOFT_PANEL} px-3 py-2`}>
          <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
            Hold a checkbox to mark a task missed.
          </p>
          <button
            type="button"
            onClick={dismissHint}
            className="tap-target shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
          >
            Got it
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="mb-3 rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center dark:border-white/[0.10]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">Nothing to check off today</p>
          <p className="mt-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            Add the first block from Today.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {tasks.map((task) => (
            <TodayTaskRow
              key={task.id}
              task={task}
              plans={plans}
              taskSummary={taskSummary}
              taskCheckableIds={taskCheckableIds}
              onMarkDone={onMarkDone}
              onMissed={onMissed}
              onOpenSubtasks={onOpenSubtasks}
              onMissedFired={dismissHint}
            />
          ))}
        </div>
      )}
    </section>
  );
}
