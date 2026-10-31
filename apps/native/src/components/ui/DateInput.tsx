import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { IconCalendar, IconX } from '@tabler/icons-react-native';
import { localISODate } from '@planr/core/lib/dateUtils';
import { FORM_LABEL } from './Input';
import { Icon } from './Icon';
import SystemPickerSheet from './SystemPickerSheet';
import { Text } from './Text';

/**
 * The native stand-in for the PWA's `<input type="date">` (same form chrome,
 * same "YYYY-MM-DD" | "" value).
 *
 * A tap anywhere on the field opens the platform's own picker: on iOS the
 * system calendar in the app's sheet (ui/SystemPickerSheet), on Android the
 * system date dialog.
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
  const [open, setOpen] = useState(false);
  const ios = Platform.OS === 'ios';
  const current = parseISO(value) ?? new Date();
  const minimumDate = min ? parseISO(min) ?? undefined : undefined;
  const maximumDate = max ? parseISO(max) ?? undefined : undefined;

  function handle(event: DateTimePickerEvent, date?: Date) {
    setOpen(false);
    if (event.type === 'set' && date) onChange(localISODate(date));
  }

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    if (ios) return;
    DateTimePickerAndroid.open({ value: current, mode: 'date', onChange: handle, minimumDate, maximumDate });
  }

  const field = `h-11 w-full flex-row items-center gap-2 rounded-xl border bg-neutral-50 px-4 dark:bg-white/[0.04] ${
    open ? 'border-emerald-600/60 dark:border-emerald-400/50' : 'border-neutral-200 dark:border-white/10'
  } ${disabled ? 'opacity-60' : ''} ${className}`;
  const contents = (
    <>
      <Icon icon={IconCalendar} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      <Text className={`flex-1 text-[16px] font-medium ${value ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
        {value ? display(value) : placeholder}
      </Text>
    </>
  );
  const clear =
    clearable && value ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Clear date" hitSlop={8} onPress={() => onChange('')}>
        <Icon icon={IconX} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>
    ) : null;

  return (
    <View className="w-full">
      {label && <Text className={FORM_LABEL}>{label}</Text>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Date'}
        accessibilityHint={value ? display(value) : placeholder}
        onPress={openPicker}
        className={field}
      >
        {contents}
        {clear}
      </Pressable>
      {ios && (
        <SystemPickerSheet
          open={open}
          onClose={() => setOpen(false)}
          mode="date"
          title={label ?? 'Date'}
          value={current}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onPick={(date) => onChange(localISODate(date))}
          onClear={clearable && value ? () => onChange('') : undefined}
        />
      )}
    </View>
  );
}
