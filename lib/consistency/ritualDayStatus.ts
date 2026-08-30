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
  /** Checklist/times only. */
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
    case "checklist":
    case "times": {
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

/**
 * Group a day's completion rows by ritual id. Exported because callers that
 * need per-ritual entries (progress readouts, quick-add controls) would
 * otherwise re-filter the whole completion array once per routine.
 */
export function groupRitualEntriesForDate(
  completions: RitualCompletion[],
  dateISO: string,
): Map<string, RitualCompletion[]> {
  const byRitual = new Map<string, RitualCompletion[]>();
  for (const c of completions) {
    if (c.date !== dateISO) continue;
    const bucket = byRitual.get(c.ritualId);
    if (bucket) bucket.push(c);
    else byRitual.set(c.ritualId, [c]);
  }
  return byRitual;
}

/**
 * The ids of routines whose day is genuinely complete on `dateISO`.
 *
 * Both shells derive "what's done today" from this rather than from raw row
 * presence. The presence shortcut (`any row dated today`) is wrong for every
 * non-checkbox type: one 250ml log against a 3000ml target creates a row, so
 * the routine would read complete on the Today bar and in Needs Attention
 * while the Routine tab — which asks isRitualDayComplete — correctly showed it
 * unfinished. Same question, one answer.
 */
export function completedRitualIdsOn(
  rituals: Ritual[],
  completions: RitualCompletion[],
  dateISO: string,
): Set<string> {
  const byRitual = groupRitualEntriesForDate(completions, dateISO);
  const done = new Set<string>();
  for (const ritual of rituals) {
    if (isRitualDayComplete(ritual, byRitual.get(ritual.id) ?? [])) done.add(ritual.id);
  }
  return done;
}
