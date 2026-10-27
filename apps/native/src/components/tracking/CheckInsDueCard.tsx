import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowRight, IconCalendarCheck, IconPlus } from '@tabler/icons-react-native';
import type { MetricEntry, ProgressTracker } from '@planr/core/lib/scheduleTypes';
import { checkInStatusLabel, dueCheckIns } from '@planr/core/lib/trackerCadence';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** Beyond this many, the card points to Tracking rather than growing. */
const MAX_ROWS = 4;

interface CheckInsDueCardProps {
  trackers: readonly ProgressTracker[];
  metricEntries: readonly MetricEntry[];
  todayISO: string;
  trackingStart?: string;
  onLog: (tracker: ProgressTracker) => void;
  /** Opens the Tracking page. */
  onOpenTracking?: () => void;
}

/**
 * Native port of components/tracking/CheckInsDueCard.tsx — the trackers
 * waiting on this period's entry, on the page you land on. A weekly weigh-in
 * that nobody prompts for quietly stops happening; this is the prompt.
 * Renders nothing when every tracker is checked in.
 */
export default function CheckInsDueCard({ trackers, metricEntries, todayISO, trackingStart, onLog, onOpenTracking }: CheckInsDueCardProps) {
  const due = useMemo(() => dueCheckIns(trackers, metricEntries, todayISO, trackingStart), [trackers, metricEntries, todayISO, trackingStart]);
  if (due.length === 0) return null;

  const shown = due.slice(0, MAX_ROWS);
  const more = due.length - shown.length;

  return (
    <View testID="checkins-due-card" className={`${CARD} px-4 py-4`}>
      <View className="mb-1 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon icon={IconCalendarCheck} size={15} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
          <Text accessibilityRole="header" numberOfLines={1} className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200">
            Check-ins due
          </Text>
        </View>
        <View className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-white/[0.09] dark:bg-white/[0.04]">
          <Text className="text-[11px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{due.length}</Text>
        </View>
      </View>
      {shown.map(({ tracker, state }, i) => (
        <View key={tracker.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[15px] font-semibold leading-tight text-neutral-950 dark:text-white">
              {tracker.title}
            </Text>
            <Text
              numberOfLines={1}
              className={`mt-0.5 text-[12px] font-bold ${state.overdue ? 'text-rose-700 dark:text-rose-400' : 'text-amber-800 dark:text-amber-300'}`}
            >
              {checkInStatusLabel(state)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log ${tracker.title}`}
            onPress={() => {
              haptic('light');
              onLog(tracker);
            }}
            className="h-11 shrink-0 flex-row items-center gap-1.5 rounded-full bg-neutral-950 px-4 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200"
          >
            <Icon icon={IconPlus} size={14} strokeWidth={2.6} className="text-white dark:text-neutral-950" />
            <Text className="text-[13px] font-extrabold text-white dark:text-neutral-950">Log</Text>
          </Pressable>
        </View>
      ))}
      {onOpenTracking && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic('light');
            onOpenTracking();
          }}
          className="mt-1 min-h-[44px] flex-row items-center gap-1.5 self-start"
        >
          <Text className="text-[13px] font-bold text-neutral-600 dark:text-neutral-300">{more > 0 ? `${more} more in Tracking` : 'Open Tracking'}</Text>
          <Icon icon={IconArrowRight} size={14} strokeWidth={2.4} className="text-neutral-600 dark:text-neutral-300" />
        </Pressable>
      )}
    </View>
  );
}
