/**
 * The one place that decides "is this routine's day complete?", across every
 * trackingType. lib/consistency/calculateRitualStreak.ts's streak/adherence
 * walk calls this instead of a raw completion-presence check, so the
 * algorithm itself never needs to know about tracking types.
 */
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";

export interface RitualDayProgress {
  /** Summed logged value for quantity/duration/count (0 if none logged). */
  value: number;
  target: number | undefined;
  /** Whether the day counts as done, per the rules below. */
  complete: boolean;
  /** Checklist only. */
  stepsDone: number;
  stepsTotal: number;
  /** Every row for this ritual on this day, in original order. */
  entries: RitualCompletion[];
}

/**
 * A row with neither `value` nor `stepId` is a "day marked done" sentinel —
 * this is exactly what every completion row looked like before trackingType
 * existed, so it always counts as complete regardless of the ritual's
 * current trackingType. This is the backward-compat guarantee: converting an
 * old checkbox routine to quantity/checklist never erases its history.
 */
function hasSentinelRow(entries: RitualCompletion[]): boolean {
  return entries.some((e) => e.value === undefined && e.stepId === undefined);
}

export function ritualDayProgress(ritual: Ritual, entries: RitualCompletion[]): RitualDayProgress {
  if (hasSentinelRow(entries)) {
    return { value: 0, target: ritual.target, complete: true, stepsDone: 0, stepsTotal: ritual.steps?.length ?? 0, entries };
  }

  switch (ritual.trackingType) {
    case "quantity":
    case "duration":
    case "count": {
      const value = entries.reduce((sum, e) => sum + (e.value ?? 0), 0);
      const target = ritual.target;
      const complete = typeof target === "number" && target > 0 ? value >= target : value > 0;
      return { value, target, complete, stepsDone: 0, stepsTotal: 0, entries };
    }
    case "checklist": {
      const stepsTotal = ritual.steps?.length ?? 0;
      const doneIds = new Set(entries.map((e) => e.stepId).filter((id): id is string => !!id));
      const stepsDone = doneIds.size;
      // No steps defined yet — fall back to checkbox semantics rather than
      // being permanently uncompletable.
      const complete = stepsTotal > 0 ? stepsDone >= stepsTotal : entries.length > 0;
      return { value: 0, target: undefined, complete, stepsDone, stepsTotal, entries };
    }
    case "checkbox":
    default:
      return { value: 0, target: undefined, complete: entries.length > 0, stepsDone: 0, stepsTotal: 0, entries };
  }
}

export function isRitualDayComplete(ritual: Ritual, entries: RitualCompletion[]): boolean {
  return ritualDayProgress(ritual, entries).complete;
}
