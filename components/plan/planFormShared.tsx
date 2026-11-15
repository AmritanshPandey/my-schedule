"use client";

import { ChipRow, ChoiceChip } from "@/components/ui/FormChips";
import type { AccentColor } from "@/lib/colorSystem";
import { todayISO } from "@/lib/dateUtils";
import { typography } from "@/components/ui/Typography";

export const PLAN_TITLE_MAX = 40;

export const PLAN_DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "Ongoing", days: null },
];

export const PLAN_COLOR_SWATCHES: { color: AccentColor; bg: string }[] = [
  { color: "red",     bg: "bg-red-500" },
  { color: "orange",  bg: "bg-orange-500" },
  { color: "amber",   bg: "bg-amber-500" },
  { color: "yellow",  bg: "bg-yellow-500" },
  { color: "lime",    bg: "bg-lime-500" },
  { color: "green",   bg: "bg-green-500" },
  { color: "emerald", bg: "bg-emerald-500" },
  { color: "teal",    bg: "bg-teal-500" },
  { color: "cyan",    bg: "bg-cyan-500" },
  { color: "sky",     bg: "bg-sky-500" },
  { color: "blue",    bg: "bg-blue-500" },
  { color: "indigo",  bg: "bg-indigo-500" },
  { color: "violet",  bg: "bg-violet-500" },
  { color: "purple",  bg: "bg-purple-500" },
  { color: "fuchsia", bg: "bg-fuchsia-500" },
  { color: "pink",    bg: "bg-pink-500" },
  { color: "rose",    bg: "bg-rose-500" },
];

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export function iconPickerClass(selected: boolean): string {
  return `flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all duration-150 ${
    selected
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.1]"
  }`;
}

export function PlanColorPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange: (color: AccentColor) => void;
}) {
  return (
    <div>
      <p className={`mb-2 ${typography.eyebrow}`}>Color</p>
      <div className="flex flex-wrap gap-1">
        {PLAN_COLOR_SWATCHES.map(({ color, bg }) => {
          const sel = value === color;
          return (
            // A 44px target around the 32px swatch.
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={sel}
              onClick={() => onChange(color)}
              className="group flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span
                className={`h-8 w-8 rounded-full ${bg} transition-transform duration-150 ${
                  sel
                    ? "ring-2 ring-offset-2 ring-neutral-900 ring-offset-white dark:ring-white dark:ring-offset-neutral-900"
                    : "group-hover:scale-110"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DurationPresets({
  startDate,
  endDate,
  onSelect,
}: {
  startDate: string;
  endDate: string;
  onSelect: (start: string, end: string) => void;
}) {
  const today = todayISO();
  return (
    <div>
      <ChipRow label="Quick duration">
        {PLAN_DURATION_PRESETS.map(({ label, days }) => {
          const isActive = days !== null
            ? startDate === today && endDate === addDaysISO(days)
            : startDate === today && !endDate;
          return <ChoiceChip key={label} active={isActive} label={label} onClick={() => onSelect(today, days !== null ? addDaysISO(days) : "")} />;
        })}
      </ChipRow>
    </div>
  );
}
