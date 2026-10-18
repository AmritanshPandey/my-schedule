/**
 * Routine mutations. Pure functions returning a Schedule updater, matching the
 * shape of lib/taskMutations.ts so call sites read the same way.
 */

import type { Ritual, Schedule } from "./useScheduleDB";
import { parseTimeToMinutes, minutesToInputTime } from "./timeUtils";

/** Normalise whatever a caller hands us to the "HH:MM" the model stores. */
function toStoredTime(time: string): string | null {
  const minutes = parseTimeToMinutes(time);
  return minutes === null ? null : minutesToInputTime(minutes);
}

/**
 * Move one routine occurrence to a new time of day.
 *
 * A routine has no per-date position — `repeatDays`/`recurrence` decide which
 * days it appears on — so this changes the time on every day it recurs, which
 * is the only thing "move a routine" can mean without editing its recurrence.
 * Dragging across columns is deliberately not wired to this for that reason.
 *
 * `stepId` addresses one occurrence of a "times" routine (water at 8am/1pm/6pm);
 * omit it for every other kind, which has a single occurrence at `ritual.time`.
 *
 * Returns the same schedule reference when nothing actually changes, so React
 * and the sync stamper both bail out on a no-op drag.
 */
export function setRitualTime(ritualId: string, time: string) {
  return (prev: Schedule): Schedule => {
    const stored = toStoredTime(time);
    if (!stored) return prev;

    let changed = false;
    const rituals = (prev.rituals ?? []).map((ritual) => {
      if (ritual.id !== ritualId || ritual.time === stored) return ritual;
      changed = true;
      return { ...ritual, time: stored };
    });

    return changed ? { ...prev, rituals } : prev;
  };
}

/**
 * Drop a copy of a routine at a new time, leaving the original be.
 *
 * The Alt-variant of `setRitualTime`. Completions are per-ritual, so the copy
 * correctly starts unticked. `limit` guards the same routine ceiling the add
 * button enforces; the caller decides what to tell the user when it returns
 * unchanged.
 */
export function duplicateRitualAt(
  ritualId: string,
  time: string,
  makeId: () => string,
  limit = Number.POSITIVE_INFINITY,
) {
  return (prev: Schedule): Schedule => {
    const stored = toStoredTime(time);
    if (!stored) return prev;

    const rituals = prev.rituals ?? [];
    const source = rituals.find((r) => r.id === ritualId);
    if (!source) return prev;

    if (rituals.length >= limit) return prev;
    return { ...prev, rituals: [...rituals, { ...source, id: makeId(), time: stored }] };
  };
}
