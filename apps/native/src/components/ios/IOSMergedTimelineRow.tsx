import { Pressable, View } from 'react-native';
import { IconEdit } from '@tabler/icons-react-native';
import type { Plan, Task, TaskCategory } from '@planr/core/lib/scheduleTypes';
import { getTaskCheckableItems, isTrackedTask, resolveSlotState, resolveTaskState } from '@planr/core/lib/taskCompletion';
import { getSlots } from '@planr/core/lib/taskMutations';
import { formatSlotsDuration, formatDisplayTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import CheckDraw from '../ui/CheckDraw';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface IOSMergedTimelineHalf {
  task: Task;
  linkedPlan: Plan | null;
  category: TaskCategory | null;
  slotIndex?: number;
}

interface IOSMergedTimelineRowProps {
  primary: IOSMergedTimelineHalf;
  partner: IOSMergedTimelineHalf;
  isLast?: boolean;
  isFirst?: boolean;
  readOnly?: boolean;
  editMode?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onEdit: (task: Task) => void;
}

/** Native port of components/ios/IOSMergedTimelineRow.tsx — two merged tasks on one rail. */
export default function IOSMergedTimelineRow({
  primary,
  partner,
  isLast = false,
  isFirst = false,
  readOnly = false,
  editMode = true,
  onToggleComplete,
  onToggleSlot,
  onEdit,
}: IOSMergedTimelineRowProps) {
  return (
    <View className="flex-row items-stretch gap-3 pb-3">
      <View className="w-[52px] shrink-0" />
      <View className="relative w-7 shrink-0 items-center justify-center gap-2">
        <View
          pointerEvents="none"
          className={`absolute w-[1.5px] rounded-full bg-neutral-200 dark:bg-white/10 ${isFirst ? 'top-1/2' : 'top-0'} ${isLast ? 'bottom-1/2' : '-bottom-3'}`}
          style={{ left: 13.25 }}
        />
        <Node half={primary} readOnly={readOnly} onToggleComplete={onToggleComplete} onToggleSlot={onToggleSlot} />
        <Node half={partner} readOnly={readOnly} onToggleComplete={onToggleComplete} onToggleSlot={onToggleSlot} />
      </View>
      <View className="min-w-0 flex-1 rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900">
        <HalfRow half={primary} readOnly={readOnly} editMode={editMode} onEdit={onEdit} />
        <View className="h-px bg-neutral-200/70 dark:bg-white/[0.07]" />
        <HalfRow half={partner} readOnly={readOnly} editMode={editMode} onEdit={onEdit} />
      </View>
    </View>
  );
}

function halfState(half: IOSMergedTimelineHalf) {
  const summary = getTaskCheckableItems(half.task, half.linkedPlan).length;
  const slots = getSlots(half.task);
  const singleSlot = half.slotIndex != null && half.slotIndex >= 0 && half.slotIndex < slots.length;
  const tracked = isTrackedTask(half.task);
  const state = singleSlot && tracked ? resolveSlotState(half.task, half.slotIndex!) : resolveTaskState(half.task, half.task.taskType === 'session' ? 0 : summary);
  return { tracked, singleSlot, state, done: state === 'completed', missed: state === 'missed' };
}

function Node({
  half,
  readOnly,
  onToggleComplete,
  onToggleSlot,
}: {
  half: IOSMergedTimelineHalf;
  readOnly: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
}) {
  const { tracked, singleSlot, done, missed } = halfState(half);
  if (!tracked) {
    return (
      <View className="h-5 w-5 items-center justify-center">
        <View className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-white/25" />
      </View>
    );
  }
  const allSubtaskIds = getTaskCheckableItems(half.task, half.linkedPlan).map((i) => i.id);
  return (
    <Pressable
      disabled={readOnly}
      accessibilityRole="checkbox"
      accessibilityLabel={done ? 'Mark not done' : 'Mark done'}
      accessibilityState={{ checked: done, disabled: readOnly }}
      hitSlop={6}
      onPress={() => {
        if (readOnly) return;
        haptic('medium');
        if (singleSlot) onToggleSlot?.(half.task.id, half.slotIndex!);
        else onToggleComplete(half.task.id, allSubtaskIds);
      }}
      className={`relative z-10 h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
        done ? 'border-transparent bg-emerald-500' : missed ? 'border-transparent bg-rose-500' : 'border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950'
      }`}
    >
      <CheckDraw visible={done} size={13} strokeWidth={3} className="text-white" />
    </Pressable>
  );
}

function HalfRow({ half, readOnly, editMode, onEdit }: { half: IOSMergedTimelineHalf; readOnly: boolean; editMode: boolean; onEdit: (task: Task) => void }) {
  const { task, linkedPlan, category, slotIndex } = half;
  const { missed } = halfState(half);
  const slots = getSlots(task);
  const singleSlot = slotIndex != null && slotIndex >= 0 && slotIndex < slots.length;
  const slot = singleSlot ? slots[slotIndex!] : slots[0];
  const duration = singleSlot ? formatSlotsDuration([slots[slotIndex!]]) : formatSlotsDuration(slots);
  const timeLabel = formatDisplayTime(slot?.startTime ?? '');
  const label = linkedPlan?.title || category?.title || '';
  const subtitle = [timeLabel, label, duration].filter(Boolean).join(' · ');

  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-2.5">
      <View className="min-w-0 flex-1">
        <Text
          className={`truncate text-[15px] font-bold leading-tight ${
            missed ? 'text-neutral-500 line-through dark:text-neutral-500' : 'text-neutral-900 dark:text-white'
          }`}
        >
          {task.title}
        </Text>
        {subtitle ? <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{subtitle}</Text> : null}
      </View>
      {editMode && !readOnly && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit task"
          hitSlop={8}
          onPress={() => {
            haptic('light');
            onEdit(task);
          }}
          className="h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white/60 dark:border-white/[0.10] dark:bg-white/[0.08]"
        >
          <Icon icon={IconEdit} size={13} strokeWidth={2} className="text-neutral-600 dark:text-neutral-200" />
        </Pressable>
      )}
    </View>
  );
}
