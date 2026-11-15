import { Pressable, View } from 'react-native';
import { DAYS, DAY_FULL_LABELS, DAY_LABELS, type DayKey } from '@planr/core/lib/scheduleConstants';
import { Text } from './Text';
import { ChoiceChip } from './FormChips';

/** Native port of components/ui/WeekdayPicker.tsx — Monday-first toggle chips. */
interface WeekdayPickerProps {
  selected: DayKey[];
  onChange: (days: DayKey[]) => void;
  allDaysOption?: boolean;
  fallbackDay?: DayKey;
  allowEmpty?: boolean;
  className?: string;
}

function dayClass(active: boolean): string {
  return active
    ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white'
    : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]';
}

function dayText(active: boolean): string {
  return active ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-200';
}

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

  // One row of seven equal 44px days, so the week never wraps into a
  // crowded second line; "Every day" is its own chip above it.
  return (
    <View className={`gap-2 ${className}`}>
      {allDaysOption && (
        <View className="flex-row">
          <ChoiceChip
            active={allSelected}
            label="Every day"
            onPress={() => onChange(allSelected ? [fallbackDay ?? selected[0] ?? DAYS[0]] : [...DAYS])}
          />
        </View>
      )}
      <View className="flex-row gap-1.5">
        {DAYS.map((day) => {
          const active = allDaysOption ? !allSelected && selected.includes(day) : selected.includes(day);
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={DAY_FULL_LABELS[day]}
              onPress={() => toggleDay(day)}
              className={`h-11 min-w-0 flex-1 items-center justify-center rounded-full border ${dayClass(active)}`}
            >
              {/* Full width: iOS measures Nunito's "Mo" / "We" a hair narrow
                  and clips the last letter of a content-sized label. */}
              <Text numberOfLines={1} className={`w-full text-center text-[14px] font-semibold ${dayText(active)}`}>
                {DAY_LABELS[day]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
