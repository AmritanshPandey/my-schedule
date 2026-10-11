import { View } from 'react-native';
import { IconAlertTriangle, IconFlame, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react-native';
import type { RoutineInsights } from '@planr/core/lib/consistency/routineInsights';
import { CARD } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

interface RoutineInsightsSectionProps {
  insights: RoutineInsights;
}

/**
 * Native port of components/activity/RoutineInsightsSection.tsx — a few
 * compact lines, not a dashboard. Every fact comes straight from
 * `buildRoutineInsights` or is omitted; nothing renders until there's at
 * least one line worth saying.
 */
export default function RoutineInsightsSection({ insights }: RoutineInsightsSectionProps) {
  const { overallPct, deltaVsLastWeek, mostConsistent, needsAttention } = insights;
  const hasAnything = overallPct !== null || mostConsistent !== null || needsAttention !== null;
  if (!hasAnything) return null;

  const line = 'text-[13px] leading-snug text-neutral-700 dark:text-neutral-200';

  return (
    <View className={`gap-2.5 p-4 ${CARD}`}>
      <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">Insights</Text>

      {overallPct !== null && (
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className={line}>
            <Text className="font-bold tabular-nums text-neutral-950 dark:text-white">{overallPct}%</Text> of scheduled routines done this week
          </Text>
          {deltaVsLastWeek !== null && deltaVsLastWeek !== 0 && (
            <View className="flex-row items-center gap-0.5">
              <Icon
                icon={deltaVsLastWeek > 0 ? IconTrendingUp : IconTrendingDown}
                size={13}
                strokeWidth={2.4}
                className={deltaVsLastWeek > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}
              />
              <Text
                className={`text-[12px] font-bold tabular-nums ${
                  deltaVsLastWeek > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                }`}
              >
                {Math.abs(deltaVsLastWeek)}pt
              </Text>
            </View>
          )}
        </View>
      )}

      {mostConsistent && (
        <View className="flex-row items-center gap-1.5">
          <Icon icon={IconFlame} size={14} strokeWidth={2.2} className="shrink-0 text-emerald-500" />
          <Text className={`flex-1 ${line}`}>
            <Text className="font-bold text-neutral-950 dark:text-white">{mostConsistent.ritual.title}</Text> is your most consistent —{' '}
            {mostConsistent.streak}-day streak
          </Text>
        </View>
      )}

      {needsAttention && (
        <View className="flex-row items-center gap-1.5">
          <Icon icon={IconAlertTriangle} size={14} strokeWidth={2.2} className="shrink-0 text-amber-500" />
          <Text className={`flex-1 ${line}`}>
            <Text className="font-bold text-neutral-950 dark:text-white">{needsAttention.ritual.title}</Text> needs attention —{' '}
            {needsAttention.adherencePct}% over the last 30 days
          </Text>
        </View>
      )}
    </View>
  );
}
