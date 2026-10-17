import { Pressable, View } from 'react-native';
import { IconCheck, IconMinus, IconPlus } from '@tabler/icons-react-native';
import type { Ritual } from '@planr/core/lib/scheduleTypes';
import type { RitualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { quickAmountsForRitual } from '@planr/core/lib/quickAmounts';
import { haptic } from '../../lib/haptics';
import CheckDraw from '../ui/CheckDraw';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

interface RoutineCompletionControlProps {
  ritual: Ritual;
  progress: RitualDayProgress;
  missed: boolean;
  onToggleCheckbox: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
}

/**
 * Native port of components/activity/RoutineCompletionControl.tsx — the
 * primary completion action for one routine row, dispatched by trackingType:
 *
 * checkbox   → the 44px ring, green fill + check when done.
 * quantity/
 * duration/
 * count      → a "+amount" pill (the primary preset) plus undo once logged.
 *              Every log goes through `onLogAmount`, which is backed by a
 *              functional setSchedule updater so rapid taps never lose one.
 * checklist/
 * times      → a "done/total" pill; steps are checked off in the detail view.
 */
export default function RoutineCompletionControl({
  ritual,
  progress,
  missed,
  onToggleCheckbox,
  onLogAmount,
  onUndoLastLog,
}: RoutineCompletionControlProps) {
  const trackingType = ritual.trackingType ?? 'checkbox';

  if (trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count') {
    const [primaryAmount] = quickAmountsForRitual(ritual);
    return (
      <View className="shrink-0 flex-row items-center gap-1">
        {progress.value > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last log"
            onPress={() => {
              haptic('light');
              onUndoLastLog();
            }}
            className="h-8 w-8 items-center justify-center rounded-full border border-neutral-200 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]"
          >
            <Icon icon={IconMinus} size={14} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log +${primaryAmount ?? 1}${ritual.unit ?? ''}`}
          onPress={() => {
            haptic('medium');
            onLogAmount(primaryAmount ?? 1);
          }}
          className={`h-8 flex-row items-center gap-1 rounded-full border px-3 active:scale-[0.92] ${
            progress.complete
              ? 'border-transparent bg-green-500'
              : 'border-neutral-200 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]'
          }`}
        >
          <Icon
            icon={progress.complete ? IconCheck : IconPlus}
            size={progress.complete ? 13 : 12}
            strokeWidth={2.6}
            className={progress.complete ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'}
          />
          <Text className={`text-[12px] font-bold ${progress.complete ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'}`}>
            {primaryAmount ?? 1}
            {ritual.unit ? ` ${ritual.unit}` : ''}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (trackingType === 'checklist' || trackingType === 'times') {
    return (
      <View
        className={`h-8 shrink-0 flex-row items-center rounded-full px-3 ${
          progress.complete ? 'bg-green-500' : 'border border-neutral-200 dark:border-white/[0.10]'
        }`}
      >
        <Text
          className={`text-[12px] font-bold tabular-nums ${progress.complete ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}`}
        >
          {progress.stepsDone}/{progress.stepsTotal}
        </Text>
      </View>
    );
  }

  // checkbox (including legacy undefined trackingType) — unchanged behavior.
  const done = progress.complete;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={done ? 'Mark incomplete' : missed ? 'Mark complete for missed day' : 'Mark complete'}
      accessibilityState={{ checked: done }}
      onPress={() => {
        haptic('light');
        onToggleCheckbox();
      }}
      className={`h-11 w-11 shrink-0 items-center justify-center rounded-full border-[2.5px] active:scale-[0.86] ${
        done
          ? 'border-transparent bg-green-500'
          : missed
            ? 'border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10'
            : 'border-neutral-300 bg-transparent dark:border-neutral-600'
      }`}
    >
      <CheckDraw visible={done} size={24} strokeWidth={3} className="text-white" />
    </Pressable>
  );
}
