import { Pressable, View } from 'react-native';
import { Text } from './Text';

/**
 * Native port of components/ui/SegmentedControl.tsx — the single-select mode
 * switch (pill track, selected option raised). Exposed as a radio group, the
 * same semantics the web gives screen readers.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={ariaLabel}
      className={`flex-row gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-white/[0.05] ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            className={`h-11 min-w-0 flex-1 items-center justify-center rounded-xl px-2 ${
              active ? 'border border-black/[0.06] bg-white dark:border-white/10 dark:bg-white/[0.12]' : ''
            }`}
          >
            <Text
              className={`truncate text-[13px] font-semibold ${
                active ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
