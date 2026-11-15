"use client";

import { DAYS, DAY_FULL_LABELS, DAY_LABELS } from "@/lib/scheduleConstants";
import type { DayKey } from "@/lib/useScheduleDB";
import { ChoiceChip, choiceChipTone } from "@/components/ui/FormChips";

/**
 * Pick the weekdays something happens on.
 *
 * Extracted because the New/Edit Task sheet drew this twice, from two different
 * day tables, and the two disagreed: the repeat row ran Sunday-first with
 * three-letter labels off a local `REPEAT_DAYS` constant, while the duplicate
 * step ran Monday-first with the canonical two-letter `DAY_LABELS`. One sheet,
 * two week-start conventions, two abbreviations. `lib/scheduleConstants.ts` is
 * the app's week: Monday-first, "Mo"/"Tu".
 *
 * Each chip is a toggle, so `aria-pressed` is the right state (a radio group
 * would claim only one can be on). The visible label is abbreviated, so the
 * accessible name spells the day out.
 */
interface WeekdayPickerProps {
  selected: DayKey[];
  onChange: (days: DayKey[]) => void;
  /**
   * Adds an "All days" chip that selects the whole week, and — when the whole
   * week is already selected — collapses back to `fallbackDay`. Used by the
   * repeat row; the duplicate step has no such shortcut.
   */
  allDaysOption?: boolean;
  /** Where "All days" collapses back to. Defaults to the first selected day. */
  fallbackDay?: DayKey;
  /**
   * Allow deselecting every day. Off for repeat days — a task that recurs on
   * nothing is not a thing the model can express — but on for "copy to days",
   * where an empty selection is how you back out of the whole action.
   */
  allowEmpty?: boolean;
  className?: string;
}

// One row of seven equal 44px days, so the week never wraps into a crowded
// second line on a phone; "Every day" is its own chip above it.
const DAY = "flex h-11 min-w-0 items-center justify-center rounded-full border text-[14px] font-semibold transition-colors lg:h-10 lg:text-[13px]";

export default function WeekdayPicker({
  selected,
  onChange,
  allDaysOption = false,
  fallbackDay,
  allowEmpty = false,
  className = "",
}: WeekdayPickerProps) {
  const allSelected = selected.length === DAYS.length;

  function toggleDay(day: DayKey) {
    if (allSelected && allDaysOption) {
      onChange([day]);
      return;
    }
    const next = selected.includes(day)
      ? selected.filter((selectedDay) => selectedDay !== day)
      : [...selected, day];
    const kept = next.length > 0 || allowEmpty ? next : [day];
    onChange(DAYS.filter((d) => kept.includes(d)));
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {allDaysOption && (
        <ChoiceChip
          active={allSelected}
          label="Every day"
          onClick={() => onChange(allSelected ? [fallbackDay ?? selected[0] ?? DAYS[0]] : [...DAYS])}
        />
      )}
      <div className="grid max-w-[392px] grid-cols-7 gap-1.5">
        {DAYS.map((day) => {
          const active = allDaysOption ? !allSelected && selected.includes(day) : selected.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              aria-label={DAY_FULL_LABELS[day]}
              onClick={() => toggleDay(day)}
              className={`${DAY} ${choiceChipTone(active)}`}
            >
              {DAY_LABELS[day]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
