import type { Ritual } from "@/lib/useScheduleDB";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { ritualScheduledOnDate } from "@/lib/ritualRecurrence";

/**
 * One drawable occurrence of a ritual on the timeline. Most trackingTypes
 * have exactly one occurrence a day (the ritual itself, at `ritual.time`).
 * A "times" ritual (see lib/useScheduleDB.ts's RitualTrackingType) has one
 * occurrence per entry in `ritual.steps`, each at its own time — `stepId`
 * is what scopes a completion row to that one occurrence
 * (RitualCompletion.stepId, toggled via toggleRitualStep).
 */
export interface RitualOccurrence {
  ritual: Ritual;
  /** Present only for one occurrence of a "times" ritual; undefined for
   *  every other trackingType, where the ritual itself is the one occurrence. */
  stepId?: string;
  /** Raw "HH:MM" — this occurrence's own time (a step's label for "times", else ritual.time). */
  time: string;
}

export interface RitualGroup {
  key: string;
  timeMinutes: number;
  top: number;
  occurrences: RitualOccurrence[];
}

/** The one or more occurrences a single ritual contributes, each with its
 *  own raw "HH:MM" time. Every trackingType but "times" is a single
 *  occurrence at the ritual's own time — unchanged from before this existed. */
function occurrencesFor(ritual: Ritual): Array<{ stepId?: string; time: string }> {
  if (ritual.trackingType === "times" && ritual.steps && ritual.steps.length > 0) {
    return ritual.steps.map((step) => ({ stepId: step.id, time: step.label }));
  }
  return [{ time: ritual.time }];
}

export function groupRitualsByTime(
  rituals: Ritual[],
  dateISO: string,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  timelineTopPadding: number,
  hourHeight: number,
  trackingStart?: string,
): RitualGroup[] {
  const scheduled = rituals.filter((r) => ritualScheduledOnDate(r, dateISO, trackingStart));

  const map = new Map<number, RitualOccurrence[]>();
  for (const ritual of scheduled) {
    for (const occ of occurrencesFor(ritual)) {
      const mins = parseTimeToMinutes(occ.time);
      if (mins === null) continue;
      // Filtered per-occurrence, not per-ritual: a "times" ritual's later
      // occurrences must not be hidden (or wrongly shown) just because its
      // earliest one does or doesn't fall inside the visible window.
      if (mins < timelineStartMinutes || mins > timelineEndMinutes) continue;
      if (!map.has(mins)) map.set(mins, []);
      map.get(mins)!.push({ ritual, stepId: occ.stepId, time: occ.time });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([mins, occurrences]) => ({
      key: String(mins),
      timeMinutes: mins,
      top: timelineTopPadding + ((mins - timelineStartMinutes) / 60) * hourHeight,
      occurrences,
    }));
}
