import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconEdit, IconTrash, IconWand } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { calculateMilestoneState } from '@planr/core/lib/milestoneHealth';
import { calculateMilestoneProgress } from '@planr/core/lib/planProgress';
import { paceNarrative } from '@planr/core/lib/paceModel';
import { formatDateShort } from '@planr/core/lib/dateUtils';
import { HEALTH_FILL } from '../lib/healthFill';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import HealthBadge from '../components/HealthBadge';
import { colors } from '../theme/colors';

type RootStackParamList = {
  MilestoneDetail: { planId: string; milestoneId: string };
  NewMilestone: { planId: string; milestoneId?: string };
  AdaptMilestone: { planId: string; milestoneId: string };
};

export default function MilestoneDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'MilestoneDetail'>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const { planId, milestoneId } = route.params;
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const milestone = schedule.milestones?.find((m) => m.id === milestoneId);
  const plan = schedule.plans.find((p) => p.id === planId);

  useEffect(() => {
    if (milestone) navigation.setOptions({ title: milestone.title });
  }, [navigation, milestone]);

  const state = useMemo(
    () =>
      milestone && plan
        ? calculateMilestoneState({
            milestone,
            plan,
            activities: schedule.activities,
            trackers: schedule.progressTrackers,
            metricEntries: schedule.metricEntries,
            trackingStart: schedule.preferences?.startDate,
          })
        : null,
    [milestone, plan, schedule],
  );
  const progress = useMemo(
    () => (milestone && plan ? calculateMilestoneProgress(milestone, schedule.activities, plan) : null),
    [milestone, plan, schedule.activities],
  );

  if (!milestone || !plan || !state) {
    return <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" />;
  }

  const isCompleted = milestone.status === 'completed';
  const pace = paceNarrative(state.paceGap);
  const readyToComplete = !!progress?.hasLinkedTasks && progress.pct === 100 && !isCompleted;

  function handleDelete() {
    Alert.alert('Delete milestone', `Delete "${milestone!.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateSchedule((s) => ({ ...s, milestones: (s.milestones ?? []).filter((m) => m.id !== milestoneId) }));
          navigation.goBack();
        },
      },
    ]);
  }

  function markDone() {
    setSchedule(
      updateSchedule((s) => ({
        ...s,
        milestones: (s.milestones ?? []).map((m) =>
          m.id === milestoneId
            ? { ...m, status: 'completed', actualCompletedDate: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString() }
            : m,
        ),
      })),
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
      <View>
        <View className="mb-2 flex-row items-center gap-2">
          <HealthBadge health={state.health} size="md" />
        </View>
        <Text
          className={`text-[20px] font-bold leading-snug ${isCompleted ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-black dark:text-white'}`}
        >
          {milestone.title}
        </Text>
        <Text className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {formatDateShort(milestone.startDate)} – {formatDateShort(milestone.plannedEndDate)}
          {'  ·  '}
          {milestone.plannedDurationDays} {milestone.plannedDurationDays === 1 ? 'day' : 'days'}
        </Text>
      </View>

      {state.hasData && (
        <View className="gap-3 rounded-2xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.09] dark:bg-neutral-900">
          {state.metricCurrentValue !== null && state.metricTargetValue !== null && (
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[22px] font-bold text-black dark:text-white">
                {state.metricCurrentValue}
                {state.metricUnit ? ` ${state.metricUnit}` : ''}
              </Text>
              <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                Target: {state.metricTargetValue}
                {state.metricUnit ? ` ${state.metricUnit}` : ''}
              </Text>
            </View>
          )}
          {state.overallProgress !== null && (
            <View className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
              <View
                className={`h-full rounded-full ${isCompleted ? 'bg-neutral-300 dark:bg-white/20' : HEALTH_FILL[state.health]}`}
                style={{ width: `${state.overallProgress}%` }}
              />
            </View>
          )}
          {state.metricMovedWrongDirection && (
            <Text className="text-[12.5px] font-medium text-rose-600 dark:text-rose-400">
              This has moved away from your target since you started.
            </Text>
          )}
          {(state.taskProgress !== null || state.consistency !== null) && (
            <View className="flex-row gap-4">
              {state.taskProgress !== null && (
                <View>
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Activity
                  </Text>
                  <Text className="text-[14px] font-semibold text-black dark:text-white">{state.taskProgress}% task progress</Text>
                </View>
              )}
              {state.consistency !== null && (
                <View>
                  <Text className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    Consistency
                  </Text>
                  <Text className="text-[14px] font-semibold text-black dark:text-white">{state.consistency}%</Text>
                </View>
              )}
            </View>
          )}
          <Text className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{state.statusMessage}</Text>
          {pace && (
            <Text className="text-[13px] font-semibold leading-relaxed text-neutral-700 dark:text-neutral-300">{pace}</Text>
          )}
          {!isCompleted && (state.health === 'at_risk' || state.health === 'delayed') && (
            <Pressable
              onPress={() => navigation.navigate('AdaptMilestone', { planId, milestoneId })}
              className="flex-row items-center justify-center gap-1.5 self-start rounded-full border border-black/[0.10] bg-white px-4 py-2.5 dark:border-white/[0.12] dark:bg-neutral-900"
            >
              <IconWand size={14} strokeWidth={2} color={c.muted} />
              <Text className="text-[13px] font-semibold text-black dark:text-white">Adjust this milestone</Text>
            </Pressable>
          )}
        </View>
      )}

      {milestone.description ? (
        <View>
          <Text className="mb-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Description
          </Text>
          <Text className="text-[15px] leading-relaxed text-black dark:text-white">{milestone.description}</Text>
        </View>
      ) : null}

      {readyToComplete && (
        <Text className="text-center text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
          All linked tasks are complete — ready to mark this milestone done.
        </Text>
      )}

      {!isCompleted && (
        <Pressable onPress={markDone} className="items-center rounded-2xl bg-emerald-600 py-3.5">
          <Text className="text-[15px] font-semibold text-white">Mark as Done</Text>
        </Pressable>
      )}

      <View className="flex-row gap-3">
        <Pressable
          onPress={handleDelete}
          className="h-12 w-12 items-center justify-center rounded-2xl border border-black/[0.08] dark:border-white/[0.09]"
        >
          <IconTrash size={18} strokeWidth={1.8} color={c.danger} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('NewMilestone', { planId, milestoneId })}
          className="flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-white py-3.5 dark:bg-neutral-100"
        >
          <IconEdit size={16} strokeWidth={1.8} color="#0A0A0A" />
          <Text className="text-[15px] font-semibold text-black">Edit milestone</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
