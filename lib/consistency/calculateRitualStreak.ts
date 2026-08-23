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
import { isRitualDayComplete } from "./ritualDayStatus";

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** How far back the streak walk looks, and the adherence window. */
const STREAK_LOOKBACK_DAYS = 180;
const ADHERENCE_WINDOW_DAYS = 30;
/** How far back the best-streak scan looks — generous, since it's a
 *  once-per-view calculation, not a per-render one. */
const BEST_STREAK_LOOKBACK_DAYS = 730;

/** A routine runs on a day when it has no repeatDays (every day) or lists it.
 *  Kept exactly as-is (signature and behavior) — RitualView.tsx and
 *  OverviewDashboard.tsx both import this directly for their own weekday
 *  checks. Date-aware scheduling (including `interval` recurrence) lives in
 *  `ritualScheduledOnDate` (lib/ritualRecurrence.ts), which delegates here
 *  for every non-interval case. */
export function ritualScheduledOn(ritual: Pick<Ritual, "repeatDays">, day: DayKey): boolean {
  return !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day);
}

/** Whole-day difference, `dateISO - anchorISO`, allowing 0 and negative
 *  (unlike lib/dateUtils.ts's `daysBetween`, which is tailored for
 *  plan-duration math and returns null for non-positive results — day 0 of
 *  an interval cycle is a legitimate, scheduled day here). */
function dayDiff(anchorISO: string, dateISO: string): number {
  const anchor = new Date(`${anchorISO}T00:00:00`).getTime();
  const date = new Date(`${dateISO}T00:00:00`).getTime();
  return Math.round((date - anchor) / 86_400_000);
}

/**
 * The date-aware schedule check — handles `interval` recurrence (which a
 * plain weekday set can't express) and otherwise delegates straight to
 * `ritualScheduledOn`. Lives here (rather than lib/ritualRecurrence.ts, which
 * re-exports it) so the streak/adherence/dots/best-streak walks below can use
 * it directly without an import cycle. */
export function ritualScheduledOnDate(ritual: Pick<Ritual, "repeatDays" | "recurrence">, dateISO: string): boolean {
  const recurrence = ritual.recurrence;
  if (recurrence?.kind === "interval" && recurrence.intervalDays && recurrence.intervalDays >= 2 && recurrence.anchorDate) {
    const diff = dayDiff(recurrence.anchorDate, dateISO);
    if (diff < 0) return false; // before the cycle started
    return diff % recurrence.intervalDays === 0;
  }
  return ritualScheduledOn(ritual, JS_TO_DAY[new Date(`${dateISO}T00:00:00`).getDay()]);
}

export interface RitualStats {
  /** Consecutive completed scheduled days ending at `uptoISO`. An unchecked
   * today doesn't break the run (it's in-progress, not a miss). */
  streak: number;
  /** The longest streak anywhere in this routine's history (bounded to
   *  BEST_STREAK_LOOKBACK_DAYS). Never less than `streak`. */
  bestStreak: number;
  /** Completed ÷ scheduled over the last ADHERENCE_WINDOW_DAYS (0–100). Today's
   * still-open slot is excluded so an in-progress day never drags it down. */
  adherencePct: number;
  /** Last 7 days' completion, oldest → newest — feeds the row sparkline dots. */
  dots: boolean[];
}

/** Groups a ritual's own completion rows by date, once, so the streak/
 *  adherence/dots loops below can each do an O(1) lookup instead of
 *  re-filtering the full completion array per day. */
function groupByDate(ritual: Ritual, completions: RitualCompletion[]): Map<string, RitualCompletion[]> {
  const byDate = new Map<string, RitualCompletion[]>();
  for (const c of completions) {
    if (c.ritualId !== ritual.id) continue;
    const bucket = byDate.get(c.date);
    if (bucket) bucket.push(c);
    else byDate.set(c.date, [c]);
  }
  return byDate;
}

export function calculateRitualStats(
  ritual: Ritual,
  completions: RitualCompletion[],
  uptoISO: string = todayISO(),
): RitualStats {
  const byDate = groupByDate(ritual, completions);
  const completeOn = (iso: string) => isRitualDayComplete(ritual, byDate.get(iso) ?? []);
  const today = todayISO();

  // ── Streak ──────────────────────────────────────────────────────────────
  let streak = 0;
  const cursor = new Date(`${uptoISO}T00:00:00`);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const iso = localISODate(cursor);
    if (ritualScheduledOnDate(ritual, iso)) {
      if (completeOn(iso)) streak++;
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
    if (ritualScheduledOnDate(ritual, iso)) {
      // Skip today's still-open slot so an in-progress day isn't a "miss".
      if (!(iso === today && !completeOn(iso))) {
        scheduled++;
        if (completeOn(iso)) completed++;
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
    dots.push(completeOn(localISODate(d)));
  }

  const bestStreak = Math.max(streak, calculateBestStreak(ritual, completions, uptoISO));

  return { streak, bestStreak, adherencePct, dots };
}

/**
 * The longest run of consecutive completed scheduled days anywhere in this
 * routine's history, bounded to BEST_STREAK_LOOKBACK_DAYS. Walks forward
 * (oldest → newest) so a broken run resets `run` to 0 without needing a
 * second backward pass; an unchecked *today* doesn't end the current run,
 * matching `calculateRitualStats`'s own in-progress-day grace.
 */
export function calculateBestStreak(
  ritual: Ritual,
  completions: RitualCompletion[],
  uptoISO: string = todayISO(),
): number {
  const byDate = groupByDate(ritual, completions);
  const completeOn = (iso: string) => isRitualDayComplete(ritual, byDate.get(iso) ?? []);
  const today = todayISO();

  const start = new Date(`${uptoISO}T00:00:00`);
  start.setDate(start.getDate() - (BEST_STREAK_LOOKBACK_DAYS - 1));

  let run = 0;
  let best = 0;
  const cursor = new Date(start);
  while (cursor <= new Date(`${uptoISO}T00:00:00`)) {
    const iso = localISODate(cursor);
    if (ritualScheduledOnDate(ritual, iso)) {
      if (completeOn(iso)) {
        run++;
        best = Math.max(best, run);
      } else if (iso !== today) {
        run = 0;
      }
      // unchecked today: leave `run` as-is, in progress
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}
