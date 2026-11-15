import { View } from 'react-native';
import { IconAdjustments } from '@tabler/icons-react-native';
import type { PlanAdjustment } from '@planr/core/lib/scheduleTypes';
import Button from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** What accepting the suggestion would change, in plain words. */
export function adjustmentProposal(adj: PlanAdjustment): string {
  if (adj.kind === 'pace') {
    const step = Math.abs(adj.detail.paceDeltaSec ?? 10);
    return `Speed up your interval and tempo pace by ${step} s/km from week ${adj.weekIndex}?`;
  }
  if (adj.kind === 'repeat-week') return "Repeat last week's runs before moving on? Your plan ends a week later.";
  return "Ease next week back to last week's distances? Your plan ends a week later.";
}

/** Native port of components/session/AdjustmentCard.tsx. Nothing changes until Accept. */
export default function AdjustmentCard({ adjustment, onDecide }: { adjustment: PlanAdjustment; onDecide: (decision: 'accepted' | 'held') => void }) {
  return (
    <View className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
      <View className="flex-row items-start gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          <Icon icon={IconAdjustments} size={18} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">{adjustment.reason}</Text>
          <Text className="mt-0.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-300">{adjustmentProposal(adjustment)}</Text>
        </View>
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button variant="primary" onPress={() => onDecide('accepted')}>Accept</Button>
        <Button variant="secondary" onPress={() => onDecide('held')}>Not now</Button>
      </View>
    </View>
  );
}
