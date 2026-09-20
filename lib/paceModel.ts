/**
 * The gap between the pace a target needs and the pace actually happening.
 *
 * lib/milestoneHealth.ts already answers "when will this finish". That is the
 * right headline, but it is a date, and a date is hard to act on: someone told
 * they will finish twelve days late still has to work out what would close the
 * gap. This answers the other half — "you need 1.4 kg a week; you are averaging
 * 0.6" — which is a number they can decide about.
 *
 * ── Why regression rather than the existing two-point slope
 *
 * `forecastMetricDate` takes the first and last entry in a window and divides.
 * That is fine when a metric moves cleanly, and badly wrong when it does not:
 * weight, savings and study hours all wobble, and a single heavy Monday
 * weigh-in at either end swings the whole projection. Least squares uses every
 * point, so one outlier moves the line a little instead of pivoting it.
 *
 * It also yields R², which is the honest part. A slope through scattered points
 * is a number with no meaning behind it, so `fit` travels with every result and
 * callers are expected to stay quiet below `MIN_TRUSTWORTHY_FIT` rather than
 * quote a projection the data does not support.
 *
 * This module deliberately does NOT replace the existing forecast. That one
 * feeds milestone health, which has its own tuned thresholds and a large test
 * suite pinned to them; swapping its maths underneath would change health
 * verdicts as a side effect of adding a feature. This is additive.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { Milestone, MetricEntry, ProgressTracker, Task } from "./useScheduleDB";
import { localISODate, addDaysToISO } from "./dateUtils";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** Fewer points than this and a regression line is drawing through noise. */
export const MIN_REGRESSION_POINTS = 3;

/**
 * R² below which the trend is too scattered to quote.
 *
 * Deliberately lenient. Real human metrics are noisy — a 0.5 fit on eight
 * weigh-ins is a genuine trend, not a coincidence — and demanding textbook
 * tidiness would silence the feature for exactly the people it is for.
 */
export const MIN_TRUSTWORTHY_FIT = 0.35;

/** Ratio of actual to required pace at or above which the target is on track. */
export const ON_PACE_RATIO = 0.95;

// ── Regression ───────────────────────────────────────────────────────────────

export interface RegressionPoint {
  dateISO: string;
  value: number;
}

export interface Regression {
  /** Units of change per week. Sign follows the raw values, not the goal. */
  slopePerWeek: number;
  /** Fitted value at the first point's date. */
  intercept: number;
  /** Coefficient of determination, 0–1. 1 = every point on the line. */
  r2: number;
  n: number;
  firstDateISO: string;
  lastDateISO: string;
}

function daysBetween(a: string, b: string): number {
  const toUTC = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12);
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/**
 * Ordinary least squares over dated values, with x measured in weeks from the
 * first point.
 *
 * Returns null below `MIN_REGRESSION_POINTS`, or when every point shares a
 * date — a vertical line has no slope, and dividing by its zero variance would
 * produce Infinity rather than an error anyone would notice.
 */
export function linearRegression(points: readonly RegressionPoint[]): Regression | null {
  if (points.length < MIN_REGRESSION_POINTS) return null;
  const sorted = [...points].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const origin = sorted[0].dateISO;

  const xs = sorted.map((p) => daysBetween(origin, p.dateISO) / 7);
  const ys = sorted.map((p) => p.value);
  const n = xs.length;

  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    sxx += dx * dx;
    sxy += dx * (ys[i] - meanY);
  }
  if (sxx === 0) return null; // every reading on one day

  const slopePerWeek = sxy / sxx;
  const intercept = meanY - slopePerWeek * meanX;

  // R²: how much of the variation the line accounts for. A flat series has no
  // variation to explain, so the line is a perfect description of it.
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slopePerWeek * xs[i];
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - predicted) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return {
    slopePerWeek,
    intercept,
    r2,
    n,
    firstDateISO: sorted[0].dateISO,
    lastDateISO: sorted[n - 1].dateISO,
  };
}

// ── Pace ─────────────────────────────────────────────────────────────────────

export type PaceLevel = "ahead" | "on_pace" | "behind" | "wrong_way";

