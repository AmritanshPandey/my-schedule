"use client";

import { useCallback, useMemo, useState } from "react";
import {
  IconArrowRight,
  IconCalendarEvent,
  IconScale,
  IconCheck,
  IconClipboardList,
  IconRepeat,
} from "@tabler/icons-react";
import type { DayKey, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import DayBreakdownCard from "@/components/DayBreakdownCard";
import type { InsightToast } from "@/components/intelligence/InsightsCard";
import { selectNeedsAttention, type MissedTask, type NeedsAttention, type UnreliableSlotTask } from "@/lib/needsAttention";
import {
  computeCapacityModel,
  plannedWeeklyMinutes,
  assessPlannedLoad,
  heaviestDay,
  type LoadVerdict,
} from "@/lib/capacityModel";
import CompletionTrendCard from "@/components/analytics/CompletionTrendCard";
import {
  selectActiveTracking,
  selectGoalPace,
  selectRoutineConsistency,
  selectSetupSteps,
  selectTodayPlan,
  selectTodayRoutines,
  selectWeekStatus,
} from "@/lib/overview";
import WeekStatusCard from "@/components/overview/WeekStatusCard";
import GoalPaceCard from "@/components/overview/GoalPaceCard";
import StreakPill from "@/components/overview/StreakPill";
import TodayPlanCard from "@/components/overview/TodayPlanCard";
import TodayRoutineCard from "@/components/overview/TodayRoutineCard";
import ActiveTrackingCard from "@/components/overview/ActiveTrackingCard";
import RoutineConsistencyCard from "@/components/overview/RoutineConsistencyCard";
import { localISODate } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import Button from "@/components/ui/Button";

interface OverviewDashboardProps {
  schedule: Schedule;
  todayKey: DayKey;
  onNavigate: (tab: number) => void;
  onMarkTaskDone: (taskId: string, subtaskIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  /** Opens one plan's detail (Goals & milestones rows). Falls back to the Plans tab. */
  onOpenPlan?: (planId: string) => void;
  completedRitualIds: Set<string>;
  onLogTracker: (tracker: ProgressTracker) => void;
  /** Today's routine ring: mark done (fully followed) or take the mark back. */
  onMarkRitualDone?: (ritualId: string) => void;
  onUnmarkRitualDone?: (ritualId: string) => void;
  /** Hold a task's checkbox to mark it missed. */
  onMissedTask?: (taskId: string, subtaskIds: string[]) => void;
  /** The empty day's "Add a task". */
  onAddTask?: () => void;
  /** Open the recovery sheet for a missed task in "Needs attention". */
  onHandleMissed?: (missed: MissedTask) => void;
  /** Open the adaptation sheet for an off-pace milestone. */
  onAdaptMilestone?: (milestoneId: string) => void;
  /** Open the edit sheet for a task parked in an unreliable time slot. */
  onReviewUnreliableSlot?: (row: UnreliableSlotTask) => void;
  /** Dismiss every row on the "Needs attention" card. The data is passed up
   *  because this component is the one that computed it — asking the parent to
   *  re-derive it would risk the two disagreeing about what was cleared. */
  onClearAttention?: (data: NeedsAttention) => void;
  onDismissAttentionOne?: (key: string) => void;
  /** Enables the weekly read (components/intelligence/InsightsCard.tsx) —
   *  its suggestions write to the schedule. Omitted → the card is hidden. */
  setSchedule?: (updater: (prev: Schedule) => Schedule) => void;
  onToast?: (toast: InsightToast) => void;
  onReviewTask?: (task: Task) => void;
  onReviewDay?: (day: DayKey) => void;
  /** Opens "new task" pre-filled into a free slot from "Where the day goes". */
  onCreateTaskAtTime?: (day: DayKey, startMinutes: number, endMinutes: number) => void;
}

/** Keyed by DayKey, for the capacity check's prose. */
const DAY_LABELS_FULL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday",
  friday: "Friday", saturday: "Saturday", sunday: "Sunday",
};

function formatHoursShort(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

/**
 * What this week ASKS FOR, against what this person has actually sustained
 * (lib/capacityModel.ts). The week card reports what happened; this is the
 * only line that says whether the week ahead is one they have ever actually
 * done. Pure arithmetic over completion history, silent when it is too thin.
 */
function CapacityCheck({ load, heaviest }: { load: LoadVerdict | null; heaviest: ReturnType<typeof heaviestDay> }) {
  if (!load || load.level === "comfortable") return null;
  return (
    <div
      data-testid="overview-capacity-check"
      className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
        load.level === "unrealistic"
          ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.08]"
          : "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]"
      }`}
    >
      <IconScale
        size={14}
        strokeWidth={2}
        className={`mt-0.5 shrink-0 ${
          load.level === "unrealistic"
            ? "text-amber-600 dark:text-amber-400"
            : "text-neutral-500 dark:text-neutral-400"
        }`}
      />
      <div className="min-w-0">
        <p
          className={`text-[12.5px] leading-relaxed ${
            load.level === "unrealistic"
              ? "text-amber-900 dark:text-amber-200"
              : "text-neutral-600 dark:text-neutral-300"
          }`}
        >
          {load.message}
        </p>
        {/* Lumpiness is a different failure from a heavy week: 20h is fine
            spread out and impossible if 9h lands on one day. */}
        {heaviest && (
          <p className="mt-0.5 text-[11.5px] text-neutral-500 dark:text-neutral-400">
            {DAY_LABELS_FULL[heaviest.day]} is the tightest — {formatHoursShort(heaviest.plannedMinutes)} against your usual {formatHoursShort(heaviest.usualMinutes)}.
          </p>
        )}
      </div>
    </div>
  );
}

interface SetupDone {
  plan: boolean;
  task: boolean;
  ritual: boolean;
}

function GettingStarted({
  onNavigate,
  done,
  onDismiss,
}: {
  onNavigate: (tab: number) => void;
  done: SetupDone;
  onDismiss: () => void;
}) {
  const steps = [
    {
      n: 1,
      icon: IconClipboardList,
      title: "Create your first plan",
      desc: "Group related tasks, milestones, and trackers.",
      tab: 1,
      done: done.plan,
    },
    {
      n: 2,
      icon: IconCalendarEvent,
      title: "Schedule today's tasks",
      desc: "Put the next blocks on your timeline.",
      tab: 0,
      done: done.task,
    },
    {
      n: 3,
      icon: IconRepeat,
      title: "Build a daily routine",
      desc: "Track small repeated actions.",
      tab: 2,
      done: done.ritual,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? steps[0];
  const ctaLabel = nextStep.n === 1 ? "Create plan" : nextStep.n === 2 ? "Schedule tasks" : "Add a routine";

  // A soft green wash marks this as a welcome moment without the loud solid
  // panel; saturated green is still spent only on progress (finished
  // segments, done markers) and the single next action — the One Signal rule.
  return (
    <section
      aria-labelledby="getting-started-title"
      className="w-full max-w-[640px] rounded-2xl border border-emerald-600/15 bg-emerald-50/70 px-5 py-5 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06] sm:px-6 sm:py-6"
    >
      <h2
        id="getting-started-title"
        className="text-[24px] font-extrabold leading-[1.1] tracking-[-0.02em] text-neutral-950 [text-wrap:balance] dark:text-white"
      >
        Set up your first day
      </h2>
      <p className="mt-1.5 text-[14px] font-medium text-neutral-600 dark:text-neutral-400">
        Three steps, about two minutes.
      </p>

      {/* Honest progress: one segment per step, filled only when that step is
          actually done. No head-start sliver at 0 of 3. */}
      <div className="mt-5 flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" role="img" aria-label={`${doneCount} of ${steps.length} setup steps done`}>
          {steps.map((s) => (
            <span
              key={s.n}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                s.done ? "bg-[#00A63E] dark:bg-[#2FD46E]" : "bg-emerald-900/10 dark:bg-white/[0.10]"
              }`}
            />
          ))}
        </div>
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
          {doneCount} of {steps.length} done
        </span>
      </div>

      <ol className="mt-4 flex flex-col gap-1">
        {steps.map(({ n, icon: Icon, title, desc, tab, done: stepDone }) => {
          const isNext = !stepDone && n === nextStep.n;
          // The marker carries the step's icon, and becomes the check once
          // the step is done — no separate number badge or icon tile.
          const marker = (
            <span
              aria-hidden
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                stepDone
                  ? "bg-[#00A63E] text-white dark:bg-[#2FD46E] dark:text-neutral-950"
                  : isNext
                  ? "border-2 border-neutral-950 bg-white text-neutral-950 dark:border-white dark:bg-transparent dark:text-white"
                  : "border border-emerald-900/15 bg-white/60 text-neutral-500 dark:border-white/[0.15] dark:bg-transparent dark:text-neutral-400"
              }`}
            >
              {stepDone ? <IconCheck size={16} strokeWidth={3} /> : <Icon size={17} strokeWidth={2} />}
            </span>
          );
          const text = (
            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[15px] font-bold leading-snug ${
                  stepDone ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-950 dark:text-white"
                }`}
              >
                <span className="sr-only">Step {n}: </span>
                {title}
                {stepDone && <span className="sr-only"> (done)</span>}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-neutral-600 dark:text-neutral-400">{desc}</p>
            </div>
          );

          return (
            <li key={n}>
              {isNext ? (
                // The next step is the one place on the card that acts: a
                // lighter row (not a second bordered card) and the green CTA.
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/90 px-3 py-3 dark:bg-white/[0.05] sm:flex-nowrap">
                  {marker}
                  {text}
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => { haptic("light"); onNavigate(tab); }}
                    className="ml-12 shrink-0 sm:ml-0"
                  >
                    {ctaLabel}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(tab); }}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 dark:hover:bg-white/[0.04]"
                >
                  {marker}
                  {text}
                  <IconArrowRight
                    size={16}
                    strokeWidth={2.2}
                    className="shrink-0 text-neutral-400 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none dark:text-neutral-500"
                  />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <Button variant="ghost" size="md" onClick={() => { haptic("light"); onDismiss(); }} className="-ml-4 mt-3">
        I&apos;ll do this later
      </Button>
    </section>
  );
}

