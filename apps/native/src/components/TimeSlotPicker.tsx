import { useState } from 'react';
import { View } from 'react-native';
import { IconX } from '@tabler/icons-react-native';
import { parseTimeToMinutes, minutesToInputTime, currentMinutes, formatDisplayTime } from '@planr/core/lib/timeUtils';
import type { UsualTimeSlot } from '@planr/core/lib/usualTimeSlot';
import AddRowButton from './ui/AddRowButton';
import { ChipRow, ChoiceChip } from './ui/FormChips';
import TimeInput from './ui/TimeInput';
import { typography } from './ui/Typography';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';
import IconButton, { ICON_BUTTON_TONE } from './ui/IconButton';

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
              <IconButton
                label={`Remove time slot ${index + 1}`}
                variant="destructive"
                size="lg"
                onPress={() => removeSlot(index)}
                className="mb-0.5"
              >
                <Icon icon={IconX} size={18} strokeWidth={2.2} className={ICON_BUTTON_TONE.destructive} />
              </IconButton>
            )}
          </View>
        ))}
        <AddRowButton label="Add time slot" onClick={addSlot} />
      </View>

      <View className="gap-5">
        {usualTimeSlot && (
          <ChipRow label="Your usual time">
            <ChoiceChip
              active={false}
              label={`${formatDisplayTime(minutesToInput(usualTimeSlot.startMinutes))}–${formatDisplayTime(minutesToInput(usualTimeSlot.endMinutes))}`}
              detail={` · ${usualTimeSlot.sampleSize} similar ${usualTimeSlot.sampleSize === 1 ? 'task' : 'tasks'}`}
              onPress={() => {
                setSelectedDuration(usualTimeSlot.endMinutes - usualTimeSlot.startMinutes);
                patchSlot(activeIndex, {
                  startTime: minutesToInput(usualTimeSlot.startMinutes),
                  endTime: minutesToInput(usualTimeSlot.endMinutes),
                });
              }}
            />
          </ChipRow>
        )}

        {suggestedSlots && suggestedSlots.length > 0 && (
          <ChipRow label="Free today">
            {suggestedSlots.map((suggestion) => {
              const startInput = minutesToInput(suggestion.startMinutes);
              const endInput = minutesToInput(suggestion.endMinutes);
              const isActive = active.startTime === startInput && active.endTime === endInput;
              return (
                <ChoiceChip
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
          </ChipRow>
        )}

        <ChipRow label={slots.length > 1 ? `Start ${activeIndex + 1} at` : 'Start at'}>
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === 'now' ? null : preset.value;
            const isActive = presetMinutes !== null && parseTimeToMinutes(active.startTime) === presetMinutes;
            return (
              <ChoiceChip key={preset.label} active={isActive} label={preset.label} onPress={() => applyStart(preset.value === 'now' ? currentMinutes() : preset.value)} />
            );
          })}
        </ChipRow>

        <ChipRow label="Duration">
          {DURATION_OPTIONS.map((option) => (
            <ChoiceChip key={option.label} active={currentDuration === option.minutes} label={option.label} onPress={() => applyDuration(option.minutes)} />
          ))}
        </ChipRow>
      </View>
    </View>
  );
}
