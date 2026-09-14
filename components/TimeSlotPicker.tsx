"use client";

import { useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { DayKey } from "@/lib/useScheduleDB";
import { parseTimeToMinutes, minutesToInputTime, currentMinutes, formatDisplayTime } from "@/lib/timeUtils";
import AddRowButton from "@/components/ui/AddRowButton";
import TimeInput from "@/components/ui/TimeInput";
import { typography } from "@/components/ui/Typography";
import type { UsualTimeSlot } from "@/lib/usualTimeSlot";

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

function chipClass(active: boolean): string {
  return active
    ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200";
}

const LABEL = typography.eyebrow;

/**
 * One row of presets, introduced by a word rather than by an uppercase eyebrow.
 *
 * These rows used to be three separately-titled sections — SUGGESTED TIMES,
 * QUICK START, DURATION — stacked one under another in identical chip
 * vocabulary. Four rows of interchangeable-looking pills where the pills mean
 * completely different things (a whole slot / a start / a length), and the only
 * thing telling them apart was a 2.6:1 grey caption above each. DESIGN.md bans
 * the eyebrow-above-every-section habit outright; the lead-in also does the job
 * better, because "Start · Now Morning" and "For · 15m 30m" read as sentences
 * and no longer need the "pick a start, then tap a duration" instruction that
 * sat underneath explaining how to operate the control.
 */
function PresetRow({ lead, children }: { lead: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[52px] shrink-0 pt-[7px] text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
        {lead}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">{children}</div>
    </div>
  );
}

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
        <p className={LABEL}>{slots.length > 1 ? "Time Slots" : "Time Slot"}</p>
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
              <button
                type="button"
                aria-label={`Remove time slot ${index + 1}`}
                onClick={() => removeSlot(index)}
                className="mb-0.5 flex h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:border-rose-300 hover:text-rose-500 dark:border-white/10 dark:text-neutral-500 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
              >
                <IconX size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>
        ))}
        <AddRowButton label="Add time slot" onClick={addSlot} />
      </div>

      {/*
        Presets: three ways to fill the two fields above, kept together as one
        block instead of three separately-titled sections. See PresetRow.
      */}
      <div className="space-y-2.5">
        {/* Your usual time — personalized, from the user's own scheduling
            history (lib/usualTimeSlot.ts). Distinct from the open-gap
            suggestions below: this is "what you actually do," not "what
            happens to be free." Violet marks personalization throughout this
            app (AddPlanSheet's "Build this with AI instead"). */}
        {usualTimeSlot && (
          <PresetRow lead="Usual">
            <button
              type="button"
              onClick={() => {
                setSelectedDuration(usualTimeSlot.endMinutes - usualTimeSlot.startMinutes);
                patchSlot(activeIndex, {
                  startTime: minutesToInput(usualTimeSlot.startMinutes),
                  endTime: minutesToInput(usualTimeSlot.endMinutes),
                });
              }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 text-[12px] font-semibold text-violet-700 transition-colors hover:border-violet-300 dark:border-violet-500/20 dark:bg-violet-500/[0.08] dark:text-violet-300 dark:hover:border-violet-500/30"
            >
              {formatDisplayTime(minutesToInput(usualTimeSlot.startMinutes))}–{formatDisplayTime(minutesToInput(usualTimeSlot.endMinutes))}
              <span className="font-normal text-violet-600/80 dark:text-violet-300/70">
                · {usualTimeSlot.sampleSize} similar {usualTimeSlot.sampleSize === 1 ? "task" : "tasks"}
              </span>
            </button>
          </PresetRow>
        )}

        {/* Suggested = currently-open gaps in the day being edited. */}
        {suggestedSlots && suggestedSlots.length > 0 && (
          <PresetRow lead="Free">
            {suggestedSlots.map((suggestion) => {
              const startInput = minutesToInput(suggestion.startMinutes);
              const endInput = minutesToInput(suggestion.endMinutes);
              const isActive = active.startTime === startInput && active.endTime === endInput;
              return (
                <button
                  key={`${suggestion.startMinutes}-${suggestion.endMinutes}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setSelectedDuration(suggestion.endMinutes - suggestion.startMinutes);
                    patchSlot(activeIndex, { startTime: startInput, endTime: endInput });
                  }}
                  className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(isActive)}`}
                >
                  {formatDisplayTime(startInput)}–{formatDisplayTime(endInput)}
                </button>
              );
            })}
          </PresetRow>
        )}

        <PresetRow lead={slots.length > 1 ? `Start ${activeIndex + 1}` : "Start"}>
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === "now" ? null : preset.value;
            const isActive = presetMinutes !== null && inputToMinutes(active.startTime) === presetMinutes;
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => applyStart(preset.value === "now" ? currentMinutes() : preset.value)}
                className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(isActive)}`}
              >
                {preset.label}
              </button>
            );
          })}
        </PresetRow>

        <PresetRow lead="For">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={currentDuration === option.minutes}
              onClick={() => applyDuration(option.minutes)}
              className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(currentDuration === option.minutes)}`}
            >
              {option.label}
            </button>
          ))}
        </PresetRow>
      </div>

    </section>
  );
}
