import { View } from 'react-native';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react-native';
import type { TrendDirection, TrendState } from '@planr/core/lib/trendUtils';
import { Icon } from './Icon';
import { Text } from './Text';

/** Native port of components/ui/TrendChange.tsx — "↗ +1.5%" colored by whether the move is good. */
export default function TrendChange({ direction, state, pct }: { direction: TrendDirection; state: TrendState; pct: number | null }) {
  if (direction === 'neutral' || pct === null) return null;

  const glyph = direction === 'up' ? IconArrowUpRight : IconArrowDownRight;
  const colorClass =
    state === 'positive'
      ? 'text-emerald-500 dark:text-emerald-400'
      : state === 'negative'
        ? 'text-rose-500 dark:text-rose-400'
        : 'text-neutral-500 dark:text-neutral-400';

  return (
    <View className="shrink-0 flex-row items-center gap-0.5">
      <Icon icon={glyph} size={13} strokeWidth={2.6} className={`shrink-0 ${colorClass}`} />
      <Text className={`text-[12px] font-bold tabular-nums ${colorClass}`}>
        {pct > 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </Text>
    </View>
  );
}
