import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrowBackUp, IconBan, IconCheck, IconClockHour4, IconEdit, IconListCheck, IconNotes, IconX } from '@tabler/icons-react-native';
import type { Plan, Task } from '@planr/core/lib/scheduleTypes';
import type { ScheduleEntry } from '@planr/core/lib/scheduleEntry';
import { todayISO } from '@planr/core/lib/dateUtils';
import { compareDeadline } from '@planr/core/lib/subtaskDeadline';
import { calculateTaskProgress, isTrackedTask, phaseProgress, resolveSlotState, resolveTaskState } from '@planr/core/lib/taskCompletion';
import { getSlots } from '@planr/core/lib/taskMutations';
import { formatDisplayTime, formatDuration } from '@planr/core/lib/timeUtils';
import TaskChecklistItem from './TaskChecklistItem';
import TaskStatusCheckbox from '../task/TaskStatusCheckbox';
import DetailHeader from '../ui/DetailHeader';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import Pill from '../ui/Pill';
import ProgressBar from '../ui/ProgressBar';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

export interface TaskDetailViewProps {
  task: Task | null;
  linkedPlan: Plan | null;
  readOnly?: boolean;
  onClose: () => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onToggleSlot?: (taskId: string, slotIndex: number) => void;
  onMissed?: (taskId: string, allSubtaskIds: string[]) => void;
  onSnooze?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  skipped?: boolean;
  canSkip?: boolean;
  dayNote?: string;
  onSaveDayNote?: (taskId: string, note: string) => void;
  dayLabel?: string;
  onEdit?: () => void;
  presentation?: 'sheet' | 'page';
}

/**
 * Native port of components/activity/TaskDetailView.tsx — a task's
 * occurrence: progress, per-block checkboxes for split tasks, the day note,
 * the subtask checklist and the outcome actions (Done / Later today / Skip /
 * Missed). Same rules as the web, including the `!done` guards that stop
 * Done and Missed from silently undoing a finished task.
 */
