import { Pressable, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { IconCalendarPlus, IconCheck, IconChevronRight, IconCircleCheck, IconFlame } from '@tabler/icons-react-native';
import { formatMinutesBrief, type NextUp } from '@planr/core/lib/overview';
import type { ExecutionStreak } from '@planr/core/lib/consistency/calculateExecutionStreak';
import { haptic } from '../../lib/haptics';
import ProgressBar from '../ui/ProgressBar';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/overview/NextUpCard.tsx (the phone hero) — the
 * Overview's focal point: today's date and streak, today's progress, the next
 * task as the headline, and Mark done as a real button. A raised white card
 * (the one hero shadow on the screen, DESIGN.md) so the eye lands here first;
 * green is spent only on the progress fill, a live streak, and the
 * affirmative action (One Signal Rule).
 */
export default function NextUpCard({
  next,
  streak,
  onMarkDone,
  onToggleSlot,
  onOpenToday,
}: {
  next: NextUp;
  /** Shown beside the date, so the reward sits with the next action. */
  streak?: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenToday: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const done = next.kind === 'empty' ? 0 : next.done;
  const total = next.kind === 'empty' ? 0 : next.total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let label: string;
  let title: string;
  let meta: string;
  if (next.kind === 'task') {
    const { task, plan, timeLabel, openCount, remainingMinutes } = next;
    label = timeLabel ? `Next up · ${timeLabel}` : 'Next up';
    title = task.title;
    meta = [
      plan?.title,
      openCount > 1 ? `${openCount} left · ${formatMinutesBrief(remainingMinutes)}` : remainingMinutes > 0 ? formatMinutesBrief(remainingMinutes) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (next.kind === 'day-done') {
    label = 'Today';
    title = 'Day complete';
    meta = next.total > next.done ? 'The rest are logged as missed.' : "Everything on today's list is done.";
  } else {
    label = 'Next up';
    title = 'Plan your day';
    meta = 'Nothing is scheduled for today yet.';
  }

  const openToday = () => {
    haptic('light');
    onOpenToday();
  };

  const primary =
    'h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-[#008236] px-5 active:scale-[0.98] active:bg-[#006B2C] dark:bg-[#2FD46E] dark:active:bg-[#25B85D]';
  const primaryText = 'text-[15px] font-bold text-white dark:text-neutral-950';
  const secondary =
    'h-12 flex-row items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-5 active:scale-[0.98] active:bg-neutral-200 dark:bg-white/10 dark:active:bg-white/15';
  const secondaryText = 'text-[15px] font-semibold text-neutral-900 dark:text-white';

  return (
    <View
      testID="overview-next-task"
      className="rounded-[24px] border border-neutral-200/70 bg-white p-5 dark:border-white/[0.08] dark:bg-neutral-900"
      // The one hero shadow on the screen (DESIGN.md: shadow-hero), light theme only.
      style={dark ? undefined : { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{dateLabel}</Text>
        {!!streak && streak.streak > 0 && (
          <View
            accessible
            accessibilityLabel={`${streak.streak}-day streak${streak.atRisk ? ', do one thing today to keep it' : ''}`}
            className={`shrink-0 flex-row items-center gap-1 rounded-full px-2.5 py-1 ${
              streak.atRisk ? 'bg-amber-500/12 dark:bg-amber-400/12' : 'bg-emerald-500/10 dark:bg-emerald-400/10'
            }`}
          >
            <Icon
              icon={IconFlame}
              size={14}
              strokeWidth={2.2}
              className={streak.atRisk ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}
            />
            <Text
              className={`text-[12px] font-bold tabular-nums ${streak.atRisk ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {streak.streak}-day streak
            </Text>
          </View>
        )}
      </View>

      <View className="mt-4 flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
          <Text
            accessibilityRole="header"
            numberOfLines={2}
            className="mt-1 text-[28px] font-extrabold leading-[31px] tracking-[-0.5px] text-neutral-950 dark:text-white"
          >
            {title}
          </Text>
          {!!meta && (
            <Text numberOfLines={1} className="mt-1.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              {meta}
            </Text>
          )}
        </View>
        {next.kind === 'day-done' && (
          <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 dark:bg-emerald-400/12">
            <Icon icon={IconCircleCheck} size={24} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
          </View>
        )}
      </View>

      {total > 0 && (
        <View className="mt-4 flex-row items-center gap-3">
          <View accessible accessibilityRole="progressbar" accessibilityLabel={`Today's progress, ${pct}%`} className="min-w-0 flex-1">
            <ProgressBar
              pct={pct}
              height={6}
              minVisible={false}
              fillColor={dark ? '#2FD46E' : '#00A63E'}
              trackColor={dark ? 'rgba(255,255,255,0.1)' : '#F5F5F5'}
            />
          </View>
          <Text className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
            {done} of {total} done
          </Text>
        </View>
      )}

      <View className="mt-5 flex-row items-center gap-2">
        {next.kind === 'task' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${next.task.title} done`}
              onPress={() => {
                haptic('medium');
                if (next.slotIndex !== undefined) onToggleSlot(next.task.id, next.slotIndex);
                else onMarkDone(next.task.id, next.checkableIds);
              }}
              className={primary}
            >
              <Icon icon={IconCheck} size={18} strokeWidth={3} className="text-white dark:text-neutral-950" />
              <Text className={primaryText}>Mark done</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Open Today" onPress={openToday} className={secondary}>
              <Text className={secondaryText}>Today</Text>
              <Icon icon={IconChevronRight} size={16} strokeWidth={2.4} className="text-neutral-900 dark:text-white" />
            </Pressable>
          </>
        ) : next.kind === 'empty' ? (
          <Pressable accessibilityRole="button" onPress={openToday} className={primary}>
            <Icon icon={IconCalendarPlus} size={18} strokeWidth={2.4} className="text-white dark:text-neutral-950" />
            <Text className={primaryText}>Add a task</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={openToday} className={secondary}>
            <Text className={secondaryText}>Open Today</Text>
            <Icon icon={IconChevronRight} size={16} strokeWidth={2.4} className="text-neutral-900 dark:text-white" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
