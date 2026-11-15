"use client";

import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { DayKey } from "@/lib/useScheduleDB";
import { parseTimeToMinutes, minutesToInputTime, currentMinutes, formatDisplayTime } from "@/lib/timeUtils";
import AddRowButton from "@/components/ui/AddRowButton";
import { ChipRow, ChoiceChip } from "@/components/ui/FormChips";
import TimeInput from "@/components/ui/TimeInput";
import { typography } from "@/components/ui/Typography";
import type { UsualTimeSlot } from "@/lib/usualTimeSlot";
import IconButton from "@/components/ui/IconButton";

const START_PRESETS = [
  { label: "Now", value: "now" },
  { label: "Morning", value: 9 * 60 },
  { label: "Afternoon", value: 13 * 60 },
  { label: "Evening", value: 18 * 60 },
] as const;

const DURATION_OPTIONS = [
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "45m", minutes: 45 },
  { label: "1h", minutes: 60 },
  { label: "90m", minutes: 90 },
  { label: "2h", minutes: 120 },
];

/** A slot as edited here — times in HTML input format ("HH:MM"). */
export interface EditableSlot {
  startTime: string;
  endTime: string;
}

/**
 * Times only. The weekday row that used to live at the bottom of this component
 * moved next to "Repeat" in TaskSheet, where it belongs: "Visible on: Mon, Wed"
 * and "Repeat: Weekly" were two labelled sections answering one question, and
 * the reader had to hold them together across an unrelated block of controls.
 */
interface TimeSlotPickerProps {
  slots: EditableSlot[];
  onSlotsChange: (slots: EditableSlot[]) => void;
  /** Open windows for the day being edited, in schedule-day minutes (see
   *  lib/availableSlots.ts). Omitted/empty hides the section entirely. */
  suggestedSlots?: { startMinutes: number; endMinutes: number }[];
  /** The user's typical time for tasks like this one (see lib/usualTimeSlot.ts).
   *  Omitted/null hides the section — including when there isn't enough
   *  history yet, or the usual slot would conflict with something already
   *  scheduled that day. */
  usualTimeSlot?: UsualTimeSlot | null;
}

// inputToMinutes: parse "HH:MM" input format
function inputToMinutes(value: string): number | null {
  return parseTimeToMinutes(value);
}

const minutesToInput = minutesToInputTime;

