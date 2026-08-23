/**
 * Recurrence presets layered on top of `Ritual.repeatDays` — the weekday-set
 * field every existing reader (streak calc, timeline grouping, reminders)
 * already understands and keeps using unchanged. `RitualRecurrence` adds
 * `interval` scheduling (every N days), which a weekday set can't express,
 * and remembers which preset produced the current `repeatDays` so re-opening
 * the edit form doesn't collapse a "Weekdays" pick down to "Custom".
 */
import type { DayKey, Ritual, RitualRecurrence } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/scheduleConstants";
import { ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";

// Re-exported for existing importers (RitualView.tsx, ritualCalendar.ts, tests) —
// the actual date-aware check lives in calculateRitualStreak.ts now, so the
// streak/adherence/dots/best-streak walks there can use it directly without
// an import cycle (that file also owns the base `ritualScheduledOn`, which
// this module depends on).
export { ritualScheduledOnDate };

const WEEKDAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKENDS: DayKey[] = ["saturday", "sunday"];

function sameDaySet(a: DayKey[], b: DayKey[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((d) => setB.has(d));
}

/** `recurrence` → the `repeatDays` value to actually store on the Ritual.
 *  `interval` recurrence has no weekday projection — leave `repeatDays`
 *  undefined (every-day-eligible; the interval gate in `scheduledOnDate`
 *  narrows it down). */
export function recurrenceToRepeatDays(recurrence: RitualRecurrence): DayKey[] | undefined {
  switch (recurrence.kind) {
    case "daily": return undefined;
    case "weekdays": return WEEKDAYS;
    case "weekends": return WEEKENDS;
    case "custom": return recurrence.days?.length ? recurrence.days : undefined;
    case "interval": return undefined;
  }
}

/** Reverse mapping, for round-tripping a legacy ritual (which only ever had
 *  `repeatDays`) into the richer recurrence editor without collapsing a
 *  recognizable preset down to "Custom". */
export function repeatDaysToRecurrence(repeatDays: DayKey[] | undefined): RitualRecurrence {
  if (!repeatDays || repeatDays.length === 0) return { kind: "daily" };
  if (sameDaySet(repeatDays, WEEKDAYS)) return { kind: "weekdays" };
  if (sameDaySet(repeatDays, WEEKENDS)) return { kind: "weekends" };
  return { kind: "custom", days: repeatDays };
}

export function describeRecurrence(ritual: Pick<Ritual, "repeatDays" | "recurrence">): string {
  const recurrence = ritual.recurrence ?? repeatDaysToRecurrence(ritual.repeatDays);
  switch (recurrence.kind) {
    case "daily": return "Every day";
    case "weekdays": return "Weekdays";
    case "weekends": return "Weekends";
    case "interval": return recurrence.intervalDays ? `Every ${recurrence.intervalDays} days` : "Every day";
    case "custom": {
      const days = recurrence.days ?? ritual.repeatDays ?? [];
      if (days.length === 0) return "Every day";
      return DAYS.filter((d) => days.includes(d)).map((d) => DAY_LABELS[d]).join(" · ");
    }
  }
}

