import { View } from 'react-native';
import { IconArrowRight, IconPlus } from '@tabler/icons-react-native';
import type { ProgressTracker } from '@planr/core/lib/scheduleTypes';
import type { ActiveTrackingRow } from '@planr/core/lib/overview';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button, { BUTTON_TEXT } from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import Sparkline from '../ui/Sparkline';
import TrendChange from '../ui/TrendChange';

/** "1.5" not "1.50", "500" not "500.0". */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Native port of components/overview/ActiveTrackingCard.tsx — every tracker
 * at a glance with one tap to log. Due check-ins carry a badge and sit first
 * (the Check-ins due card folded into this list).
 */
export default function ActiveTrackingCard({
  rows,
  limit,
  onLogTracker,
  onOpenTracking,
  onSetUp,
}: {
  rows: ActiveTrackingRow[];
  limit?: number;
  onLogTracker: (tracker: ProgressTracker) => void;
  onOpenTracking: () => void;
  onSetUp: () => void;
}) {
  const shown = limit !== undefined ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;

  return (
    <View testID="overview-tracking-card" className={`${CARD} px-4 pb-2 pt-4`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-[16px] font-bold text-neutral-950 dark:text-white">
          Active tracking
        </Text>
        {hidden > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              haptic('light');
              onOpenTracking();
            }}
            className="-my-2"
          >
            {`See all ${rows.length}`}
          </Button>
        )}
      </View>

      {rows.length === 0 ? (
        <View className="items-center py-5">
          <Text className="text-center text-[13px] text-neutral-500 dark:text-neutral-400">Track a metric on any plan to see it move here.</Text>
          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              haptic('light');
              onSetUp();
            }}
            trailingIcon={<Icon icon={IconArrowRight} size={16} strokeWidth={2.5} className={BUTTON_TEXT.secondary} />}
            className="mt-3"
          >
            Set up tracking
          </Button>
        </View>
      ) : (
        <View className="mt-2">
          {shown.map(({ stat, checkIn }, index) => {
            const { tracker, latestValue, trend, series } = stat;
            const unit = tracker.unit?.trim() ?? '';
            return (
              <View
                key={tracker.id}
                className={`flex-row items-center gap-3 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}
              >
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text numberOfLines={1} className="shrink text-[15px] font-semibold text-neutral-950 dark:text-white">
                      {tracker.title}
                    </Text>
                    {checkIn.due && (
                      <View
                        className={`shrink-0 rounded-full px-2 py-0.5 ${
                          checkIn.overdue ? 'bg-rose-500/10 dark:bg-rose-400/10' : 'bg-amber-500/12 dark:bg-amber-400/12'
                        }`}
                      >
                        <Text className={`text-[11px] font-bold ${checkIn.overdue ? 'text-rose-700 dark:text-rose-300' : 'text-amber-800 dark:text-amber-300'}`}>
                          Due
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="mt-0.5 flex-row items-center gap-1.5">
                    <Text numberOfLines={1} className="shrink text-[13px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                      {latestValue !== null ? `${fmt(latestValue)}${unit ? ` ${unit}` : ''}` : 'Nothing logged yet'}
                    </Text>
                    {trend && <TrendChange direction={trend.direction} state={trend.state} pct={trend.pct} />}
                  </View>
                </View>
                <Sparkline values={series} tone={trend?.state === 'positive' ? 'positive' : trend?.state === 'negative' ? 'negative' : 'neutral'} />
                <IconButton
                  label={`Log ${tracker.title}`}
                  variant="primary"
                  size="md"
                  onPress={() => {
                    haptic('light');
                    onLogTracker(tracker);
                  }}
                >
                  <Icon icon={IconPlus} size={18} strokeWidth={2.5} className={ICON_BUTTON_TONE.primary} />
                </IconButton>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
