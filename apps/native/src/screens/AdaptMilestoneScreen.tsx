import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { IconCheck } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { calculateMilestoneState } from '@planr/core/lib/milestoneHealth';
import { proposeAdaptations, applyAdaptation, type AdaptationOffer } from '@planr/core/lib/milestoneAdaptation';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';

type RootStackParamList = {
  AdaptMilestone: { planId: string; milestoneId: string };
};

/**
 * Propose/apply — native port of components/plan/AdaptMilestoneSheet.tsx.
 * proposeAdaptations() already ranks and writes the copy (rationale +
 * changes); this screen only renders the offers and applies whichever one
 * is tapped via the same applyAdaptation() the web app uses, so a Catch Up/
 * Extend/Pause choice behaves identically on both.
 */
export default function AdaptMilestoneScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AdaptMilestone'>>();
  const { colorScheme } = useColorScheme();
  const { planId, milestoneId } = route.params;
  const schedule = getSchedule();

  const milestone = schedule.milestones?.find((m) => m.id === milestoneId);
  const plan = schedule.plans.find((p) => p.id === planId);

  const offers: AdaptationOffer[] = useMemo(() => {
    if (!milestone || !plan) return [];
    const state = calculateMilestoneState({
      milestone,
      plan,
      activities: schedule.activities,
      trackers: schedule.progressTrackers,
      metricEntries: schedule.metricEntries,
      trackingStart: schedule.preferences?.startDate,
    });
    return proposeAdaptations({ milestone, plan, state, schedule });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone?.id, plan?.id]);

  if (!milestone || !plan) {
    return <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" />;
  }

  function apply(offer: AdaptationOffer) {
    updateSchedule((s: Schedule) => applyAdaptation(s, offer.adaptation));
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48 }}>
      <View>
        <Text className="text-[13px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Adjust
        </Text>
        <Text className="mt-0.5 text-[20px] font-bold text-black dark:text-white" numberOfLines={2}>
          {milestone.title}
        </Text>
      </View>

      {offers.length === 0 ? (
        <Text className="text-[14px] text-neutral-500 dark:text-neutral-400">
          Nothing worth adjusting right now — this milestone is either on track or doesn't have enough data yet.
        </Text>
      ) : (
        offers.map((offer, i) => (
          <View
            key={i}
            className="gap-2.5 rounded-2xl border border-black/[0.08] bg-white p-4 dark:border-white/[0.09] dark:bg-neutral-900"
          >
            <Text className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{offer.rationale}</Text>
            <View className="gap-1">
              {offer.changes.map((change, j) => (
                <View key={j} className="flex-row items-start gap-1.5">
                  <Text className="mt-1.5 h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                  <Text className="flex-1 text-[12.5px] text-neutral-600 dark:text-neutral-400">{change}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => apply(offer)}
              className="mt-1 flex-row items-center justify-center gap-1.5 rounded-full bg-black py-3 dark:bg-white"
            >
              <IconCheck size={15} strokeWidth={2.4} color={colorScheme === 'dark' ? '#0A0A0A' : '#FFFFFF'} />
              <Text className="text-[14px] font-bold text-white dark:text-black">{offer.label}</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}
