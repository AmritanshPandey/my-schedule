import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  IconCalendarEvent,
  IconCheck,
  IconChevronRight,
  IconClipboardList,
  IconFlame,
  IconRepeat,
} from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { DAY_FULL_LABELS, DAYS } from '@planr/core/lib/scheduleConstants';
import { todayISO, formatDateOrdinal } from '@planr/core/lib/dateUtils';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import { getSlots } from '@planr/core/lib/taskMutations';
import { isTaskResolved } from '@planr/core/lib/taskCompletion';
import { selectTodayTasks } from '@planr/core/lib/todayTasks';
import { calculateExecutionStreak } from '@planr/core/lib/consistency/calculateExecutionStreak';
import { computeExecutionTrend } from '@planr/core/lib/executionAnalytics';
import { getSchedule } from '../storage/scheduleStore';
import { storage } from '../storage/mmkv';
import { colors } from '../theme/colors';
import Screen from '../components/Screen';

type RootStackParamList = {
  Today: undefined;
  Plans: undefined;
  Routine: undefined;
};

const SETUP_DISMISSED_KEY = 'overview-setup-dismissed';

function todayLabel(): string {
  const dayKey = DAYS[(new Date().getDay() + 6) % 7];
  return `${DAY_FULL_LABELS[dayKey]}, ${formatDateOrdinal(todayISO())}`;
}

function todayDayKey() {
  return DAYS[(new Date().getDay() + 6) % 7];
}

function formatMinutesBrief(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function slotMinutes(startTime: string, endTime: string): number {
  const parse = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
  };
  const start = parse(startTime);
  let end = parse(endTime);
  if (end <= start) end += 24 * 60;
  return Math.max(0, end - start);
}

/**
 * Native port of the iOS shell's Overview tab (components/ios/IOSScheduleApp.tsx,
 * activeTab === 4) — the compact "Getting started" checklist, execution
 * streak, "Next up" prompt, and today's execution stat. All computed from the
 * same shared, portable functions the web app uses
 * (calculateExecutionStreak, computeExecutionTrend, selectTodayTasks), so the
 * numbers can't drift between platforms.
 *
 * Scoped deliberately smaller than desktop's OverviewDashboard.tsx (weekly
 * heatmap, completion trend chart, capacity check, needs-attention card,
 * tracker rows) — that's a much larger, analytics-heavy surface; this covers
 * the mobile-shell's own leaner Overview, which is the actual visual parity
 * target for a phone screen.
 */
