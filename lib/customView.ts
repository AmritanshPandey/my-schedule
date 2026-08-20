import { DAYS, type DayKey } from "@/lib/scheduleConstants";

export function normalizeCustomDays(days: DayKey[]): DayKey[] {
  const unique = Array.from(new Set(days.filter((day) => DAYS.includes(day))));
  return unique.length > 0 ? unique : [...DAYS];
}

export function resolveCustomVisibleDates(
  weekDates: Array<{ day: DayKey; date: Date }>,
  customDays: DayKey[],
): Array<{ day: DayKey; date: Date }> {
  const normalized = normalizeCustomDays(customDays);
  const visible = weekDates.filter(({ day }) => normalized.includes(day));
  return visible.length > 0 ? visible : weekDates;
}
