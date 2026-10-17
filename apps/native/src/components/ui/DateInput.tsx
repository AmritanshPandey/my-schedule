import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { IconCalendar, IconX } from '@tabler/icons-react-native';
import { localISODate } from '@planr/core/lib/dateUtils';
import { FORM_LABEL } from './Input';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * The native stand-in for the PWA's `<input type="date">` (same form chrome,
 * same "YYYY-MM-DD" | "" value). Android opens the system date dialog; iOS
 * expands the inline calendar under the field — the closest match to what
 * Safari shows for a date input.
 */
interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  /** Show an × that clears the value back to "". */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

function parseISO(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function display(value: string): string {
  const d = parseISO(value);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DateInput({
  value,
  onChange,
  label,
  placeholder = 'Select date',
  min,
  max,
  clearable = false,
  disabled = false,
  className = '',
}: DateInputProps) {
  const { colorScheme } = useColorScheme();
  const [open, setOpen] = useState(false);
  const current = parseISO(value) ?? new Date();
  const minimumDate = min ? parseISO(min) ?? undefined : undefined;
  const maximumDate = max ? parseISO(max) ?? undefined : undefined;

  function handle(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'set' && date) onChange(localISODate(date));
  }

  function openPicker() {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: current, mode: 'date', onChange: handle, minimumDate, maximumDate });
    } else {
      setOpen((v) => !v);
    }
  }

  return (
    <View className="w-full">
      {label && <Text className={FORM_LABEL}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Date'}
        accessibilityHint={value ? display(value) : placeholder}
        onPress={openPicker}
        className={`h-11 w-full flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 dark:border-white/10 dark:bg-white/[0.04] ${
          disabled ? 'opacity-60' : ''
        } ${className}`}
      >
        <Icon icon={IconCalendar} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className={`flex-1 text-[16px] font-medium ${value ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
          {value ? display(value) : placeholder}
        </Text>
        {clearable && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear date" hitSlop={8} onPress={() => onChange('')}>
            <Icon icon={IconX} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
          </Pressable>
        ) : null}
      </Pressable>
      {open && Platform.OS === 'ios' && (
        <View className="mt-2 overflow-hidden rounded-xl border border-neutral-200 dark:border-white/10">
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
            accentColor="#00A63E"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(event, date) => {
              handle(event, date);
              if (event.type === 'set') setOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}
