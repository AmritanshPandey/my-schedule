import { Pressable, View } from 'react-native';
import { IconBarbell, IconCalendarDue } from '@tabler/icons-react-native';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import type { TaskState } from '@planr/core/lib/taskCompletion';
import type { ScheduleEntry, TargetValues } from '@planr/core/lib/scheduleEntry';
import { deadlineState, formatDeadline, type DeadlineState } from '@planr/core/lib/subtaskDeadline';
import { subtaskDetailSegments, type DetailSegment } from '@planr/core/lib/subtaskTargets';
import TaskStatusCheckbox from '../task/TaskStatusCheckbox';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const DEADLINE_BADGE: Record<DeadlineState, { box: string; text: string }> = {
  overdue: { box: 'border-rose-500/30 bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
  soon: { box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  upcoming: { box: 'border-neutral-200 bg-white dark:border-white/[0.12] dark:bg-transparent', text: 'text-neutral-500 dark:text-neutral-400' },
};

/** Same as the web helper — the shared core label (info, time, strength targets, detail). */
export function getTaskDetailSegments(entry: ScheduleEntry, values?: TargetValues): DetailSegment[] | null {
  return subtaskDetailSegments(entry, values);
}

export function getTaskDetailPill(entry: ScheduleEntry): string | null {
  const segments = getTaskDetailSegments(entry);
  return segments ? segments.map((s) => s.text).join(' · ') : null;
}

/** Native port of components/activity/TaskChecklistItem.tsx — one subtask row. */
export default function TaskChecklistItem({
  item,
  isDone,
  state,
  today,
  readOnly = false,
  onToggle,
  values,
  onLogSets,
  logSummary,
}: {
  item: ScheduleEntry;
  isDone: boolean;
  state: TaskState;
  today: string;
  readOnly?: boolean;
  onToggle: () => void;
  /** The figures that apply today — accepted progression steps included. */
  values?: TargetValues;
  /** Open the Log sets sheet for this subtask. Absent = no button. */
  onLogSets?: () => void;
  /** Today's logged recap, e.g. "3 sets logged · top 62.5 kg". */
  logSummary?: string;
}) {
  const detailSegments = getTaskDetailSegments(item, values);
  const deadline = item.deadline
    ? {
        label: formatDeadline(item.deadline, item.deadlineScope ?? 'day'),
        state: deadlineState(item.deadline, item.deadlineScope ?? 'day', today),
      }
    : null;
  const deadlineTone = deadline ? (isDone ? DEADLINE_BADGE.upcoming : DEADLINE_BADGE[deadline.state]) : null;

  return (
    <Pressable
      disabled={readOnly}
      accessibilityRole="button"
      onPress={() => {
        if (!readOnly) onToggle();
      }}
      className={`flex-row items-center gap-3 rounded-2xl px-3.5 py-3 ${isDone ? 'bg-transparent' : 'bg-neutral-100/70 dark:bg-white/[0.03]'}`}
    >
      <TaskStatusCheckbox
        state={state}
        checked={isDone}
        readOnly={readOnly}
        label={isDone ? 'Mark subtask not done' : 'Mark subtask done'}
        onClick={onToggle}
      />
      <View className="min-w-0 flex-1">
        <Text
          className={`text-[16px] font-semibold ${
            isDone || state === 'missed' ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-200'
          }`}
        >
          {item.task}
        </Text>
        {logSummary ? (
          <Text className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
            {logSummary}
          </Text>
        ) : null}
      </View>
      {deadline && deadlineTone && (
        <View className={`shrink-0 flex-row items-center gap-1 rounded-full border px-2.5 py-1 ${deadlineTone.box}`}>
          <Icon icon={IconCalendarDue} size={12} strokeWidth={2.2} className={deadlineTone.text} />
          <Text className={`text-[12px] font-bold ${deadlineTone.text}`}>{deadline.label}</Text>
        </View>
      )}
      {detailSegments && (
        <View className="max-w-[45%] shrink flex-row items-center rounded-full border border-neutral-200 bg-white px-3 py-1 dark:border-white/[0.12] dark:bg-transparent">
          <Text numberOfLines={1} className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
            {detailSegments.map((seg, i) => (
              <Text key={i}>
                {i > 0 && <Text className="text-neutral-400 dark:text-neutral-500"> · </Text>}
                <Text className={seg.isTime ? 'font-extrabold tabular-nums text-blue-600 dark:text-blue-400' : undefined}>{seg.text}</Text>
              </Text>
            ))}
          </Text>
        </View>
      )}
      {onLogSets ? (
        <IconButton label={`Log sets for ${item.task}`} variant="secondary" size="md" onPress={onLogSets}>
          <Icon icon={IconBarbell} size={18} strokeWidth={2} className={ICON_BUTTON_TONE.secondary} />
        </IconButton>
      ) : null}
    </Pressable>
  );
}
