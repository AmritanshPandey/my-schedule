/**
 * What this person actually sustains, versus what they keep planning.
 *
 * "Plan for the life you actually have" is the product's whole thesis, and
 * until now the only thing enforcing it was a geometric check: does the work
 * fit between the day's start and end. That asks whether a week is
 * *physically* possible. It is the wrong question. A week can be physically
 * possible and still be one this person has never once completed.
 *
 * This measures the other thing — the observed ceiling — from the only honest
 * source available: dated completion events. No model, no inference, no LLM.
 * Sum the minutes of work actually completed in each past week, take the
 * median, and compare it with what the coming week asks for.
 *
 * Median, not mean, on purpose: one holiday fortnight or one heroic week
 * should not move the number. The median is what a typical week looks like,
 * which is the only figure worth planning against.
 *
 * ── Honest limitations, stated because the numbers are only as good as these
 *
 *  - Recurring tasks are stored as weekday templates with no history, so a
 *    task that has since been deleted or retimed cannot be reconstructed.
 *    Completed minutes are therefore measured against each task's CURRENT
 *    duration. For a user who mostly keeps their tasks, this is close; for one
 *    who rebuilds their schedule weekly, it drifts. Same constraint
 *    lib/executionAnalytics.ts documents for its own `scheduled` figure.
 *  - Only whole-task and slot completions count. A part-done task with some
 *    subtasks ticked contributes nothing, because there is no honest way to
 *    price a subtask in minutes.
 *  - Commitments are excluded throughout. They are held time, not executed
 *    work — counting them would inflate the ceiling with hours the user never
 *    chose to spend on their goals.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { DayKey, Schedule, Task } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { isPlanRunning } from "./planLifecycle";
import { isTrackedTask, completionForDate } from "./taskCompletion";
import { getSlots } from "./taskMutations";
import { isTaskScheduledOn } from "./taskOccurrence";
import { localISODate, addDaysToISO } from "./dateUtils";
import { parseTimeToMinutes } from "./timeUtils";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** How many completed weeks to sample. Eight covers a seasonal wobble without
 *  reaching back to a schedule the user no longer recognises. */
export const CAPACITY_WEEKS = 8;

/** Below this many sampled weeks the median is noise, and the model reports
 *  `hasEnoughData: false` rather than a number the UI would treat as fact. */
export const MIN_CAPACITY_WEEKS = 3;

/** Planned/sustained ratio at or above which a week reads as a stretch. */
export const STRETCH_RATIO = 1.15;

/** Ratio at or above which a week is one this person has never actually done. */
export const UNREALISTIC_RATIO = 1.5;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CapacityWeek {
  /** Monday of the week, ISO. */
  weekStartISO: string;
  /** Minutes of tracked work actually completed that week. */
  completedMinutes: number;
}

export interface CapacityModel {
  /** Completed weeks, oldest first. Excludes the current partial week. */
  weeks: CapacityWeek[];
  /**
   * Median completed minutes per week — the sustained ceiling. Null until
   * there are `MIN_CAPACITY_WEEKS` of history.
   */
  sustainedWeeklyMinutes: number | null;
  /** Median completed minutes for each weekday, for lumpiness checks. */
  byWeekday: Record<DayKey, number>;
  /** The best single week observed — used to say "even your best week was X". */
  bestWeekMinutes: number | null;
  hasEnoughData: boolean;
}

export type LoadLevel = "comfortable" | "stretch" | "unrealistic";

export interface LoadVerdict {
  level: LoadLevel;
  plannedMinutes: number;
  sustainedMinutes: number;
  /** planned / sustained. 1.0 = exactly a typical week. */
  ratio: number;
  /** A sentence quoting both real figures — never a generic caution. */
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Monday of the week containing `dateISO`. */
export function weekStartISO(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  // JS getDay(): Sun=0…Sat=6; our weeks start Monday.
  return addDaysToISO(dateISO, -((d.getDay() + 6) % 7));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** One slot's length in minutes, tolerating a slot that runs past midnight. */
function slotMinutes(slot: { startTime: string; endTime: string }): number {
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
}

/** Whole-task duration: every slot summed. */
function taskMinutes(task: Task): number {
  return getSlots(task).reduce((sum, slot) => sum + slotMinutes(slot), 0);
}

/**
 * Minutes of tracked work this task records as completed on `dateISO`.
 *
 * A whole-task completion prices the whole task; individual slot completions
 * price only those slots, so a two-phase task with one phase done contributes
 * half. Subtask ticks contribute nothing — see the header.
 */
export function completedMinutesOn(task: Task, dateISO: string): number {
  if (!isTrackedTask(task)) return 0;
  const state = completionForDate(task, dateISO);
  const slots = getSlots(task);
  if (state.completed) return taskMinutes(task);
  if (slots.length > 1 && state.completedSlotIndices.length > 0) {
    return state.completedSlotIndices.reduce(
      (sum, index) => sum + (slots[index] ? slotMinutes(slots[index]) : 0),
      0,
    );
  }
  return 0;
}

/** Every task in the schedule, deduped across the weekday buckets it recurs in. */
function uniqueTasks(schedule: Pick<Schedule, "activities">): Task[] {
  const byId = new Map<string, Task>();
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      if (!byId.has(task.id)) byId.set(task.id, task);
    }
  }
  return [...byId.values()];
}

