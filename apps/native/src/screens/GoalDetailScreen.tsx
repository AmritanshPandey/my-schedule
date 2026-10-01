import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconEdit, IconTrash } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { archiveGoal, completeGoal, deleteGoal, plansForGoal } from '@planr/core/lib/goalMutations';
import { calculateGoalProgress } from '@planr/core/lib/goalProgress';
import { formatDateShort } from '@planr/core/lib/dateUtils';
import { HEALTH_FILL } from '../lib/healthFill';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import HealthBadge from '../components/HealthBadge';
import { colors } from '../theme/colors';

type RootStackParamList = {
  GoalDetail: { goalId: string };
  NewGoal: { goalId?: string };
};

const STATUS_LABEL = { active: 'Active', completed: 'Completed', paused: 'Paused', archived: 'Archived' } as const;

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function GoalDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'GoalDetail'>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const goal = schedule.goals?.find((g) => g.id === route.params.goalId);

  useEffect(() => {
    if (goal) navigation.setOptions({ title: goal.title });
  }, [navigation, goal]);

  const progress = useMemo(() => (goal ? calculateGoalProgress(schedule, goal) : null), [schedule, goal]);
  const linkedPlans = useMemo(() => (goal ? plansForGoal(schedule, goal.id) : []), [schedule, goal]);

  if (!goal || !progress) {
    return <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" />;
  }

  function handleDelete() {
    if (!goal) return;
    Alert.alert('Delete goal', `Delete "${goal.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          updateSchedule((s) => deleteGoal(s, goal.id));
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 48 }}>
      <View>
        <View className="mb-1.5 flex-row flex-wrap items-center gap-2">
          <View className="rounded-full bg-neutral-200 px-2 py-0.5 dark:bg-white/10">
            <Text className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
              {STATUS_LABEL[goal.status]}
            </Text>
          </View>
          {goal.status === 'active' && <HealthBadge health={progress.health} size="md" />}
          {formatDate(goal.targetDate) && (
            <Text className="text-[12px] text-neutral-500 dark:text-neutral-400">Target {formatDate(goal.targetDate)}</Text>
          )}
        </View>
        {goal.description ? (
          <Text className="mt-1 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{goal.description}</Text>
        ) : null}
      </View>

      <View className="rounded-2xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.09] dark:bg-neutral-900">
        <Text className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{progress.statusMessage}</Text>
        {progress.hasData && (
          <View className="mt-3">
            <View className="mb-1 flex-row items-baseline justify-between gap-2">
              <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {progress.milestonesCompleted} of {progress.milestoneTotal} done
              </Text>
              {progress.progress !== null && (
                <Text className="text-[11px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                  {progress.progress}% progress
                </Text>
              )}
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
              <View className={`h-full rounded-full ${HEALTH_FILL[progress.health]}`} style={{ width: `${progress.progress ?? 0}%` }} />
            </View>
          </View>
        )}
        {progress.nextMilestone && (
          <View className="mt-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Next milestone
            </Text>
            <Text className="mt-1 text-[13px] font-semibold text-neutral-900 dark:text-white" numberOfLines={1}>
              {progress.nextMilestone.milestone.title}
            </Text>
            <Text className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
              {progress.nextMilestone.plan.title}
              {' · '}
              {progress.nextMilestone.daysUntil < 0
                ? `${Math.abs(progress.nextMilestone.daysUntil)} day${Math.abs(progress.nextMilestone.daysUntil) === 1 ? '' : 's'} overdue`
                : progress.nextMilestone.daysUntil === 0
                ? 'due today'
                : `in ${progress.nextMilestone.daysUntil} day${progress.nextMilestone.daysUntil === 1 ? '' : 's'}`}
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          onPress={() => navigation.navigate('NewGoal', { goalId: goal.id })}
          className="flex-row items-center gap-1.5 rounded-full border border-black/[0.10] bg-white px-4 py-2.5 dark:border-white/[0.12] dark:bg-neutral-900"
        >
          <IconEdit size={14} strokeWidth={2} color={c.muted} />
          <Text className="text-[13px] font-semibold text-black dark:text-white">Edit</Text>
        </Pressable>
        {goal.status === 'active' && (
          <Pressable
            onPress={() => setSchedule(updateSchedule((s) => completeGoal(s, goal.id)))}
            className="rounded-full bg-emerald-600 px-4 py-2.5"
          >
            <Text className="text-[13px] font-semibold text-white">Mark complete</Text>
          </Pressable>
        )}
        {goal.status !== 'archived' && (
          <Pressable
            onPress={() => setSchedule(updateSchedule((s) => archiveGoal(s, goal.id)))}
            className="rounded-full border border-black/[0.10] bg-white px-4 py-2.5 dark:border-white/[0.12] dark:bg-neutral-900"
          >
            <Text className="text-[13px] font-semibold text-black dark:text-white">Archive</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleDelete}
          className="h-10 w-10 items-center justify-center rounded-full border border-rose-200 dark:border-rose-500/30"
        >
          <IconTrash size={15} strokeWidth={2} color={c.danger} />
        </Pressable>
      </View>

      <View>
        <Text className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Plans
        </Text>
        {linkedPlans.length === 0 ? (
          <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">
            No plans linked yet — link one from a plan's Goal field.
          </Text>
        ) : (
          <View className="gap-1.5">
            {linkedPlans.map((p) => (
              <View
                key={p.id}
                className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 dark:border-white/[0.09] dark:bg-neutral-900"
              >
                <Text className="text-[13px] font-semibold text-black dark:text-white">{p.title}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
