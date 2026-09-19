/**
 * When this person actually executes — measured, not assumed.
 *
 * Every occurrence that has passed is a small experiment: work was scheduled
 * at a particular time on a particular weekday, and it either got done or it
 * did not. Aggregating those outcomes gives something no planner usually
 * knows: "you finish 82% of what you schedule at 7am, and 24% of what you
 * schedule after 8pm." That turns rescheduling from a guess into a lookup.
 *
 * ── The data trap this avoids
 *
 * lib/usualTimeSlot.ts documents it: `completedAt` records when a task was
 * *marked* done, not when it was actually performed. Someone who ticks their
 * whole day off at bedtime would make 10pm look like their most productive
 * hour. So nothing here reads `completedAt` as a clock time. It is used only
 * to date the outcome; the *time* always comes from the slot the work was
 * scheduled into, via `resolveOccurrence` so per-date retimings count where
 * they actually landed.
 *
 * ── What counts as an experiment
 *
 * Only resolved occurrences — completed or missed. An occurrence that is
 * merely unmarked says nothing: it may be today's, or a day the user never
 * opened the app. Counting silence as failure would make every reliability
 * figure a measure of app usage rather than of execution.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { DayKey, Schedule, Task } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { isPlanRunning } from "./planLifecycle";
import { isTrackedTask, completionForDate } from "./taskCompletion";
import { getSlots } from "./taskMutations";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { localISODate, addDaysToISO } from "./dateUtils";
import { parseTimeToMinutes, minutesToInputTime, inputToDisplayTime } from "./timeUtils";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** How far back to sample. Long enough to gather a sample, short enough that
 *  it describes the user's current life rather than last season's. */
export const RELIABILITY_LOOKBACK_DAYS = 56;

/** Below this many resolved occurrences a band's rate is noise, not a rate. */
export const MIN_BAND_SAMPLES = 4;

/** A band at or below this completion rate is worth naming as unreliable. */
export const WEAK_BAND_RATE = 0.5;

/** A band at or above this is worth recommending. */
export const STRONG_BAND_RATE = 0.7;

/**
 * Hour bands, in schedule-day minutes from midnight.
 *
 * Bands rather than raw hours: an hour-by-hour table over eight weeks is
 * mostly empty cells, and "early morning" is the unit people actually plan in.
 * Boundaries follow how the day is lived, not clean arithmetic.
 */
export const TIME_BANDS = [
  { id: "early", label: "Early morning", startMinutes: 4 * 60, endMinutes: 9 * 60 },
  { id: "morning", label: "Morning", startMinutes: 9 * 60, endMinutes: 12 * 60 },
  { id: "afternoon", label: "Afternoon", startMinutes: 12 * 60, endMinutes: 17 * 60 },
  { id: "evening", label: "Evening", startMinutes: 17 * 60, endMinutes: 21 * 60 },
  { id: "night", label: "Late", startMinutes: 21 * 60, endMinutes: 28 * 60 },
] as const;

export type TimeBandId = (typeof TIME_BANDS)[number]["id"];

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReliabilityCell {
  resolved: number;
  completed: number;
  /** completed / resolved, or null below MIN_BAND_SAMPLES. */
  rate: number | null;
}

