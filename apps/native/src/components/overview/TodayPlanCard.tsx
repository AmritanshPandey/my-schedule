import { Pressable, View } from 'react-native';
import { IconCalendarPlus, IconCheck, IconFlame, IconListCheck, IconX } from '@tabler/icons-react-native';
import type { ExecutionStreak } from '@planr/core/lib/consistency/calculateExecutionStreak';
import type { TodayPlan, TodayPlanRow } from '@planr/core/lib/overview';
import { getSlots } from '@planr/core/lib/taskMutations';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import ProgressBar from '../ui/ProgressBar';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button, { BUTTON_TEXT } from '../ui/Button';

/**
 * Native port of components/overview/TodayPlanCard.tsx — the Overview's hero:
 * today's tasks with the day's progress on top. Checking a row is the
 * one-tap "mark done"; a multi-slot task checks off its next open slot, the
 * same as Next up used to. White card, green only for progress.
 */
function TaskRow({
  row,
  onMarkDone,
  onToggleSlot,
}: {
  row: TodayPlanRow;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
}) {
  const { task, state, timeLabel, metaLabel, subtasks, checkableIds } = row;
  const done = state === 'completed';
  const missed = state === 'missed';
  const slots = getSlots(task);
  const toggle = () => {
    haptic('medium');
    if (slots.length > 1 && !done) {
      const completed = new Set(task.completedSlotIndices ?? []);
      const next = slots.findIndex((_, i) => !completed.has(i));
      onToggleSlot(task.id, next === -1 ? 0 : next);
    } else {
      onMarkDone(task.id, checkableIds);
    }
  };
  const meta = [timeLabel, metaLabel].filter(Boolean).join(' · ');

  return (
    <View className="flex-row items-center gap-3 py-3">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        accessibilityState={{ checked: done }}
        hitSlop={8}
        onPress={toggle}
        className={`h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 active:scale-95 ${
          done ? 'border-transparent bg-emerald-500' : missed ? 'border-transparent bg-rose-500' : 'border-neutral-500 dark:border-white/30'
        }`}
      >
        {done && <Icon icon={IconCheck} size={15} strokeWidth={3} className="text-white" />}
        {missed && <Icon icon={IconX} size={15} strokeWidth={3} className="text-white" />}
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className={`text-[16px] font-bold leading-tight ${
            done || missed ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-950 dark:text-white'
          }`}
        >
          {task.title}
        </Text>
        {meta ? (
          <Text numberOfLines={1} className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            {meta}
          </Text>
        ) : null}
      </View>
      {subtasks && (
        <View className="h-8 shrink-0 flex-row items-center gap-1 rounded-full bg-black/[0.05] px-2.5 dark:bg-white/[0.08]">
          <Icon icon={IconListCheck} size={14} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
          <Text className="text-[12px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
            {subtasks.done}/{subtasks.total}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TodayPlanCard({
  plan,
  streak,
  onMarkDone,
  onToggleSlot,
  onAddTask,
}: {
  plan: TodayPlan;
  streak?: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  /** The empty day's "Add a task". */
  onAddTask: () => void;
}) {
  const { rows, done, total, pct } = plan;
  const left = total - done;

  return (
    <View testID="overview-today-plan" className={`${CARD} px-4 pb-1 pt-4`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Today's plan</Text>
        {streak && streak.streak > 0 && (
          <View
            className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${
              streak.atRisk ? 'bg-amber-500/12 dark:bg-amber-400/12' : 'bg-rose-500/10 dark:bg-rose-400/10'
            }`}
          >
            <Icon
              icon={IconFlame}
              size={14}
              strokeWidth={2.2}
              className={streak.atRisk ? 'text-amber-800 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}
            />
            <Text className={`text-[12px] font-bold tabular-nums ${streak.atRisk ? 'text-amber-800 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>
              {`${streak.streak}-day streak`}
            </Text>
          </View>
        )}
      </View>
      <Text accessibilityRole="header" className="mt-0.5 text-[24px] font-extrabold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white">
        {total === 0 ? 'Plan your day' : `${total} ${total === 1 ? 'task' : 'tasks'} for today`}
      </Text>

      {total === 0 ? (
        <View className="mb-4 mt-1">
          <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Nothing is scheduled for today yet.</Text>
          <Button
            fullWidth
            onPress={() => {
              haptic('light');
              onAddTask();
            }}
            icon={<Icon icon={IconCalendarPlus} size={18} strokeWidth={2.4} className={BUTTON_TEXT.primary} />}
            className="mt-3"
          >
            Add a task
          </Button>
        </View>
      ) : (
        <>
          <Text className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {left === 0 ? 'All done. Nice work.' : `${left} left · focus on what matters most`}
          </Text>
          <View className="mt-3 flex-row items-center gap-3">
            <ProgressBar pct={pct} height={6} className="flex-1" />
            <Text className="w-10 shrink-0 text-right text-[12px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">{pct}%</Text>
          </View>
          <View className="mt-1">
            {rows.map((row, index) => (
              <View key={row.task.id} className={index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}>
                <TaskRow row={row} onMarkDone={onMarkDone} onToggleSlot={onToggleSlot} />
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
