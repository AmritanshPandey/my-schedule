import { Pressable, View } from 'react-native';
import { DAYS, DAY_FULL_LABELS, DAY_LABELS, type DayKey } from '@planr/core/lib/scheduleConstants';
import { Text } from './Text';

/** Native port of components/ui/WeekdayPicker.tsx — Monday-first toggle chips. */
interface WeekdayPickerProps {
  selected: DayKey[];
  onChange: (days: DayKey[]) => void;
  allDaysOption?: boolean;
  fallbackDay?: DayKey;
  allowEmpty?: boolean;
  className?: string;
}

function chipClass(active: boolean): string {
  return active
    ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white'
    : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]';
}

function chipText(active: boolean): string {
  return active ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400';
}

const CHIP = 'h-8 items-center justify-center rounded-full border px-3';
const CHIP_TEXT = 'text-[12px] font-semibold';

export default function WeekdayPicker({
  selected,
  onChange,
  allDaysOption = false,
  fallbackDay,
  allowEmpty = false,
  className = '',
}: WeekdayPickerProps) {
  const allSelected = selected.length === DAYS.length;

  function toggleDay(day: DayKey) {
    if (allSelected && allDaysOption) {
      onChange([day]);
      return;
    }
    const next = selected.includes(day) ? selected.filter((selectedDay) => selectedDay !== day) : [...selected, day];
    const kept = next.length > 0 || allowEmpty ? next : [day];
    onChange(DAYS.filter((d) => kept.includes(d)));
  }

  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {allDaysOption && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: allSelected }}
          onPress={() => onChange(allSelected ? [fallbackDay ?? selected[0] ?? DAYS[0]] : [...DAYS])}
          className={`${CHIP} ${chipClass(allSelected)}`}
        >
          <Text className={`${CHIP_TEXT} ${chipText(allSelected)}`}>All days</Text>
        </Pressable>
      )}
      {DAYS.map((day) => {
        const active = allDaysOption ? !allSelected && selected.includes(day) : selected.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={DAY_FULL_LABELS[day]}
            onPress={() => toggleDay(day)}
            className={`${CHIP} w-10 px-0 ${chipClass(active)}`}
          >
            <Text className={`${CHIP_TEXT} ${chipText(active)}`}>{DAY_LABELS[day]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
