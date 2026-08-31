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
export function setRitualTime(ritualId: string, stepId: string | undefined, time: string) {
  return (prev: Schedule): Schedule => {
    const stored = toStoredTime(time);
    if (!stored) return prev;

    let changed = false;
    const rituals = (prev.rituals ?? []).map((ritual) => {
      if (ritual.id !== ritualId) return ritual;
      const next = moveOccurrence(ritual, stepId, stored);
      if (next !== ritual) changed = true;
      return next;
    });

    return changed ? { ...prev, rituals } : prev;
  };
}

function moveOccurrence(ritual: Ritual, stepId: string | undefined, time: string): Ritual {
  const isTimes = ritual.trackingType === "times" && !!ritual.steps?.length;

  if (!stepId || !isTimes) {
    return ritual.time === time ? ritual : { ...ritual, time };
  }

  const steps = ritual.steps ?? [];
  if (!steps.some((step) => step.id === stepId)) return ritual;

  const moved = steps.map((step) => (step.id === stepId ? { ...step, label: time } : step));
  // `RitualStep.label` for a "times" routine is a raw "HH:MM" kept sorted
  // ascending (see its comment in useScheduleDB.ts). Re-sorting here is what
  // stops dragging the 6pm occurrence to 7am leaving the list out of order.
  moved.sort((a, b) => (parseTimeToMinutes(a.label) ?? 0) - (parseTimeToMinutes(b.label) ?? 0));

  // `ritual.time` mirrors the earliest occurrence for every reader that treats
  // a routine as happening once (grouping, reminders, the streak walk). Leaving
  // it stale would put the routine in two places at once.
  const earliest = moved[0]?.label ?? ritual.time;

  const same =
    earliest === ritual.time &&
    moved.length === steps.length &&
    moved.every((step, i) => step.id === steps[i].id && step.label === steps[i].label);

  return same ? ritual : { ...ritual, steps: moved, time: earliest };
}
