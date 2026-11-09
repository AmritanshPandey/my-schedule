"use client";

import { IconCalendarPlus, IconFlame } from "@tabler/icons-react";
import type { ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import type { Plan, Task } from "@/lib/useScheduleDB";
import type { TodayPlan } from "@/lib/overview";
import { getTaskSubtaskSummary } from "@/lib/taskCompletion";
import { haptic } from "@/lib/haptics";
import TodayTaskList from "@/components/today/TodayTaskList";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button";

/**
 * The Overview's hero: today's tasks, with the day's progress on top. Checking
 * a row is the one-tap "mark done" (the rows are TodayTaskList's, so a
 * multi-slot task, the hold-to-miss gesture and the checklist pill behave
 * exactly as they do on Today). A white card with green only where it reports
 * progress — the bar and the checked boxes.
 */
export default function TodayPlanCard({
  plan,
  plans,
  onMarkDone,
  onToggleSlot,
  onMissed,
  onOpenSubtasks,
  onAddTask,
  streak,
}: {
  plan: TodayPlan;
  plans: Plan[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onMissed?: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
  /** The empty day's "Add a task". */
  onAddTask: () => void;
  /** Phone only: the streak as a chip in the corner (desktop has the header pill). */
  streak?: ExecutionStreak;
}) {
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const planFor = (task: Task) => (task.planId ? plansById.get(task.planId) ?? null : null);
  const checkable = new Map(plan.rows.map((row) => [row.task.id, row.checkableIds]));
  const { done, total, pct } = plan;
  const left = total - done;

  const heading = (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Today&rsquo;s plan</p>
        {streak && streak.streak > 0 && (
          <p
            data-testid="overview-streak"
            title={streak.atRisk ? "Do one thing today to keep it" : undefined}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums ${
              streak.atRisk
                ? "bg-amber-500/12 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300"
                : "bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
            }`}
          >
            <IconFlame size={14} strokeWidth={2.2} aria-hidden />
            {streak.streak}-day streak
          </p>
        )}
      </div>
      <h2 className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-neutral-950 dark:text-white">
        {total === 0 ? "Plan your day" : `${total} ${total === 1 ? "task" : "tasks"} for today`}
      </h2>
      {total > 0 && (
        <>
          <p className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {left === 0 ? "All done. Nice work." : `${left} left · focus on what matters most`}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar pct={pct} height={6} className="flex-1" />
            <span className="w-10 shrink-0 text-right text-[12px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">{pct}%</span>
          </div>
        </>
      )}
    </div>
  );

  return (
    <TodayTaskList
      testId="overview-today-plan"
      heading={heading}
      empty={
        <div className="mb-4 mt-1">
          <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Nothing is scheduled for today yet.</p>
          <Button
            onClick={() => { haptic("light"); onAddTask(); }}
            icon={<IconCalendarPlus size={18} strokeWidth={2.4} aria-hidden />}
            fullWidth
            className="mt-3"
          >
            Add a task
          </Button>
        </div>
      }
      tasks={plan.rows.map((row) => row.task)}
      done={done}
      total={total}
      plans={plans}
      taskSummary={(task) => getTaskSubtaskSummary(task, planFor(task))}
      taskCheckableIds={(task) => checkable.get(task.id) ?? []}
      onMarkDone={onMarkDone}
      onToggleSlot={onToggleSlot}
      onMissed={onMissed}
      onOpenSubtasks={onOpenSubtasks}
    />
  );
}
