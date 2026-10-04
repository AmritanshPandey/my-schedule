import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { IconX } from '@tabler/icons-react-native';
import { parseTimeToMinutes, minutesToInputTime, currentMinutes, formatDisplayTime } from '@planr/core/lib/timeUtils';
import type { UsualTimeSlot } from '@planr/core/lib/usualTimeSlot';
import AddRowButton from './ui/AddRowButton';
import TimeInput from './ui/TimeInput';
import { typography } from './ui/Typography';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

const START_PRESETS = [
  { label: 'Now', value: 'now' },
  { label: 'Morning', value: 9 * 60 },
  { label: 'Afternoon', value: 13 * 60 },
  { label: 'Evening', value: 18 * 60 },
] as const;

const DURATION_OPTIONS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '90m', minutes: 90 },
  { label: '2h', minutes: 120 },
];

/** A slot as edited here — times in "HH:MM" 24-hour input format. */
export interface EditableSlot {
  startTime: string;
  endTime: string;
}

const minutesToInput = minutesToInputTime;

function durationMinutes(startTime: string, endTime: string): number | null {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-8 justify-center rounded-full border px-3 ${
        active ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
      }`}
    >
      <Text className={`text-[12px] font-semibold ${active ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{label}</Text>
    </Pressable>
  );
}

