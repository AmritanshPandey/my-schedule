import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowDown, IconArrowUp, IconBarbell, IconTrendingUp, IconClock, IconCopy, IconCornerDownRight, IconTrash } from '@tabler/icons-react-native';
import type { DeadlineScope } from '@planr/core/lib/subtaskDeadline';
import { parseDurationMinutes, formatMinutes } from '@planr/core/lib/timeUtils';
import { buildDeleteConfirmationCopy } from '@planr/core/lib/deleteConfirm';
import type { SubtaskDraft } from '@planr/core/lib/subtaskDraft';
import type { SubtaskTargets } from '@planr/core/lib/scheduleEntry';
import { hasStrengthTargets } from '@planr/core/lib/subtaskTargets';
import { DEFAULT_PROGRESSION_THRESHOLD } from '@planr/core/lib/subtaskProgression';
import type { SubtaskProgression } from '@planr/core/lib/scheduleEntry';
import { todayISO } from '@planr/core/lib/dateUtils';
import { ChoiceChip } from '../ui/FormChips';
import { haptic } from '../../lib/haptics';
import IconButton from '../ui/IconButton';
import { FORM_CONTROL_BASE } from '../ui/Input';
import ConfirmSheet from '../ui/ConfirmSheet';
import DateInput from '../ui/DateInput';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

