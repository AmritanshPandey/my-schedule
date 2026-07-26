"use client";

import { useState } from "react";
import { IconPlus, IconX } from "@tabler/icons-react";
import type { DayKey } from "@/lib/useScheduleDB";
import { parseTimeToMinutes, minutesToInputTime, currentMinutes } from "@/lib/timeUtils";
import { stopTextEditKeyPropagation } from "@/lib/keyboardEvents";

const REPEAT_DAYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DAY_LABELS: Record<DayKey, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

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

interface TimeSlotPickerProps {
  slots: EditableSlot[];
  onSlotsChange: (slots: EditableSlot[]) => void;
  activeDay?: DayKey;
  repeatDays?: DayKey[];
  onRepeatDaysChange?: (days: DayKey[]) => void;
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

function TimeInput({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
}) {
  return (
    <div>
      <p className={`mb-1.5 ${LABEL}`}>{label}</p>
      <input
        type="time"
        step={60}
        value={value}
        aria-label={`${label} time`}
        onFocus={onFocus}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={stopTextEditKeyPropagation}
        className="h-11 w-full min-w-0 appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] font-semibold tabular-nums text-neutral-900 outline-none ring-0 transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
      />
    </div>
  );
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return "Set time";
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

function sortDays(days: DayKey[]): DayKey[] {
  const unique = Array.from(new Set(days));
  return REPEAT_DAYS.filter((day) => unique.includes(day));
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export default function TimeSlotPicker({
  slots,
  onSlotsChange,
  activeDay = "monday",
  repeatDays,
  onRepeatDaysChange,
}: TimeSlotPickerProps) {
  // Presets/duration act on the focused (most recently touched) slot.
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const activeIndex = Math.min(focusedIndex, slots.length - 1);
  const active = slots[activeIndex] ?? { startTime: "", endTime: "" };
  const currentDuration = durationMinutes(active.startTime, active.endTime);
  const durationText = durationLabel(currentDuration);
  const allDaysSelected = repeatDays?.length === REPEAT_DAYS.length;

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

  function toggleAllDays() {
    if (!onRepeatDaysChange) return;
    onRepeatDaysChange(allDaysSelected ? [activeDay] : REPEAT_DAYS);
  }

  function toggleDay(day: DayKey) {
    if (!repeatDays || !onRepeatDaysChange) return;
    if (allDaysSelected) {
      onRepeatDaysChange([day]);
      return;
    }
    const next = repeatDays.includes(day)
      ? repeatDays.filter((selectedDay) => selectedDay !== day)
      : [...repeatDays, day];
    onRepeatDaysChange(sortDays(next.length > 0 ? next : [day]));
  }

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>{slots.length > 1 ? "Time Slots" : "Time Slot"}</p>
        <p className={`text-[12px] font-semibold tabular-nums ${currentDuration === null ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}>
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
                className="mb-0.5 flex h-11 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 transition-colors hover:border-rose-300 hover:text-rose-500 dark:border-white/10 dark:text-neutral-500 dark:hover:border-rose-500/40 dark:hover:text-rose-400"
              >
                <IconX size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addSlot}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-dashed border-neutral-200 px-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
        >
          <IconPlus size={14} strokeWidth={2.5} />
          Add time slot
        </button>
      </div>

      {/* Start presets */}
      <div className="space-y-2">
        <p className={LABEL}>Quick start{slots.length > 1 ? ` · slot ${activeIndex + 1}` : ""}</p>
        <div className="flex flex-wrap gap-2">
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === "now" ? null : preset.value;
            const isActive = presetMinutes !== null && inputToMinutes(active.startTime) === presetMinutes;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyStart(preset.value === "now" ? currentMinutes() : preset.value)}
                className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(isActive)}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration presets */}
      <div className="space-y-2">
        <p className={LABEL}>Duration</p>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => applyDuration(option.minutes)}
              className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(currentDuration === option.minutes)}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          Pick a start time, then tap a duration to set end time.
        </p>
      </div>

      {/* Repeat */}
      {repeatDays && onRepeatDaysChange && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className={LABEL}>Visible on</p>
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
              {allDaysSelected ? "All days" : `${repeatDays.length} ${repeatDays.length === 1 ? "day" : "days"}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllDays}
              className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(!!allDaysSelected)}`}
            >
              All days
            </button>
            {REPEAT_DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(!allDaysSelected && repeatDays.includes(day))}`}
              >
                {DAY_LABELS[day]}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
