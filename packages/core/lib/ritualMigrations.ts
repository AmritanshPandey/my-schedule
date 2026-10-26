/**
 * Retiring the "times" tracking type.
 *
 * "times" let a routine carry a list of clock times — water at 5:15, 6:45,
 * 9:00, 9:45, 12:30, 2:30, 4:30, 6:30, 9:00, 9:30. It was the only tracking
 * type that forced `anyTime: false` (see RitualSheet), so a habit you do when
 * you're thirsty got a "Due 5:15 AM", a slot in the Morning group, and ten
 * lines of clock times under its title.
 *
 * It was also redundant. `ritualDayProgress` gives "times" and "checklist"
 * identical completion logic — "times" is a checklist whose step labels happen
 * to be clock times — while `count` already models "do this N times a day"
 * with a target and a percentage, no clock involved.
 *
 * So the type goes, and its routines become plain daily ticks.
 *
 * History survives, by the guarantee `ritualDayStatus.ts` already documents:
 * completion rows are never reinterpreted when a trackingType changes. A
 * checkbox routine is complete on `entries.length > 0`, so every day that
 * carried any logged occurrence still reads as done and streaks are unaffected.
 * The rows keep their now-dangling `stepId`s, which cost nothing — only
 * checklist-shaped types ever read them.
 *
 * Pure and idempotent: once no routine is "times", re-running returns the same
 * array by reference.
 */

import type { Ritual } from "./scheduleTypes";

/** The retired trackingType, as it still appears in stored data. */
const LEGACY_TIMES = "times";

/**
 * Convert every "times" routine to a plain daily tick.
 *
 * `steps` is dropped rather than carried over. For a checkbox routine `steps`
 * renders as a descriptive caption ("Hair" ⇒ coconut oil, shampoo,
 * conditioner), and a list of bare clock times is exactly the noise this
 * change exists to remove.
 *
 * `time` is kept because the field is required and normalization validates it,
 * but `anyTime: true` means nothing reads it — grouping, the timeline and
 * reminders all skip a routine with no time of its own.
 */
export function retireTimesRituals(rituals: readonly Ritual[]): Ritual[] {
  let changed = false;
  const out = rituals.map((ritual) => {
    // Compared as a raw string, not against RitualTrackingType: "times" has
    // been removed from that union, and this function exists precisely to read
    // stored data that predates the removal.
    if ((ritual.trackingType as string | undefined) !== LEGACY_TIMES) return ritual;
    changed = true;
    const { steps: _steps, ...rest } = ritual;
    return { ...rest, trackingType: "checkbox" as const, anyTime: true };
  });
  return changed ? out : (rituals as Ritual[]);
}