export default function OverviewDashboard({
  schedule,
  todayKey,
  onNavigate,
  onMarkTaskDone,
  onToggleSlot,
  onOpenPlan,
  completedRitualIds,
  onLogTracker,
  onMarkRitualDone,
  onUnmarkRitualDone,
  onMissedTask,
  onAddTask,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAttention,
  onDismissAttentionOne,
  setSchedule,
  onToast,
  onReviewTask,
  onReviewDay,
  onCreateTaskAtTime,
}: OverviewDashboardProps) {
  const todayISO = localISODate(new Date());

  // The design's nine modules (docs: ~/Documents/Over View.pdf), all read from
  // lib/overview.ts so the phone shells show the same numbers.
  const todayPlan = useMemo(() => selectTodayPlan(schedule, todayISO, todayKey), [schedule, todayISO, todayKey]);
  const todayRoutines = useMemo(() => selectTodayRoutines(schedule, todayISO), [schedule, todayISO]);
  const tracking = useMemo(() => selectActiveTracking(schedule, todayISO), [schedule, todayISO]);
  const routineConsistency = useMemo(() => selectRoutineConsistency(schedule, todayISO), [schedule, todayISO]);

  // Only its at-risk routines are used now: the rest of Needs attention folds
  // into Goals & milestones (the callout) and Active tracking (the Due badge).
  const atRiskRitualIds = useMemo(
    () => new Set(selectNeedsAttention(schedule, todayISO, todayKey, completedRitualIds).atRiskRituals.map((row) => row.ritual.id)),
    [schedule, todayISO, todayKey, completedRitualIds],
  );

  const weekStatus = useMemo(() => selectWeekStatus(schedule, todayISO), [schedule, todayISO]);
  const goalPace = useMemo(() => selectGoalPace(schedule), [schedule]);

  // The observed weekly ceiling, and how the coming week measures against it.
  // One walk over completion history, shared by both readings.
  const capacity = useMemo(() => computeCapacityModel(schedule), [schedule]);
  const weekLoad = useMemo(
    () => assessPlannedLoad(capacity, plannedWeeklyMinutes(schedule)),
    [capacity, schedule],
  );
  const weekHeaviestDay = useMemo(() => heaviestDay(schedule, capacity), [schedule, capacity]);

  const setup = useMemo(() => selectSetupSteps(schedule), [schedule]);
  const hasScheduledTasks = setup.steps[1].done;

  // Getting-started stays up until the user has real momentum (2 of 3 setup
  // steps) or explicitly skips it; the flag is per-device.
  const [setupDismissed, setSetupDismissed] = useState(() => {
    try {
      return localStorage.getItem("planr-getting-started-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissGettingStarted = useCallback(() => {
    setSetupDismissed(true);
    try {
      localStorage.setItem("planr-getting-started-dismissed", "1");
    } catch {
      // storage unavailable — dismissal just won't persist
    }
  }, []);

  const setupDone: SetupDone = {
    plan: setup.steps[0].done,
    task: setup.steps[1].done,
    ritual: setup.steps[2].done,
  };
  const showGettingStarted = !setupDismissed && setup.show;

  const openPlan = (planId: string) => (onOpenPlan ? onOpenPlan(planId) : onNavigate(1));

  return (
    <div data-testid="overview-dashboard" className="pb-24 lg:pb-8">
      <div className="mx-auto w-full max-w-[1320px] pt-5 lg:pt-4">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-0.5 text-[30px] font-extrabold leading-tight tracking-[-0.04em] text-neutral-950 dark:text-white">
              Overview
            </h1>
          </div>
          <StreakPill streak={weekStatus.streak} />
        </div>

        {showGettingStarted ? (
          <GettingStarted onNavigate={onNavigate} done={setupDone} onDismiss={dismissGettingStarted} />
        ) : (
          <div className="stagger-rise flex flex-col gap-4">
            {/* Today: the work, the routines, the numbers. */}
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              <TodayPlanCard
                plan={todayPlan}
                plans={schedule.plans}
                onMarkDone={onMarkTaskDone}
                onToggleSlot={onToggleSlot}
                onMissed={onMissedTask}
                onAddTask={onAddTask ?? (() => onNavigate(0))}
              />
              <TodayRoutineCard
                rows={todayRoutines.rows}
                done={todayRoutines.done}
                total={todayRoutines.total}
                atRiskIds={atRiskRitualIds}
                onToggle={(id, done) => (done ? onUnmarkRitualDone?.(id) : onMarkRitualDone?.(id))}
                onOpenRoutine={() => onNavigate(2)}
              />
              <ActiveTrackingCard
                rows={tracking}
                onLogTracker={onLogTracker}
                onOpenTracking={() => onNavigate(8)}
                onSetUp={() => onNavigate(1)}
              />
            </div>

            {/* The day's shape and the goals it serves. */}
            <div className="grid items-start gap-4 xl:grid-cols-3">
              {hasScheduledTasks && (
                <div data-testid="overview-day-breakdown" className={`${CARD} overflow-hidden`}>
                  <DayBreakdownCard
                    activities={schedule.activities}
                    categories={schedule.categories}
                    todayKey={todayKey}
                    todayISO={todayISO}
                    preferences={schedule.preferences}
                    onFillSlot={onCreateTaskAtTime}
                  />
                </div>
              )}
              <div className={hasScheduledTasks ? "xl:col-span-2" : "xl:col-span-3"}>
                <GoalPaceCard
                  rows={goalPace.rows}
                  totalCount={goalPace.totalCount}
                  onOpenPlan={openPlan}
                  onSeeAll={() => onNavigate(1)}
                  onAdaptMilestone={onAdaptMilestone}
                />
              </div>
            </div>

            {/* The week, and the longer trend. */}
            <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              <WeekStatusCard status={weekStatus}>
                <CapacityCheck load={weekLoad} heaviest={weekHeaviestDay} />
              </WeekStatusCard>
              <RoutineConsistencyCard rows={routineConsistency.rows} pct={routineConsistency.pct} />
              {hasScheduledTasks && (
                <div data-testid="overview-progress-card">
                  <CompletionTrendCard schedule={schedule} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
