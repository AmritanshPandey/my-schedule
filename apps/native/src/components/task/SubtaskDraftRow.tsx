import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowDown, IconArrowUp, IconClock, IconCopy, IconCornerDownRight, IconTrash } from '@tabler/icons-react-native';
import type { DeadlineScope } from '@planr/core/lib/subtaskDeadline';
import { parseDurationMinutes, formatMinutes } from '@planr/core/lib/timeUtils';
import { buildDeleteConfirmationCopy } from '@planr/core/lib/deleteConfirm';
import { haptic } from '../../lib/haptics';
import IconButton from '../ui/IconButton';
import { FORM_CONTROL_BASE } from '../ui/Input';
import ConfirmSheet from '../ui/ConfirmSheet';
import DateInput from '../ui/DateInput';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

export interface SubtaskDraft {
  id: string;
  title: string;
  info?: string;
  duration?: string;
  timeMinutes?: number;
  deadline?: string;
  deadlineScope?: DeadlineScope;
}

const SCOPE_LABEL: Record<DeadlineScope, string> = { day: 'Day', week: 'Wk', month: 'Mo' };

const ROW_INPUT = `${FORM_CONTROL_BASE} bg-white px-3 text-[16px] focus:bg-white dark:bg-white/[0.04] dark:focus:bg-white/[0.07]`;

/**
 * Native port of components/task/SubtaskDraftRow.tsx — one editable subtask
 * (name, time budget, detail, info, optional deadline). The web reorders by
 * dragging a grip; here the same reorder is two move buttons, since the web's
 * drag library has no native counterpart in this app.
 */
function SubtaskDraftRow({
  draft,
  onChange,
  onDelete,
  onDuplicate,
  onCopyToTask,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  autoFocus,
  showDeadline,
}: {
  draft: SubtaskDraft;
  onChange: (id: string, updated: SubtaskDraft) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onCopyToTask?: (id: string) => void;
  onMove?: (id: string, direction: 'up' | 'down') => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  autoFocus?: boolean;
  showDeadline?: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCopy = buildDeleteConfirmationCopy('subtask', {
    name: draft.title.trim() || undefined,
    description: 'This subtask will be removed from the task.',
  });

  const [timeText, setTimeText] = useState(() => (draft.timeMinutes != null ? formatMinutes(draft.timeMinutes) : ''));
  const timeInvalid = timeText.trim() !== '' && parseDurationMinutes(timeText) == null;
  function handleTimeChange(text: string) {
    setTimeText(text);
    const mins = parseDurationMinutes(text);
    onChange(draft.id, { ...draft, timeMinutes: mins != null && mins > 0 ? mins : undefined });
  }

  return (
    <View className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <View className="flex-row items-start gap-2">
        {onMove && (
          <View className="shrink-0 items-center gap-0.5">
            <IconButton label="Move subtask up" variant="ghost" size="xs" radius="lg" disabled={!canMoveUp} onPress={() => onMove(draft.id, 'up')}>
              <Icon icon={IconArrowUp} size={14} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
            <IconButton label="Move subtask down" variant="ghost" size="xs" radius="lg" disabled={!canMoveDown} onPress={() => onMove(draft.id, 'down')}>
              <Icon icon={IconArrowDown} size={14} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
          </View>
        )}

        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row flex-wrap gap-2">
            <TextInput
              autoFocus={autoFocus}
              value={draft.title ?? ''}
              onChangeText={(v) => onChange(draft.id, { ...draft, title: v })}
              placeholder="Name"
              accessibilityLabel="Subtask name"
              autoComplete="off"
              className={`h-10 min-w-[150px] flex-1 font-semibold ${ROW_INPUT}`}
            />
            <View className="relative h-10 w-[112px] shrink-0 justify-center">
              <View pointerEvents="none" className="absolute left-2.5 z-10">
                <Icon icon={IconClock} size={13} strokeWidth={2.2} className={timeInvalid ? 'text-rose-500 dark:text-rose-400' : 'text-blue-500 dark:text-blue-400'} />
              </View>
              <TextInput
                value={timeText}
                onChangeText={handleTimeChange}
                placeholder="15min"
                accessibilityLabel="Subtask time (minutes or hours)"
                autoComplete="off"
                className={`h-10 w-full text-center font-bold ${ROW_INPUT} pl-6 ${
                  timeInvalid ? 'border-rose-400 text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                }`}
              />
            </View>
          </View>

          {timeInvalid && <Text className="text-[11px] font-semibold text-rose-500 dark:text-rose-400">Use a time like 15min, 1h, or 1h30m.</Text>}

          <View className="flex-row flex-wrap items-center gap-2">
            <TextInput
              value={draft.duration ?? ''}
              onChangeText={(v) => onChange(draft.id, { ...draft, duration: v })}
              placeholder="Detail · optional"
              accessibilityLabel="Subtask detail"
              autoComplete="off"
              className={`h-10 min-w-[120px] flex-1 font-semibold text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
            <TextInput
              value={draft.info ?? ''}
              onChangeText={(v) => onChange(draft.id, { ...draft, info: v })}
              placeholder="Info"
              accessibilityLabel="Subtask info"
              autoComplete="off"
              className={`h-10 min-w-[120px] flex-1 text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
          </View>
          {showDeadline && (
            <View className="gap-1.5">
              <DateInput
                value={draft.deadline ?? ''}
                placeholder="Deadline · optional"
                clearable
                onChange={(v) =>
                  onChange(draft.id, {
                    ...draft,
                    deadline: v || undefined,
                    deadlineScope: v ? draft.deadlineScope ?? 'day' : undefined,
                  })
                }
              />
              {draft.deadline ? (
                <View className="flex-row gap-1">
                  {(['day', 'week', 'month'] as const).map((scope) => {
                    const on = (draft.deadlineScope ?? 'day') === scope;
                    return (
                      <Pressable
                        key={scope}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => onChange(draft.id, { ...draft, deadlineScope: scope })}
                        className={`h-9 justify-center rounded-lg px-2.5 ${on ? 'bg-neutral-900 dark:bg-white' : 'border border-neutral-200 dark:border-white/10'}`}
                      >
                        <Text className={`text-[12px] font-bold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{SCOPE_LABEL[scope]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View className="shrink-0 items-center gap-0.5">
          {onDuplicate && (
            <IconButton
              label="Duplicate subtask"
              variant="ghost"
              size="xs"
              radius="lg"
              onPress={() => {
                haptic('light');
                onDuplicate(draft.id);
              }}
            >
              <Icon icon={IconCopy} size={15} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
          )}
          {onCopyToTask && (
            <IconButton
              label="Copy subtask to another task"
              variant="ghost"
              size="xs"
              radius="lg"
              onPress={() => {
                haptic('light');
                onCopyToTask(draft.id);
              }}
            >
              <Icon icon={IconCornerDownRight} size={15} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
          )}
          <IconButton
            label="Delete subtask"
            variant="dangerGhost"
            size="xs"
            radius="lg"
            onPress={() => {
              haptic('light');
              setDeleteOpen(true);
            }}
          >
            <Icon icon={IconTrash} size={15} className="text-neutral-500 dark:text-neutral-400" />
          </IconButton>
        </View>
      </View>

      <ConfirmSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          onDelete(draft.id);
          setDeleteOpen(false);
        }}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel={deleteCopy.confirmLabel}
      />
    </View>
  );
}

export default memo(SubtaskDraftRow);
