import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { categoryHex, resolveAccentColor } from '@planr/core/lib/colorSystem';
import { formatMinutesCompact } from '@planr/core/lib/dayBreakdown';
import type { DaySpread } from '@planr/core/lib/daySpread';
import { toScheduleDayMinutes } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import { Text } from '../ui/Text';

/** Neutral for "Other" and anything without a colour. */
const NEUTRAL = '#A3A3A3';
/** Groups named in the legend; the rest still show on the strip. */
const LEGEND_GROUPS = 3;

function spreadHex(color: string | null): string {
  return color ? categoryHex(resolveAccentColor(color, '')) : NEUTRAL;
}

/** "6 AM", "1 PM" — a schedule-day minute (which may run past midnight) as a clock hour. */
function spreadClock(minutes: number): string {
  const total = (((Math.round(minutes / 60) * 60) % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  return `${h24 % 12 || 12} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Native port of components/overview/DaySpreadCard.tsx — "Your day" on the
 * phone Overview: when today's waking hours are booked and what they go to.
 * Renders nothing on a day with nothing booked; the hero already says so.
 */
export default function DaySpreadCard({ spread, onOpen }: { spread: DaySpread; onOpen: () => void }) {
  const { colorScheme } = useColorScheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const { windowStart, windowEnd, blocks, groups, plannedMinutes, freeMinutes } = spread;
  if (blocks.length === 0) return null;

  const span = windowEnd - windowStart;
  const colorOf = new Map(groups.map((g) => [g.id, spreadHex(g.color)]));
  const now = new Date();
  const nowMinutes = toScheduleDayMinutes(now.getHours() * 60 + now.getMinutes(), windowStart);
  const nowFraction = nowMinutes >= windowStart && nowMinutes <= windowEnd ? (nowMinutes - windowStart) / span : null;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => windowStart + span * f);
  const summary = `${formatMinutesCompact(plannedMinutes)} planned, ${formatMinutesCompact(freeMinutes)} free. ${groups
    .map((g) => `${g.label} ${formatMinutesCompact(g.minutes)}`)
    .join(', ')}.`;

  return (
    <View testID="overview-day-spread" className={`${CARD} p-0`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your day. ${summary} Open Today.`}
        onPress={() => {
          haptic('light');
          onOpen();
        }}
        className="rounded-2xl p-4 active:bg-neutral-50 dark:active:bg-white/[0.03]"
      >
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-[14px] font-bold text-neutral-950 dark:text-white">Your day</Text>
          <Text className="text-[12.5px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-400">
            {formatMinutesCompact(plannedMinutes)} planned · {formatMinutesCompact(freeMinutes)} free
          </Text>
        </View>

        {/* The waking day, left to right. Free time is the track itself. */}
        <View
          className="mt-3 h-10 overflow-hidden rounded-xl bg-neutral-100 dark:bg-white/[0.06]"
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {trackWidth > 0 &&
            blocks.map((block, i) => (
              <View
                key={i}
                className="absolute bottom-1 top-1 rounded-md"
                style={{
                  left: ((block.start - windowStart) / span) * trackWidth,
                  width: Math.max(3, ((block.end - block.start) / span) * trackWidth),
                  backgroundColor: colorOf.get(block.groupId) ?? NEUTRAL,
                }}
              />
            ))}
          {trackWidth > 0 && nowFraction !== null && (
            <View
              className="absolute bottom-0 top-0 w-[2px]"
              style={{ left: nowFraction * trackWidth - 1, backgroundColor: colorScheme === 'dark' ? '#FFFFFF' : '#0A0A0A' }}
            />
          )}
        </View>
        <View className="mt-1.5 flex-row justify-between" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {ticks.map((t, i) => (
            <Text key={i} className="text-[11px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              {spreadClock(t)}
            </Text>
          ))}
        </View>

        <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-2" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {groups.slice(0, LEGEND_GROUPS).map((g) => (
            <View key={g.id} className="min-w-0 flex-row items-center gap-1.5">
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf.get(g.id) }} />
              <Text numberOfLines={1} className="max-w-[140px] text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
                {g.label}
              </Text>
              <Text className="text-[13px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">{formatMinutesCompact(g.minutes)}</Text>
            </View>
          ))}
          {groups.length > LEGEND_GROUPS && (
            <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">+{groups.length - LEGEND_GROUPS} more</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}