export interface PaceGap {
  level: PaceLevel;
  /** Units per week needed from today to hit the target by its deadline. */
  requiredPerWeek: number;
  /** Units per week actually being achieved, signed so positive = toward the goal. */
  actualPerWeek: number;
  /** actual ÷ required. 1 = exactly on pace. Null when nothing is required. */
  ratio: number | null;
  /** Where the current pace lands. Null when not moving toward the goal. */
  projectedDateISO: string | null;
  /** Deadline − projection, in days. Negative = late. Null without a projection. */
  daysAheadBehind: number | null;
  /** 0–1 goodness of fit behind `actualPerWeek`. */
  fit: number;
  /** How much still to cover, in the metric's own units. */
  remaining: number;
  unit: string;
}

function roundTo(value: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

function levelFor(ratio: number | null, actualPerWeek: number): PaceLevel {
  if (actualPerWeek <= 0) return "wrong_way";
  // A null ratio here can only mean the deadline has passed with work still
  // outstanding — the target-already-met case returns before this is reached.
  // No rate can meet a deadline in the past, so this is behind by definition.
  if (ratio === null) return "behind";
  if (ratio >= 1.15) return "ahead";
  if (ratio >= ON_PACE_RATIO) return "on_pace";
  return "behind";
}

/**
 * Required vs actual pace for a numeric tracker with a goal and a deadline.
 *
 * `deadlineISO` is the date the target is wanted by — usually the milestone or
 * plan the tracker serves, since a ProgressTracker carries no date of its own.
 * Without one there is no "required" rate to compare against, and the result is
 * null rather than a projection with nothing to judge it by.
 */
export function trackerPace(params: {
  tracker: Pick<ProgressTracker, "id" | "goalValue" | "goalDirection" | "unit">;
  entries: readonly MetricEntry[];
  deadlineISO: string;
  now?: Date;
  trackingStart?: string;
}): PaceGap | null {
  const { tracker, entries, deadlineISO, trackingStart } = params;
  const now = params.now ?? new Date();
  const todayISO = localISODate(now);
  if (tracker.goalValue === undefined) return null;

  const scoped = entries
    .filter((e) => e.trackerId === tracker.id && e.date <= todayISO && (!trackingStart || e.date >= trackingStart))
    .map((e) => ({ dateISO: e.date, value: e.value }));

  const regression = linearRegression(scoped);
  if (!regression) return null;

  const sorted = [...scoped].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const current = sorted[sorted.length - 1].value;
  const decreasing = (tracker.goalDirection ?? "increase_good") === "decrease_good";
  const target = tracker.goalValue;

  // Signed so positive always means "toward the goal", whichever way that is.
  const remaining = decreasing ? current - target : target - current;
  const actualPerWeek = decreasing ? -regression.slopePerWeek : regression.slopePerWeek;

  const weeksLeft = daysBetween(todayISO, deadlineISO) / 7;
  const unit = tracker.unit ?? "";

  // Target already met: no required rate, and nothing to be behind on.
  if (remaining <= 0) {
    return {
      level: "on_pace",
      requiredPerWeek: 0,
      actualPerWeek: roundTo(actualPerWeek, 2),
      ratio: null,
      projectedDateISO: todayISO,
      daysAheadBehind: daysBetween(todayISO, deadlineISO),
      fit: regression.r2,
      remaining: 0,
      unit,
    };
  }

  // A deadline today or in the past leaves no time to require a rate over.
  const requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : Infinity;
  const ratio = Number.isFinite(requiredPerWeek) && requiredPerWeek > 0
    ? actualPerWeek / requiredPerWeek
    : null;

  const projectedDateISO = actualPerWeek > 0
    ? addDaysToISO(todayISO, Math.ceil((remaining / actualPerWeek) * 7))
    : null;

  return {
    level: levelFor(ratio, actualPerWeek),
    requiredPerWeek: Number.isFinite(requiredPerWeek) ? roundTo(requiredPerWeek, 2) : Infinity,
    actualPerWeek: roundTo(actualPerWeek, 2),
    ratio: ratio === null ? null : roundTo(ratio, 2),
    projectedDateISO,
    daysAheadBehind: projectedDateISO ? daysBetween(projectedDateISO, deadlineISO) : null,
    fit: regression.r2,
    remaining: roundTo(remaining, 2),
    unit,
  };
}

/**
 * Required vs actual pace for a milestone measured by linked tasks, in
 * sessions per week.
 *
 * Counts are supplied by the caller (lib/milestoneHealth.ts owns the
 * occurrence walk and its recurrence/exception rules, and duplicating that
 * here would be a second source of truth for the same number).
 */
export function milestonePace(params: {
  milestone: Pick<Milestone, "startDate" | "plannedEndDate">;
  /** Occurrences expected across the whole milestone window. */
  expectedTotal: number;
  /** Occurrences completed so far. */
  completedSoFar: number;
  now?: Date;
}): PaceGap | null {
  const { milestone, expectedTotal, completedSoFar } = params;
  const now = params.now ?? new Date();
  const todayISO = localISODate(now);
  if (expectedTotal <= 0) return null;
  if (todayISO < milestone.startDate) return null;

  const remaining = Math.max(0, expectedTotal - completedSoFar);
  const weeksElapsed = Math.max(daysBetween(milestone.startDate, todayISO), 1) / 7;
  const weeksLeft = daysBetween(todayISO, milestone.plannedEndDate) / 7;

  const actualPerWeek = completedSoFar / weeksElapsed;
  const unit = "sessions";

  if (remaining <= 0) {
    return {
      level: "on_pace",
      requiredPerWeek: 0,
      actualPerWeek: roundTo(actualPerWeek),
      ratio: null,
      projectedDateISO: todayISO,
      daysAheadBehind: daysBetween(todayISO, milestone.plannedEndDate),
      fit: 1,
      remaining: 0,
      unit,
    };
  }

  const requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : Infinity;
  const ratio = Number.isFinite(requiredPerWeek) && requiredPerWeek > 0
    ? actualPerWeek / requiredPerWeek
    : null;
  const projectedDateISO = actualPerWeek > 0
    ? addDaysToISO(todayISO, Math.ceil((remaining / actualPerWeek) * 7))
    : null;

  return {
    level: levelFor(ratio, actualPerWeek),
    requiredPerWeek: Number.isFinite(requiredPerWeek) ? roundTo(requiredPerWeek) : Infinity,
    actualPerWeek: roundTo(actualPerWeek),
    ratio: ratio === null ? null : roundTo(ratio, 2),
    projectedDateISO,
    daysAheadBehind: projectedDateISO ? daysBetween(projectedDateISO, milestone.plannedEndDate) : null,
    // Occurrence counts are exact, not fitted — there is no scatter to explain.
    fit: 1,
    remaining,
    unit,
  };
}

// ── Prose ────────────────────────────────────────────────────────────────────

function formatRate(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "more than is possible";
  const n = Math.abs(value) >= 10 ? Math.round(value) : roundTo(value, 1);
  return unit ? `${n} ${unit}/week` : `${n}/week`;
}

/**
 * The gap as a sentence, or null when the fit is too weak to claim a rate.
 *
 * Quoting a slope drawn through scattered points would be the most confident
 * thing on the screen and the least supported, so a poor fit says nothing at
 * all rather than hedging.
 */
export function paceNarrative(gap: PaceGap | null): string | null {
  if (!gap) return null;
  if (gap.fit < MIN_TRUSTWORTHY_FIT) return null;

  const actual = formatRate(Math.abs(gap.actualPerWeek), gap.unit);

  // A deadline already past has no meaningful required rate — every sentence
  // below would read as nonsense ("about the more than is possible this
  // needs"), so it gets its own.
  if (!Number.isFinite(gap.requiredPerWeek) && gap.remaining > 0) {
    const left = gap.unit ? `${gap.remaining} ${gap.unit}` : `${gap.remaining}`;
    return `The target date has passed with ${left} still to go.`;
  }

  const required = formatRate(gap.requiredPerWeek, gap.unit);

  switch (gap.level) {
    case "wrong_way":
      return gap.actualPerWeek === 0
        ? `No movement yet. You need ${required} to hit this.`
        : `This is moving away from the target. You need ${required} to hit it.`;
    case "behind":
      return `You need ${required} to hit this, and you're averaging ${actual}.`;
    case "ahead":
      return `You're averaging ${actual}, ahead of the ${required} this needs.`;
    case "on_pace":
      return gap.remaining <= 0
        ? "Target reached."
        : `You're averaging ${actual}, about the ${required} this needs.`;
  }
}
