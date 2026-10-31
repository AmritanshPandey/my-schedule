import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { IconCalendar, IconX } from '@tabler/icons-react-native';
import { localISODate } from '@planr/core/lib/dateUtils';
import { FORM_LABEL } from './Input';
import { Icon } from './Icon';
import SystemPickerSheet, { closeAfterTouch } from './SystemPickerSheet';
import { Text } from './Text';

/**
 * The native stand-in for the PWA's `<input type="date">` (same form chrome,
 * same "YYYY-MM-DD" | "" value).
 *
 * A tap anywhere on the field opens the platform's own picker. On iOS that is
 * the system calendar expanding inline under the field, as in Apple's
 * Calendar app; a field too narrow to hold it (half of a two-up row) opens
 * the same calendar in a panel instead (ui/SystemPickerSheet). Android opens
 * the system date dialog.
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

/** Narrowest field the inline calendar fits under; narrower ones use a panel. */
export const INLINE_MIN_WIDTH = 300;

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
  const [width, setWidth] = useState(0);
  const { colorScheme } = useColorScheme();
  const ios = Platform.OS === 'ios';
  const inline = width >= INLINE_MIN_WIDTH;
  const current = parseISO(value) ?? new Date();
  const minimumDate = min ? parseISO(min) ?? undefined : undefined;
  const maximumDate = max ? parseISO(max) ?? undefined : undefined;

  function handle(event: DateTimePickerEvent, date?: Date) {
    setOpen(false);
    if (event.type === 'set' && date) onChange(localISODate(date));
  }

  function openPicker() {
    if (disabled) return;
    if (ios) {
      setOpen((v) => !v);
      return;
    }
    setOpen(true);
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
    <View className="w-full" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
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
      {ios && open && inline && (
        <View className="mt-2 items-center overflow-hidden rounded-2xl bg-neutral-50 dark:bg-white/[0.04]">
          <DateTimePicker
            value={current}
            mode="date"
            display="inline"
            themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
            accentColor={colorScheme === 'dark' ? '#2FD46E' : '#008236'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(event, date) => {
              if (event.type !== 'set' || !date) return;
              onChange(localISODate(date));
              closeAfterTouch(() => setOpen(false));
            }}
          />
        </View>
      )}
      {ios && (
        <SystemPickerSheet
          open={open && !inline}
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
