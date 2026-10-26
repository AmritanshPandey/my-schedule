import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IconCheck, IconClock, IconPlus, IconX } from '@tabler/icons-react-native';
import type { DayKey, Ritual, RitualColor, RitualRecurrenceKind, RitualStep, RitualTrackingType } from '@planr/core/lib/scheduleTypes';
import { RITUAL_COLORS } from '@planr/core/lib/scheduleTypes';
import { DAYS, DAY_LABELS } from '@planr/core/lib/scheduleConstants';
import { uid } from '@planr/core/lib/id';
import { RITUAL_COLOR_DOT } from '@planr/core/lib/ritualColors';
import { ROUTINE_TEMPLATES, type RoutineTemplateKey } from '@planr/core/lib/routineTemplates';
import { recurrenceToRepeatDays, repeatDaysToRecurrence } from '@planr/core/lib/ritualRecurrence';
import { haptic } from '../../lib/haptics';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import { typography } from '../ui/Typography';
import Button from '../ui/Button';
import TimeInput from '../ui/TimeInput';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import { iconGlyph, SECTION_ICONS } from '../SectionIcons';

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];

const TRACKING_TYPES: { key: RitualTrackingType; label: string }[] = [
  { key: 'checkbox', label: 'Checkbox' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'duration', label: 'Duration' },
  { key: 'count', label: 'Count' },
  { key: 'checklist', label: 'Checklist' },
];

const RECURRENCE_KINDS: { key: RitualRecurrenceKind; label: string }[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'custom', label: 'Custom' },
  { key: 'interval', label: 'Every N days' },
];

/**
 * The web's `ring-2 ring-offset-2 ring-{color}-400` selection ring (from
 * RITUAL_COLOR_SELECT_RING). RN has no ring/offset, so it's a 2px border on a
 * wrapper with 2px of padding — same geometry, same color.
 */
const RITUAL_COLOR_RING_BORDER: Record<RitualColor, string> = {
  rose: 'border-rose-400',
  sky: 'border-sky-400',
  violet: 'border-violet-400',
  amber: 'border-amber-400',
  emerald: 'border-emerald-400',
  fuchsia: 'border-fuchsia-400',
  orange: 'border-orange-400',
  cyan: 'border-cyan-400',
  indigo: 'border-indigo-400',
  teal: 'border-teal-400',
};

const CHIP_ON = 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white';
const CHIP_OFF = 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]';
const CHIP_TEXT_ON = 'text-white dark:text-neutral-900';
const CHIP_TEXT_OFF = 'text-neutral-500 dark:text-neutral-400';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`h-8 justify-center rounded-full border px-3 ${selected ? CHIP_ON : CHIP_OFF}`}
    >
      <Text className={`text-[12px] font-semibold ${selected ? CHIP_TEXT_ON : CHIP_TEXT_OFF}`}>{label}</Text>
    </Pressable>
  );
}

interface RitualSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: Ritual;
  onSave: (data: Omit<Ritual, 'id'>) => void;
  onDelete?: () => void;
}

/**
 * Native port of components/activity/RitualSheet.tsx — create or edit a
 * routine: template picker first (create only), then title/icon/color,
 * schedule (recurrence + time / any time), tracking type with its target,
 * unit and step list, and the advanced fields. Same validation, same saved
 * shape.
 */
