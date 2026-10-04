import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowUp, IconTrash } from '@tabler/icons-react-native';
import { getSlots } from '@planr/core/lib/taskMutations';
import { parseTimeToMinutes, minutesToInputTime, formatDisplayTime } from '@planr/core/lib/timeUtils';
import { localISODate } from '@planr/core/lib/dateUtils';
import { formatDaysAgo, type MissedTask } from '@planr/core/lib/needsAttention';
import { haptic } from '../lib/haptics';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import Button, { BUTTON_TEXT } from './ui/Button';
import TimeInput from './ui/TimeInput';
import DateInput from './ui/DateInput';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

interface MissedTaskSheetProps {
  missed: MissedTask | null;
  onClose: () => void;
  onReschedule: (missed: MissedTask, dateISO: string, startMinutes: number) => void;
  onDismiss: (missed: MissedTask) => void;
}

const LABEL = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400';

function friendlyDate(iso: string, todayISO: string): string {
  if (iso === todayISO) return 'Today';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Native port of components/MissedTaskSheet.tsx — reschedule a missed task
 * (today or a custom date, original or custom time) or dismiss it.
 */
export default function MissedTaskSheet({ missed, onClose, onReschedule, onDismiss }: MissedTaskSheetProps) {
  const todayISO = localISODate(new Date());
  const originalStart = missed ? parseTimeToMinutes(getSlots(missed.task)[0]?.startTime ?? '') : null;

  const [dateISO, setDateISO] = useState(todayISO);
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    if (!missed) return;
    setDateISO(localISODate(new Date()));
    setTimeStr(minutesToInputTime(parseTimeToMinutes(getSlots(missed.task)[0]?.startTime ?? '') ?? 9 * 60));
  }, [missed]);

  const startMinutes = parseTimeToMinutes(timeStr) ?? originalStart ?? 9 * 60;
  const keepsOriginalTime = originalStart != null && startMinutes === originalStart;

  function handleReschedule() {
    if (!missed) return;
    haptic('light');
    onReschedule(missed, dateISO, startMinutes);
    onClose();
  }

  function handleDismiss() {
    if (!missed) return;
    haptic('light');
    onDismiss(missed);
    onClose();
  }

  return (
    <BottomSheet open={!!missed} onClose={onClose}>
      {missed && (
        <View className="px-5 pb-6 pt-4">
          <SheetHeader eyebrow={`Missed ${formatDaysAgo(missed.daysAgo)}`} title={missed.task.title} onClose={onClose} />

          <View className="mt-5 gap-4">
            <View>
              <Text className={`mb-2 ${LABEL}`}>Do it on</Text>
              <View className="flex-row items-start gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: dateISO === todayISO }}
                  onPress={() => setDateISO(todayISO)}
                  className={`h-11 shrink-0 justify-center rounded-xl px-4 ${
                    dateISO === todayISO ? 'bg-neutral-900 dark:bg-white' : 'border border-neutral-200 bg-white dark:border-white/[0.10] dark:bg-white/[0.04]'
                  }`}
                >
                  <Text
                    className={`text-[14px] font-bold ${
                      dateISO === todayISO ? 'text-white dark:text-neutral-950' : 'text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    Today
                  </Text>
                </Pressable>
                <View className="min-w-0 flex-1">
                  <DateInput value={dateISO} min={todayISO} onChange={(v) => setDateISO(v || todayISO)} />
                </View>
              </View>
            </View>

            <View>
              <TimeInput label="At" value={timeStr} onChange={setTimeStr} ariaLabel="Start time" />
              {originalStart != null && (
                <Text className="mt-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  {keepsOriginalTime ? 'Keeping the original time' : `Original: ${formatDisplayTime(minutesToInputTime(originalStart))}`}
                </Text>
              )}
            </View>
          </View>

          <View className="mt-6 gap-2.5">
            <Button variant="cta" fullWidth onPress={handleReschedule}>
              <Icon icon={IconArrowUp} size={16} strokeWidth={2.4} className={BUTTON_TEXT.cta} />
              {`Add to ${friendlyDate(dateISO, todayISO)}`}
            </Button>
            <Button variant="dangerSecondary" fullWidth onPress={handleDismiss}>
              <Icon icon={IconTrash} size={15} strokeWidth={2} className={BUTTON_TEXT.dangerSecondary} />
              Dismiss
            </Button>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}
