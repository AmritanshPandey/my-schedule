import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { IconClock } from '@tabler/icons-react-native';
import { displayToInputTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../lib/haptics';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import Button, { BUTTON_TEXT } from './ui/Button';
import TimeInput from './ui/TimeInput';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

export interface QuickRetimeTarget {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
}

/**
 * Native port of components/QuickRetimeSheet.tsx — retime one occurrence
 * (today only) without opening the full task editor.
 */
export default function QuickRetimeSheet({
  target,
  onClose,
  onSave,
}: {
  target: QuickRetimeTarget | null;
  onClose: () => void;
  onSave: (taskId: string, startTime: string, endTime: string) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!target) return;
    setStart(displayToInputTime(target.startTime));
    setEnd(displayToInputTime(target.endTime));
  }, [target]);

  function handleSave() {
    if (!target) return;
    haptic('light');
    onSave(target.taskId, start, end);
    onClose();
  }

  return (
    <BottomSheet open={!!target} onClose={onClose}>
      {target && (
        <View className="px-5 pb-6 pt-4">
          <SheetHeader eyebrow="Today only" title={target.title} onClose={onClose} />
          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <TimeInput label="Start" value={start} onChange={setStart} ariaLabel="Start time" />
            </View>
            <View className="flex-1">
              <TimeInput label="End" value={end} onChange={setEnd} ariaLabel="End time" />
            </View>
          </View>
          <Text className="mt-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Changes just today's occurrence — the rest of the series keeps its usual time.
          </Text>
          <Button variant="cta" fullWidth className="mt-5" onPress={handleSave}>
            <Icon icon={IconClock} size={16} strokeWidth={2.4} className={BUTTON_TEXT.cta} />
            Save
          </Button>
        </View>
      )}
    </BottomSheet>
  );
}