/**
 * The earliest date this user recorded anything at all.
 *
 * `preferences.startDate` is optional and most people never set it, so without
 * this the sample window reaches back into weeks that predate the user
 * entirely. Those weeks are not evidence of low capacity — they are absence of
 * data — and counting them as zeroes halves the median for anyone in their
 * first two months. Completions and misses both count: a recorded miss means
 * the app was in use that week, which is exactly what we are trying to detect.
 */
function firstRecordedDate(tasks: readonly Task[]): string | null {
  let earliest: string | null = null;
  for (const task of tasks) {
    for (const event of task.completionHistory ?? []) {
      const dateISO = localISODate(new Date(event.completedAt));
      if (earliest === null || dateISO < earliest) earliest = dateISO;
    }
  }
  return earliest;
}

// ── The model ────────────────────────────────────────────────────────────────

/**
 * Measure the sustained weekly ceiling from completion history.
 *
 * The current (partial) week is excluded — it would always read low and drag
 * the median down. Weeks before `preferences.startDate` are excluded too, so
 * adopting the app does not count years of empty history as capacity.
 */
export function computeCapacityModel(
  schedule: Schedule,
  now: Date = new Date(),
  weeksCount: number = CAPACITY_WEEKS,
): CapacityModel {
  const tasks = uniqueTasks(schedule);
  // The later of the two floors: an explicit tracking start, and the first day
  // this user recorded anything. Either alone leaves a hole — the setting is
  // usually unset, and a user who sets it later still has older events.
  const recorded = firstRecordedDate(tasks);
  const explicit = schedule.preferences?.startDate;
  const trackingStart =
    explicit && recorded ? (explicit > recorded ? explicit : recorded) : explicit ?? recorded ?? undefined;
  const todayISO = localISODate(now);
  const currentWeekStart = weekStartISO(todayISO);

  const weeks: CapacityWeek[] = [];
  const perWeekday: Record<DayKey, number[]> = Object.fromEntries(
    DAYS.map((d) => [d, [] as number[]]),
  ) as Record<DayKey, number[]>;

  for (let i = weeksCount; i >= 1; i--) {
    const start = addDaysToISO(currentWeekStart, -7 * i);
    // A week that ended before tracking began is not this user's history.
    if (trackingStart && addDaysToISO(start, 6) < trackingStart) continue;

    let weekTotal = 0;
    for (let offset = 0; offset < 7; offset++) {
      const dateISO = addDaysToISO(start, offset);
      if (trackingStart && dateISO < trackingStart) continue;
      let dayTotal = 0;
      for (const task of tasks) dayTotal += completedMinutesOn(task, dateISO);
      weekTotal += dayTotal;
      perWeekday[DAYS[offset] as DayKey].push(dayTotal);
    }
    weeks.push({ weekStartISO: start, completedMinutes: weekTotal });
  }

  const totals = weeks.map((w) => w.completedMinutes);
  const hasEnoughData = weeks.length >= MIN_CAPACITY_WEEKS;

  return {
    weeks,
    sustainedWeeklyMinutes: hasEnoughData ? median(totals) : null,
    byWeekday: Object.fromEntries(
      DAYS.map((d) => [d, median(perWeekday[d as DayKey]) ?? 0]),
    ) as Record<DayKey, number>,
    bestWeekMinutes: totals.length > 0 ? Math.max(...totals) : null,
    hasEnoughData,
  };
}

/**
 * Minutes of tracked work a normal week currently asks for.
 *
 * Counts each task once per weekday it is scheduled on, so a Mon/Wed/Fri task
 * is priced three times. Paused plans and commitments are excluded, matching
 * what the capacity measurement counts — comparing a planned figure that
 * includes held time against a completed figure that excludes it would
 * overstate every week.
 */
