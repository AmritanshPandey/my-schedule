"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  IconArrowRight,
  IconCalendarEvent,
  IconScale,
  IconChartLine,
  IconCheck,
  IconChevronDown,
  IconClipboardList,
  IconFlame,
  IconTrophy,
  IconPlus,
  IconRepeat,
  IconTarget,
} from "@tabler/icons-react";
import type { DayKey, Plan, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import { accentStyles } from "@/lib/colorSystem";
import DayBreakdownCard from "@/components/DayBreakdownCard";
import NeedsAttentionCard from "@/components/NeedsAttentionCard";
import InsightsCard, { type InsightToast } from "@/components/intelligence/InsightsCard";
import CheckInsDueCard from "@/components/tracking/CheckInsDueCard";
import { selectNeedsAttention, type MissedTask, type NeedsAttention, type UnreliableSlotTask } from "@/lib/needsAttention";
import {
  computeCapacityModel,
  plannedWeeklyMinutes,
  assessPlannedLoad,
  heaviestDay,
  type LoadVerdict,
} from "@/lib/capacityModel";
import CompletionTrendCard from "@/components/analytics/CompletionTrendCard";
import { selectGoalPace, selectNextUp, selectSetupSteps, selectWeekStatus } from "@/lib/overview";
import NextUpCard from "@/components/overview/NextUpCard";
import WeekStatusCard from "@/components/overview/WeekStatusCard";
import GoalPaceCard from "@/components/overview/GoalPaceCard";

import { computeTrend, type TrendResult } from "@/lib/trendUtils";
import { localISODate } from "@/lib/dateUtils";
import { formatDisplayTime } from "@/lib/timeUtils";
import { calculateRitualStats, ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import Button from "@/components/ui/Button";
import Sparkline from "@/components/ui/Sparkline";
import TrendChange from "@/components/ui/TrendChange";
import IconButton from "@/components/ui/IconButton";

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

type TrackerRow = {
  tracker: ProgressTracker;
  latest?: { value: number };
  /** Up to the last 8 entries, chronological — feeds the row's sparkline. */
  series: number[];
  trend: TrendResult | null;
  plan?: Plan;
};

function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={15} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">{title}</p>
      </div>
      {meta && (
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
          {meta}
        </span>
      )}
    </div>
  );
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

/** Bucket tracker rows under their plan, preserving first-seen order. */
function groupTrackerRowsByPlan(rows: TrackerRow[]): Array<{ key: string; plan?: Plan; rows: TrackerRow[] }> {
  const groups: Array<{ key: string; plan?: Plan; rows: TrackerRow[] }> = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = row.plan?.id ?? "__none__";
    let gi = index.get(key);
    if (gi === undefined) {
      gi = groups.length;
      index.set(key, gi);
      groups.push({ key, plan: row.plan, rows: [] });
    }
    groups[gi].rows.push(row);
  }
  return groups;
}

