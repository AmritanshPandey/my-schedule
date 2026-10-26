import { useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import { todayISO } from '@planr/core/lib/dateUtils';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import Button, { BUTTON_TEXT } from './ui/Button';
import Input from './ui/Input';
import DateInput from './ui/DateInput';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

interface AddEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: number, date: string) => void;
  metric?: { name: string; unit: string };
  /** Preset amounts (e.g. [100, 250, 500] for an "ml" tracker). Tapping a
   *  chip increments the value field rather than saving immediately, so a
   *  misfire doesn't write a bad row. Omit/empty = no chip row. */
  quickAmounts?: number[];
  /** Today's already-logged total for this tracker, shown under the label when > 0. */
  todayTotal?: number;
}

/**
 * Native port of components/AddEntryModal.tsx — log one metric value for any
 * date: a number field, increment chips, a date field, and "Save entry".
 */
export default function AddEntryModal({ isOpen, onClose, onSave, metric, quickAmounts, todayTotal }: AddEntryModalProps) {
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayISO);

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || !date) return;
    onSave(num, date);
    setValue('');
    setDate(todayISO());
    onClose();
  }

  function handleClose() {
    setValue('');
    setDate(todayISO());
    onClose();
  }

  function addQuickAmount(amount: number) {
    // Functional updater — two chip taps in quick succession must each build
    // on the other's result, not both read the same stale `value` closure.
    setValue((current) => String((parseFloat(current) || 0) + amount));
  }

  const metricLabel = metric ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ''}` : 'Value';
  const canSave = !!value && !isNaN(parseFloat(value));

  return (
    <BottomSheet open={isOpen} onClose={handleClose} maxHeight={Dimensions.get('window').height * 0.8}>
      <View className="gap-4 px-5 pb-8 pt-4">
        <SheetHeader eyebrow="Log" title="New entry" onClose={handleClose} />

        {!!todayTotal && todayTotal > 0 && (
          <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            Today: {todayTotal}
            {metric?.unit ? ` ${metric.unit}` : ''}
          </Text>
        )}

        <Input
          label={metricLabel}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={handleSave}
          returnKeyType="done"
          placeholder="0"
          autoFocus
        />

        {!!quickAmounts?.length && (
          <View className="flex-row flex-wrap gap-1.5">
            {quickAmounts.map((amount) => (
              <Pressable
                key={amount}
                accessibilityRole="button"
                onPress={() => addQuickAmount(amount)}
                className="rounded-lg border border-neutral-200 px-2.5 py-1.5 active:bg-neutral-50 dark:border-white/[0.08] dark:active:bg-white/[0.05]"
              >
                <Text className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">
                  +{amount}
                  {metric?.unit ? ` ${metric.unit}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <DateInput label="Date" value={date} onChange={setDate} />

        <View className="flex-row gap-2 pt-1">
          <Button fullWidth onPress={handleSave} disabled={!canSave}>
            <Icon icon={IconCheck} size={16} strokeWidth={2.5} className={BUTTON_TEXT.primary} />
            <Text className={`text-[16px] font-semibold ${BUTTON_TEXT.primary}`}>Save entry</Text>
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
