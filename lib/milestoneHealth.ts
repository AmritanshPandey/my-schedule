/**
 * Live Milestone health — task/consistency/metric progress, expected-vs-
 * actual pace, and a forecasted completion date, all derived from existing
 * data (linked tasks + a linked tracker's logged values). Nothing here is
 * stored: like lib/planProgress.ts's milestone progress, this is a pure,
 * read-only layer recomputed on every render from the raw Schedule — there
 * is no event system to wire up, React's own render cycle already reruns
 * whatever useMemo calls calculateMilestoneState whenever a linked task, a
 * tracker entry, or the milestone itself changes.
 *
 * Mirrors lib/planInsights.ts's derivePlanStatus for the health-derivation
 * shape: a small ordered enum, a grace period before a new/quiet milestone
 * can read as failing, and every threshold centralized here as a named
 * constant rather than scattered through the UI.
 *
 * Pure and React-free, matching planProgress.ts / planInsights.ts / roadmapDates.ts.
 */

import type { Milestone, Plan, Task, ProgressTracker, MetricEntry, DayKey } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isTrackedTask } from "./taskCompletion";
import { calculateMilestoneProgress } from "./planProgress";
import { addDaysToISO, localISODate, formatDateShort } from "./dateUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MilestoneHealth =
  | "not_started" | "getting_started" | "ahead" | "on_track" | "at_risk" | "delayed" | "completed";

export interface MilestoneState {
  milestoneId: string;
  health: MilestoneHealth;
  /** False = neither a linked task nor a linked tracker — setup guidance, not fake progress. */
  hasData: boolean;
  /** 0-100, from the existing calculateMilestoneProgress (lib/planProgress.ts). Null = no linked tasks. */
  taskProgress: number | null;
  /** 0-100 rolling cadence of linked tasks within the milestone's elapsed window. Null = not enough signal yet. */
  consistency: number | null;
  /** 0-100 clamped display value for the primary linked tracker. Null = no linked tracker or no entries yet. */
  metricProgress: number | null;
  /** Uncapped — can exceed 100 (target exceeded) — for "ahead" math and detail display. */
  metricProgressRaw: number | null;
  /** True when the metric has moved further from the target since starting, never surfaced as a negative %. */
  metricMovedWrongDirection: boolean;
  /** Display-ready values for the primary linked tracker — null when none is linked or logged yet. */
  metricCurrentValue: number | null;
  metricTargetValue: number | null;
  metricUnit: string | undefined;
  /** The ONE headline % — metric-primary when a tracker is linked, else task-primary. Null = no data. */
  overallProgress: number | null;
  /** 0-100 — how far along the milestone "should" be by now. */
  expectedProgress: number | null;
  /** ISO date this milestone is projected to actually finish. Null = not enough data to project. */
  forecastDate: string | null;
  /** plannedEndDate - forecastDate, in days. Positive = ahead of target, negative = behind. Null if no forecast. */
  daysAheadBehind: number | null;
  /** A contextual sentence referencing the milestone's real dates/numbers — never a generic canned line. */
  statusMessage: string;
}

// ── Thresholds — centralized here, nothing hardcoded inline in the UI ──────────

/** Days a milestone gets before "nothing logged yet" reads as at-risk/delayed
 *  rather than just getting started — mirrors lib/planInsights.ts's PROVING_DAYS. */
export const GETTING_STARTED_DAYS = 7;
/** Forecast this many days (or more) before the target reads "ahead". */
export const AHEAD_BUFFER_DAYS = 5;
/** Forecast up to this many days after the target still reads "at_risk", not "delayed". */
export const AT_RISK_BUFFER_DAYS = 10;
/** Minimum elapsed days before a consistency % is trusted — one missed
 *  occurrence on day one must not read as "0% consistent" (spec: avoid false alerts). */
export const CONSISTENCY_MIN_WINDOW_DAYS = 3;
/** Consistency-only fallback thresholds, used only when a forecast can't be computed at all. */
export const CONSISTENCY_ON_TRACK_THRESHOLD = 75;
export const CONSISTENCY_AT_RISK_THRESHOLD = 60;
/** Trailing window used to compute a metric's rate of change (grows from MIN to MAX when sparse). */
export const METRIC_TREND_MIN_WINDOW_DAYS = 7;
export const METRIC_TREND_MAX_WINDOW_DAYS = 30;
/** Trailing window used to compute a task-completion rate for forecasting. */
export const TASK_RATE_WINDOW_DAYS = 14;

