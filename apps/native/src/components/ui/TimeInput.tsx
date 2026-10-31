import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { IconClock } from '@tabler/icons-react-native';
import { displayToInputTime, formatDisplayTime, minutesToInputTime, parseTimeToMinutes, punctuateTimeDigits } from '@planr/core/lib/timeUtils';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { INLINE_MIN_WIDTH } from './DateInput';
import { Icon } from './Icon';
import SystemPickerSheet from './SystemPickerSheet';
import { typography } from './Typography';
import { Text, TextInput } from './Text';

/**
 * Native port of components/ui/TimeInput.tsx — the same typed "hh:mm" field
 * with an AM/PM segmented pair, the same draft-vs-committed reconciliation
 * (never re-format under the user's fingers), and the same output: a 24-hour
 * "HH:MM" string. Arrow-key stepping has no phone equivalent and is dropped.
 *
 * On iOS the typed field gives way to the system time wheels, expanding inline
 * under the field as in Apple's Calendar app and committing as they turn; a
 * field too narrow for them opens the wheels in a panel instead
 * (ui/SystemPickerSheet). The same pattern as ui/DateInput.
 */
interface TimeInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  onFocus?: () => void;
  disabled?: boolean;
  className?: string;
}

type Period = 'AM' | 'PM';

function partsFor(value: string): { draft: string; period: Period } {
  const input = displayToInputTime(value);
  const minutes = parseTimeToMinutes(input || value);
  if (minutes === null) return { draft: '', period: 'AM' };
  const hour = Math.floor(minutes / 60) % 12 || 12;
  return {
    draft: `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    period: minutes >= 720 ? 'PM' : 'AM',
  };
}

function parseDraft(draft: string, period: Period): string | null {
  const match = draft.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  let hour24 = hour % 12;
  if (period === 'PM') hour24 += 12;
  return minutesToInputTime(hour24 * 60 + minute);
}

export default function TimeInput({ value, onChange, label, ariaLabel, onFocus, disabled = false, className = '' }: TimeInputProps) {
  const initial = partsFor(value);
  const [draft, setDraft] = useState(initial.draft);
  const [period, setPeriod] = useState<Period>(initial.period);
  const typingRef = useRef(false);

  useEffect(() => {
    if (typingRef.current) return;
    const next = partsFor(value);
    setDraft(next.draft);
    setPeriod(next.period);
  }, [value]);

  function emit(nextDraft: string, nextPeriod: Period) {
    const normalized = parseDraft(nextDraft, nextPeriod);
    if (normalized) onChange(normalized);
  }

  function commit(nextDraft = draft, nextPeriod = period) {
    const normalized = parseDraft(nextDraft, nextPeriod);
    if (!normalized) return;
    onChange(normalized);
    const next = partsFor(normalized);
    setDraft(next.draft);
    setPeriod(next.period);
  }

  function selectPeriod(next: Period) {
    setPeriod(next);
    emit(draft, next);
  }

  const isEmpty = draft === '';
  const [picking, setPicking] = useState(false);
  const [width, setWidth] = useState(0);
  const { colorScheme } = useColorScheme();

  if (Platform.OS === 'ios') {
    const minutes = parseTimeToMinutes(displayToInputTime(value) || value);
    const at = new Date();
    at.setHours(minutes === null ? 9 : Math.floor(minutes / 60), minutes === null ? 0 : minutes % 60, 0, 0);
    const shown = minutes === null ? '' : formatDisplayTime(minutesToInputTime(minutes));
    const inline = width >= INLINE_MIN_WIDTH;
    const commitWheel = (date: Date) => onChange(minutesToInputTime(date.getHours() * 60 + date.getMinutes()));
    return (
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {label && <Text className={`mb-1.5 ${typography.eyebrow}`}>{label}</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ariaLabel ?? label ?? 'Time'}
          accessibilityValue={{ text: shown || 'Not set' }}
          disabled={disabled}
          onPress={() => {
            onFocus?.();
            setPicking((v) => !v);
          }}
          className={`h-11 min-w-0 flex-row items-center gap-2 rounded-xl border bg-neutral-50 px-3 dark:bg-white/[0.04] ${
            picking ? 'border-emerald-600/60 dark:border-emerald-400/50' : 'border-neutral-200 dark:border-white/10'
          } ${disabled ? 'opacity-60' : ''} ${className}`}
        >
          <Icon icon={IconClock} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
          <Text className={`flex-1 text-[16px] font-semibold tabular-nums ${shown ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
            {shown || '--:--'}
          </Text>
        </Pressable>
        {picking && inline && (
          <View className="mt-2 items-center overflow-hidden rounded-2xl bg-neutral-50 dark:bg-white/[0.04]">
            <DateTimePicker
              value={at}
              mode="time"
              display="spinner"
              themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
              textColor={colorScheme === 'dark' ? '#FFFFFF' : '#0A0A0A'}
              onChange={(event, date) => {
                if (event.type === 'set' && date) commitWheel(date);
              }}
            />
          </View>
        )}
        <SystemPickerSheet
          open={picking && !inline}
          onClose={() => setPicking(false)}
          mode="time"
          title={label ?? ariaLabel ?? 'Time'}
          value={at}
          onPick={commitWheel}
        />
      </View>
    );
  }

  return (
    <View>
      {label && <Text className={`mb-1.5 ${typography.eyebrow}`}>{label}</Text>}
      <View
        className={`h-11 min-w-0 flex-row items-stretch overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] ${className}`}
      >
        <TextInput
          value={draft}
          accessibilityLabel={ariaLabel ?? label ?? 'Time'}
          placeholder="--:--"
          editable={!disabled}
          keyboardType="numbers-and-punctuation"
          onFocus={() => {
            typingRef.current = true;
            onFocus?.();
          }}
          onChangeText={(raw) => {
            const pasted = /p/i.test(raw) ? 'PM' : /a/i.test(raw) ? 'AM' : null;
            const next = punctuateTimeDigits(raw);
            setDraft(next);
            if (pasted && pasted !== period) setPeriod(pasted);
            emit(next, pasted ?? period);
          }}
          onBlur={() => {
            typingRef.current = false;
            commit();
          }}
          onSubmitEditing={() => commit()}
          className={`min-w-0 flex-1 px-3 text-[16px] font-semibold tabular-nums text-neutral-900 dark:text-white ${disabled ? 'opacity-60' : ''}`}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={`${ariaLabel ?? label ?? 'Time'} period`}
          className="shrink-0 flex-row items-center gap-1 border-l border-neutral-200 p-1 dark:border-white/10"
        >
          {(['AM', 'PM'] as const).map((option) => {
            const active = period === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled }}
                disabled={disabled}
                onPress={() => selectPeriod(option)}
                className={`h-full w-[34px] items-center justify-center rounded-lg ${disabled ? 'opacity-60' : ''} ${
                  active ? (isEmpty ? 'bg-neutral-200/70 dark:bg-white/[0.08]' : 'bg-neutral-900 dark:bg-white') : ''
                }`}
              >
                <Text
                  className={`text-[13px] font-bold ${
                    active
                      ? isEmpty
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : 'text-white dark:text-neutral-900'
                      : 'text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
