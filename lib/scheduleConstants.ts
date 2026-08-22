export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export const DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};

/** Caps `Schedule.events` so the append-only Goal event log can't grow
 * unbounded (same spirit as `acknowledgedMisses`'s 200-item cap). Lives here
 * (rather than useScheduleDB.ts) so lib/goalMutations.ts can import it
 * without pulling in that "use client" module's React/auth dependencies. */
export const MAX_SCHEDULE_EVENTS = 300;
