import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconArrowDown, IconArrowUp, IconPlus } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { formatDateShort } from '@planr/core/lib/dateUtils';
import { moveMilestone } from '@planr/core/lib/roadmapDates';
import { calculateMilestoneState } from '@planr/core/lib/milestoneHealth';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import HealthBadge from '../components/HealthBadge';
import { colors } from '../theme/colors';

type RootStackParamList = {
  PlanDetail: { planId: string };
  NewMilestone: { planId: string; milestoneId?: string };
  MilestoneDetail: { planId: string; milestoneId: string };
};

export default function PlanDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'PlanDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const plan = schedule.plans.find((p) => p.id === route.params.planId);

  useFocusEffect(
    useCallback(() => {
      if (plan) navigation.setOptions({ title: plan.title });
    }, [navigation, plan]),
  );

  if (!plan) {
    return <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" />;
  }

  const milestones = [...schedule.milestones.filter((m) => m.planId === plan.id)].sort((a, b) => a.sortOrder - b.sortOrder);
  const linkedTasks = Object.entries(schedule.activities).flatMap(([day, tasks]) =>
    tasks.filter((t) => t.planId === plan.id).map((t) => ({ day, task: t })),
  );

  function reorder(milestoneId: string, direction: 'up' | 'down') {
    setSchedule(
      updateSchedule((s) => {
        const other = (s.milestones ?? []).filter((m) => m.planId !== plan!.id);
        const own = (s.milestones ?? []).filter((m) => m.planId === plan!.id);
        return { ...s, milestones: [...other, ...moveMilestone(own, milestoneId, direction, plan!.startDate)] };
      }),
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
      <View>
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-[13px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Milestones
          </Text>
          <Pressable onPress={() => navigation.navigate('NewMilestone', { planId: plan!.id })} hitSlop={8}>
            <IconPlus size={18} strokeWidth={2.2} color={c.muted} />
          </Pressable>
        </View>

        {milestones.length === 0 ? (
          <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">No milestones yet.</Text>
        ) : (
          <View className="gap-2">
            {milestones.map((milestone, i) => {
              const state = calculateMilestoneState({
                milestone,
                plan,
                activities: schedule.activities,
                trackers: schedule.progressTrackers,
                metricEntries: schedule.metricEntries,
                trackingStart: schedule.preferences?.startDate,
              });
              const isFirst = i === 0;
              const isLast = i === milestones.length - 1;
              return (
                <View key={milestone.id} className="flex-row items-center gap-1">
                  <Pressable
                    onPress={() => navigation.navigate('MilestoneDetail', { planId: plan!.id, milestoneId: milestone.id })}
                    className="flex-1 rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900"
                  >
                    <Text
                      className={`text-[15px] font-semibold ${
                        milestone.status === 'completed' ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-black dark:text-white'
                      }`}
                      numberOfLines={1}
                    >
                      {milestone.title}
                    </Text>
                    <Text className="mt-0.5 mb-2 text-[12px] text-neutral-500 dark:text-neutral-400">
                      Due {formatDateShort(milestone.plannedEndDate)}
                    </Text>
                    <HealthBadge health={state.health} />
                  </Pressable>
                  <View className="gap-0.5">
                    <Pressable
                      onPress={() => reorder(milestone.id, 'up')}
                      disabled={isFirst}
                      hitSlop={6}
                      className="h-7 w-7 items-center justify-center rounded-lg"
                      style={{ opacity: isFirst ? 0.25 : 1 }}
                    >
                      <IconArrowUp size={14} strokeWidth={2} color={c.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => reorder(milestone.id, 'down')}
                      disabled={isLast}
                      hitSlop={6}
                      className="h-7 w-7 items-center justify-center rounded-lg"
                      style={{ opacity: isLast ? 0.25 : 1 }}
                    >
                      <IconArrowDown size={14} strokeWidth={2} color={c.muted} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View>
        <Text className="mb-2 text-[13px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Linked tasks
        </Text>
        {linkedTasks.length === 0 ? (
          <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">No tasks linked to this plan yet.</Text>
        ) : (
          <View className="gap-2">
            {linkedTasks.map(({ day, task }) => (
              <View
                key={`${day}-${task.id}`}
                className="flex-row items-center justify-between rounded-2xl border border-black/[0.08] bg-white px-4 py-3 dark:border-white/[0.09] dark:bg-neutral-900"
              >
                <Text className="flex-1 text-[14px] text-black dark:text-white">{task.title}</Text>
                <Text className="text-[12px] capitalize text-neutral-500 dark:text-neutral-400">{day.slice(0, 3)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
