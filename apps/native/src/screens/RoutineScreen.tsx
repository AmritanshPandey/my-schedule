import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { IconCheck, IconFlame, IconRepeat } from '@tabler/icons-react-native';
import type { Ritual, Schedule } from '@planr/core/lib/scheduleTypes';
import { todayISO } from '@planr/core/lib/dateUtils';
import { ritualScheduledOnDate, calculateRitualStats } from '@planr/core/lib/consistency/calculateRitualStreak';
import { ritualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { toggleRitualCompletion, appendRitualLog, entriesForRitualDate, toggleRitualStep } from '@planr/core/lib/ritualCompletions';
import { quickAmountsForRitual } from '@planr/core/lib/quickAmounts';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { colors, type ThemeColors } from '../theme/colors';

function RoutineRow({
  ritual,
  completions,
  trackingStart,
  onLog,
  c,
}: {
  ritual: Ritual;
  completions: Schedule['ritualCompletions'];
  trackingStart: string | undefined;
  onLog: (mutate: (completions: Schedule['ritualCompletions']) => Schedule['ritualCompletions']) => void;
  c: ThemeColors;
}) {
  const [expanded, setExpanded] = useState(false);
  const dateISO = todayISO();
  const entries = entriesForRitualDate(completions, ritual.id, dateISO);
  const progress = ritualDayProgress(ritual, entries);
  const stats = calculateRitualStats(ritual, completions, dateISO, trackingStart);
  const trackingType = ritual.trackingType ?? 'checkbox';

  return (
    <View className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-black dark:text-white">{ritual.title}</Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">{ritual.time}</Text>
            {stats.streak >= 2 && (
              <View className="flex-row items-center gap-0.5">
                <IconFlame size={13} strokeWidth={2.2} color="#F59E0B" />
                <Text className="text-[12px] font-bold text-amber-500">{stats.streak}</Text>
              </View>
            )}
          </View>
        </View>

        {trackingType === 'checkbox' && (
          <Pressable
            onPress={() => onLog((prev) => toggleRitualCompletion(prev, ritual.id, dateISO))}
            accessibilityRole="button"
            accessibilityLabel={progress.complete ? 'Mark not done' : 'Mark done'}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full border-2"
            style={{
              backgroundColor: progress.complete ? c.momentumGreen : 'transparent',
              borderColor: progress.complete ? c.momentumGreen : c.muted,
            }}
          >
            {progress.complete && <IconCheck size={16} strokeWidth={3} color="#FFFFFF" />}
          </Pressable>
        )}

        {(trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count') && (
          <Pressable
            onPress={() => {
              const amount = quickAmountsForRitual(ritual)[0] ?? 1;
              onLog((prev) => appendRitualLog(prev, ritual.id, dateISO, amount));
            }}
            className={`rounded-full px-3 py-1.5 ${progress.complete ? 'bg-momentum-green' : 'bg-black dark:bg-white'}`}
          >
            <Text className={`text-[13px] font-bold ${progress.complete ? 'text-white' : 'text-white dark:text-black'}`}>
              {progress.value}
              {ritual.unit ? ` ${ritual.unit}` : ''}
              {ritual.target ? ` / ${ritual.target}` : ''}
            </Text>
          </Pressable>
        )}

        {(trackingType === 'checklist' || trackingType === 'times') && (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            className={`rounded-full px-3 py-1.5 ${progress.complete ? 'bg-momentum-green' : 'bg-black dark:bg-white'}`}
          >
            <Text className={`text-[13px] font-bold ${progress.complete ? 'text-white' : 'text-white dark:text-black'}`}>
              {progress.stepsDone}/{progress.stepsTotal}
            </Text>
          </Pressable>
        )}
      </View>

      {expanded && (trackingType === 'checklist' || trackingType === 'times') && (
        <View className="mt-3 gap-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
          {(ritual.steps ?? []).map((step) => {
            const done = entries.some((e) => e.stepId === step.id);
            return (
              <Pressable
                key={step.id}
                onPress={() => onLog((prev) => toggleRitualStep(prev, ritual.id, dateISO, step.id))}
                className="flex-row items-center gap-2.5"
              >
                <View
                  className="h-5 w-5 items-center justify-center rounded-md border-2"
                  style={{ backgroundColor: done ? c.momentumGreen : 'transparent', borderColor: done ? c.momentumGreen : c.muted }}
                >
                  {done && <IconCheck size={12} strokeWidth={3} color="#FFFFFF" />}
                </View>
                <Text className="text-[14px] text-black dark:text-white">{step.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function RoutineScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const dateISO = todayISO();
  const trackingStart = schedule.preferences?.startDate;
  const rituals = schedule.rituals.filter((r) => ritualScheduledOnDate(r, dateISO, trackingStart));

  function onLog(mutate: (completions: Schedule['ritualCompletions']) => Schedule['ritualCompletions']) {
    const next = updateSchedule((s) => ({ ...s, ritualCompletions: mutate(s.ritualCompletions) }));
    setSchedule(next);
  }

  return (
    <Screen title="Routine" onCreate={() => navigation.navigate('NewRoutine' as never)} createLabel="New routine">
      {rituals.length === 0 ? (
        <EmptyState
          icon={IconRepeat}
          title="No routines yet"
          description="Tap + to add a habit you want to run on repeat."
        />
      ) : (
        rituals.map((ritual) => (
          <RoutineRow
            key={ritual.id}
            ritual={ritual}
            completions={schedule.ritualCompletions}
            trackingStart={trackingStart}
            onLog={onLog}
            c={c}
          />
        ))
      )}
    </Screen>
  );
}
