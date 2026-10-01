import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconClipboardData, IconChevronRight, IconTargetArrow } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { categoryHex } from '@planr/core/lib/colorSystem';
import { formatDateShort } from '@planr/core/lib/dateUtils';
import { getSchedule } from '../storage/scheduleStore';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { ICON_MAP } from '../theme/planIcons';
import { colors } from '../theme/colors';

type RootStackParamList = {
  PlanDetail: { planId: string };
  Goals: undefined;
};

export default function PlansScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  return (
    <Screen title="Plans" onCreate={() => navigation.navigate('NewPlan' as never)} createLabel="New plan">
      <Pressable
        onPress={() => navigation.navigate('Goals')}
        className="flex-row items-center gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
          <IconTargetArrow size={17} strokeWidth={1.8} color={c.momentumGreen} />
        </View>
        <Text className="flex-1 text-[15px] font-semibold text-black dark:text-white">Goals</Text>
        <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
          {(schedule.goals ?? []).length}
        </Text>
        <IconChevronRight size={16} color={c.muted} />
      </Pressable>

      {schedule.plans.length === 0 ? (
        <EmptyState
          icon={IconClipboardData}
          title="No plans yet"
          description="Plans group related tasks toward one outcome — training for a race, a course you're working through, a diet you're tracking."
        />
      ) : (
        schedule.plans.map((plan) => {
          const taskCount = Object.values(schedule.activities).flat().filter((t) => t.planId === plan.id).length;
          const Icon = ICON_MAP[plan.emoji] ?? IconClipboardData;
          const dateRange =
            plan.startDate && plan.endDate
              ? `${formatDateShort(plan.startDate)} – ${formatDateShort(plan.endDate)}`
              : plan.startDate
              ? `From ${formatDateShort(plan.startDate)}`
              : 'No date range';

          return (
            <Pressable
              key={plan.id}
              onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
              className="flex-row items-center gap-3 rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900"
            >
              <View
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{ backgroundColor: categoryHex(plan.color) + '26' }}
              >
                <Icon size={22} strokeWidth={1.8} color={categoryHex(plan.color)} />
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-semibold text-black dark:text-white">{plan.title}</Text>
                <Text className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{dateRange}</Text>
              </View>
              <View className="rounded-full bg-neutral-100 px-2.5 py-1 dark:bg-white/[0.06]">
                <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{taskCount}</Text>
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