export function RitualSheet({ open, onClose, initial, onSave, onDelete }: RitualSheetProps) {
  const isEdit = !!initial;

  const [template, setTemplate] = useState<RoutineTemplateKey | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [time, setTime] = useState('08:00');
  const [anyTime, setAnyTime] = useState(false);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [color, setColor] = useState<RitualColor | ''>('');
  const [icon, setIcon] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [recurrenceKind, setRecurrenceKind] = useState<RitualRecurrenceKind>('daily');
  const [customDays, setCustomDays] = useState<DayKey[]>([]);
  const [intervalDays, setIntervalDays] = useState(2);

  const [trackingType, setTrackingType] = useState<RitualTrackingType>('checkbox');
  const [target, setTarget] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [steps, setSteps] = useState<RitualStep[]>([]);
  const [newStepLabel, setNewStepLabel] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset/pre-fill when sheet opens.
  useEffect(() => {
    if (!open) return;
    setTemplate(isEdit ? 'custom' : null);
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setTime(initial?.time ?? '08:00');
    setAnyTime(initial?.anyTime ?? false);
    setDuration(initial?.duration);
    setColor(initial?.color ?? '');
    setIcon(initial?.icon ?? '');
    setNotes(initial?.notes ?? '');
    const recurrence = initial?.recurrence ?? repeatDaysToRecurrence(initial?.repeatDays);
    setRecurrenceKind(recurrence.kind);
    setCustomDays(recurrence.days ?? initial?.repeatDays ?? []);
    setIntervalDays(recurrence.intervalDays ?? 2);
    setTrackingType(initial?.trackingType ?? 'checkbox');
    setTarget(initial?.target !== undefined ? String(initial.target) : '');
    setUnit(initial?.unit ?? '');
    setSteps(initial?.steps ?? []);
    setShowAdvanced(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(key: RoutineTemplateKey) {
    setTemplate(key);
    const tpl = ROUTINE_TEMPLATES.find((t) => t.key === key);
    if (!tpl || key === 'custom') return;
    const d = tpl.defaults;
    if (d.title !== undefined) setTitle(d.title);
    if (d.time !== undefined) setTime(d.time);
    setAnyTime(!!d.anyTime);
    setColor(tpl.color ?? '');
    setIcon(tpl.icon);
    setTrackingType(d.trackingType ?? 'checkbox');
    setTarget(d.target !== undefined ? String(d.target) : '');
    setUnit(d.unit ?? '');
    setSteps(d.steps ? d.steps.map((s) => ({ ...s, id: uid() })) : []);
    const recurrence = d.recurrence ?? { kind: 'daily' as const };
    setRecurrenceKind(recurrence.kind);
    setCustomDays(recurrence.days ?? []);
  }

  const canSave =
    !!title.trim() &&
    !!time &&
    (trackingType !== 'checklist' || steps.length > 0) &&
    (recurrenceKind !== 'custom' || customDays.length > 0);

  function addStep() {
    const label = newStepLabel.trim();
    if (!label) return;
    setSteps((prev) => [...prev, { id: uid(), label }]);
    setNewStepLabel('');
  }

  function handleSave() {
    if (!canSave) return;
    haptic('medium');
    const recurrence =
      recurrenceKind === 'custom'
        ? { kind: 'custom' as const, days: customDays }
        : recurrenceKind === 'interval'
          ? { kind: 'interval' as const, intervalDays, anchorDate: initial?.recurrence?.anchorDate }
          : { kind: recurrenceKind };
    const repeatDays = recurrenceToRepeatDays(recurrence);
    const parsedTarget = parseFloat(target);
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      time,
      anyTime,
      duration: duration ?? undefined,
      color: color || undefined,
      icon: icon || undefined,
      repeatDays,
      recurrence,
      notes: notes.trim() || undefined,
      sortOrder: initial?.sortOrder,
      trackingType: trackingType === 'checkbox' ? undefined : trackingType,
      target:
        (trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count') && Number.isFinite(parsedTarget) && parsedTarget > 0
          ? parsedTarget
          : undefined,
      unit: unit.trim() || undefined,
      // checklist: steps drive per-item completion. checkbox: steps are
      // an optional, purely descriptive list (undefined when empty).
      steps:
        trackingType === 'checklist'
          ? steps
          : trackingType === 'checkbox' && steps.length > 0
            ? steps
            : undefined,
    });
    onClose();
  }

  function handleClose() {
    onClose();
  }

  const showTemplatePicker = !isEdit && template === null;
  const needsTargetUnit = trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count';
  const fieldBase =
    'rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <View className="px-5 pb-6 pt-2">
        {showTemplatePicker ? (
          <View className="gap-4">
            <SheetHeader eyebrow="Add routine" title="What do you want to track?" onClose={handleClose} />
            <View className="flex-row flex-wrap" style={{ marginHorizontal: -5 }}>
              {ROUTINE_TEMPLATES.map((tpl) => {
                const Glyph = iconGlyph(tpl.icon);
                return (
                  <View key={tpl.key} style={{ width: '50%', padding: 5 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        haptic('light');
                        applyTemplate(tpl.key);
                      }}
                      className="items-start gap-2 rounded-2xl border border-neutral-200 bg-white p-3.5 active:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:active:border-white/20"
                    >
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                        <Icon icon={Glyph} size={17} strokeWidth={1.9} className="text-neutral-500 dark:text-neutral-300" />
                      </View>
                      <Text className="text-[13px] font-bold text-neutral-900 dark:text-white">{tpl.label}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <>
            <SheetHeader eyebrow={isEdit ? 'Edit routine' : 'New routine'} title={title || 'New routine'} onClose={handleClose} />

            <View className="mt-4 gap-5">
              {/* ── Basic ──────────────────────────────────────────────────── */}
              <View className="gap-3">
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  onSubmitEditing={() => {
                    if (canSave) handleSave();
                  }}
                  returnKeyType="done"
                  placeholder="e.g. Skin care, Vitamins, Stretch…"
                  autoFocus={!isEdit}
                  className={`h-11 w-full min-w-0 px-4 text-[16px] font-medium ${fieldBase}`}
                />

                {/* Icon picker */}
                <View>
                  <Text className={`mb-2 ${typography.eyebrow}`}>Icon</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 pb-1">
                    {SECTION_ICONS.map(({ name, icon: Glyph }) => {
                      const selected = icon === name;
                      return (
                        <Pressable
                          key={name}
                          accessibilityRole="button"
                          accessibilityLabel={name}
                          accessibilityState={{ selected }}
                          onPress={() => setIcon((prev) => (prev === name ? '' : name))}
                          className={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            selected ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-100 active:bg-neutral-200 dark:bg-white/[0.06] dark:active:bg-white/[0.10]'
                          }`}
                        >
                          <Icon
                            icon={Glyph}
                            size={16}
                            strokeWidth={1.9}
                            className={selected ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}
                          />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Color */}
                <View>
                  <Text className={`mb-2 ${typography.eyebrow}`}>Color</Text>
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    {RITUAL_COLORS.map((c) => {
                      const selected = color === c;
                      return (
                        <Pressable
                          key={c}
                          accessibilityRole="button"
                          accessibilityLabel={c}
                          accessibilityState={{ selected }}
                          onPress={() => setColor((prev) => (prev === c ? '' : c))}
                          className={`rounded-full border-2 p-[2px] ${selected ? RITUAL_COLOR_RING_BORDER[c] : 'border-transparent'}`}
                        >
                          <View className={`h-7 w-7 rounded-full ${RITUAL_COLOR_DOT[c]} ${selected ? '' : 'opacity-50'}`} />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* ── Schedule ───────────────────────────────────────────────── */}
              <View className="gap-3 border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <Text className={typography.eyebrow}>Schedule</Text>

                <View className="flex-row flex-wrap gap-2">
                  {RECURRENCE_KINDS.map((r) => (
                    <Chip key={r.key} label={r.label} selected={recurrenceKind === r.key} onPress={() => setRecurrenceKind(r.key)} />
                  ))}
                </View>

                {recurrenceKind === 'custom' && (
                  <View className="flex-row flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const sel = customDays.includes(day);
                      return (
                        <Chip
                          key={day}
                          label={DAY_LABELS[day]}
                          selected={sel}
                          onPress={() => setCustomDays((prev) => (sel ? prev.filter((x) => x !== day) : [...prev, day]))}
                        />
                      );
                    })}
                  </View>
                )}

                {recurrenceKind === 'interval' && (
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">Every</Text>
                    <TextInput
                      keyboardType="number-pad"
                      value={String(intervalDays)}
                      onChangeText={(v) => setIntervalDays(Math.max(2, parseInt(v, 10) || 2))}
                      accessibilityLabel="Interval in days"
                      className={`h-9 w-16 px-2 text-center text-[14px] font-semibold ${fieldBase}`}
                    />
                    <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">days</Text>
                  </View>
                )}

                <View className="flex-row items-end gap-3">
                  {/* Disabled, not unmounted, when "Any time" is on — keeps
                      the layout stable and still shows what time it'll
                      revert to. */}
                  <View className="min-w-0 flex-1">
                    <TimeInput label="Time" value={time} onChange={setTime} ariaLabel="Routine time" disabled={anyTime} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: anyTime }}
                    onPress={() => setAnyTime((v) => !v)}
                    className={`h-11 shrink-0 flex-row items-center gap-1.5 rounded-xl border px-3 ${
                      anyTime ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 dark:border-white/10'
                    }`}
                  >
                    <Icon icon={IconClock} size={13} strokeWidth={2.2} className={anyTime ? CHIP_TEXT_ON : CHIP_TEXT_OFF} />
                    <Text className={`text-[12px] font-semibold ${anyTime ? CHIP_TEXT_ON : CHIP_TEXT_OFF}`}>Any time</Text>
                  </Pressable>
                </View>
              </View>

              {/* ── Tracking ───────────────────────────────────────────────── */}
              <View className="gap-3 border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <Text className={typography.eyebrow}>Tracking</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TRACKING_TYPES.map((t) => (
                    <Chip key={t.key} label={t.label} selected={trackingType === t.key} onPress={() => setTrackingType(t.key)} />
                  ))}
                </View>

                {needsTargetUnit && (
                  <View className="flex-row gap-2">
                    <TextInput
                      keyboardType="decimal-pad"
                      value={target}
                      onChangeText={setTarget}
                      placeholder="Goal"
                      className={`h-10 w-24 px-3 text-[14px] font-semibold ${fieldBase}`}
                    />
                    <TextInput
                      value={unit}
                      onChangeText={setUnit}
                      placeholder="Unit (ml, min, reps…)"
                      className={`h-10 flex-1 px-3 text-[14px] font-medium ${fieldBase}`}
                    />
                  </View>
                )}

                {/* Checklist: each item is its own checkbox, and the routine
                    counts done once every item is. Checkbox: items are a reference list
                    only — completing the routine is still one tap. */}
                {(trackingType === 'checklist' || trackingType === 'checkbox') && (
                  <View className="gap-1.5">
                    {trackingType === 'checkbox' && (
                      <Text className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                        Optional — list what this routine covers. These aren't checked off individually; one tap on the routine covers all of them.
                      </Text>
                    )}
                    {steps.map((step) => (
                      <View
                        key={step.id}
                        className="flex-row items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <Text className="flex-1 truncate text-[13px] font-medium tabular-nums text-neutral-800 dark:text-neutral-100">
                          {step.label}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Remove item"
                          hitSlop={10}
                          onPress={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                        >
                          <Icon icon={IconX} size={14} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
                        </Pressable>
                      </View>
                    ))}
                    <View className="flex-row gap-2">
                      <TextInput
                        value={newStepLabel}
                        onChangeText={setNewStepLabel}
                        onSubmitEditing={addStep}
                        blurOnSubmit={false}
                        returnKeyType="done"
                        placeholder={trackingType === 'checklist' ? 'Add a step…' : 'Add an item…'}
                        className={`h-9 flex-1 px-3 text-[13px] ${fieldBase}`}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Add item"
                        onPress={addStep}
                        className="h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 active:bg-neutral-50 dark:border-white/10"
                      >
                        <Icon icon={IconPlus} size={14} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              {/* ── Advanced (progressive disclosure) ─────────────────────── */}
              <View className="border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <Pressable accessibilityRole="button" onPress={() => setShowAdvanced((v) => !v)} hitSlop={8} className="self-start">
                  <Text className="text-[12px] font-semibold text-neutral-500 underline dark:text-neutral-400">
                    {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
                  </Text>
                </Pressable>

                {showAdvanced && (
                  <View className="mt-3 gap-3">
                    <View>
                      <Text className={`mb-1.5 ${typography.eyebrow}`}>
                        Description <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional)</Text>
                      </Text>
                      <TextInput
                        value={description}
                        onChangeText={setDescription}
                        placeholder="A short subtitle"
                        className={`h-10 w-full px-3 text-[13px] ${fieldBase}`}
                      />
                    </View>

                    <View>
                      <Text className={`mb-2 ${typography.eyebrow}`}>
                        Typical duration{' '}
                        <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional, display only)</Text>
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {[undefined, ...DURATION_PRESETS].map((d) => {
                          const selected = duration === d;
                          return (
                            <Pressable
                              key={d ?? 'none'}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setDuration((prev) => (d === undefined ? undefined : prev === d ? undefined : d))}
                              className={`rounded-full px-3 py-1 ${selected ? 'bg-neutral-900 dark:bg-white' : 'border border-neutral-200 dark:border-white/10'}`}
                            >
                              <Text className={`text-[12px] font-semibold ${selected ? CHIP_TEXT_ON : CHIP_TEXT_OFF}`}>{d === undefined ? 'None' : `${d}m`}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View>
                      <Text className={`mb-1.5 ${typography.eyebrow}`}>
                        Notes <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional)</Text>
                      </Text>
                      <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Any notes or reminders…"
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                        className="min-h-[64px] w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* Submit */}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSave }}
                onPress={handleSave}
                disabled={!canSave}
                className={`w-full flex-row items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 dark:bg-white ${canSave ? '' : 'opacity-40'}`}
              >
                <Icon icon={isEdit ? IconCheck : IconPlus} size={16} strokeWidth={2.5} className="text-white dark:text-neutral-950" />
                <Text className="text-[16px] font-bold text-white dark:text-neutral-950">{isEdit ? 'Save routine' : 'Add routine'}</Text>
              </Pressable>

              {isEdit && onDelete && (
                <Button
                  variant="dangerSecondary"
                  fullWidth
                  onPress={() => {
                    haptic('light');
                    onDelete();
                    onClose();
                  }}
                >
                  Delete routine
                </Button>
              )}
            </View>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

export default RitualSheet;
