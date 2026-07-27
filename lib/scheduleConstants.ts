export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export const DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** The weekday before `day`, wrapping Monday back to Sunday. */
export function previousDayKey(day: DayKey): DayKey {
  return DAYS[(DAYS.indexOf(day) + 6) % 7];
}

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};
