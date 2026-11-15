import { View } from 'react-native';
import { IconTrendingUp } from '@tabler/icons-react-native';
import type { SubtaskProgression } from '@planr/core/lib/scheduleEntry';
import { describeEvidence, describeStep, type ProgressionSuggestion } from '@planr/core/lib/subtaskProgression';
import Button from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** Native port of components/activity/ProgressionCard.tsx — one suggested step and its two answers. */
export default function ProgressionCard({
  suggestion,
  name,
  cadence,
  onDecide,
}: {
  suggestion: ProgressionSuggestion;
  name: string;
  cadence: SubtaskProgression['cadence'];
  onDecide: (decision: 'accepted' | 'held') => void;
}) {
  return (
    <View className="rounded-2xl border border-neutral-200 px-4 py-3.5 dark:border-white/[0.08]">
      <View className="flex-row items-center gap-1.5">
        <Icon icon={IconTrendingUp} size={13} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className="text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">Ready to step up</Text>
      </View>
      <Text className="mt-1.5 text-[16px] font-bold text-neutral-900 dark:text-white">{name}</Text>
      <Text className="text-[16px] font-semibold text-neutral-800 dark:text-neutral-100" style={{ fontVariant: ['tabular-nums'] }}>
        {describeStep(suggestion.from, suggestion.to)}
      </Text>
      <Text className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{describeEvidence(suggestion.consistency, cadence)}</Text>
      <View className="mt-3 flex-row gap-2">
        <View className="flex-1">
          <Button variant="primary" size="md" fullWidth onPress={() => onDecide('accepted')}>
            Step up
          </Button>
        </View>
        <View className="flex-1">
          <Button variant="secondary" size="md" fullWidth onPress={() => onDecide('held')}>
            Hold for now
          </Button>
        </View>
      </View>
    </View>
  );
}
