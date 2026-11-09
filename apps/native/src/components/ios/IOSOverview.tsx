import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { IconCalendar, IconCheck, IconChevronRight, IconClipboardList, IconRepeat } from '@tabler/icons-react-native';
import type { DayKey, ProgressTracker, Schedule, Task } from '@planr/core/lib/scheduleTypes';
import type { MissedTask, NeedsAttention, UnreliableSlotTask } from '@planr/core/lib/needsAttention';
import {
  selectActiveTracking,
  selectGoalPace,
  selectSetupSteps,
  selectTodayPlan,
  selectTodayRoutines,
  selectWeekStatus,
  type SetupStep,
} from '@planr/core/lib/overview';
import { todayISO as currentISO } from '@planr/core/lib/dateUtils';
import { haptic } from '../../lib/haptics';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';
import type { InsightToast } from '../intelligence/InsightsCard';
import TodayPlanCard from '../overview/TodayPlanCard';
import TodayRoutineCard from '../overview/TodayRoutineCard';
import ActiveTrackingCard from '../overview/ActiveTrackingCard';
import WeekStatusCard from '../overview/WeekStatusCard';
import GoalPaceCard from '../overview/GoalPaceCard';
import Button from '../ui/Button';

const SETUP_ICON: Record<SetupStep['key'], TablerIcon> = {
  plan: IconClipboardList,
  task: IconCalendar,
  ritual: IconRepeat,
};

/** Goal rows on the phone: enough to see what's slipping, not a second Plans tab. */
const MOBILE_GOAL_ROWS = 3;
/** Trackers on the phone; the rest are a tap away on Tracking. */
const MOBILE_TRACKER_ROWS = 3;