// ── Date helpers (file-local, mirrors the parseISODate convention in roadmapDates.ts) ──

function parseISO(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}
/** Whole days from fromISO to toISO, inclusive of both ends (a single day = 1). */
function daysBetweenInclusive(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86_400_000) + 1;
}
/** toISO - fromISO in days, signed (not inclusive — a date-arithmetic delta). */
function daysBetweenSigned(fromISO: string, toISO: string): number {
  return Math.round((parseISO(toISO) - parseISO(fromISO)) / 86_400_000);
}
function clampISO(iso: string, min: string, max: string): string {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

const JS_TO_DAY: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function dayKeyFor(dateISO: string): DayKey {
  return JS_TO_DAY[new Date(`${dateISO}T00:00:00`).getDay()];
}

// ── Linked-task occurrence counting ─────────────────────────────────────────
// Mirrors lib/planProgress.ts's findTaskCopies/durable-completion approach,
// but per-date (expected vs completed on each day) rather than "ever done".

function copiesById(taskId: string, activities: Record<string, Task[]>): Task[] {
  return DAYS.flatMap((d) => activities[d] ?? []).filter((t) => t.id === taskId);
}

/** Every ISO date this task has a durable "task" completion event on,
 *  across every weekday-bucket copy sharing its id. */
function completedDatesFor(copies: Task[]): Set<string> {
  const dates = new Set<string>();
  for (const copy of copies) {
    for (const event of copy.completionHistory ?? []) {
      if (event.completionType === "task") dates.add(localISODate(new Date(event.completedAt)));
    }
  }
  return dates;
}

interface OccurrenceCounts { expected: number; completed: number; }

/** Expected-vs-completed occurrences for one linked task within [fromISO, toISO]. */
function occurrenceCounts(taskId: string, activities: Record<string, Task[]>, fromISO: string, toISO: string): OccurrenceCounts {
  const copies = copiesById(taskId, activities);
  if (copies.length === 0 || !isTrackedTask(copies[0])) return { expected: 0, completed: 0 };
  const completedDates = completedDatesFor(copies);

  let expected = 0;
  let completed = 0;
  let cursor = fromISO;
  while (cursor <= toISO) {
    const dayKey = dayKeyFor(cursor);
    const bucketCopy = (activities[dayKey] ?? []).find((t) => t.id === taskId);
    if (bucketCopy && isTaskScheduledOn(bucketCopy, cursor, true)) {
      expected++;
      if (completedDates.has(cursor)) completed++;
    }
    cursor = addDaysToISO(cursor, 1);
  }
  return { expected, completed };
}

function aggregateOccurrences(milestone: Milestone, activities: Record<string, Task[]>, toISO: string): OccurrenceCounts {
  let expected = 0;
  let completed = 0;
  for (const taskId of milestone.linkedActivities ?? []) {
    const c = occurrenceCounts(taskId, activities, milestone.startDate, toISO);
    expected += c.expected;
    completed += c.completed;
  }
  return { expected, completed };
}

// ── Consistency ───────────────────────────────────────────────────────────────

/**
 * Rolling cadence of linked recurring tasks within the milestone's elapsed
 * window: completed occurrences ÷ expected occurrences so far. Null when
 * nothing is linked, the milestone hasn't started, or the window is still
 * too short to mean anything (avoids a false alarm from one missed task).
 */
export function calculateConsistency(milestone: Milestone, activities: Record<string, Task[]>, now: Date = new Date()): number | null {
  const todayStr = localISODate(now);
  if (todayStr < milestone.startDate) return null;
  if ((milestone.linkedActivities?.length ?? 0) === 0) return null;

  const toISO = clampISO(todayStr, milestone.startDate, milestone.plannedEndDate);
  const elapsedDays = daysBetweenInclusive(milestone.startDate, toISO);
  if (elapsedDays < CONSISTENCY_MIN_WINDOW_DAYS) return null;

  const { expected, completed } = aggregateOccurrences(milestone, activities, toISO);
  if (expected === 0) return null;
  return Math.round((completed / expected) * 100);
}

// ── Expected progress ───────────────────────────────────────────────────────

/**
 * How far along the milestone "should" be by now. Activity-based (expected
 * occurrences elapsed ÷ expected occurrences for the whole window) when
 * tasks are linked — matching the spec's "40 workouts / 10 weeks" example —
 * falling back to plain elapsed-time only when there's nothing activity-based
 * to expect from at all.
 */
export function calculateExpectedProgress(milestone: Milestone, activities: Record<string, Task[]>, now: Date = new Date()): number | null {
  const todayStr = localISODate(now);
  if (todayStr < milestone.startDate) return 0;
  const toISO = clampISO(todayStr, milestone.startDate, milestone.plannedEndDate);

  if ((milestone.linkedActivities?.length ?? 0) > 0) {
    const total = aggregateOccurrences(milestone, activities, milestone.plannedEndDate);
    if (total.expected === 0) return null;
    const elapsed = aggregateOccurrences(milestone, activities, toISO);
    return Math.round(Math.min(100, (elapsed.expected / total.expected) * 100));
  }

  const totalDays = daysBetweenInclusive(milestone.startDate, milestone.plannedEndDate);
  if (totalDays <= 0) return null;
  const elapsedDays = daysBetweenInclusive(milestone.startDate, toISO);
  return Math.round(Math.min(100, (elapsedDays / totalDays) * 100));
}

// ── Metric progress ──────────────────────────────────────────────────────────

function resolvePrimaryTracker(milestone: Milestone, trackers: ProgressTracker[]): ProgressTracker | null {
  const id = milestone.linkedTrackers?.[0];
  if (!id) return null;
  return trackers.find((t) => t.id === id) ?? null;
}

/**
 * `trackingStart` is honoured here for the same reason the Tracking page
 * honours it: the setting promises streaks, trends and consistency ignore
 * everything before it, and metric entries were the one thing it never
 * actually filtered. Milestone health and the Tracking page must agree about
 * the same tracker, so the filter lives at both readers' single entry point.
 */
function entriesForTracker(trackerId: string, metricEntries: MetricEntry[], trackingStart?: string): MetricEntry[] {
  return metricEntries
    .filter((e) => e.trackerId === trackerId && (!trackingStart || e.date >= trackingStart))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface MetricProgressResult {
  progress: number | null;      // 0-100, clamped
  raw: number | null;           // uncapped
  wrongDirection: boolean;
  current: number | null;
  startingValue: number | null;
}

/**
 * Progress toward the milestone's primary linked tracker's goalValue, per
 * the spec's increase/decrease formula. `startingValue` falls back to the
 * tracker's earliest logged entry when not explicitly set. Clamped 0-100 for
 * display; `raw` is preserved uncapped so "target exceeded" reads as ahead,
 * not a nonsensical >100% bar.
 */
export function calculateMetricProgress(
  milestone: Milestone,
  trackers: ProgressTracker[],
  metricEntries: MetricEntry[],
  now: Date = new Date(),
  trackingStart?: string,
): MetricProgressResult {
  const empty: MetricProgressResult = { progress: null, raw: null, wrongDirection: false, current: null, startingValue: null };
  const tracker = resolvePrimaryTracker(milestone, trackers);
  if (!tracker || tracker.goalValue === undefined) return empty;

  const nowStr = localISODate(now);
  const entries = entriesForTracker(tracker.id, metricEntries, trackingStart).filter((e) => e.date <= nowStr);
  if (entries.length === 0) return empty;

  const current = entries[entries.length - 1].value;
  const startingValue = tracker.startingValue ?? entries[0].value;
  const direction = tracker.goalDirection ?? "increase_good";
  const target = tracker.goalValue;

  let raw: number;
  if (direction === "decrease_good") {
    const span = startingValue - target;
    raw = span !== 0 ? ((startingValue - current) / span) * 100 : current <= target ? 100 : 0;
  } else {
    const span = target - startingValue;
    raw = span !== 0 ? ((current - startingValue) / span) * 100 : current >= target ? 100 : 0;
  }
  const rounded = Math.round(raw);
  return {
    progress: Math.max(0, Math.min(100, rounded)),
    raw: rounded,
    wrongDirection: raw < 0,
    current,
    startingValue,
  };
}

// ── Forecast ──────────────────────────────────────────────────────────────────

function forecastMetricDate(milestone: Milestone, trackers: ProgressTracker[], metricEntries: MetricEntry[], now: Date, trackingStart?: string): string | null {
  const tracker = resolvePrimaryTracker(milestone, trackers);
  if (!tracker || tracker.goalValue === undefined) return null;
  const nowStr = localISODate(now);
  const entries = entriesForTracker(tracker.id, metricEntries, trackingStart).filter((e) => e.date <= nowStr);
  if (entries.length === 0) return null;

  const direction = tracker.goalDirection ?? "increase_good";
  const current = entries[entries.length - 1].value;
  const target = tracker.goalValue;
  const remaining = direction === "decrease_good" ? current - target : target - current;
  if (remaining <= 0) return nowStr; // target already reached or exceeded

  if (entries.length < 2) return null; // need at least two points for a rate

  let windowEntries = entries.filter((e) => e.date >= addDaysToISO(nowStr, -METRIC_TREND_MIN_WINDOW_DAYS));
  if (windowEntries.length < 2) {
    windowEntries = entries.filter((e) => e.date >= addDaysToISO(nowStr, -METRIC_TREND_MAX_WINDOW_DAYS));
  }
  if (windowEntries.length < 2) return null;

  const first = windowEntries[0];
  const last = windowEntries[windowEntries.length - 1];
  const weeks = daysBetweenSigned(first.date, last.date) / 7;
  if (weeks <= 0) return null;

  const rawRatePerWeek = (last.value - first.value) / weeks;
  const goodPacePerWeek = direction === "decrease_good" ? -rawRatePerWeek : rawRatePerWeek;
  if (goodPacePerWeek <= 0) return null; // not moving in the right direction

  const weeksNeeded = remaining / goodPacePerWeek;
  return addDaysToISO(nowStr, Math.ceil(weeksNeeded * 7));
}

function forecastTaskDate(milestone: Milestone, activities: Record<string, Task[]>, now: Date): string | null {
  const nowStr = localISODate(now);
  if (nowStr < milestone.startDate) return null;

  const total = aggregateOccurrences(milestone, activities, milestone.plannedEndDate);
  const elapsedToNow = aggregateOccurrences(milestone, activities, clampISO(nowStr, milestone.startDate, milestone.plannedEndDate));
  const remaining = total.expected - elapsedToNow.completed;
  if (remaining <= 0) return nowStr;

  const rateFrom = addDaysToISO(nowStr, -(TASK_RATE_WINDOW_DAYS - 1));
  let recentCompleted = 0;
  for (const taskId of milestone.linkedActivities ?? []) {
    const copies = copiesById(taskId, activities);
    if (copies.length === 0) continue;
    for (const d of completedDatesFor(copies)) {
      if (d >= rateFrom && d <= nowStr) recentCompleted++;
    }
  }
  const ratePerWeek = recentCompleted / (TASK_RATE_WINDOW_DAYS / 7);
  if (ratePerWeek <= 0) return null;

  const weeksNeeded = remaining / ratePerWeek;
  return addDaysToISO(nowStr, Math.ceil(weeksNeeded * 7));
}

/**
 * Projected completion date — metric trend when a tracker is linked
 * (spec: "use the user's recent measurable trend"), else recent
 * task-completion rate. Null when there isn't enough data yet to project.
 */
export function calculateForecastDate(
  milestone: Milestone,
  activities: Record<string, Task[]>,
  trackers: ProgressTracker[],
  metricEntries: MetricEntry[],
  now: Date = new Date(),
  trackingStart?: string,
): string | null {
  if ((milestone.linkedTrackers?.length ?? 0) > 0) {
    return forecastMetricDate(milestone, trackers, metricEntries, now, trackingStart);
  }
  if ((milestone.linkedActivities?.length ?? 0) > 0) {
    return forecastTaskDate(milestone, activities, now);
  }
  return null;
}

// ── Health ────────────────────────────────────────────────────────────────────

/**
 * The milestone's live standing. Forecast vs target date is the primary
 * signal (spec: "the forecast should ultimately be more important than
 * consistency alone"); consistency is only consulted as a fallback when a
 * forecast can't be computed at all. Mirrors lib/planInsights.ts's
 * derivePlanStatus in shape (small enum, grace period, named thresholds).
 */
export function calculateMilestoneHealth(input: {
  milestone: Milestone;
  now?: Date;
  hasData: boolean;
  overallProgress: number | null;
  consistency: number | null;
  forecastDate: string | null;
  daysAheadBehind: number | null;
}): MilestoneHealth {
  const { milestone, hasData, overallProgress, consistency, forecastDate, daysAheadBehind } = input;
  const now = input.now ?? new Date();
  const todayStr = localISODate(now);

  if (milestone.status === "completed" || milestone.actualCompletedDate) return "completed";
  if (todayStr < milestone.startDate) return "not_started";
  if (!hasData) return "getting_started";

  const elapsedDays = daysBetweenInclusive(milestone.startDate, todayStr);
  const stillEarly = elapsedDays < GETTING_STARTED_DAYS;
  if (overallProgress === null && stillEarly) return "getting_started";

  // Target date passed and not completed: never reads on_track/ahead past the deadline.
  if (todayStr > milestone.plannedEndDate) return "delayed";

  if (forecastDate !== null && daysAheadBehind !== null) {
    if (daysAheadBehind >= AHEAD_BUFFER_DAYS) return "ahead";
    if (daysAheadBehind >= 0) return "on_track";
    if (daysAheadBehind >= -AT_RISK_BUFFER_DAYS) return "at_risk";
    return "delayed";
  }

  // No forecast to go on — fall back to the consistency signal.
  if (consistency !== null) {
    if (consistency >= CONSISTENCY_ON_TRACK_THRESHOLD) return "on_track";
    if (consistency >= CONSISTENCY_AT_RISK_THRESHOLD) return "at_risk";
    return "delayed";
  }

  return stillEarly ? "getting_started" : "delayed";
}

// ── Status message ───────────────────────────────────────────────────────────

function buildStatusMessage(health: MilestoneHealth, milestone: Milestone, forecastDate: string | null): string {
  const target = formatDateShort(milestone.plannedEndDate);
  switch (health) {
    case "completed":
      return "Milestone completed.";
    case "not_started":
      return `Starts ${formatDateShort(milestone.startDate)}.`;
    case "getting_started":
      return "Getting started — check back once there's a bit more activity to go on.";
    case "ahead":
      return forecastDate
        ? `You're ahead of pace and may reach this milestone by ${formatDateShort(forecastDate)}, before your ${target} target.`
        : "You're ahead of pace and may reach this milestone early.";
    case "on_track":
      return `You're on track to reach this milestone by ${target}.`;
    case "at_risk":
      return forecastDate
        ? `Your current pace projects this milestone for ${formatDateShort(forecastDate)} — slightly behind your ${target} target.`
        : "Your recent consistency has dropped. You're slightly behind the pace needed to hit your target.";
    case "delayed":
      return forecastDate
        ? `At your current pace, this milestone is projected to finish ${formatDateShort(forecastDate)} — after your ${target} target.`
        : `This milestone is past its target date of ${target}.`;
  }
}

// ── Top-level orchestrator ──────────────────────────────────────────────────

export function calculateMilestoneState(params: {
  milestone: Milestone;
  plan: Plan;
  activities: Record<string, Task[]>;
  trackers: ProgressTracker[];
  metricEntries: MetricEntry[];
  now?: Date;
  /** `preferences.startDate` — entries before it are not counted. */
  trackingStart?: string;
}): MilestoneState {
  const { milestone, plan, activities, trackers, metricEntries, trackingStart } = params;
  const now = params.now ?? new Date();

  const hasTasks = (milestone.linkedActivities?.length ?? 0) > 0;
  const hasTracker = (milestone.linkedTrackers?.length ?? 0) > 0;
  const hasData = hasTasks || hasTracker;

  const taskProgressResult = calculateMilestoneProgress(milestone, activities, plan);
  const taskProgress = taskProgressResult.hasLinkedTasks ? taskProgressResult.pct : null;

  const consistency = calculateConsistency(milestone, activities, now);
  const expectedProgress = calculateExpectedProgress(milestone, activities, now);
  const metric = calculateMetricProgress(milestone, trackers, metricEntries, now, trackingStart);
  const primaryTracker = resolvePrimaryTracker(milestone, trackers);
  const forecastDate = calculateForecastDate(milestone, activities, trackers, metricEntries, now, trackingStart);
  const daysAheadBehind = forecastDate !== null ? daysBetweenSigned(forecastDate, milestone.plannedEndDate) : null;

  // Outcome-driven (a tracker is linked) uses the metric as the headline
  // number; activity-driven (tasks only) uses task completion. Task
  // progress/consistency/metric progress are always returned regardless, so
  // the UI can show them as secondary breakdown signals either way.
  const overallProgress = hasTracker ? metric.progress : hasTasks ? taskProgress : null;

  const health = calculateMilestoneHealth({
    milestone, now, hasData, overallProgress, consistency, forecastDate, daysAheadBehind,
  });
  const statusMessage = buildStatusMessage(health, milestone, forecastDate);

  return {
    milestoneId: milestone.id,
    health,
    hasData,
    taskProgress,
    consistency,
    metricProgress: metric.progress,
    metricProgressRaw: metric.raw,
    metricMovedWrongDirection: metric.wrongDirection,
    metricCurrentValue: metric.current,
    metricTargetValue: primaryTracker?.goalValue ?? null,
    metricUnit: primaryTracker?.unit,
    overallProgress,
    expectedProgress,
    forecastDate,
    daysAheadBehind,
    statusMessage,
  };
}
