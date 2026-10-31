import { memo } from 'react';
import { sameRowProps } from '../../lib/sameRowProps';
import type { ReactNode } from 'react';
import { Pressable, View, type TextStyle } from 'react-native';
import { IconEdit, IconListCheck, IconX } from '@tabler/icons-react-native';
import type { Plan, Task, TaskCategory } from '@planr/core/lib/scheduleTypes';
import {
  calculateTaskProgress,
  getTaskCheckableItems,
  getTaskSubtaskSummary,
  isTrackedTask,
  resolveSlotState,
  resolveTaskState,
} from '@planr/core/lib/taskCompletion';
import { getSlots } from '@planr/core/lib/taskMutations';
import { formatSlotsDuration, formatDisplayTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import CheckDraw from '../ui/CheckDraw';
import Pill from '../ui/Pill';
import Pulse from '../ui/Pulse';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** "10:30 AM" → digits at full size, the period a step smaller beside them,
 *  on one line — the way iOS Calendar sets it, so the gutter never wraps. */
function TimeLabel({ value, className, style }: { value: string; className: string; style?: TextStyle }) {
  const match = /^(.*?)\s*(AM|PM)$/i.exec(value);
  return (
    <Text numberOfLines={1} className={className} style={style}>
      {match ? match[1] : value}
      {match && <Text className="text-[10px] font-bold">{` ${match[2].toUpperCase()}`}</Text>}
    </Text>
  );
}

/** Matches lib/useLongPress.ts's MISSED_LONG_PRESS_MS — the platform hold value. */
const MISSED_LONG_PRESS_MS = 500;

interface IOSTimelineRowProps {
  task: Task;
  linkedPlan: Plan | null;
  category: TaskCategory | null;
  slotIndex?: number;
  isCurrent?: boolean;
  isPast?: boolean;
  isLast?: boolean;
  isFirst?: boolean;
  readOnly?: boolean;
  editMode?: boolean;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onEdit: () => void;
  onOpenSubtasks?: () => void;
  onQuickRetime?: () => void;
}

/**
 * Native port of components/ios/IOSTimelineRow.tsx — one row of Today's
 * timeline: time label (tap to quick-retime), the rail node that toggles
 * completion (hold to mark missed), the progress spine, and the card.
 */
function IOSTimelineRow({
  task,
  linkedPlan,
  category,
  slotIndex,
  isCurrent = false,
  isPast = false,
  isLast = false,
  isFirst = false,
  readOnly = false,
  editMode = true,
  onToggleComplete,
  onMissed,
  onToggleSlot,
  onEdit,
  onOpenSubtasks,
  onQuickRetime,
}: IOSTimelineRowProps) {
  const summary = getTaskSubtaskSummary(task, linkedPlan);
  const itemCount = summary.totalCount;
  const allSubtaskIds = getTaskCheckableItems(task, linkedPlan).map((i) => i.id);
  const { completedCount, totalCount } = task.taskType === 'session' ? summary : calculateTaskProgress(task, itemCount);
  const tracked = isTrackedTask(task);

  const slots = getSlots(task);
  const singleSlot = slotIndex != null && slotIndex >= 0 && slotIndex < slots.length;
  const slot = singleSlot ? slots[slotIndex!] : slots[0];

  const state = singleSlot && tracked ? resolveSlotState(task, slotIndex!) : resolveTaskState(task, task.taskType === 'session' ? 0 : itemCount);
  const done = state === 'completed';
  const missed = state === 'missed';

  const duration = singleSlot ? formatSlotsDuration([slots[slotIndex!]]) : formatSlotsDuration(slots);
  const timeLabel = formatDisplayTime(slot?.startTime ?? '');
  const label = linkedPlan?.title || category?.title || '';
  const subtitle = [label, duration].filter(Boolean).join(' · ');

  const hasItems = itemCount > 0;
  const hasDetail = hasItems || !!task.description?.trim();

  const toggle = () => {
    if (readOnly || !tracked) return;
    haptic('medium');
    if (singleSlot) onToggleSlot?.(task.id, slotIndex!);
    else onToggleComplete(task.id, allSubtaskIds);
  };
  const canMiss = tracked && !readOnly && !done && !singleSlot && !!onMissed;

  const openDetail = () => {
    if (hasDetail && onOpenSubtasks) {
      haptic('light');
      onOpenSubtasks();
    }
  };

  // ── Rail node ───────────────────────────────────────────────────────────────
  let node: ReactNode;
  if (!tracked) {
    node = (
      <View className="h-7 w-7 items-center justify-center">
        <View className={`h-2.5 w-2.5 rounded-full ${isPast ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-neutral-300 dark:bg-white/25'}`} />
      </View>
    );
  } else {
    const nodeClass = done
      ? 'border-transparent bg-emerald-500'
      : missed
        ? 'border-transparent bg-rose-500'
        : isCurrent
          ? 'border-2 border-emerald-500 bg-white dark:bg-neutral-950'
          : 'border-2 border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950';
    node = (
      <Pressable
        disabled={readOnly}
        accessibilityRole="checkbox"
        accessibilityLabel={done ? 'Mark not done' : 'Mark done'}
        accessibilityHint={canMiss ? 'Hold to mark missed' : undefined}
        accessibilityState={{ checked: done, disabled: readOnly }}
        onPress={toggle}
        onLongPress={
          canMiss
            ? () => {
                haptic('medium');
                onMissed?.(task.id, allSubtaskIds);
              }
            : undefined
        }
        delayLongPress={MISSED_LONG_PRESS_MS}
        hitSlop={8}
        className={`relative h-7 w-7 items-center justify-center rounded-full ${nodeClass}`}
      >
        <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
        {missed && <Icon icon={IconX} size={14} strokeWidth={3} className="text-white" />}
        {isCurrent && !done && !missed && (
          <Pulse>
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
          </Pulse>
        )}
      </Pressable>
    );
  }

  const connectorClass = missed
    ? 'bg-rose-500/50'
    : isCurrent || done || isPast
      ? 'bg-emerald-500/70'
      : 'bg-neutral-200 dark:bg-white/10';

  // ── Trailing status ─────────────────────────────────────────────────────────
  let trailing: ReactNode = null;
  if (done) {
    trailing = (
      <Pill variant="success" size="sm">
        Completed
      </Pill>
    );
  } else if (missed) {
    trailing = (
      <Pill variant="danger" size="sm">
        Missed
      </Pill>
    );
  } else if (isCurrent) {
    trailing = (
      <View className="shrink-0 flex-row items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/[0.08] px-2.5 py-1">
        <Pulse>
          <View className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </Pulse>
        <Text className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">In progress</Text>
      </View>
    );
  } else if (hasItems) {
    trailing = (
      <View className="shrink-0 flex-row items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 dark:border-white/[0.10] dark:bg-white/[0.04]">
        <Icon icon={IconListCheck} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
          {completedCount}/{totalCount || itemCount}
        </Text>
      </View>
    );
  }

  // ── Card tint ────────────────────────────────────────────────────────────────
  const cardClass = !tracked
    ? 'border-neutral-200/70 bg-neutral-100/60 dark:border-white/[0.07] dark:bg-white/[0.03]'
    : done
      ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
      : missed
        ? 'border-rose-500/25 bg-rose-500/[0.06]'
        : isCurrent
          ? 'border-emerald-500/40 bg-white dark:bg-neutral-900'
          : 'border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900';

  const timeText = 'text-right text-[13px] font-semibold tabular-nums leading-none text-neutral-500 dark:text-neutral-400';

  return (
    <View className="flex-row items-stretch gap-3 pb-3">
      {!readOnly && !singleSlot && onQuickRetime ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change time, ${timeLabel}`}
          onPress={() => {
            haptic('light');
            onQuickRetime();
          }}
          className="w-[56px] shrink-0 items-end justify-center"
        >
          <TimeLabel value={timeLabel} className={timeText} style={{ textDecorationLine: 'underline', textDecorationStyle: 'dotted' }} />
        </Pressable>
      ) : (
        <View className="w-[56px] shrink-0 items-end justify-center">
          <TimeLabel value={timeLabel} className={timeText} />
        </View>
      )}

      <View className="relative w-7 shrink-0 items-center justify-center">
        <View
          pointerEvents="none"
          className={`absolute w-[1.5px] rounded-full ${connectorClass} ${isFirst ? 'top-1/2' : 'top-0'} ${isLast ? 'bottom-1/2' : '-bottom-3'}`}
          style={{ left: 13.25 }}
        />
        <View className="relative z-10">{node}</View>
      </View>

      <View className="min-w-0 flex-1">
        <Pressable
          disabled={!hasDetail}
          accessibilityRole={hasDetail ? 'button' : undefined}
          onPress={openDetail}
          className={`flex-row items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${cardClass} ${hasDetail ? 'active:scale-[0.995]' : ''}`}
          style={
            isCurrent
              ? { shadowColor: '#00C950', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }
              : undefined
          }
        >
          <View className="min-w-0 flex-1">
            <Text
              className={`truncate text-[16px] font-bold leading-tight ${
                !tracked
                  ? 'text-neutral-500 dark:text-neutral-400'
                  : missed
                    ? 'text-neutral-400 line-through dark:text-neutral-500'
                    : 'text-neutral-900 dark:text-white'
              }`}
            >
              {task.title}
            </Text>
            {subtitle ? <Text className="mt-0.5 truncate text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{subtitle}</Text> : null}
          </View>
          <View className="shrink-0 flex-row items-center gap-1.5">
            {trailing}
            {editMode && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit task"
                hitSlop={6}
                onPress={() => {
                  haptic('light');
                  onEdit();
                }}
                className="h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/60 active:bg-white/80 dark:border-white/[0.10] dark:bg-white/[0.08]"
              >
                <Icon icon={IconEdit} size={15} strokeWidth={2} className="text-neutral-600 dark:text-neutral-200" />
              </Pressable>
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

// Today re-renders on every tick and edit; untouched rows skip it.
export default memo(IOSTimelineRow, sameRowProps);
