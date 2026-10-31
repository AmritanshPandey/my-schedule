import { Pressable, View } from 'react-native';
import { IconCalendarPlus, IconCheck, IconChevronRight, IconCircleCheck } from '@tabler/icons-react-native';
import { formatMinutesBrief, type NextUp } from '@planr/core/lib/overview';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/overview/NextUpCard.tsx (the `card` variant) —
 * "What do I do next?", the first answer on Overview. The check is the
 * screen's single affirmative action; the rest of the row opens Today.
 */
export default function NextUpCard({
  next,
  onMarkDone,
  onToggleSlot,
  onOpenToday,
}: {
  next: NextUp;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenToday: () => void;
}) {
  const open = (label: string, title: string, meta: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title}. ${meta}`}
      onPress={() => {
        haptic('light');
        onOpenToday();
      }}
      className="min-h-[56px] min-w-0 flex-1 flex-row items-center gap-2 rounded-xl px-2.5 py-2 active:bg-neutral-50 dark:active:bg-white/[0.04]"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
        <Text className="mt-0.5 truncate text-[17px] font-bold text-neutral-950 dark:text-white">{title}</Text>
        {!!meta && <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{meta}</Text>}
      </View>
      <Icon icon={IconChevronRight} size={18} strokeWidth={2.2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
    </Pressable>
  );

  const badge = (icon: TablerIcon, box: string, tint: string) => (
    <View className={`ml-1.5 h-11 w-11 shrink-0 items-center justify-center rounded-full ${box}`}>
      <Icon icon={icon} size={21} strokeWidth={2} className={tint} />
    </View>
  );

  if (next.kind === 'empty') {
    return (
      <View testID="overview-next-task" className={`${CARD} flex-row items-center gap-1 p-2`}>
        {badge(IconCalendarPlus, 'bg-neutral-100 dark:bg-white/[0.06]', 'text-neutral-500 dark:text-neutral-400')}
        {open('Next up', 'Plan your day', 'Nothing is scheduled for today yet')}
      </View>
    );
  }

  if (next.kind === 'day-done') {
    return (
      <View testID="overview-next-task" className={`${CARD} flex-row items-center gap-1 p-2`}>
        {badge(IconCircleCheck, 'bg-emerald-500/12 dark:bg-emerald-400/12', 'text-emerald-600 dark:text-emerald-400')}
        {open('Today', 'Day complete', `${next.done} of ${next.total} done${next.total > next.done ? ' · the rest are logged as missed' : ''}`)}
      </View>
    );
  }

  const { task, plan, timeLabel, slotIndex, checkableIds, openCount, remainingMinutes } = next;
  const meta = [
    plan?.title,
    openCount > 1 ? `${openCount} left · ${formatMinutesBrief(remainingMinutes)}` : remainingMinutes > 0 ? formatMinutesBrief(remainingMinutes) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View testID="overview-next-task" className={`${CARD} flex-row items-center gap-1 p-2`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mark ${task.title} done`}
        onPress={() => {
          haptic('medium');
          if (slotIndex !== undefined) onToggleSlot(task.id, slotIndex);
          else onMarkDone(task.id, checkableIds);
        }}
        // The one affirmative on the screen: the ring fills Momentum Green on press.
        className="ml-1 h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-neutral-300 active:scale-[0.94] active:border-[#00A63E] active:bg-[#00A63E] dark:border-white/25 dark:active:border-[#2FD46E] dark:active:bg-[#2FD46E]"
      >
        <Icon icon={IconCheck} size={20} strokeWidth={3} className="text-neutral-300 dark:text-white/30" />
      </Pressable>
      {open(timeLabel ? `Next up · ${timeLabel}` : 'Next up', task.title, meta)}
    </View>
  );
}
