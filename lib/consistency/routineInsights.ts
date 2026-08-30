/**
 * Lightweight Routine insights — a few sentences, not a dashboard. Every
 * field is nullable and only ever derived from real completion history;
 * when there isn't enough data to say something true, the field is null and
 * the section renders nothing for it rather than inventing filler text.
 */
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { calculateRitualStats, ritualScheduledOnDate } from "./calculateRitualStreak";
import { isRitualDayComplete } from "./ritualDayStatus";

/** A streak below this isn't worth naming as "most consistent" — matches the
 *  same bar `lib/needsAttention.ts` uses for "at risk" (MIN_STREAK_TO_WARN). */
const MIN_STREAK_TO_HIGHLIGHT = 2;
/** Adherence below this, over a window with real scheduled days, is worth
 *  flagging as needing attention. */
const LOW_ADHERENCE_THRESHOLD = 50;

export interface RoutineInsights {
  /** This week's (last 7 days incl. today) completed ÷ scheduled, 0-100. Null
   *  when nothing was scheduled in the window — nothing true to say yet. */
  overallPct: number | null;
  /** Percentage-point change vs. the prior 7-day window. Null unless both
   *  windows had scheduled days to compare. */
  deltaVsLastWeek: number | null;
  /** The routine with the strongest current run, if any clears the bar. */
  mostConsistent: { ritual: Ritual; streak: number } | null;
  /** The routine slipping the most, if any clears the bar. */
  needsAttention: { ritual: Ritual; adherencePct: number } | null;
}

function windowPct(
  rituals: Ritual[],
  completions: RitualCompletion[],
  startISO: string,
  endISO: string,
  trackingStart?: string,
): number | null {
  let scheduled = 0;
  let done = 0;
  const cursor = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  while (cursor <= end) {
    const iso = localISODate(cursor);
    for (const ritual of rituals) {
      if (!ritualScheduledOnDate(ritual, iso, trackingStart)) continue;
      scheduled++;
      const dayRows = completions.filter((c) => c.ritualId === ritual.id && c.date === iso);
      if (isRitualDayComplete(ritual, dayRows)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return scheduled > 0 ? Math.round((done / scheduled) * 100) : null;
}

export function buildRoutineInsights(
  rituals: Ritual[],
  completions: RitualCompletion[],
  todayISO: string,
  /** Schedule-wide tracking start — insights ignore anything before it. */
  trackingStart?: string,
): RoutineInsights {
  const today = new Date(`${todayISO}T00:00:00`);
  const iso = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return localISODate(d);
  };

  const overallPct = rituals.length > 0 ? windowPct(rituals, completions, iso(-6), iso(0), trackingStart) : null;
  const lastWeekPct = rituals.length > 0 ? windowPct(rituals, completions, iso(-13), iso(-7), trackingStart) : null;
  const deltaVsLastWeek =
    overallPct !== null && lastWeekPct !== null ? overallPct - lastWeekPct : null;

  let mostConsistent: RoutineInsights["mostConsistent"] = null;
  let needsAttention: RoutineInsights["needsAttention"] = null;

  for (const ritual of rituals) {
    const { streak, adherencePct } = calculateRitualStats(ritual, completions, todayISO, trackingStart);
    if (streak >= MIN_STREAK_TO_HIGHLIGHT && (!mostConsistent || streak > mostConsistent.streak)) {
      mostConsistent = { ritual, streak };
    }
  }

  // calculateRitualStats reads adherencePct as 0 whenever nothing was
  // scheduled in the window at all (nothing to divide by) — guarded out here
  // so a routine with zero scheduled days recently reads as "no data", not
  // "struggling" (e.g. an interval routine whose cycle hasn't started yet).
  const hasRecentSchedule = (ritual: Ritual) => {
    for (let i = 0; i < 30; i++) {
      if (ritualScheduledOnDate(ritual, iso(-i), trackingStart)) return true;
    }
    return false;
  };
  const candidates = rituals
    .filter(hasRecentSchedule)
    .map((ritual) => ({ ritual, ...calculateRitualStats(ritual, completions, todayISO, trackingStart) }))
    .filter((r) => r.adherencePct < LOW_ADHERENCE_THRESHOLD);
  if (candidates.length > 0) {
    const worst = candidates.reduce((a, b) => (b.adherencePct < a.adherencePct ? b : a));
    needsAttention = { ritual: worst.ritual, adherencePct: worst.adherencePct };
  }

  return { overallPct, deltaVsLastWeek, mostConsistent, needsAttention };
}