export function plannedWeeklyMinutes(schedule: Schedule, now: Date = new Date()): number {
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const weekStart = weekStartISO(localISODate(now));
  let total = 0;

  for (let offset = 0; offset < 7; offset++) {
    const day = DAYS[offset] as DayKey;
    const dateISO = addDaysToISO(weekStart, offset);
    for (const task of schedule.activities[day] ?? []) {
      if (!isTrackedTask(task)) continue;
      if (task.planId && !isPlanRunning(plansById.get(task.planId))) continue;
      if (!isTaskScheduledOn(task, dateISO, true, schedule.preferences?.startDate)) continue;
      total += taskMinutes(task);
    }
  }
  return total;
}

// ── The verdict ──────────────────────────────────────────────────────────────

function formatHours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

/**
 * Compare a planned week against the observed ceiling.
 *
 * Returns null when there isn't enough history to say anything true — an
 * unproven guess presented as a warning is worse than silence, and this is
 * exactly the kind of number a user would take literally.
 */
export function assessPlannedLoad(
  model: CapacityModel,
  plannedMinutes: number,
): LoadVerdict | null {
  const sustained = model.sustainedWeeklyMinutes;
  if (!model.hasEnoughData || sustained === null) return null;
  // A user whose median week is zero has history but no completions; there is
  // no ceiling to measure against, and "∞× your usual" helps nobody.
  if (sustained === 0) return null;

  const ratio = plannedMinutes / sustained;
  const planned = formatHours(plannedMinutes);
  const usual = formatHours(sustained);

  if (ratio >= UNREALISTIC_RATIO) {
    const best = model.bestWeekMinutes;
    // Naming the best week pre-empts "but I could push" — it says the ceiling
    // is measured from their own record, not imposed.
    const bestClause =
      best !== null && plannedMinutes > best
        ? ` Even your best week was ${formatHours(best)}.`
        : "";
    return {
      level: "unrealistic",
      plannedMinutes,
      sustainedMinutes: sustained,
      ratio,
      message: `This week asks for ${planned}. You typically complete ${usual}.${bestClause}`,
    };
  }

  if (ratio >= STRETCH_RATIO) {
    return {
      level: "stretch",
      plannedMinutes,
      sustainedMinutes: sustained,
      ratio,
      message: `This week asks for ${planned}, above your usual ${usual}. Doable, but it is a stretch.`,
    };
  }

  return {
    level: "comfortable",
    plannedMinutes,
    sustainedMinutes: sustained,
    ratio,
    message: `This week asks for ${planned}, within your usual ${usual}.`,
  };
}

/**
 * The most overloaded weekday relative to what this person usually completes
 * on that day, or null when nothing stands out.
 *
 * Lumpiness is a different failure from a heavy week: a 20h week is fine if
 * it is spread, and impossible if 9h of it lands on Tuesday. Keyed per weekday
 * because people's days genuinely differ — a free Sunday is not a work
 * Wednesday, and a single daily average would flag both wrongly.
 */
export function heaviestDay(
  schedule: Schedule,
  model: CapacityModel,
  now: Date = new Date(),
): { day: DayKey; plannedMinutes: number; usualMinutes: number; ratio: number } | null {
  if (!model.hasEnoughData) return null;
  const plansById = new Map(schedule.plans.map((p) => [p.id, p]));
  const weekStart = weekStartISO(localISODate(now));

  let worst: { day: DayKey; plannedMinutes: number; usualMinutes: number; ratio: number } | null = null;

  for (let offset = 0; offset < 7; offset++) {
    const day = DAYS[offset] as DayKey;
    const dateISO = addDaysToISO(weekStart, offset);
    let planned = 0;
    for (const task of schedule.activities[day] ?? []) {
      if (!isTrackedTask(task)) continue;
      if (task.planId && !isPlanRunning(plansById.get(task.planId))) continue;
      if (!isTaskScheduledOn(task, dateISO, true, schedule.preferences?.startDate)) continue;
      planned += taskMinutes(task);
    }
    const usual = model.byWeekday[day];
    if (usual <= 0 || planned <= 0) continue;
    const ratio = planned / usual;
    if (ratio >= STRETCH_RATIO && (!worst || ratio > worst.ratio)) {
      worst = { day, plannedMinutes: planned, usualMinutes: usual, ratio };
    }
  }
  return worst;
}