export default function OverviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());
  const [setupDismissed, setSetupDismissed] = useState(() => storage.getString(SETUP_DISMISSED_KEY) === '1');

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const today = todayISO();
  const dayKey = todayDayKey();

  const { tasks: todayTasks, done: todayDone } = useMemo(
    () => selectTodayTasks(schedule, today, dayKey),
    [schedule, today, dayKey],
  );
  const todayOpenTasks = useMemo(
    () => todayTasks.filter((task) => !isTaskResolved(task, task.subtasks?.length ?? 0)),
    [todayTasks],
  );
  const remainingPlannedMinutes = useMemo(
    () =>
      todayOpenTasks.reduce((sum, task) => {
        const slots = getSlots(task);
        return sum + slots.reduce((s, slot) => s + slotMinutes(slot.startTime, slot.endTime), 0);
      }, 0),
    [todayOpenTasks],
  );
  const dashboardProgressPct = todayTasks.length > 0 ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const executionStreak = useMemo(() => calculateExecutionStreak(schedule, today), [schedule, today]);
  const missedThisWeek = useMemo(() => computeExecutionTrend(schedule).currentMissed, [schedule]);

  const setupSteps = [
    { label: 'Create your first plan', done: schedule.plans.length > 0, Icon: IconClipboardList, go: () => navigation.navigate('Plans') },
    { label: "Schedule today's tasks", done: Object.values(schedule.activities).some((a) => (a?.length ?? 0) > 0), Icon: IconCalendarEvent, go: () => navigation.navigate('Today') },
    { label: 'Build a daily routine', done: (schedule.rituals?.length ?? 0) > 0, Icon: IconRepeat, go: () => navigation.navigate('Routine') },
  ];
  const setupDoneCount = setupSteps.filter((s) => s.done).length;
  const showSetup = !setupDismissed && setupDoneCount < 2;
  const nextSetup = setupSteps.find((s) => !s.done) ?? setupSteps[0];

  function dismissSetup() {
    setSetupDismissed(true);
    storage.set(SETUP_DISMISSED_KEY, '1');
  }

  const nextTask = todayOpenTasks[0];
  const nextTaskSlot = nextTask ? getSlots(nextTask)[0] : undefined;
  const nextTaskPlan = nextTask?.planId ? schedule.plans.find((p) => p.id === nextTask.planId) : undefined;

  return (
    <Screen title="Overview">
      <View className="rounded-2xl border border-black/[0.08] bg-white px-5 py-4 dark:border-white/[0.09] dark:bg-neutral-900">
        <Text className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Today
        </Text>
        <Text className="mt-1 text-[22px] font-extrabold text-black dark:text-white">{todayLabel()}</Text>
      </View>

        {showSetup && (
          <View className="overflow-hidden rounded-2xl border border-emerald-700/40 bg-[#00A63E] p-4 dark:border-emerald-400/25 dark:bg-[#2FD46E]">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-[11px] font-black uppercase tracking-[0.10em] text-black/80">Getting started</Text>
                <Text className="mt-1 text-[19px] font-black leading-tight text-black">Make your day trackable</Text>
              </View>
              <Text className="text-[12px] font-black tabular-nums text-black/70">{setupDoneCount}/3</Text>
            </View>
            <View className="mb-3.5 mt-3 h-1.5 overflow-hidden rounded-full bg-black/15">
              <View className="h-full rounded-full bg-black" style={{ width: `${Math.max(8, (setupDoneCount / 3) * 100)}%` }} />
            </View>
            <View className="gap-1.5">
              {setupSteps.map(({ label, done, Icon, go }) => (
                <Pressable
                  key={label}
                  onPress={go}
                  className="flex-row items-center gap-2.5 rounded-xl bg-black/5 px-3 py-2.5 active:bg-black/10"
                >
                  <View className={`h-7 w-7 items-center justify-center rounded-lg ${done ? 'bg-black' : 'bg-black/10'}`}>
                    {done ? <IconCheck size={15} strokeWidth={3} color="#FFFFFF" /> : <Icon size={15} strokeWidth={2.2} color="#0A0A0A" />}
                  </View>
                  <Text className={`min-w-0 flex-1 text-[14px] font-bold ${done ? 'text-black/45 line-through' : 'text-black'}`} numberOfLines={1}>
                    {label}
                  </Text>
                  {!done && <IconChevronRight size={16} strokeWidth={2.4} color="rgba(10,10,10,0.4)" />}
                </Pressable>
              ))}
            </View>
            <View className="mt-3.5 flex-row gap-2">
              <Pressable onPress={nextSetup.go} className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-black active:bg-neutral-800">
                <Text className="text-[14px] font-black text-white">
                  {nextSetup.label === 'Create your first plan' ? 'Create plan' : nextSetup.label === "Schedule today's tasks" ? 'Schedule tasks' : 'Add routine'}
                </Text>
              </Pressable>
              <Pressable onPress={dismissSetup} className="min-h-[44px] items-center justify-center rounded-xl px-4 active:bg-black/5">
                <Text className="text-[13px] font-bold text-black/55">Skip</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View className="rounded-2xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.09] dark:bg-neutral-900">
          <View className="flex-row items-center gap-3">
            <View
              className={`h-12 w-12 items-center justify-center rounded-2xl ${
                executionStreak.atRisk ? 'bg-amber-500/12' : 'bg-emerald-500/12'
              }`}
            >
              <IconFlame size={22} strokeWidth={2} color={executionStreak.atRisk ? '#F59E0B' : c.momentumGreen} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[16px] font-bold leading-none text-black dark:text-white" numberOfLines={1}>
                {executionStreak.streak === 0 ? 'No streak yet' : `${executionStreak.streak}-day streak`}
              </Text>
              <Text className="mt-1.5 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                {executionStreak.atRisk
                  ? 'Complete one thing to keep it alive.'
                  : executionStreak.milestone
                  ? 'New milestone — keep the run going.'
                  : executionStreak.streak === 0
                  ? 'Finish a task or ritual to start.'
                  : 'You showed up. Keep the run going.'}
              </Text>
            </View>
            {executionStreak.streak > 0 && (
              <Text
                className={`text-[24px] font-semibold tabular-nums leading-none ${
                  executionStreak.atRisk ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {executionStreak.streak}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate('Today')}
          className="min-h-[72px] flex-row items-center gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3 active:bg-neutral-50 dark:border-white/[0.09] dark:bg-neutral-900 dark:active:bg-white/[0.04]"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/12">
            <IconCalendarEvent size={19} strokeWidth={2.2} color={c.momentumGreen} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">Next up</Text>
            <Text className="mt-0.5 text-[16px] font-bold text-black dark:text-white" numberOfLines={1}>
              {nextTask?.title ?? 'Plan your day'}
            </Text>
            <Text className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
              {nextTask
                ? [nextTaskSlot?.startTime && formatDisplayTime(nextTaskSlot.startTime), nextTaskPlan?.title].filter(Boolean).join(' · ') || 'Open Today to continue'
                : todayTasks.length > 0
                ? 'Everything scheduled is complete'
                : 'Open Today to add your first task'}
            </Text>
          </View>
          <IconChevronRight size={18} strokeWidth={2.2} color={c.muted} />
        </Pressable>

        <View className="rounded-2xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.09] dark:bg-neutral-900">
          <View className="flex-row items-start justify-between gap-4">
            <View>
              <Text className="text-[13px] font-bold text-black dark:text-white">Today's execution</Text>
              <Text className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-black dark:text-white">
                {dashboardProgressPct}%
              </Text>
            </View>
            <View className={`rounded-full px-2.5 py-1 ${missedThisWeek > 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10'}`}>
              <Text className={`text-[12px] font-bold tabular-nums ${missedThisWeek > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {missedThisWeek > 0 ? `${missedThisWeek} missed` : 'On track'}
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row justify-between border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]">
            <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
              <Text className="font-bold tabular-nums text-black dark:text-white">{todayDone}/{todayTasks.length}</Text> done
            </Text>
            <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
              <Text className="font-bold tabular-nums text-black dark:text-white">{formatMinutesBrief(remainingPlannedMinutes)}</Text> remaining
            </Text>
          </View>
        </View>
    </Screen>
  );
}
