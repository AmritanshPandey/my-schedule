import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconChevronRight, IconTargetArrow } from '@tabler/icons-react-native';
import type { Goal, Schedule } from '@planr/core/lib/scheduleTypes';
import { calculateGoalProgress, type GoalProgressState } from '@planr/core/lib/goalProgress';
import { HEALTH_FILL } from '../lib/healthFill';
import { getSchedule } from '../storage/scheduleStore';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import HealthBadge from '../components/HealthBadge';
import { colors } from '../theme/colors';

type RootStackParamList = {
  GoalDetail: { goalId: string };
  NewGoal: undefined;
};

const STATUS_LABEL: Record<Goal['status'], string> = {
  active: 'Active',
  completed: 'Completed',
  paused: 'Paused',
  archived: 'Archived',
};

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Same shape in the list row as the detail screen — a goal reads
 *  identically everywhere, matching web's GoalProgressBlock. */
function ProgressRow({ state }: { state: GoalProgressState }) {
  if (!state.hasData) return null;
  return (
    <View className="mt-2">
      <View className="mb-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          {state.milestonesCompleted} of {state.milestoneTotal} done
        </Text>
        {state.progress !== null && (
          <Text className="text-[11px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
            {state.progress}% progress
          </Text>
        )}
      </View>
      <View className="h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
        <View
          className={`h-full rounded-full ${HEALTH_FILL[state.health]}`}
          style={{ width: `${state.progress ?? 0}%` }}
        />
      </View>
    </View>
  );
}

export default function GoalsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const goals = schedule.goals ?? [];
  const progressByGoal = useMemo(() => {
    const map = new Map<string, GoalProgressState>();
    for (const g of goals) map.set(g.id, calculateGoalProgress(schedule, g));
    return map;
  }, [goals, schedule]);

  return (
    <Screen title="Goals" onCreate={() => navigation.navigate('NewGoal')} createLabel="New goal">
      {goals.length === 0 ? (
        <EmptyState
          icon={IconTargetArrow}
          title="No goals yet"
          description={'A Goal is the outcome behind your plans — e.g. "Get a senior UX job." Optional, and plans work fine without one.'}
          action={{ label: 'New goal', onPress: () => navigation.navigate('NewGoal') }}
        />
      ) : (
        goals.map((goal) => {
          const progress = progressByGoal.get(goal.id)!;
          return (
            <Pressable
              key={goal.id}
              onPress={() => navigation.navigate('GoalDetail', { goalId: goal.id })}
              className="flex-row items-center gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900"
            >
              <View className="min-w-0 flex-1">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="flex-1 text-[15px] font-bold text-black dark:text-white" numberOfLines={1}>
                    {goal.title}
                  </Text>
                  {goal.status === 'active' && <HealthBadge health={progress.health} />}
                </View>
                <View className="mt-1 flex-row flex-wrap items-center gap-2">
                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {STATUS_LABEL[goal.status]}
                  </Text>
                  {formatDate(goal.targetDate) && (
                    <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Target {formatDate(goal.targetDate)}
                    </Text>
                  )}
                  <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {progress.planCount} {progress.planCount === 1 ? 'plan' : 'plans'}
                  </Text>
                </View>
                <ProgressRow state={progress} />
              </View>
              <IconChevronRight size={16} color={c.muted} />
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
