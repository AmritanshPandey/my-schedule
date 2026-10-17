import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowLeft, IconArrowsExchange, IconCopy, IconTrash } from '@tabler/icons-react-native';
import { DAYS, DAY_LABELS, DAY_FULL_LABELS, type DayKey } from '@planr/core/lib/scheduleConstants';
import { haptic } from '../lib/haptics';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import Button, { BUTTON_TEXT } from './ui/Button';
import IconButton, { ICON_BUTTON_TONE } from './ui/IconButton';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text } from './ui/Text';

interface DayActionsSheetProps {
  open: boolean;
  sourceDay: DayKey;
  onClose: () => void;
  onSwap: (target: DayKey) => void;
  onDuplicate: (targets: DayKey[]) => void;
  onClear: () => void;
  taskCount: number;
}

const SECTION_LABEL = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400';

function MenuRow({
  icon,
  title,
  detail,
  onPress,
  destructive = false,
  iconSize = 18,
}: {
  icon: TablerIcon;
  title: string;
  detail: string;
  onPress: () => void;
  destructive?: boolean;
  iconSize?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`w-full flex-row items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 dark:bg-white/[0.03] ${
        destructive
          ? 'border-rose-200 active:border-rose-300 active:bg-rose-50/60 dark:border-rose-500/25 dark:active:bg-rose-500/[0.08]'
          : 'border-neutral-200 active:border-neutral-300 dark:border-white/[0.08] dark:active:border-white/20'
      }`}
    >
      <View
        className={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          destructive ? 'bg-rose-50 dark:bg-rose-500/15' : 'bg-neutral-100 dark:bg-white/[0.08]'
        }`}
      >
        <Icon
          icon={icon}
          size={iconSize}
          strokeWidth={2}
          className={destructive ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-600 dark:text-neutral-200'}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className={`text-[16px] font-bold ${destructive ? 'text-rose-700 dark:text-rose-400' : 'text-neutral-900 dark:text-white'}`}>{title}</Text>
        <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{detail}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Native port of components/DayActionsSheet.tsx — swap two weekdays,
 * duplicate a day onto others, or clear one out.
 */
export default function DayActionsSheet({ open, sourceDay, onClose, onSwap, onDuplicate, onClear, taskCount }: DayActionsSheetProps) {
  const [step, setStep] = useState<'menu' | 'swap' | 'duplicate'>('menu');
  const [dupDays, setDupDays] = useState<DayKey[]>([]);

  useEffect(() => {
    if (open) {
      setStep('menu');
      setDupDays([]);
    }
  }, [open]);

  const otherDays = DAYS.filter((d) => d !== sourceDay);

  function handleSwap(target: DayKey) {
    haptic('light');
    onSwap(target);
    onClose();
  }

  function handleClear() {
    haptic('medium');
    onClear();
    onClose();
  }

  function handleDuplicate() {
    if (dupDays.length === 0) return;
    haptic('light');
    onDuplicate(dupDays);
    onClose();
  }

  function BackHeader({ title }: { title: string }) {
    return (
      <View className="mb-5 flex-row items-center gap-3">
        <IconButton label="Back" variant="soft" size="md" radius="full" onPress={() => setStep('menu')}>
          <Icon icon={IconArrowLeft} size={18} strokeWidth={2} className={ICON_BUTTON_TONE.soft} />
        </IconButton>
        <Text className="text-[18px] font-bold text-neutral-900 dark:text-white">{title}</Text>
      </View>
    );
  }

  return (
    <BottomSheet open={open} onClose={step === 'menu' ? onClose : () => setStep('menu')}>
      <View className="px-5 pb-6 pt-4">
        {step === 'menu' && (
          <View>
            <SheetHeader eyebrow="Day" title={`${DAY_FULL_LABELS[sourceDay]} actions`} onClose={onClose} />
            <View className="mt-4 gap-2">
              <MenuRow icon={IconArrowsExchange} iconSize={24} title="Swap with day…" detail="Exchange this day's whole schedule" onPress={() => setStep('swap')} />
              <MenuRow icon={IconCopy} title="Duplicate day to…" detail="Copy these tasks onto other days" onPress={() => setStep('duplicate')} />
              {taskCount > 0 && (
                <MenuRow
                  destructive
                  icon={IconTrash}
                  title={`Clear every ${DAY_FULL_LABELS[sourceDay]}`}
                  detail={`Delete all ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} from this weekday`}
                  onPress={handleClear}
                />
              )}
            </View>
          </View>
        )}

        {step === 'swap' && (
          <View>
            <BackHeader title={`Swap ${DAY_FULL_LABELS[sourceDay]} with`} />
            <View className="flex-row flex-wrap gap-2">
              {otherDays.map((day) => (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={DAY_FULL_LABELS[day]}
                  onPress={() => handleSwap(day)}
                  className="h-10 justify-center rounded-full border border-neutral-200 bg-white px-4 active:border-neutral-900 active:bg-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:active:border-white dark:active:bg-white"
                >
                  <Text className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{DAY_LABELS[day]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 'duplicate' && (
          <View>
            <BackHeader title={`Copy ${DAY_FULL_LABELS[sourceDay]} to`} />
            <Text className={`mb-2.5 ${SECTION_LABEL}`}>Target days</Text>
            <View className="mb-6 flex-row flex-wrap gap-2">
              {otherDays.map((day) => {
                const sel = dupDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={DAY_FULL_LABELS[day]}
                    accessibilityState={{ selected: sel }}
                    onPress={() => setDupDays((prev) => (sel ? prev.filter((d) => d !== day) : [...prev, day]))}
                    className={`h-10 justify-center rounded-full px-4 ${
                      sel ? 'bg-neutral-900 dark:bg-white' : 'border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                    }`}
                  >
                    <Text className={`text-[13px] font-semibold ${sel ? 'text-white dark:text-neutral-950' : 'text-neutral-500 dark:text-neutral-400'}`}>
                      {DAY_LABELS[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button fullWidth onPress={handleDuplicate} disabled={dupDays.length === 0}>
              <Icon icon={IconCopy} size={15} className={BUTTON_TEXT.primary} />
              {`Duplicate to ${dupDays.length || ''} ${dupDays.length === 1 ? 'day' : 'days'}`}
            </Button>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
