"use client";

import { useState } from "react";
import type { DayKey } from "@/lib/useScheduleDB";

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

interface TimeSlotPickerProps {
  startTime: string;
  endTime: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  activeDay?: DayKey;
  repeatDays?: DayKey[];
  onRepeatDaysChange?: (days: DayKey[]) => void;
}

function inputToMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToInput(value: number): string {
  const clamped = Math.min(Math.max(value, 0), 23 * 60 + 59);
  const hours = Math.floor(clamped / 60).toString().padStart(2, "0");
  const minutes = (clamped % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function durationMinutes(startTime: string, endTime: string): number | null {
  const start = inputToMinutes(startTime);
  const end = inputToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
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
    ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-neutral-900"
    : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200";
}

function sortDays(days: DayKey[]): DayKey[] {
  const unique = Array.from(new Set(days));
  return REPEAT_DAYS.filter((day) => unique.includes(day));
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export default function TimeSlotPicker({
  startTime,
  endTime,
  onStartChange,
  onEndChange,
  activeDay = "monday",
  repeatDays,
  onRepeatDaysChange,
}: TimeSlotPickerProps) {
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const currentDuration = durationMinutes(startTime, endTime);
  const durationText = durationLabel(currentDuration);
  const allDaysSelected = repeatDays?.length === REPEAT_DAYS.length;

  function applyStart(minutes: number) {
    const nextStart = minutesToInput(minutes);
    const preservedDuration = selectedDuration ?? currentDuration;
    onStartChange(nextStart);
    if (preservedDuration !== null) {
      onEndChange(minutesToInput(minutes + preservedDuration));
    }
  }

  function applyDuration(minutes: number) {
    const start = inputToMinutes(startTime) ?? currentMinutes();
    setSelectedDuration(minutes);
    onStartChange(minutesToInput(start));
    onEndChange(minutesToInput(start + minutes));
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
        <p className={LABEL}>Time Slot</p>
        <p className={`text-[12px] font-semibold tabular-nums ${currentDuration === null ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-700 dark:text-neutral-300"}`}>
          {durationText}
        </p>
      </div>

      {/* Time inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={`mb-1.5 ${LABEL}`}>Start</p>
          <input
            type="time"
            value={startTime}
            onChange={(e) => {
              const value = e.target.value;
              onStartChange(value);
              if (selectedDuration !== null) {
                const start = inputToMinutes(value);
                if (start !== null) onEndChange(minutesToInput(start + selectedDuration));
              }
            }}
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
          />
        </div>
        <div>
          <p className={`mb-1.5 ${LABEL}`}>End</p>
          <input
            type="time"
            value={endTime}
            onChange={(e) => {
              setSelectedDuration(null);
              onEndChange(e.target.value);
            }}
            className="
            h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
            "
          />
        </div>
      </div>

      {/* Start presets */}
      <div className="space-y-2">
        <p className={LABEL}>Quick start</p>
        <div className="flex flex-wrap gap-2">
          {START_PRESETS.map((preset) => {
            const presetMinutes = preset.value === "now" ? null : preset.value;
            const active = presetMinutes !== null && inputToMinutes(startTime) === presetMinutes;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyStart(preset.value === "now" ? currentMinutes() : preset.value)}
                className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${chipClass(active)}`}
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
            <p className={LABEL}>Repeat on</p>
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
