/**
 * Ritual (routine) streak + adherence — the single source of truth.
 *
 * Previously three call sites computed a routine's streak differently
 * (RitualView 180d/today-inclusive, OverviewDashboard 90d/from-yesterday, and
 * the execution-streak folder), so the same routine could read a different
 * number on the Routine tab and the Overview. This is the one implementation
 * they all use now. Pure — no React, no clock beyond `todayISO()` for the
 * unchecked-today grace.
 */

import type { DayKey, Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { localISODate, todayISO } from "@/lib/dateUtils";

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** How far back the streak walk looks, and the adherence window. */
const STREAK_LOOKBACK_DAYS = 180;
const ADHERENCE_WINDOW_DAYS = 30;

/** A routine runs on a day when it has no repeatDays (every day) or lists it. */
export function ritualScheduledOn(ritual: Pick<Ritual, "repeatDays">, day: DayKey): boolean {
  return !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day);
}

export interface RitualStats {
  /** Consecutive completed scheduled days ending at `uptoISO`. An unchecked
   * today doesn't break the run (it's in-progress, not a miss). */
  streak: number;
  /** Completed ÷ scheduled over the last ADHERENCE_WINDOW_DAYS (0–100). Today's
   * still-open slot is excluded so an in-progress day never drags it down. */
  adherencePct: number;
  /** Last 7 days' completion, oldest → newest — feeds the row sparkline dots. */
  dots: boolean[];
}

export function calculateRitualStats(
  ritual: Ritual,
  completions: RitualCompletion[],
  uptoISO: string = todayISO(),
): RitualStats {
  const done = new Set(
    completions.filter((c) => c.ritualId === ritual.id).map((c) => c.date),
  );
  const today = todayISO();

  // ── Streak ──────────────────────────────────────────────────────────────
  let streak = 0;
  const cursor = new Date(`${uptoISO}T00:00:00`);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const iso = localISODate(cursor);
    if (ritualScheduledOn(ritual, JS_TO_DAY[cursor.getDay()])) {
      if (done.has(iso)) streak++;
      else if (iso !== today) break; // unchecked today is in-progress, not a miss
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  // ── Adherence over the window ───────────────────────────────────────────
  let scheduled = 0;
  let completed = 0;
  const adCursor = new Date(`${uptoISO}T00:00:00`);
  for (let i = 0; i < ADHERENCE_WINDOW_DAYS; i++) {
    const iso = localISODate(adCursor);
    if (ritualScheduledOn(ritual, JS_TO_DAY[adCursor.getDay()])) {
      // Skip today's still-open slot so an in-progress day isn't a "miss".
      if (!(iso === today && !done.has(iso))) {
        scheduled++;
        if (done.has(iso)) completed++;
      }
    }
    adCursor.setDate(adCursor.getDate() - 1);
  }
  const adherencePct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;

  // ── Last-7 dots (oldest → newest) ───────────────────────────────────────
  const dots: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${uptoISO}T00:00:00`);
    d.setDate(d.getDate() - i);
    dots.push(done.has(localISODate(d)));
  }

  return { streak, adherencePct, dots };
}
