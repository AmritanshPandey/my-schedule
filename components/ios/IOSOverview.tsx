"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { IconCalendar, IconCheck, IconChevronRight, IconClipboardList, IconRepeat } from "@tabler/icons-react";
import type { DayKey, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import type { MissedTask, NeedsAttention, UnreliableSlotTask } from "@/lib/needsAttention";
import { selectGoalPace, selectNextUp, selectSetupSteps, selectWeekStatus, type SetupStep } from "@/lib/overview";
import { localISODate } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import NeedsAttentionCard from "@/components/NeedsAttentionCard";
import NextUpCard from "@/components/overview/NextUpCard";
import WeekStatusCard from "@/components/overview/WeekStatusCard";
import GoalPaceCard from "@/components/overview/GoalPaceCard";
import type { InsightToast } from "@/components/intelligence/InsightsCard";

const InsightsCard = dynamic(() => import("@/components/intelligence/InsightsCard"), { ssr: false });
const CheckInsDueCard = dynamic(() => import("@/components/tracking/CheckInsDueCard"), { ssr: false });

const SETUP_ICON: Record<SetupStep["key"], typeof IconCalendar> = {
  plan: IconClipboardList,
  task: IconCalendar,
  ritual: IconRepeat,
};

/** Goal rows on the phone: enough to see what's slipping, not a second Plans tab. */
const MOBILE_GOAL_ROWS = 3;

/**
 * The phone's Overview: status at a glance, plus quick fixes. Same order as
 * every Overview (lib/overview.ts): Next → Fix → Status → Goals → Patterns.
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
  onOpenPlan,
  onMarkDone,
  onToggleSlot,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAttention,
  onDismissAttentionOne,
  onLogTracker,
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
  onOpenPlan: (planId: string) => void;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onHandleMissed: (missed: MissedTask) => void;
  onAdaptMilestone: (milestoneId: string) => void;
  onReviewUnreliableSlot: (row: UnreliableSlotTask) => void;
  onClearAttention: () => void;
  onDismissAttentionOne: (key: string) => void;
  onLogTracker: (tracker: ProgressTracker) => void;
  onToast: (toast: InsightToast) => void;
  onReviewTask: (task: Task) => void;
  onReviewDay: (day: DayKey) => void;
}) {
  const todayISO = localISODate(new Date());
  const setup = useMemo(() => selectSetupSteps(schedule), [schedule]);
  const nextUp = useMemo(() => selectNextUp(schedule, todayISO, todayKey), [schedule, todayISO, todayKey]);
  const weekStatus = useMemo(() => selectWeekStatus(schedule, todayISO), [schedule, todayISO]);
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
            {setup.steps.map(({ key, label, tab, done }, index) => {
              const isNext = !done && key === setup.next.key;
              const Icon = SETUP_ICON[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onNavigate(tab); }}
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
            <button
              type="button"
              onClick={() => { haptic("light"); onNavigate(setup.next.tab); }}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#008236] text-[14px] font-bold text-white active:scale-[0.98] active:bg-[#006B2C] dark:bg-[#2FD46E] dark:text-neutral-950"
            >
              {setup.next.cta}
            </button>
            <button
              type="button"
              onClick={() => { haptic("light"); onDismissSetup(); }}
              className="flex min-h-[44px] items-center justify-center rounded-full px-3 text-[13px] font-semibold text-neutral-600 active:text-neutral-950 dark:text-neutral-400 dark:active:text-white"
            >
              I&apos;ll do this later
            </button>
          </div>
        </section>
      )}

      {/* Next — the first answer. */}
      <NextUpCard next={nextUp} onMarkDone={onMarkDone} onToggleSlot={onToggleSlot} onOpenToday={() => onNavigate(0)} />

      {/* Fix — both render nothing when all clear. */}
      <NeedsAttentionCard
        data={needsAttention}
        onNavigate={onNavigate}
        onHandleMissed={onHandleMissed}
        onAdaptMilestone={onAdaptMilestone}
        onReviewUnreliableSlot={onReviewUnreliableSlot}
        onClearAll={onClearAttention}
        onDismissOne={onDismissAttentionOne}
      />
      <CheckInsDueCard
        trackers={schedule.progressTrackers}
        metricEntries={schedule.metricEntries}
        todayISO={todayISO}
        trackingStart={schedule.preferences?.startDate}
        onLog={onLogTracker}
        onOpenTracking={() => onNavigate(8)}
      />

      {/* Status — the week in one card, streak included. */}
      <WeekStatusCard status={weekStatus} compact onOpen={() => { haptic("light"); onNavigate(0); }} />

      {/* Goals — worst first; hidden when no plan has a milestone to pace. */}
      <GoalPaceCard
        rows={goalPace.rows}
        totalCount={goalPace.totalCount}
        compact
        onOpenPlan={onOpenPlan}
        onSeeAll={() => onNavigate(1)}
      />

      {/* Patterns — the weekly read. Pattern engine only on iPhone (no
          language model runs in Safari/the PWA), so it costs no model memory. */}
      <InsightsCard
        schedule={schedule}
        setSchedule={setSchedule}
        onToast={onToast}
        onReviewTask={onReviewTask}
        onReviewDay={onReviewDay}
      />
    </div>
  );
}