function ActiveTrackingCard({
  rows,
  onNavigate,
  onLogTracker,
}: {
  rows: TrackerRow[];
  onNavigate: (tab: number) => void;
  onLogTracker: (tracker: ProgressTracker) => void;
}) {
  return (
    <section data-testid="overview-tracking-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconTarget} title="Active tracking" meta={rows.length > 0 ? `${rows.length}` : undefined} />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-center dark:border-white/[0.09]">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
            <IconChartLine size={24} strokeWidth={2} />
          </span>
          <p className="mt-3 text-[14px] font-bold text-neutral-900 dark:text-white">No trackers yet</p>
          <p className="mx-auto mt-1 max-w-[250px] text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Track a metric on any plan to make your progress visible here.
          </p>
          <Button
            variant="secondary"
            size="md"
            onClick={() => { haptic("light"); onNavigate(1); }}
            trailingIcon={<IconArrowRight size={16} strokeWidth={2.5} />}
            className="mt-4"
          >
            Set up tracking
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          {groupTrackerRowsByPlan(rows).map((group) => (
            <div key={group.key} className="pt-3 first:pt-1">
              {/* Plan heading — trackers are bifurcated under the plan they
                  belong to, so the same metric name across plans reads apart. */}
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    group.plan ? accentStyles(group.plan.color).dot : "bg-neutral-400 dark:bg-neutral-500"
                  }`}
                />
                <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
                  {group.plan?.title ?? "Other"}
                </p>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                {group.rows.map(({ tracker, latest, series, trend }) => {
                  const trendColorClass =
                    trend?.state === "positive"
                      ? "text-emerald-500 dark:text-emerald-400"
                      : trend?.state === "negative"
                      ? "text-rose-500 dark:text-rose-400"
                      : "text-neutral-500 dark:text-neutral-400";
                  return (
                    <div key={tracker.id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold leading-tight text-neutral-950 dark:text-white">{tracker.title}</p>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                            {latest ? `${latest.value}${tracker.unit ?? ""}` : "No entries yet"}
                          </p>
                          {trend && <TrendChange direction={trend.direction} state={trend.state} pct={trend.pct} />}
                        </div>
                      </div>
                      <Sparkline values={series} className={trendColorClass} />
                      <IconButton label={`Log ${tracker.title}`} variant="primary" size="md" onClick={() => { haptic("light"); onLogTracker(tracker); }}>
                        <IconPlus size={18} strokeWidth={2.5} />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RoutineConsistencyCard({
  rows,
}: {
  rows: { ritual: { id: string; title: string; time: string }; streak: number; bestStreak: number; adherencePct: number; dots: boolean[]; dueToday: boolean }[];
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="overview-routine-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconRepeat} title="Routine consistency" meta={`${rows.length}`} />
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {rows.map(({ ritual, streak, bestStreak, adherencePct, dots, dueToday }) => (
          <div key={ritual.id} className={`flex items-center justify-between gap-3 py-3 ${dueToday ? "" : "opacity-70"}`}>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-neutral-950 dark:text-white">
                {ritual.title}
                {ritual.time && <span className="ml-1.5 font-semibold text-neutral-500 dark:text-neutral-400">{formatDisplayTime(ritual.time)}</span>}
              </p>
              <div className="mt-1 flex items-center gap-2.5">
                {streak > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 dark:text-rose-400">
                    <IconFlame size={12} strokeWidth={2} />
                    {streak}d streak
                  </span>
                )}
                {/* Best streak only earns a place here when it's actually a
                    different (higher) number than the current run — repeating
                    the same figure twice would read as clutter, not signal. */}
                {bestStreak > streak && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 dark:text-amber-400">
                    <IconTrophy size={12} strokeWidth={2} />
                    {bestStreak}d best
                  </span>
                )}
                <span className="text-[12px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
                  {adherencePct}% · 30d
                </span>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {dots.map((on, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.10]"}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
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
                    variant="cta"
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

  // Next → Fix → Status → Goals → Patterns (lib/overview.ts). Desktop is the
  // weekly review: Next is a strip in the header that hands off to Today,
  // and the page below is about the week and the plans.
  const nextUp = useMemo(() => selectNextUp(schedule, todayISO, todayKey), [schedule, todayISO, todayKey]);

  // What slipped while the app had no way to say so. Empty for a user who is
  // on top of things, and the card renders nothing in that case.
  const needsAttention = useMemo(
    () => selectNeedsAttention(schedule, todayISO, todayKey, completedRitualIds),
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

  const ritualConsistency = useMemo(() => {
    const completions = schedule.ritualCompletions ?? [];
    const trackingStart = schedule.preferences?.startDate;
    // All routines, not just today's — an off-day routine still shows its
    // streak/adherence so the card reviews overall follow-through. Uses the one
    // shared streak helper so the number matches the Routine tab.
    return (schedule.rituals ?? [])
      .map((ritual) => {
        const { streak, bestStreak, adherencePct, dots } = calculateRitualStats(ritual, completions, todayISO, trackingStart);
        return { ritual, streak, bestStreak, adherencePct, dots, dueToday: ritualScheduledOnDate(ritual, todayISO, trackingStart) };
      })
      // Due today first, then most-at-risk (lowest adherence) so what's slipping surfaces.
      .sort((a, b) =>
        a.dueToday !== b.dueToday ? (a.dueToday ? -1 : 1) : a.adherencePct - b.adherencePct,
      );
  }, [schedule.ritualCompletions, schedule.rituals, schedule.preferences?.startDate, todayISO]);

  const trackerData = useMemo<TrackerRow[]>(() =>
    (schedule.progressTrackers ?? []).map((tracker) => {
      const entries = (schedule.metricEntries ?? [])
        .filter((entry) => entry.trackerId === tracker.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = entries[0];
      const previous = entries[1];
      // pct/direction are well-defined regardless of goalDirection; only the
      // "is this good?" state needs one, so it falls back to a real direction
      // but a neutral (gray) state when we have no basis to judge the move.
      const trend =
        latest && previous
          ? (() => {
              const result = computeTrend({
                previous: previous.value,
                current: latest.value,
                goalDirection: tracker.goalDirection ?? "increase_good",
              });
              return tracker.goalDirection ? result : { ...result, state: "neutral" as const };
            })()
          : null;
      return {
        tracker,
        latest,
        // Chronological (oldest first) so the sparkline reads left-to-right.
        series: entries.slice(0, 8).reverse().map((entry) => entry.value),
        trend,
        plan: schedule.plans.find((plan) => plan.id === tracker.planId),
      };
    }),
    [schedule.metricEntries, schedule.plans, schedule.progressTrackers]
  );

  const openPlan = (planId: string) => (onOpenPlan ? onOpenPlan(planId) : onNavigate(1));

  return (
    <div data-testid="overview-dashboard" className="pb-24 lg:pb-8">
      <div className="mx-auto w-full max-w-[1320px] pt-5 lg:pt-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-0.5 text-[30px] font-extrabold leading-tight tracking-[-0.04em] text-neutral-950 dark:text-white">
              Overview
            </h1>
          </div>
          {!showGettingStarted && (
            <NextUpCard
              next={nextUp}
              variant="strip"
              onMarkDone={onMarkTaskDone}
              onToggleSlot={onToggleSlot}
              onOpenToday={() => onNavigate(0)}
            />
          )}
        </div>

        {showGettingStarted ? (
          <GettingStarted onNavigate={onNavigate} done={setupDone} onDismiss={dismissGettingStarted} />
        ) : (
          <div className="stagger-rise grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
            {/* ── The review: the week, the plans, the long trends. ── */}
            <div className="min-w-0 space-y-4">
              <WeekStatusCard status={weekStatus}>
                <CapacityCheck load={weekLoad} heaviest={weekHeaviestDay} />
              </WeekStatusCard>
              <GoalPaceCard
                rows={goalPace.rows}
                totalCount={goalPace.totalCount}
                onOpenPlan={openPlan}
                onSeeAll={() => onNavigate(1)}
              />
              {hasScheduledTasks && (
                <div data-testid="overview-progress-card">
                  <CompletionTrendCard schedule={schedule} />
                </div>
              )}
              <ActiveTrackingCard rows={trackerData} onNavigate={onNavigate} onLogTracker={onLogTracker} />
            </div>

            {/* ── The rail: what to act on after reading the review. ── */}
            <div className="min-w-0 space-y-4">
              <NeedsAttentionCard data={needsAttention} onNavigate={onNavigate} onHandleMissed={onHandleMissed} onAdaptMilestone={onAdaptMilestone} onReviewUnreliableSlot={onReviewUnreliableSlot} onClearAll={onClearAttention ? () => onClearAttention(needsAttention) : undefined} onDismissOne={onDismissAttentionOne} />
              {/* Trackers waiting on this period's entry — renders nothing
                  once every check-in is in. */}
              <CheckInsDueCard
                trackers={schedule.progressTrackers ?? []}
                metricEntries={schedule.metricEntries ?? []}
                todayISO={todayISO}
                trackingStart={schedule.preferences?.startDate}
                onLog={onLogTracker}
                onOpenTracking={() => onNavigate(8)}
              />
              {/* The weekly read: what the record says, what to change.
                  Hidden until there's history to read. */}
              {setSchedule && (
                <InsightsCard
                  schedule={schedule}
                  setSchedule={setSchedule}
                  onToast={onToast}
                  onReviewTask={onReviewTask}
                  onReviewDay={onReviewDay}
                />
              )}
              <RoutineConsistencyCard rows={ritualConsistency} />
              {/* Planning the day belongs on the planner; until it moves there
                  it stays reachable here, folded away from the review. */}
              {hasScheduledTasks && (
                <details data-testid="overview-day-breakdown" className={`${CARD} group`}>
                  <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-[13px] font-bold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
                    Where today goes
                    <IconChevronDown size={16} strokeWidth={2.2} className="text-neutral-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                  </summary>
                  <div className="px-1 pb-1">
                    <DayBreakdownCard
                      activities={schedule.activities}
                      categories={schedule.categories}
                      todayKey={todayKey}
                      todayISO={todayISO}
                      preferences={schedule.preferences}
                      onFillSlot={onCreateTaskAtTime}
                    />
                  </div>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