/**
 * Native twin of components/ios/IOSOverview.tsx — the daily-execution part of
 * the Overview design: today's tasks, routines and trackers, then the goals
 * and the week. Every number comes from @planr/core/lib/overview, so it
 * matches the web. Keep the two in step.
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
  onStartSetupStep: (step: SetupStep['key']) => void;
  onOpenPlan: (planId: string) => void;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onHandleMissed: (missed: MissedTask) => void;
  onAdaptMilestone: (milestoneId: string) => void;
  onReviewUnreliableSlot: (row: UnreliableSlotTask) => void;
  onClearAttention: () => void;
  onDismissAttentionOne: (key: string) => void;
  onLogTracker: (tracker: ProgressTracker) => void;
  /** Today's routine ring: mark done (fully followed) or take the mark back. */
  onMarkRitualDone: (ritualId: string) => void;
  onUnmarkRitualDone: (ritualId: string) => void;
  onToast: (toast: InsightToast) => void;
  onReviewTask: (task: Task) => void;
  onReviewDay: (day: DayKey) => void;
}) {
  const todayISO = currentISO();
  const setup = useMemo(() => selectSetupSteps(schedule), [schedule]);
  const todayPlan = useMemo(() => selectTodayPlan(schedule, todayISO, todayKey), [schedule, todayISO, todayKey]);
  const todayRoutines = useMemo(() => selectTodayRoutines(schedule, todayISO), [schedule, todayISO]);
  const tracking = useMemo(() => selectActiveTracking(schedule, todayISO), [schedule, todayISO]);
  const weekStatus = useMemo(() => selectWeekStatus(schedule, todayISO), [schedule, todayISO]);
  const atRiskRitualIds = useMemo(() => new Set(needsAttention.atRiskRituals.map((row) => row.ritual.id)), [needsAttention]);
  const goalPace = useMemo(() => selectGoalPace(schedule, { limit: MOBILE_GOAL_ROWS, withMilestoneOnly: true }), [schedule]);
  const showSetup = !setupDismissed && setup.show;

  return (
    <View testID="overview-dashboard" className="gap-4 px-4 pt-5">
      {showSetup && (
        // Same treatment as the web card: a soft green wash, honest per-step
        // segments, and saturated green only on progress and the next action.
        <View className="rounded-2xl border border-emerald-600/15 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]">
          <Text accessibilityRole="header" className="text-[19px] font-extrabold leading-tight tracking-[-0.01em] text-neutral-950 dark:text-white">
            Set up your first day
          </Text>
          <Text className="mt-1 text-[13px] font-medium text-neutral-600 dark:text-neutral-400">Three steps, about two minutes.</Text>
          <View className="mt-3 flex-row items-center gap-3">
            <View accessible accessibilityLabel={`${setup.doneCount} of 3 setup steps done`} className="flex-1 flex-row gap-1.5">
              {setup.steps.map(({ key, done }) => (
                <View key={key} className={`h-1.5 flex-1 rounded-full ${done ? 'bg-[#00A63E] dark:bg-[#2FD46E]' : 'bg-emerald-900/10 dark:bg-white/[0.10]'}`} />
              ))}
            </View>
            <Text className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">{setup.doneCount} of 3</Text>
          </View>
          <View className="mt-3 gap-1">
            {setup.steps.map(({ key, label, done }, index) => {
              const isNext = !done && key === setup.next.key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Step ${index + 1}: ${label}${done ? ' (done)' : ''}`}
                  onPress={() => {
                    haptic('light');
                    onStartSetupStep(key);
                  }}
                  className={`min-h-[52px] w-full flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-white/70 dark:active:bg-white/[0.06] ${
                    isNext ? 'bg-white/90 dark:bg-white/[0.05]' : ''
                  }`}
                >
                  <View
                    className={`h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      done
                        ? 'bg-[#00A63E] dark:bg-[#2FD46E]'
                        : isNext
                          ? 'border-2 border-neutral-950 bg-white dark:border-white dark:bg-transparent'
                          : 'border border-emerald-900/15 bg-white/60 dark:border-white/[0.15] dark:bg-transparent'
                    }`}
                  >
                    {done ? (
                      <Icon icon={IconCheck} size={15} strokeWidth={3} className="text-white dark:text-neutral-950" />
                    ) : (
                      <Icon
                        icon={SETUP_ICON[key]}
                        size={16}
                        strokeWidth={2}
                        className={isNext ? 'text-neutral-950 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}
                      />
                    )}
                  </View>
                  <Text
                    numberOfLines={1}
                    className={`min-w-0 flex-1 text-[14px] font-bold ${done ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-950 dark:text-white'}`}
                  >
                    {label}
                  </Text>
                  <Icon icon={IconChevronRight} size={16} strokeWidth={2.4} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                </Pressable>
              );
            })}
          </View>
          <View className="mt-3 flex-row items-center gap-2">
            <Button
              size="md"
              onPress={() => {
                haptic('light');
                onStartSetupStep(setup.next.key);
              }}
              className="flex-1"
            >
              {setup.next.cta}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onPress={() => {
                haptic('light');
                onDismissSetup();
              }}
            >
              I'll do this later
            </Button>
          </View>
        </View>
      )}

      {/* Today's plan — the hero; checking a row is the one-tap "mark done". */}
      <TodayPlanCard plan={todayPlan} streak={weekStatus.streak} onMarkDone={onMarkDone} onToggleSlot={onToggleSlot} onAddTask={onAddTask} />

      <TodayRoutineCard
        rows={todayRoutines.rows}
        done={todayRoutines.done}
        total={todayRoutines.total}
        atRiskIds={atRiskRitualIds}
        onToggle={(id, done) => (done ? onUnmarkRitualDone(id) : onMarkRitualDone(id))}
        onOpenRoutine={() => onNavigate(2)}
      />

      {/* Due check-ins carry a badge and sit first. */}
      <ActiveTrackingCard
        rows={tracking}
        limit={MOBILE_TRACKER_ROWS}
        onLogTracker={onLogTracker}
        onOpenTracking={() => onNavigate(8)}
        onSetUp={() => onNavigate(1)}
      />

      {/* Goals — worst first, a slipping milestone's fix under it; hidden when no plan has a milestone to pace. */}
      <GoalPaceCard
        rows={goalPace.rows}
        totalCount={goalPace.totalCount}
        onOpenPlan={onOpenPlan}
        onSeeAll={() => onNavigate(1)}
        onAdaptMilestone={onAdaptMilestone}
      />

      <WeekStatusCard status={weekStatus} onOpen={() => onNavigate(0)} />
    </View>
  );
}
