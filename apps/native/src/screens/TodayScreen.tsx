import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { IconCalendarEvent, IconCheck, IconX } from '@tabler/icons-react-native';
import type { Schedule, Task } from '@planr/core/lib/scheduleTypes';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { todayISO } from '@planr/core/lib/dateUtils';
import { isTaskScheduledOn, resolveOccurrence } from '@planr/core/lib/taskOccurrence';
import { getSlots, sortTasksByTime } from '@planr/core/lib/taskMutations';
import {
  isMultiSlot,
  markSlotMissed,
  markTaskMissed,
  resolveSlotState,
  resolveTaskState,
  toggleSlotComplete,
  toggleTaskFromCheckbox,
} from '@planr/core/lib/taskCompletion';
import { formatSlotsRange } from '@planr/core/lib/timeUtils';
import { categoryHex } from '@planr/core/lib/colorSystem';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { colors, type ThemeColors } from '../theme/colors';

function todayDayKey() {
  return DAYS[(new Date().getDay() + 6) % 7];
}

function Checkbox({
  state,
  onPress,
  onLongPress,
  tintGreen,
  tintRose,
  mutedColor,
}: {
  state: 'incomplete' | 'partial' | 'completed' | 'missed';
  onPress: () => void;
  onLongPress: () => void;
  tintGreen: string;
  tintRose: string;
  mutedColor: string;
}) {
  const bg = state === 'completed' ? tintGreen : state === 'missed' ? tintRose : 'transparent';
  const borderColor = state === 'completed' ? tintGreen : state === 'missed' ? tintRose : mutedColor;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      accessibilityRole="button"
      accessibilityLabel={state === 'completed' ? 'Mark not done' : state === 'missed' ? 'Clear missed mark' : 'Mark done'}
      hitSlop={8}
      className="h-7 w-7 items-center justify-center rounded-full border-2"
      style={{ backgroundColor: bg, borderColor }}
    >
      {state === 'completed' && <IconCheck size={15} strokeWidth={3} color="#FFFFFF" />}
      {state === 'missed' && <IconX size={15} strokeWidth={3} color="#FFFFFF" />}
    </Pressable>
  );
}

function TaskCard({
  task,
  category,
  onToggle,
  onMissed,
  onToggleSlot,
  onMissedSlot,
  c,
}: {
  task: Task;
  category: { color: string } | undefined;
  onToggle: () => void;
  onMissed: () => void;
  onToggleSlot: (slotIndex: number) => void;
  onMissedSlot: (slotIndex: number) => void;
  c: ThemeColors;
}) {
  const slots = getSlots(task);
  const multi = isMultiSlot(task);
  const state = resolveTaskState(task, task.subtasks?.length ?? 0);
  const dotColor = category ? categoryHex(category.color) : c.muted;

  return (
    <View className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3.5 dark:border-white/[0.09] dark:bg-neutral-900">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-start gap-2.5">
          <View className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
          <View className="flex-1">
            <Text
              className={`text-[16px] font-semibold text-black dark:text-white ${
                state === 'completed' ? 'line-through opacity-50' : ''
              }`}
            >
              {task.title}
            </Text>
            <Text className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">
              {formatSlotsRange(slots)}
            </Text>
          </View>
        </View>
        {!multi && (
          <Checkbox
            state={state}
            onPress={onToggle}
            onLongPress={onMissed}
            tintGreen={c.momentumGreen}
            tintRose="#FB2C36"
            mutedColor={c.muted}
          />
        )}
      </View>
      {multi && (
        <View className="mt-3 gap-2 border-t border-black/[0.06] pt-3 dark:border-white/[0.06]">
          {slots.map((slot, i) => (
            <View key={i} className="flex-row items-center justify-between">
              <Text className="text-[13px] text-neutral-600 dark:text-neutral-300">
                {formatSlotsRange([slot])}
              </Text>
              <Checkbox
                state={resolveSlotState(task, i)}
                onPress={() => onToggleSlot(i)}
                onLongPress={() => onMissedSlot(i)}
                tintGreen={c.momentumGreen}
                tintRose="#FB2C36"
                mutedColor={c.muted}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function TodayScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [schedule, setSchedule] = useState<Schedule>(() => getSchedule());

  useFocusEffect(useCallback(() => setSchedule(getSchedule()), []));

  const dayKey = todayDayKey();
  const dateISO = todayISO();
  const tasks = sortTasksByTime(
    (schedule.activities[dayKey] ?? [])
      .filter((t) => isTaskScheduledOn(t, dateISO, true, schedule.preferences?.startDate))
      .map((t) => resolveOccurrence(t, dateISO)),
  );

  function mutateTask(taskId: string, patch: Partial<Task>) {
    const next = updateSchedule((s) => ({
      ...s,
      activities: {
        ...s.activities,
        [dayKey]: s.activities[dayKey].map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      },
    }));
    setSchedule(next);
  }

  function findTask(taskId: string): Task | undefined {
    return schedule.activities[dayKey]?.find((t) => t.id === taskId);
  }

  return (
    <Screen
      title="Today"
      onCreate={() => navigation.navigate('NewTask' as never)}
      createLabel="New task"
    >
      {tasks.length === 0 ? (
        <EmptyState
          icon={IconCalendarEvent}
          title="No tasks yet"
          description="Tap + to add today's first task."
        />
      ) : (
        tasks.map((task) => {
          const category = schedule.categories.find((cat) => cat.id === task.categoryId);
          return (
            <TaskCard
              key={task.id}
              task={task}
              category={category}
              c={c}
              onToggle={() => {
                const original = findTask(task.id);
                if (!original) return;
                const allSubtaskIds = (original.subtasks ?? []).map((s) => s.id);
                mutateTask(task.id, toggleTaskFromCheckbox(original, allSubtaskIds));
              }}
              onMissed={() => {
                const original = findTask(task.id);
                if (!original) return;
                const allSubtaskIds = (original.subtasks ?? []).map((s) => s.id);
                mutateTask(task.id, markTaskMissed(original, allSubtaskIds));
              }}
              onToggleSlot={(slotIndex) => {
                const original = findTask(task.id);
                if (!original) return;
                mutateTask(task.id, toggleSlotComplete(original, slotIndex, original.subtasks?.length ?? 0));
              }}
              onMissedSlot={(slotIndex) => {
                const original = findTask(task.id);
                if (!original) return;
                mutateTask(task.id, markSlotMissed(original, slotIndex));
              }}
            />
          );
        })
      )}
    </Screen>
  );
}
