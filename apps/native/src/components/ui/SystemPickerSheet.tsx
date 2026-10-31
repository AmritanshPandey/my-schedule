import { useEffect, useState } from 'react';
import { View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import BottomSheet from './BottomSheet';
import Button from './Button';
import SheetHeader from './SheetHeader';

/**
 * iOS's own date and time pickers, in the app's sheet. The field that opens
 * it keeps the house look; what you pick on is UIDatePicker itself — the
 * inline calendar for a date, the wheels for a time — tinted the brand green.
 *
 * Why not the system's compact control laid over the field: UIKit only takes
 * taps inside that control's own small pill, however wide its frame is
 * stretched, so most of the field would do nothing.
 *
 * A date commits the moment a day is tapped, as the system calendar does. A
 * time is built across several wheel spins, so it waits for Done.
 */
interface SystemPickerSheetProps {
  open: boolean;
  onClose: () => void;
  mode: 'date' | 'time';
  /** Field label, shown as the sheet title. */
  title: string;
  value: Date;
  onPick: (value: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Shows a Clear action that hands back null. */
  onClear?: () => void;
}

export default function SystemPickerSheet({ open, onClose, mode, title, value, onPick, minimumDate, maximumDate, onClear }: SystemPickerSheetProps) {
  const { colorScheme } = useColorScheme();
  const [draft, setDraft] = useState(value);
  const dark = colorScheme === 'dark';

  // Each opening starts from the field's current value.
  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} scroll={false}>
      <View className="px-5 pb-6 pt-4">
        <SheetHeader eyebrow={mode === 'date' ? 'Choose date' : 'Choose time'} title={title} onClose={onClose} />
        <View className={`mt-2 items-center ${mode === 'time' ? 'py-2' : ''}`}>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            themeVariant={dark ? 'dark' : 'light'}
            accentColor={dark ? '#2FD46E' : '#008236'}
            textColor={dark ? '#FFFFFF' : '#0A0A0A'}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(event, date) => {
              if (event.type !== 'set' || !date) return;
              setDraft(date);
              if (mode === 'date') {
                onPick(date);
                onClose();
              }
            }}
          />
        </View>
        <View className="mt-3 flex-row gap-2">
          {onClear && (
            <Button
              variant="secondary"
              className="flex-1"
              onPress={() => {
                onClear();
                onClose();
              }}
            >
              Clear
            </Button>
          )}
          {mode === 'time' && (
            <Button
              variant="primary"
              className="flex-1"
              onPress={() => {
                onPick(draft);
                onClose();
              }}
            >
              Done
            </Button>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}