function durationMinutes(startTime: string, endTime: string): number | null {
  const start = inputToMinutes(startTime);
  const end = inputToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function durationLabel(minutes: number | null): string {
  // An em dash, not "Set time": this is the slot's length, and a readout that
  // swaps a value for an instruction reads as a button you can press. The
  // subtask-time readout in TaskSheet already shows "—" for the same state.
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

const LABEL = typography.eyebrow;

export default function TimeSlotPicker({
  slots,
  onSlotsChange,
  suggestedSlots,
  usualTimeSlot,
}: TimeSlotPickerProps) {
  // Presets/duration act on the focused (most recently touched) slot.
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const activeIndex = Math.min(focusedIndex, slots.length - 1);
  const active = slots[activeIndex] ?? { startTime: "", endTime: "" };
  const currentDuration = durationMinutes(active.startTime, active.endTime);
  const durationText = durationLabel(currentDuration);

  function patchSlot(index: number, patch: Partial<EditableSlot>) {
    onSlotsChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSlot() {
    // Seed the new slot an hour after the last one ends, if parseable.
    const last = slots[slots.length - 1];
    const lastEnd = last ? inputToMinutes(last.endTime) : null;
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
    const start = inputToMinutes(active.startTime) ?? currentMinutes();
    setSelectedDuration(minutes);
    patchSlot(activeIndex, { startTime: minutesToInput(start), endTime: minutesToInput(start + minutes) });
  }

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>{slots.length > 1 ? "Time slots" : "Time slot"}</p>
        <p className={`text-[12px] font-semibold tabular-nums ${currentDuration === null ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-700 dark:text-neutral-300"}`}>
          {durationText}
        </p>
      </div>

      {/* Slot rows */}
      <div className="space-y-3">
        {slots.map((slot, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="grid flex-1 grid-cols-2 gap-3">
                <TimeInput
                label={slots.length > 1 ? `Start ${index + 1}` : "Start"}
                value={slot.startTime}
                  ariaLabel={`${slots.length > 1 ? `Start ${index + 1}` : "Start"} time`}
                onFocus={() => setFocusedIndex(index)}
                onChange={(value) => {
                  setFocusedIndex(index);
                  const preserved = selectedDuration;
                  const start = inputToMinutes(value);
                  patchSlot(index, {
                    startTime: value,
                    ...(preserved !== null && start !== null ? { endTime: minutesToInput(start + preserved) } : {}),
                  });
                }}
              />
                <TimeInput
                label={slots.length > 1 ? `End ${index + 1}` : "End"}
                value={slot.endTime}
                  ariaLabel={`${slots.length > 1 ? `End ${index + 1}` : "End"} time`}
                onFocus={() => setFocusedIndex(index)}
                onChange={(value) => {
                  setFocusedIndex(index);
                  setSelectedDuration(null);
                  patchSlot(index, { endTime: value });
                }}
              />
            </div>
            {slots.length > 1 && (
              <IconButton
                label={`Remove time slot ${index + 1}`}
                variant="destructive"
                size="lg"
                onClick={() => removeSlot(index)}
                className="mb-0.5"
              >
                <IconX size={18} strokeWidth={2.2} />
              </IconButton>
            )}
          </div>
        ))}
        <AddRowButton label="Add time slot" onClick={addSlot} />
      </div>

      {/* Presets: quick ways to fill the two fields above, each a labelled
          row of 44px chips that scrolls sideways on a phone (ui/FormChips). */}
      <div className="space-y-5">
        {/* Your usual time — personalized, from the user's own scheduling
            history (lib/usualTimeSlot.ts): "what you actually do," not
            "what happens to be free." */}
        {usualTimeSlot && (
          <ChipRow label="Your usual time">
            <ChoiceChip
              active={false}
              label={`${formatDisplayTime(minutesToInput(usualTimeSlot.startMinutes))}–${formatDisplayTime(minutesToInput(usualTimeSlot.endMinutes))}`}
              detail={`· ${usualTimeSlot.sampleSize} similar ${usualTimeSlot.sampleSize === 1 ? "task" : "tasks"}`}
              onClick={() => {
                setSelectedDuration(usualTimeSlot.endMinutes - usualTimeSlot.startMinutes);
                patchSlot(activeIndex, {
                  startTime: minutesToInput(usualTimeSlot.startMinutes),
                  endTime: minutesToInput(usualTimeSlot.endMinutes),
                });
              }}
            />
          </ChipRow>
        )}

        {/* Suggested = currently-open gaps in the day being edited. */}
        {suggestedSlots && suggestedSlots.length > 0 && (
          <ChipRow label="Free today">
            {suggestedSlots.map((suggestion) => {
              const startInput = minutesToInput(suggestion.startMinutes);
              const endInput = minutesToInput(suggestion.endMinutes);
              return (
                <ChoiceChip
                  key={`${suggestion.startMinutes}-${suggestion.endMinutes}`}
                  active={active.startTime === startInput && active.endTime === endInput}
                  label={`${formatDisplayTime(startInput)}–${formatDisplayTime(endInput)}`}
                  onClick={() => {
                    setSelectedDuration(suggestion.endMinutes - suggestion.startMinutes);
                    patchSlot(activeIndex, { startTime: startInput, endTime: endInput });
                  }}
                />
              );
            })}
          </ChipRow>
        )}

        <ChipRow label={slots.length > 1 ? `Start ${activeIndex + 1} at` : "Start at"}>
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === "now" ? null : preset.value;
            return (
              <ChoiceChip
                key={preset.label}
                active={presetMinutes !== null && inputToMinutes(active.startTime) === presetMinutes}
                label={preset.label}
                onClick={() => applyStart(preset.value === "now" ? currentMinutes() : preset.value)}
              />
            );
          })}
        </ChipRow>

        <ChipRow label="Duration">
          {DURATION_OPTIONS.map((option) => (
            <ChoiceChip key={option.label} active={currentDuration === option.minutes} label={option.label} onClick={() => applyDuration(option.minutes)} />
          ))}
        </ChipRow>
      </div>

    </section>
  );
}
