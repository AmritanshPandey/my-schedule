"use client";

import { useMemo } from "react";
import { IconCalendar, IconCheck, IconChevronRight, IconClipboardList, IconRepeat } from "@tabler/icons-react";
import type { DayKey, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import type { MissedTask, NeedsAttention, UnreliableSlotTask } from "@/lib/needsAttention";
import {
  selectActiveTracking,
  selectGoalPace,
  selectSetupSteps,
  selectTodayPlan,
  selectTodayRoutines,
  selectWeekStatus,
  type SetupStep,
} from "@/lib/overview";
import { localISODate } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import WeekStatusCard from "@/components/overview/WeekStatusCard";
import GoalPaceCard from "@/components/overview/GoalPaceCard";
import TodayPlanCard from "@/components/overview/TodayPlanCard";
import TodayRoutineCard from "@/components/overview/TodayRoutineCard";
import ActiveTrackingCard from "@/components/overview/ActiveTrackingCard";
import type { InsightToast } from "@/components/intelligence/InsightsCard";
import Button from "@/components/ui/Button";


const SETUP_ICON: Record<SetupStep["key"], typeof IconCalendar> = {
  plan: IconClipboardList,
  task: IconCalendar,
  ritual: IconRepeat,
};

/** Goal rows on the phone: enough to see what's slipping, not a second Plans tab. */
const MOBILE_GOAL_ROWS = 3;
/** Trackers on the phone; the rest are a tap away on Tracking. */
const MOBILE_TRACKER_ROWS = 3;

/**
 * The phone's Overview: the daily-execution part of the Overview design —
 * today's tasks, routines and trackers, then the goals and the week. Every
 * number comes from lib/overview.ts, so it matches desktop and native.
 * Each block is short and taps through to the screen that owns the detail.
 * apps/native/src/components/ios/IOSOverview.tsx is the native twin — keep
 * the two in step.
 */
export default function IOSOverview({
  schedule,
  setSchedule,
  todayKey,
  needsAttention,
  setupDismissed,
  onDismissSetup,
  onNavigate,
  onAddTask,
  onStartSetupStep,
  onOpenPlan,
  onMarkDone,
  onToggleSlot,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAttention,
  onDismissAttentionOne,
  onLogTracker,
  onMissedTask,
  onMarkRitualDone,
  onUnmarkRitualDone,
  onToast,
  onReviewTask,
  onReviewDay,
}: {
  schedule: Schedule;
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  todayKey: DayKey;
  needsAttention: NeedsAttention;
  setupDismissed: boolean;
  onDismissSetup: () => void;
  onNavigate: (tab: number) => void;
  /** Opens the new-task sheet for today (the empty day's "Add a task"). */
  onAddTask: () => void;
  /** Opens a setup step's own sheet (new plan, new task, new routine), not just its tab. */
  onStartSetupStep: (step: SetupStep["key"]) => void;
  onOpenPlan: (planId: string) => void;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onHandleMissed: (missed: MissedTask) => void;
  onAdaptMilestone: (milestoneId: string) => void;
  onReviewUnreliableSlot: (row: UnreliableSlotTask) => void;
  onClearAttention: () => void;
  onDismissAttentionOne: (key: string) => void;
  onLogTracker: (tracker: ProgressTracker) => void;
  /** Hold a task's checkbox to mark it missed. */
  onMissedTask: (taskId: string, subtaskIds: string[]) => void;
  /** Today's routine ring: mark done (fully followed) or take the mark back. */
  onMarkRitualDone: (ritualId: string) => void;
  onUnmarkRitualDone: (ritualId: string) => void;
  onToast: (toast: InsightToast) => void;
  onReviewTask: (task: Task) => void;
  onReviewDay: (day: DayKey) => void;
}) {
  const todayISO = localISODate(new Date());
  const setup = useMemo(() => selectSetupSteps(schedule), [schedule]);
  const todayPlan = useMemo(() => selectTodayPlan(schedule, todayISO, todayKey), [schedule, todayISO, todayKey]);
  const todayRoutines = useMemo(() => selectTodayRoutines(schedule, todayISO), [schedule, todayISO]);
  const tracking = useMemo(() => selectActiveTracking(schedule, todayISO), [schedule, todayISO]);
  const weekStatus = useMemo(() => selectWeekStatus(schedule, todayISO), [schedule, todayISO]);
  // The at-risk routines from Needs attention, shown on their own rows.
  const atRiskRitualIds = useMemo(
    () => new Set(needsAttention.atRiskRituals.map((row) => row.ritual.id)),
    [needsAttention],
  );
  const goalPace = useMemo(
    () => selectGoalPace(schedule, { limit: MOBILE_GOAL_ROWS, withMilestoneOnly: true }),
    [schedule],
  );
  const showSetup = !setupDismissed && setup.show;

  return (
    <div data-testid="overview-dashboard" className="space-y-4 px-4 pt-5">
      {showSetup && (
        // Same treatment as the desktop card (OverviewDashboard's
        // GettingStarted): a soft green wash, honest per-step segments,
        // and saturated green only on progress and the one next action.
        <section
          aria-labelledby="ios-setup-title"
          className="rounded-2xl border border-emerald-600/15 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]"
        >
          <p id="ios-setup-title" className="text-[19px] font-extrabold leading-tight tracking-[-0.01em] text-neutral-950 dark:text-white">
            Set up your first day
          </p>
          <p className="mt-1 text-[13px] font-medium text-neutral-600 dark:text-neutral-400">Three steps, about two minutes.</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5" role="img" aria-label={`${setup.doneCount} of 3 setup steps done`}>
              {setup.steps.map(({ key, done }) => (
                <span
                  key={key}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                    done ? "bg-[#00A63E] dark:bg-[#2FD46E]" : "bg-emerald-900/10 dark:bg-white/[0.10]"
                  }`}
                />
              ))}
            </div>
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
              {setup.doneCount} of 3
            </span>
          </div>
          <ol className="mt-3 space-y-1">
            {setup.steps.map(({ key, label, done }, index) => {
              const isNext = !done && key === setup.next.key;
              const Icon = SETUP_ICON[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onStartSetupStep(key); }}
                    className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left active:bg-white/70 dark:active:bg-white/[0.06] ${
                      isNext ? "bg-white/90 dark:bg-white/[0.05]" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                        done
                          ? "bg-[#00A63E] text-white dark:bg-[#2FD46E] dark:text-neutral-950"
                          : isNext
                          ? "border-2 border-neutral-950 bg-white text-neutral-950 dark:border-white dark:bg-transparent dark:text-white"
                          : "border border-emerald-900/15 bg-white/60 text-neutral-500 dark:border-white/[0.15] dark:bg-transparent dark:text-neutral-400"
                      }`}
                    >
                      {done ? <IconCheck size={15} strokeWidth={3} /> : <Icon size={16} strokeWidth={2} />}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[14px] font-bold ${
                        done ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-950 dark:text-white"
                      }`}
                    >
                      <span className="sr-only">Step {index + 1}: </span>
                      {label}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                    <IconChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex items-center gap-2">
            <Button size="md" onClick={() => { haptic("light"); onStartSetupStep(setup.next.key); }} className="flex-1">
              {setup.next.cta}
            </Button>
            <Button variant="ghost" size="md" onClick={() => { haptic("light"); onDismissSetup(); }}>
              I&apos;ll do this later
            </Button>
          </div>
        </section>
      )}

      {/* The execution core of the Overview (desktop adds the day's shape
          and the longer trends). Same selectors as desktop and native. */}
      <TodayPlanCard
        plan={todayPlan}
        plans={schedule.plans}
        onMarkDone={onMarkDone}
        onToggleSlot={onToggleSlot}
        onMissed={onMissedTask}
        onAddTask={onAddTask}
        streak={weekStatus.streak}
      />

      <TodayRoutineCard
        rows={todayRoutines.rows}
        done={todayRoutines.done}
        total={todayRoutines.total}
        atRiskIds={atRiskRitualIds}
        onToggle={(id, done) => (done ? onUnmarkRitualDone(id) : onMarkRitualDone(id))}
        onOpenRoutine={() => onNavigate(2)}
      />

      <ActiveTrackingCard
        rows={tracking}
        limit={MOBILE_TRACKER_ROWS}
        onLogTracker={onLogTracker}
        onOpenTracking={() => onNavigate(8)}
        onSetUp={() => onNavigate(1)}
      />

      <GoalPaceCard
        rows={goalPace.rows}
        totalCount={goalPace.totalCount}
        compact
        onOpenPlan={onOpenPlan}
        onSeeAll={() => onNavigate(1)}
        onAdaptMilestone={onAdaptMilestone}
      />

      <WeekStatusCard status={weekStatus} compact onOpen={() => { haptic("light"); onNavigate(0); }} />
    </div>
  );
}