export interface SlotReliability {
  byBand: Record<TimeBandId, ReliabilityCell>;
  byWeekday: Record<DayKey, ReliabilityCell>;
  /** Total resolved occurrences sampled. */
  sampleSize: number;
  hasEnoughData: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** The band a start time falls in. Times past midnight belong to "Late". */
export function bandForMinutes(startMinutes: number): TimeBandId {
  // Pre-dawn work (00:00–04:00) is the tail of the previous evening in the
  // app's schedule-day model, so it belongs with "Late" rather than "Early".
  const normalized = startMinutes < 4 * 60 ? startMinutes + 24 * 60 : startMinutes;
  for (const band of TIME_BANDS) {
    if (normalized >= band.startMinutes && normalized < band.endMinutes) return band.id;
  }
  return "night";
}

export function bandLabel(id: TimeBandId): string {
  return TIME_BANDS.find((b) => b.id === id)?.label ?? id;
}

function emptyCell(): ReliabilityCell {
  return { resolved: 0, completed: 0, rate: null };
}

function finalize(cell: ReliabilityCell): ReliabilityCell {
  return {
    ...cell,
    rate: cell.resolved >= MIN_BAND_SAMPLES ? cell.completed / cell.resolved : null,
  };
}

/** Tasks deduped across the weekday buckets they recur in. */
function uniqueTasksByDay(schedule: Pick<Schedule, "activities">): Map<DayKey, Task[]> {
  const map = new Map<DayKey, Task[]>();
  for (const day of DAYS) map.set(day as DayKey, schedule.activities[day] ?? []);
  return map;
}

// ── The model ────────────────────────────────────────────────────────────────

/**
 * Completion rate by scheduled time band and by weekday.
 *
 * Walks each past date in the window, asks which tasks were scheduled then,
 * and records whether each resolved occurrence completed — keyed by the time
 * it was *scheduled for*, never by when it was ticked.
 */
export function computeSlotReliability(
  schedule: Schedule,
  now: Date = new Date(),
  lookbackDays: number = RELIABILITY_LOOKBACK_DAYS,
): SlotReliability {
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const byDay = uniqueTasksByDay(schedule);
  const trackingStart = schedule.preferences?.startDate;
  const todayISO = localISODate(now);

  const byBand = Object.fromEntries(
    TIME_BANDS.map((b) => [b.id, emptyCell()]),
  ) as Record<TimeBandId, ReliabilityCell>;
  const byWeekday = Object.fromEntries(
    DAYS.map((d) => [d, emptyCell()]),
  ) as Record<DayKey, ReliabilityCell>;

  let sampleSize = 0;

  // Yesterday backwards: today's occurrences are still live, and counting an
  // unfinished morning task as a failure at 9am would be wrong.
  for (let i = 1; i <= lookbackDays; i++) {
    const dateISO = addDaysToISO(todayISO, -i);
    if (trackingStart && dateISO < trackingStart) break;
    const weekday = DAYS[(new Date(`${dateISO}T12:00:00`).getDay() + 6) % 7] as DayKey;

    for (const task of byDay.get(weekday) ?? []) {
      if (!isTrackedTask(task)) continue;
      if (task.planId && !isPlanRunning(plansById.get(task.planId))) continue;
      if (!isTaskScheduledOn(task, dateISO, true, trackingStart)) continue;

      const state = completionForDate(task, dateISO);
      // Unresolved says nothing — see the header.
      if (!state.completed && !state.missed) continue;

      // The occurrence, so a per-date retiming is credited to the band it was
      // actually moved to rather than the template's original slot.
      const occurrence = resolveOccurrence(task, dateISO);
      const first = getSlots(occurrence)[0];
      const startMinutes = parseTimeToMinutes(first?.startTime ?? "");
      if (startMinutes === null) continue;

      const band = bandForMinutes(startMinutes);
      const done = state.completed ? 1 : 0;

      byBand[band].resolved += 1;
      byBand[band].completed += done;
      byWeekday[weekday].resolved += 1;
      byWeekday[weekday].completed += done;
      sampleSize += 1;
    }
  }

  return {
    byBand: Object.fromEntries(
      TIME_BANDS.map((b) => [b.id, finalize(byBand[b.id])]),
    ) as Record<TimeBandId, ReliabilityCell>,
    byWeekday: Object.fromEntries(
      DAYS.map((d) => [d, finalize(byWeekday[d as DayKey])]),
    ) as Record<DayKey, ReliabilityCell>,
    sampleSize,
    hasEnoughData: sampleSize >= MIN_BAND_SAMPLES,
  };
}

// ── Readings ─────────────────────────────────────────────────────────────────

export interface BandReading {
  band: TimeBandId;
  label: string;
  rate: number;
  resolved: number;
}

function rankedBands(model: SlotReliability): BandReading[] {
  return TIME_BANDS.flatMap((b) => {
    const cell = model.byBand[b.id];
    return cell.rate === null
      ? []
      : [{ band: b.id, label: b.label, rate: cell.rate, resolved: cell.resolved }];
  }).sort((a, b) => b.rate - a.rate);
}

/** The band this person completes most of what they schedule into. */
export function strongestBand(model: SlotReliability): BandReading | null {
  const best = rankedBands(model)[0];
  return best && best.rate >= STRONG_BAND_RATE ? best : null;
}

/** The band that most reliably swallows work, if one stands out. */
export function weakestBand(model: SlotReliability): BandReading | null {
  const ranked = rankedBands(model);
  const worst = ranked[ranked.length - 1];
  // Only interesting when there is a better band to move to — a user whose
  // every band is weak has a workload problem, not a scheduling one, and
  // capacity (lib/capacityModel.ts) is the honest thing to tell them.
  if (!worst || worst.rate > WEAK_BAND_RATE) return null;
  return ranked.length >= 2 && ranked[0].rate >= STRONG_BAND_RATE ? worst : null;
}

/**
 * Whether a specific task is parked in a band this person rarely completes,
 * with somewhere better to put it.
 *
 * Deliberately requires BOTH a weak current band and a strong alternative:
 * "you miss this a lot" is a complaint, "you miss this a lot and here is when
 * you don't" is advice.
 */
export function suggestBetterBand(
  model: SlotReliability,
  task: Pick<Task, "startTime" | "slots">,
): { from: BandReading; to: BandReading } | null {
  if (!model.hasEnoughData) return null;
  const startMinutes = parseTimeToMinutes(getSlots(task as Task)[0]?.startTime ?? "");
  if (startMinutes === null) return null;

  const current = bandForMinutes(startMinutes);
  const cell = model.byBand[current];
  if (cell.rate === null || cell.rate > WEAK_BAND_RATE) return null;

  const best = strongestBand(model);
  if (!best || best.band === current) return null;

  return {
    from: { band: current, label: bandLabel(current), rate: cell.rate, resolved: cell.resolved },
    to: best,
  };
}

/**
 * A ready-to-render sentence about when this person executes, or null.
 *
 * Phrased as an observation rather than an instruction — PP-06 says PlanR
 * recommends and the user decides, and a completion rate is evidence, not a
 * verdict on their character.
 */
export function reliabilityNarrative(model: SlotReliability): string | null {
  const best = strongestBand(model);
  if (!best) return null;
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const worst = weakestBand(model);

  if (worst) {
    return `You finish ${pct(best.rate)} of what you schedule in the ${best.label.toLowerCase()}, and ${pct(worst.rate)} of what lands in the ${worst.label.toLowerCase()}.`;
  }
  return `You finish ${pct(best.rate)} of what you schedule in the ${best.label.toLowerCase()} — your most reliable stretch.`;
}

/**
 * A band's clock range, e.g. "7:00 AM – 12:00 PM".
 *
 * Clock times, not durations: `formatMinutes` renders 4*60 as "4h", which
 * would read as a length rather than a time of day.
 */
export function bandRangeLabel(id: TimeBandId): string {
  const band = TIME_BANDS.find((b) => b.id === id);
  if (!band) return "";
  const clock = (minutes: number) => inputToDisplayTime(minutesToInputTime(minutes % (24 * 60)));
  return `${clock(band.startMinutes)} – ${clock(band.endMinutes)}`;
}