export default function TaskDetailView({
  task,
  linkedPlan,
  readOnly = false,
  onClose,
  onToggleSubtask,
  onToggleComplete,
  onToggleSlot,
  onMissed,
  onSnooze,
  onSkip,
  skipped = false,
  canSkip = false,
  dayNote,
  onSaveDayNote,
  dayLabel,
  onEdit,
  presentation = 'sheet',
}: TaskDetailViewProps) {
  const insets = useSafeAreaInsets();
  const isSession = task?.taskType === 'session';

  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const taskId = task?.id;
  useEffect(() => {
    setNoteDraft(null);
  }, [taskId, dayLabel]);

  function commitNote() {
    if (noteDraft === null || !taskId || !onSaveDayNote) return;
    const next = noteDraft.trim();
    setNoteDraft(null);
    if (next !== (dayNote ?? '')) onSaveDayNote(taskId, next);
  }

  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    if (!isTrackedTask(task)) return [];
    if (isSession) return task.subtasks ?? [];
    const base = task.subtasks !== undefined ? task.subtasks : linkedPlan?.items ?? [];
    return [...base].sort(compareDeadline);
  }, [task, isSession, linkedPlan]);

  const today = todayISO();
  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const { completedCount, totalCount, pct } = useMemo(() => calculateTaskProgress(task ?? ({} as Task), items.length), [task, items.length]);
  const state = task ? resolveTaskState(task, items.length) : 'incomplete';
  const phases = task ? phaseProgress(task) : { total: 1, done: 0, isMultiPhase: false, nextIndex: 0, allDone: false };
  const slots = task ? getSlots(task) : [];

  const completePrimary = () => {
    if (!task) return;
    if (phases.isMultiPhase && onToggleSlot) onToggleSlot(task.id, phases.nextIndex);
    else onToggleComplete(task.id, allIds);
  };
  const done = state === 'completed';
  const duration = task ? formatDuration(task.startTime, task.endTime) : '';
  const barPct = done && items.length === 0 ? 100 : pct;

  if (!task) return null;

  const tracked = isTrackedTask(task);
  const eyebrow = linkedPlan?.title ?? (isSession ? 'Session' : tracked ? 'Task' : 'Commitment');

  const secondaryButton = 'min-h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-full border border-neutral-200 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.04]';
  const secondaryText = 'text-[13px] font-semibold text-neutral-500 dark:text-neutral-400';

  const skipToggle =
    onSkip && canSkip ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onSkip(task.id);
          onClose();
        }}
        className={secondaryButton}
      >
        <Icon icon={skipped ? IconArrowBackUp : IconBan} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className={secondaryText}>{skipped ? 'Restore this day' : 'Skip this day'}</Text>
      </Pressable>
    ) : null;

  const summary = (
    <>
      {presentation === 'page' && (
        <View className="flex-row items-start gap-3">
          {tracked && (
            <TaskStatusCheckbox
              state={state}
              readOnly={readOnly}
              label={done ? 'Mark task not done' : 'Mark task done'}
              onClick={() => {
                completePrimary();
                onClose();
              }}
            />
          )}
          <View className="min-w-0 flex-1 pt-0.5">
            <Text className="truncate text-[16px] font-semibold text-neutral-500 dark:text-neutral-400">{eyebrow}</Text>
          </View>
        </View>
      )}

      {items.length > 0 && (
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <ProgressBar pct={barPct} height={10} fillClassName="bg-green-600" />
          </View>
          <Text className="w-10 shrink-0 text-right text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{barPct}%</Text>
        </View>
      )}

      <View className="flex-row items-center gap-3">
        {(task.startTime || task.endTime) && !phases.isMultiPhase ? (
          <Text className="text-[16px] font-bold text-neutral-900 dark:text-white">
            {formatDisplayTime(task.startTime)}
            {task.endTime ? ` – ${formatDisplayTime(task.endTime)}` : ''}
          </Text>
        ) : null}
        {phases.isMultiPhase && (
          <Text className="text-[16px] font-bold text-neutral-900 dark:text-white">
            {phases.done}/{phases.total} blocks done
          </Text>
        )}
        {duration ? (
          <Pill variant="neutral" size="md">
            {duration}
          </Pill>
        ) : null}
        {items.length > 0 && (
          <View className="ml-auto flex-row items-center gap-1.5">
            <Icon icon={IconListCheck} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
            <Text className="text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
              {completedCount}/{totalCount}
            </Text>
          </View>
        )}
      </View>

      {phases.isMultiPhase && (
        <View className="mt-3 gap-1.5">
          {slots.map((slot, i) => {
            const slotDone = resolveSlotState(task, i) === 'completed';
            return (
              <Pressable
                key={`${slot.startTime}-${i}`}
                disabled={readOnly || !onToggleSlot}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: slotDone }}
                accessibilityLabel={`${slotDone ? 'Mark not done' : 'Mark done'}: block ${i + 1} of ${phases.total}, ${formatDisplayTime(slot.startTime)} to ${formatDisplayTime(slot.endTime)}`}
                onPress={() => onToggleSlot?.(task.id, i)}
                className={`w-full flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${readOnly || !onToggleSlot ? 'opacity-60' : ''} ${
                  slotDone ? 'bg-neutral-50 dark:bg-white/[0.02]' : 'bg-neutral-100/70 dark:bg-white/[0.03]'
                }`}
              >
                <View
                  className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    slotDone ? 'border-transparent bg-green-500' : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {slotDone && <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-white" />}
                </View>
                <Text
                  className={`text-[14px] font-semibold ${slotDone ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-100'}`}
                >
                  {formatDisplayTime(slot.startTime)} – {formatDisplayTime(slot.endTime)}
                </Text>
                <Text className="ml-auto text-[12px] font-medium text-neutral-500 dark:text-neutral-400">Block {i + 1}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  const noteLabel = dayLabel ? `Note for ${dayLabel}` : 'Note for this day';
  const dayNoteBlock =
    !onSaveDayNote || (readOnly && !dayNote) ? null : (
      <View className="rounded-xl bg-neutral-50 px-3.5 py-3 dark:bg-white/[0.04]">
        <View className="flex-row items-center gap-1.5">
          <Icon icon={IconNotes} size={12} strokeWidth={2.2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
          <Text className="text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">{noteLabel}</Text>
        </View>
        {noteDraft !== null ? (
          <TextInput
            autoFocus
            multiline
            value={noteDraft}
            onChangeText={setNoteDraft}
            onBlur={commitNote}
            placeholder="What happened today?"
            accessibilityLabel={noteLabel}
            textAlignVertical="top"
            className="mt-2 min-h-[76px] w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-[16px] leading-relaxed text-neutral-900 focus:border-emerald-500/70 dark:border-white/[0.10] dark:bg-neutral-900 dark:text-white"
          />
        ) : dayNote ? (
          <Pressable accessibilityRole="button" disabled={readOnly} onPress={() => setNoteDraft(dayNote)} className="mt-1.5 w-full">
            <Text className="text-[14px] leading-relaxed text-neutral-700 dark:text-neutral-200">{dayNote}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setNoteDraft('')} className="mt-1.5">
            <Text className="text-[14px] text-neutral-500 dark:text-neutral-400">Add a note for this day</Text>
          </Pressable>
        )}
      </View>
    );

  const checklist = (
    <>
      {task.description ? <Text className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{task.description}</Text> : null}
      {dayNoteBlock}
      {items.length > 0 && (
        <View className="gap-2">
          {items.map((item) => (
            <TaskChecklistItem
              key={item.id}
              item={item}
              isDone={(task.completedSubtaskIds ?? []).includes(item.id)}
              state={state === 'missed' ? 'missed' : 'incomplete'}
              today={today}
              readOnly={readOnly}
              onToggle={() => onToggleSubtask(task.id, item.id)}
            />
          ))}
        </View>
      )}
    </>
  );

  const snoozeButton =
    tracked && !done && onSnooze ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onSnooze(task.id);
          onClose();
        }}
        className={secondaryButton}
      >
        <Icon icon={IconClockHour4} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className={secondaryText}>Later today</Text>
      </Pressable>
    ) : null;

  const actions: ReactNode = readOnly ? (
    skipToggle ? (
      <View className="mt-1 flex-row">{skipToggle}</View>
    ) : (
      <View className="mt-1 rounded-full bg-neutral-100 py-3 dark:bg-white/[0.04]">
        <Text className="text-center text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Read-only — past day</Text>
      </View>
    )
  ) : (
    <View className="mt-1 gap-2">
      {tracked && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (!done) completePrimary();
            onClose();
          }}
          className={`min-h-[48px] w-full flex-row items-center justify-center gap-1.5 rounded-full px-4 active:scale-[0.97] ${
            done ? 'bg-green-600/10 dark:bg-emerald-400/[0.12]' : 'bg-[#008236] active:bg-[#006B2C] dark:bg-[#2FD46E]'
          }`}
        >
          <Icon
            icon={IconCheck}
            size={18}
            strokeWidth={2.6}
            className={done ? 'text-green-700 dark:text-emerald-300' : 'text-white dark:text-neutral-950'}
          />
          <Text className={`text-[14px] font-bold ${done ? 'text-green-700 dark:text-emerald-300' : 'text-white dark:text-neutral-950'}`}>
            {done ? 'Completed' : 'Done'}
          </Text>
        </Pressable>
      )}

      {(snoozeButton || skipToggle) && (
        <View className="flex-row items-center gap-2.5">
          {snoozeButton}
          {skipToggle}
        </View>
      )}

      {tracked && !done && onMissed && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onMissed(task.id, allIds);
            onClose();
          }}
          className="min-h-[44px] w-full flex-row items-center justify-center gap-1.5 rounded-full active:scale-[0.97] active:bg-rose-500/[0.06] dark:active:bg-rose-500/[0.08]"
        >
          <Icon icon={IconX} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
          <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Mark as missed</Text>
        </Pressable>
      )}
    </View>
  );

  if (presentation === 'page') {
    return (
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <DetailHeader
          title={task.title}
          onBack={onClose}
          actions={
            onEdit
              ? [
                  {
                    icon: IconEdit,
                    label: 'Edit task',
                    onClick: () => {
                      onEdit();
                      onClose();
                    },
                  },
                ]
              : undefined
          }
        />
        <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
          <View className="gap-4 px-5 pb-4 pt-5">
            {summary}
            {checklist}
          </View>
        </ScrollView>
        <View
          className="shrink-0 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950"
          style={{ paddingBottom: Math.max(12, insets.bottom) }}
        >
          {actions}
        </View>
      </View>
    );
  }

  return (
    <View className="relative gap-4 px-5 pb-8 pt-5">
      <View className="absolute right-4 top-4 z-10 flex-row items-center gap-1">
        {onEdit && (
          <IconButton
            label="Edit task"
            variant="soft"
            size="md"
            radius="full"
            onPress={() => {
              onEdit();
              onClose();
            }}
          >
            <Icon icon={IconEdit} size={18} strokeWidth={2.2} className={ICON_BUTTON_TONE.soft} />
          </IconButton>
        )}
        <IconButton label="Close" variant="soft" size="md" radius="full" onPress={onClose}>
          <Icon icon={IconX} size={18} strokeWidth={2.2} className={ICON_BUTTON_TONE.soft} />
        </IconButton>
      </View>
      <View className="flex-row items-start gap-2.5 pr-9">
        {tracked && (
          <View className="mt-0.5">
            <TaskStatusCheckbox
              state={state}
              readOnly={readOnly}
              label={done ? 'Mark task not done' : 'Mark task done'}
              onClick={() => {
                completePrimary();
                onClose();
              }}
            />
          </View>
        )}
        <View className="min-w-0 flex-1">
          <Text className="truncate text-[20px] font-bold leading-tight text-neutral-900 dark:text-white">{task.title}</Text>
          <Text className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">{eyebrow}</Text>
        </View>
      </View>
      {summary}
      {checklist}
      {actions}
    </View>
  );
}