function PresetRow({ lead, children }: { lead: string; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-3">
      <Text className="w-[52px] shrink-0 pt-[7px] text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{lead}</Text>
      <View className="min-w-0 flex-1 flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

/**
 * Native port of components/TimeSlotPicker.tsx — the task's time block(s) plus
 * the Usual / Free / Start / For preset rows.
 */
export default function TimeSlotPicker({
  slots,
  onSlotsChange,
  suggestedSlots,
  usualTimeSlot,
}: {
  slots: EditableSlot[];
  onSlotsChange: (slots: EditableSlot[]) => void;
  suggestedSlots?: { startMinutes: number; endMinutes: number }[];
  usualTimeSlot?: UsualTimeSlot | null;
}) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const activeIndex = Math.min(focusedIndex, slots.length - 1);
  const active = slots[activeIndex] ?? { startTime: '', endTime: '' };
  const currentDuration = durationMinutes(active.startTime, active.endTime);
  const durationText = durationLabel(currentDuration);

  function patchSlot(index: number, patch: Partial<EditableSlot>) {
    onSlotsChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    const last = slots[slots.length - 1];
    const lastEnd = last ? parseTimeToMinutes(last.endTime) : null;
    const start = lastEnd ?? currentMinutes();
    const next: EditableSlot = { startTime: minutesToInput(start), endTime: minutesToInput(start + 60) };
    onSlotsChange([...slots, next]);
    setFocusedIndex(slots.length);
    setSelectedDuration(60);
  }

  function removeSlot(index: number) {
    if (slots.length <= 1) return;
    onSlotsChange(slots.filter((_, i) => i !== index));
    setFocusedIndex((prev) => (prev >= index ? Math.max(0, prev - 1) : prev));
  }

  function applyStart(minutes: number) {
    const nextStart = minutesToInput(minutes);
    const preservedDuration = selectedDuration ?? currentDuration;
    patchSlot(activeIndex, {
      startTime: nextStart,
      ...(preservedDuration !== null ? { endTime: minutesToInput(minutes + preservedDuration) } : {}),
    });
  }

  function applyDuration(minutes: number) {
    const start = parseTimeToMinutes(active.startTime) ?? currentMinutes();
    setSelectedDuration(minutes);
    patchSlot(activeIndex, { startTime: minutesToInput(start), endTime: minutesToInput(start + minutes) });
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between gap-3">
        <Text className={typography.eyebrow}>{slots.length > 1 ? 'Time slots' : 'Time slot'}</Text>
        <Text
          className={`text-[12px] font-semibold tabular-nums ${
            currentDuration === null ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-700 dark:text-neutral-300'
          }`}
        >
          {durationText}
        </Text>
      </View>

      <View className="gap-3">
        {slots.map((slot, index) => (
          <View key={index} className="flex-row items-end gap-2">
            <View className="flex-1 flex-row gap-3">
              <View className="flex-1">
                <TimeInput
                  label={slots.length > 1 ? `Start ${index + 1}` : 'Start'}
                  value={slot.startTime}
                  ariaLabel={`${slots.length > 1 ? `Start ${index + 1}` : 'Start'} time`}
                  onFocus={() => setFocusedIndex(index)}
                  onChange={(value) => {
                    setFocusedIndex(index);
                    const preserved = selectedDuration;
                    const start = parseTimeToMinutes(value);
                    patchSlot(index, {
                      startTime: value,
                      ...(preserved !== null && start !== null ? { endTime: minutesToInput(start + preserved) } : {}),
                    });
                  }}
                />
              </View>
              <View className="flex-1">
                <TimeInput
                  label={slots.length > 1 ? `End ${index + 1}` : 'End'}
                  value={slot.endTime}
                  ariaLabel={`${slots.length > 1 ? `End ${index + 1}` : 'End'} time`}
                  onFocus={() => setFocusedIndex(index)}
                  onChange={(value) => {
                    setFocusedIndex(index);
                    setSelectedDuration(null);
                    patchSlot(index, { endTime: value });
                  }}
                />
              </View>
            </View>
            {slots.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove time slot ${index + 1}`}
                onPress={() => removeSlot(index)}
                className="mb-0.5 h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 active:border-rose-300 dark:border-white/10"
              >
                <Icon icon={IconX} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
              </Pressable>
            )}
          </View>
        ))}
        <AddRowButton label="Add time slot" onClick={addSlot} />
      </View>

      <View className="gap-2.5">
        {usualTimeSlot && (
          <PresetRow lead="Usual">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedDuration(usualTimeSlot.endMinutes - usualTimeSlot.startMinutes);
                patchSlot(activeIndex, {
                  startTime: minutesToInput(usualTimeSlot.startMinutes),
                  endTime: minutesToInput(usualTimeSlot.endMinutes),
                });
              }}
              className="h-8 flex-row items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 dark:border-violet-500/20 dark:bg-violet-500/[0.08]"
            >
              <Text className="text-[12px] font-semibold text-violet-700 dark:text-violet-300">
                {formatDisplayTime(minutesToInput(usualTimeSlot.startMinutes))}–{formatDisplayTime(minutesToInput(usualTimeSlot.endMinutes))}
                <Text className="font-normal text-violet-600/80 dark:text-violet-300/70">
                  {` · ${usualTimeSlot.sampleSize} similar ${usualTimeSlot.sampleSize === 1 ? 'task' : 'tasks'}`}
                </Text>
              </Text>
            </Pressable>
          </PresetRow>
        )}

        {suggestedSlots && suggestedSlots.length > 0 && (
          <PresetRow lead="Free">
            {suggestedSlots.map((suggestion) => {
              const startInput = minutesToInput(suggestion.startMinutes);
              const endInput = minutesToInput(suggestion.endMinutes);
              const isActive = active.startTime === startInput && active.endTime === endInput;
              return (
                <Chip
                  key={`${suggestion.startMinutes}-${suggestion.endMinutes}`}
                  active={isActive}
                  label={`${formatDisplayTime(startInput)}–${formatDisplayTime(endInput)}`}
                  onPress={() => {
                    setSelectedDuration(suggestion.endMinutes - suggestion.startMinutes);
                    patchSlot(activeIndex, { startTime: startInput, endTime: endInput });
                  }}
                />
              );
            })}
          </PresetRow>
        )}

        <PresetRow lead={slots.length > 1 ? `Start ${activeIndex + 1}` : 'Start'}>
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === 'now' ? null : preset.value;
            const isActive = presetMinutes !== null && parseTimeToMinutes(active.startTime) === presetMinutes;
            return (
              <Chip key={preset.label} active={isActive} label={preset.label} onPress={() => applyStart(preset.value === 'now' ? currentMinutes() : preset.value)} />
            );
          })}
        </PresetRow>

        <PresetRow lead="For">
          {DURATION_OPTIONS.map((option) => (
            <Chip key={option.label} active={currentDuration === option.minutes} label={option.label} onPress={() => applyDuration(option.minutes)} />
          ))}
        </PresetRow>
      </View>
    </View>
  );
}