export type { SubtaskDraft };

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
  itemFields = [],
  showStrength = false,
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
  /** Per-item figures the task's category uses — quantity for ingredients, quantity and cost for shopping (lib/taskFields.ts). */
  itemFields?: ReadonlyArray<'quantity' | 'cost'>;
  /** Show sets / reps / weight / rest without asking — a strength task's exercises (lib/taskFields.ts showsStrengthFields). */
  showStrength?: boolean;
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

  // Sets / reps / weight / rest stay tucked away until asked for — most
  // subtasks are not lifts — but open on their own once any is set, and
  // always for a strength task's exercises (showStrength).
  const [strengthOpen, setStrengthOpen] = useState(() => hasStrengthTargets(draft.targets) || draft.restSeconds != null);
  function setTarget(key: keyof SubtaskTargets, value: SubtaskTargets[keyof SubtaskTargets]) {
    setStrengthOpen(true); // stays in view if the task then moves to another category
    onChange(draft.id, { ...draft, targets: { ...draft.targets, [key]: value } });
  }
  const weightUnit = draft.targets?.weightUnit ?? 'kg';
  // Local text so a half-typed "2." keeps its point; the draft gets the number.
  const [costText, setCostText] = useState(() => (draft.cost != null ? String(draft.cost) : ''));
  function handleCostChange(raw: string) {
    setCostText(raw);
    const n = Number(raw.replace(',', '.'));
    onChange(draft.id, { ...draft, cost: raw.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : n });
  }

  // A strength task's exercise leads with its sets and weight, so its time
  // moves down beside the details; everything else keeps its time by the name.
  // The time counts toward the task's allotted-time budget.
  const timeField = (
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
  );
  const timeError = timeInvalid && <Text className="text-[11px] font-semibold text-rose-500 dark:text-rose-400">Use a time like 15min, 1h, or 1h30m.</Text>;
  const strengthFields = (
    <View className="flex-row flex-wrap gap-2">
      <StrengthField label="Sets" value={draft.targets?.sets} placeholder="3" decimal={false} onChange={(n) => setTarget('sets', n)} />
      <StrengthField label="Reps" value={draft.targets?.reps} placeholder="10" decimal={false} onChange={(n) => setTarget('reps', n)} />
      <StrengthField
        label="Weight"
        value={draft.targets?.weight}
        placeholder="0"
        decimal
        onChange={(n) => setTarget('weight', n)}
        suffix={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Weight unit: ${weightUnit}. Switch to ${weightUnit === 'kg' ? 'lb' : 'kg'}`}
            onPress={() => setTarget('weightUnit', weightUnit === 'kg' ? 'lb' : 'kg')}
            className="h-11 min-w-11 items-center justify-center px-2"
          >
            <Text className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">{weightUnit}</Text>
          </Pressable>
        }
      />
      <StrengthField
        label="Rest"
        value={draft.restSeconds}
        placeholder="90"
        decimal={false}
        onChange={(n) => { setStrengthOpen(true); onChange(draft.id, { ...draft, restSeconds: n }); }}
        suffix={<Text className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">s</Text>}
      />
      <View className="w-full">
        <ProgressionFields value={draft.progression} onChange={(progression) => onChange(draft.id, { ...draft, progression })} />
      </View>
    </View>
  );

  return (
    <View className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <View className="flex-row items-start gap-2">
        {onMove && (
          <View className="shrink-0 items-center gap-0.5">
            <IconButton label="Move subtask up" variant="ghost" size="sm" disabled={!canMoveUp} onPress={() => onMove(draft.id, 'up')}>
              <Icon icon={IconArrowUp} size={14} className="text-neutral-500 dark:text-neutral-400" />
            </IconButton>
            <IconButton label="Move subtask down" variant="ghost" size="sm" disabled={!canMoveDown} onPress={() => onMove(draft.id, 'down')}>
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
            {itemFields.includes('quantity') && (
              <TextInput
                value={draft.quantity ?? ''}
                onChangeText={(v) => onChange(draft.id, { ...draft, quantity: v })}
                placeholder="Qty"
                accessibilityLabel="Quantity"
                autoComplete="off"
                className={`h-10 w-[88px] shrink-0 text-center ${ROW_INPUT}`}
              />
            )}
            {itemFields.includes('cost') && (
              <TextInput
                value={costText}
                onChangeText={handleCostChange}
                placeholder="Cost"
                accessibilityLabel="Cost"
                keyboardType="decimal-pad"
                autoComplete="off"
                className={`h-10 w-[88px] shrink-0 text-center ${ROW_INPUT}`}
                style={{ fontVariant: ['tabular-nums'] }}
              />
            )}
            {!showStrength && timeField}
          </View>

          {!showStrength && timeError}

          {showStrength && strengthFields}

          <View className="flex-row flex-wrap items-center gap-2">
            {showStrength && timeField}
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
          {showStrength && timeError}
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
                        className={`h-11 justify-center rounded-xl px-3 ${on ? 'bg-neutral-900 dark:bg-white' : 'border border-neutral-200 dark:border-white/10'}`}
                      >
                        <Text className={`text-[14px] font-semibold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-200'}`}>{SCOPE_LABEL[scope]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}

          {showStrength ? null : strengthOpen ? (
            strengthFields
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStrengthOpen(true)}
              className="h-11 flex-row items-center gap-1.5 self-start rounded-full px-3 active:bg-neutral-100 dark:active:bg-white/[0.06]"
            >
              <Icon icon={IconBarbell} size={16} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
              <Text className="text-[14px] font-semibold text-neutral-600 dark:text-neutral-300">Sets & weight</Text>
            </Pressable>
          )}
        </View>

        <View className="shrink-0 items-center gap-0.5">
          {onDuplicate && (
            <IconButton
              label="Duplicate subtask"
              variant="ghost"
              size="sm"
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
              size="sm"
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
            variant="destructive"
            size="sm"
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

const CADENCES = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
] as const;
const FIGURES = [
  { value: 'all', label: 'All' },
  { value: 'weight', label: 'Weight' },
  { value: 'reps', label: 'Reps' },
  { value: 'sets', label: 'Sets' },
  { value: 'minutes', label: 'Minutes' },
] as const;

/** Native port of the web's "Increase over time" fields — off until asked for. */
function ProgressionFields({ value, onChange }: { value: SubtaskProgression | undefined; onChange: (next: SubtaskProgression | undefined) => void }) {
  if (!value) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange({ percent: 5, cadence: 'weekly', figure: 'all', threshold: DEFAULT_PROGRESSION_THRESHOLD, startISO: todayISO() })}
        className="h-11 flex-row items-center gap-1.5 self-start rounded-full px-3 active:bg-neutral-100 dark:active:bg-white/[0.06]"
      >
        <Icon icon={IconTrendingUp} size={16} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
        <Text className="text-[14px] font-semibold text-neutral-600 dark:text-neutral-300">Increase over time</Text>
      </Pressable>
    );
  }
  const set = (patch: Partial<SubtaskProgression>) => onChange({ ...value, ...patch });
  return (
    <View className="gap-3 rounded-xl bg-white/70 p-3 dark:bg-white/[0.03]">
      <View className="flex-row items-center justify-between">
        <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">Increase over time</Text>
        <Pressable accessibilityRole="button" onPress={() => onChange(undefined)} className="h-11 justify-center px-2">
          <Text className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">Turn off</Text>
        </Pressable>
      </View>
      <View className="flex-row gap-2">
        <StrengthField
          label="Increase by"
          value={value.percent}
          placeholder="5"
          decimal
          onChange={(n) => { if (n != null && n > 0 && n <= 100) set({ percent: n }); }}
          suffix={<Text className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">%</Text>}
        />
        <StrengthField
          label="When done at least"
          value={value.threshold}
          placeholder="80"
          decimal={false}
          onChange={(n) => { if (n != null && n >= 1 && n <= 100) set({ threshold: Math.round(n) }); }}
          suffix={<Text className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">%</Text>}
        />
      </View>
      <View>
        <Text className="mb-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Every</Text>
        <View className="flex-row flex-wrap gap-2">
          {CADENCES.map((c) => (
            <ChoiceChip key={c.value} active={value.cadence === c.value} label={c.label} onPress={() => set({ cadence: c.value })} />
          ))}
        </View>
      </View>
      <View>
        <Text className="mb-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Raise</Text>
        <View className="flex-row flex-wrap gap-2">
          {FIGURES.map((f) => (
            <ChoiceChip key={f.value} active={value.figure === f.value} label={f.label} onPress={() => set({ figure: f.value })} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** A labelled number field: the label above it, the number pad on the keyboard. */
function StrengthField({
  label,
  value,
  placeholder,
  decimal,
  onChange,
  suffix,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  decimal: boolean;
  onChange: (value: number | undefined) => void;
  suffix?: React.ReactNode;
}) {
  // Local text so a half-typed "22." keeps its point; the draft gets the number.
  const [text, setText] = useState(value != null ? String(value) : '');
  return (
    <View className="min-w-[120px] flex-1 basis-[45%]">
      <Text className="mb-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
      <View className={`h-11 flex-row items-center ${ROW_INPUT} px-0`}>
        <TextInput
          value={text}
          onChangeText={(raw) => {
            setText(raw);
            const n = Number(raw.replace(',', '.'));
            onChange(raw.trim() === '' || !Number.isFinite(n) ? undefined : n);
          }}
          placeholder={placeholder}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          accessibilityLabel={label}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 px-3 text-[16px] font-semibold text-neutral-900 dark:text-white"
          style={{ fontVariant: ['tabular-nums'] }}
        />
        {suffix}
      </View>
    </View>
  );
}

export default memo(SubtaskDraftRow);
