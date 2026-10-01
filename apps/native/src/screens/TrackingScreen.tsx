import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { LineChart } from 'react-native-gifted-charts';
import { IconChartLine } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { todayISO } from '@planr/core/lib/dateUtils';
import { buildTrackerStat, groupTrackerStatsByPlan } from '@planr/core/lib/trackerStats';
import { quickAmountsForUnit } from '@planr/core/lib/quickAmounts';
import { uid } from '@planr/core/lib/id';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { colors, type ThemeColors } from '../theme/colors';

function TrackerCard({
  stat,
  onLog,
  c,
  dark,
}: {
  stat: ReturnType<typeof buildTrackerStat>;
  onLog: (trackerId: string, value: number) => void;
  c: ThemeColors;
  dark: boolean;
}) {
  const { tracker } = stat;
  const chartData = stat.points.slice(-14).map((p) => ({ value: p.value }));
  const amounts = quickAmountsForUnit(tracker.unit);

  return (
    <View className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[16px] font-semibold text-black dark:text-white">{tracker.title}</Text>
        <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
          {stat.isDaily
            ? `${stat.todayTotal} / ${stat.targetValue ?? '—'} ${tracker.unit ?? ''}`
            : stat.latestValue !== null
            ? `${stat.latestValue} ${tracker.unit ?? ''}${stat.targetValue !== null ? ` / ${stat.targetValue}` : ''}`
            : 'No entries yet'}
        </Text>
      </View>

      {chartData.length >= 2 && (
        <View className="mt-3 items-center">
          <LineChart
            data={chartData}
            height={80}
            width={260}
            thickness={2}
            color={c.momentumGreen}
            hideDataPoints
            hideRules
            hideYAxisText
            hideAxesAndRules
            curved
            initialSpacing={0}
            endSpacing={0}
            areaChart
            startFillColor={c.momentumGreen}
            endFillColor={c.momentumGreen}
            startOpacity={0.18}
            endOpacity={0}
          />
        </View>
      )}

      <View className="mt-3 flex-row flex-wrap gap-2">
        {amounts.map((amount) => (
          <Pressable
            key={amount}
            onPress={() => onLog(tracker.id, amount)}
            className="rounded-full bg-black px-3 py-1.5 dark:bg-white"
          >
            <Text className="text-[13px] font-bold text-white dark:text-black">
              +{amount}
              {tracker.unit ? ` ${tracker.unit}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function TrackingScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const dateISO = todayISO();
  const trackingStart = schedule.preferences?.startDate;
  const stats = schedule.progressTrackers.map((t) => buildTrackerStat(t, schedule.metricEntries, dateISO, trackingStart));
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const groups = groupTrackerStatsByPlan(stats, plansById);

  function onLog(trackerId: string, value: number) {
    const next = updateSchedule((s) => ({
      ...s,
      metricEntries: [
        ...s.metricEntries,
        { id: uid(), planId: s.progressTrackers.find((t) => t.id === trackerId)?.planId ?? '', trackerId, value, date: dateISO },
      ],
    }));
    setSchedule(next);
  }

  return (
    <Screen title="Tracking" onCreate={() => navigation.navigate('NewTracker' as never)} createLabel="New tracker">
      {schedule.progressTrackers.length === 0 ? (
        <EmptyState
          icon={IconChartLine}
          title="No trackers yet"
          description="Trackers log a number over time — weight, calories, pages read — and chart the trend for a plan."
        />
      ) : (
        groups.map((group) => (
          <View key={group.plan?.id ?? 'none'} className="gap-2">
            {group.plan && (
              <Text className="mb-1 text-[13px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {group.plan.title}
              </Text>
            )}
            {group.stats.map((stat) => (
              <TrackerCard key={stat.tracker.id} stat={stat} onLog={onLog} c={c} dark={colorScheme === 'dark'} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
