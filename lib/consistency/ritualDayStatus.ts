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
  /**
   * The day was explicitly marked done (a sentinel row exists), rather than
   * reaching done through logged amounts or ticked steps. Only an explicit
   * mark is something "Mark not done" can take back.
   */
  markedDone: boolean;
  /**
   * How closely the routine was followed, 0–100, or null when nothing was
   * recorded. An explicit mark carries the user's own rating (absent = 100);
   * otherwise it's derived from what was logged — 1,500 of 2,000 ml is 75,
   * two of three steps is 67. Supportive context, never the bar for "done".
   */
  followed: number | null;
}

/** Clamp a stored rating into 1–100; anything unusable reads as fully followed. */
export function clampFollowed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(100, Math.round(value)));
}

/**
 * A row with neither `value` nor `stepId` is a "day marked done" sentinel —
 * this is exactly what every completion row looked like before trackingType
 * existed, so it always counts as complete regardless of the ritual's
 * current trackingType. This is the backward-compat guarantee: converting an
 * old checkbox routine to quantity/checklist never erases its history.
 */
export function isSentinelRow(e: RitualCompletion): boolean {
  return e.value === undefined && e.stepId === undefined;
}

export function ritualDayProgress(ritual: Ritual, entries: RitualCompletion[]): RitualDayProgress {
  const value = entries.reduce((sum, e) => sum + (e.value ?? 0), 0);
  const doneIds = new Set(entries.map((e) => e.stepId).filter((id): id is string => !!id));
  const stepsTotal = ritual.steps?.length ?? 0;

  // The last mark wins if two devices each wrote one before syncing.
  const sentinels = entries.filter(isSentinelRow);
  if (sentinels.length > 0) {
    return {
      value,
      target: ritual.target,
      complete: true,
      stepsDone: doneIds.size,
      stepsTotal,
      entries,
      markedDone: true,
      followed: clampFollowed(sentinels[sentinels.length - 1].followed),
    };
  }

  switch (ritual.trackingType) {
    case "quantity":
    case "duration":
    case "count": {
      const target = ritual.target;
      const hasTarget = typeof target === "number" && target > 0;
      const complete = hasTarget ? value >= target : value > 0;
      const followed = value <= 0 ? null : hasTarget ? Math.min(100, Math.round((value / target) * 100)) : 100;
      return { value, target, complete, stepsDone: 0, stepsTotal: 0, entries, markedDone: false, followed };
    }
    case "checklist":
    case "times": {
      const stepsDone = doneIds.size;
      // No steps defined yet — fall back to checkbox semantics rather than
      // being permanently uncompletable.
      const complete = stepsTotal > 0 ? stepsDone >= stepsTotal : entries.length > 0;
      const followed = stepsDone === 0
        ? (complete ? 100 : null)
        : stepsTotal > 0 ? Math.min(100, Math.round((stepsDone / stepsTotal) * 100)) : 100;
      return { value: 0, target: undefined, complete, stepsDone, stepsTotal, entries, markedDone: false, followed };
    }
    case "checkbox":
    default: {
      const complete = entries.length > 0;
      return { value: 0, target: undefined, complete, stepsDone: 0, stepsTotal: 0, entries, markedDone: false, followed: complete ? 100 : null };
    }
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

export interface RoutineDaySummary {
  /** Routines scheduled on the day. */
  total: number;
  /** Of those, how many are done. */
  done: number;
  /**
   * How much of the day's routine was followed, 0–100: each scheduled routine
   * contributes its own follow-through (0 when nothing was recorded), averaged.
   * Null when nothing is scheduled. "You followed 72% of your routine."
   */
  followedPct: number | null;
  /** Titles of the routines that are done, in the order given. */
  doneTitles: string[];
  /** Titles still open, in the order given. */
  openTitles: string[];
}

/**
 * The whole day at a glance — what the Routine tab says back to you after a
 * few taps: "Done: Protein intake, Water intake. You followed 72% today."
 * `rituals` should already be filtered to the ones scheduled on `dateISO`.
 */
export function summarizeRoutineDay(
  rituals: Ritual[],
  completions: RitualCompletion[],
  dateISO: string,
): RoutineDaySummary {
  const byRitual = groupRitualEntriesForDate(completions, dateISO);
  let followedSum = 0;
  const doneTitles: string[] = [];
  const openTitles: string[] = [];
  for (const ritual of rituals) {
    const progress = ritualDayProgress(ritual, byRitual.get(ritual.id) ?? []);
    followedSum += progress.followed ?? 0;
    (progress.complete ? doneTitles : openTitles).push(ritual.title);
  }
  const total = rituals.length;
  return {
    total,
    done: doneTitles.length,
    followedPct: total > 0 ? Math.round(followedSum / total) : null,
    doneTitles,
    openTitles,
  };
}
