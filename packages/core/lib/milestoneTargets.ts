/**
 * A tracker's planned path — the figure it should be at on any date, drawn
 * through the checkpoints its milestones set.
 *
 * Several milestones commonly share one tracker ("Base building", "Half
 * distance", "30km long run" all on "Long run distance"). Measuring each of
 * them against the tracker's single overall `goalValue` made every early
 * milestone look hopelessly behind, and left the Tracking page with no idea
 * what "on plan" means today. Here each milestone owns a checkpoint — its
 * explicit `targetValue`, or one implied by spreading the goal across the
 * milestones by date — and the path joins them with straight lines.
 *
 * Only milestones whose *primary* tracker (`linkedTrackers[0]`) is this one
 * take part: that is the tracker `targetValue` describes.
 *
 * Pure and React-free, like lib/milestoneHealth.ts which reads it.
 */

import type { Milestone, MetricEntry, ProgressTracker } from "./scheduleTypes";

export interface TrackerCheckpoint {
  date: string;   // ISO "YYYY-MM-DD"
  value: number;
  /** Absent on the path's origin point. */
  milestoneId?: string;
  /** True when the value came from the milestone's own `targetValue`. */
  explicit: boolean;
}

export interface PlannedTrackerPath {
  trackerId: string;
  /** Origin first, then one point per milestone that resolved a value, by date. */
  points: TrackerCheckpoint[];
}

/** The stretch one milestone covers on its tracker: from the previous checkpoint to its own. */
export interface MilestoneSpan {
  from: number;
  to: number;
}

function dayNumber(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00`).getTime() / 86_400_000);
}

function sortedEntries(trackerId: string, entries: readonly MetricEntry[], trackingStart?: string): MetricEntry[] {
  return entries
    .filter((e) => e.trackerId === trackerId && (!trackingStart || e.date >= trackingStart))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Milestones this tracker is the primary tracker of, earliest end first. */
export function milestonesOnTracker(trackerId: string, milestones: readonly Milestone[]): Milestone[] {
  return milestones
    .filter((m) => m.linkedTrackers?.[0] === trackerId)
    .sort((a, b) => a.plannedEndDate.localeCompare(b.plannedEndDate) || a.sortOrder - b.sortOrder);
}

/**
 * The planned path for a tracker, or null when it can't be drawn: no
 * milestones set a checkpoint on it, or there is no starting figure (neither
 * `startingValue` nor a logged entry) to begin from.
 */
export function plannedTrackerPath(
  tracker: ProgressTracker,
  milestones: readonly Milestone[],
  entries: readonly MetricEntry[],
  trackingStart?: string,
): PlannedTrackerPath | null {
  const mine = milestonesOnTracker(tracker.id, milestones);
  if (mine.length === 0) return null;

  const logged = sortedEntries(tracker.id, entries, trackingStart);
  const originValue = tracker.startingValue ?? logged[0]?.value;
  if (originValue === undefined) return null;
  const originDate = mine.reduce((min, m) => (m.startDate < min ? m.startDate : min), mine[0].startDate);

  // Known values per milestone: explicit targets, plus the tracker's goal on
  // the last milestone when that one doesn't say otherwise.
  const known: Array<number | undefined> = mine.map((m) =>
    typeof m.targetValue === "number" && Number.isFinite(m.targetValue) ? m.targetValue : undefined,
  );
  const lastIndex = mine.length - 1;
  const goalOnLast = known[lastIndex] === undefined && tracker.goalValue !== undefined;
  if (goalOnLast) known[lastIndex] = tracker.goalValue;

  const points: TrackerCheckpoint[] = [{ date: originDate, value: originValue, explicit: false }];
  let prev = { date: originDate, value: originValue };
  for (let i = 0; i < mine.length; i++) {
    const m = mine[i];
    let value = known[i];
    const explicit = value !== undefined && !(goalOnLast && i === lastIndex);
    if (value === undefined) {
      const nextIndex = known.findIndex((v, j) => j > i && v !== undefined);
      if (nextIndex === -1) continue; // nothing further on to interpolate toward
      const next = { date: mine[nextIndex].plannedEndDate, value: known[nextIndex]! };
      const span = dayNumber(next.date) - dayNumber(prev.date);
      const t = span > 0 ? (dayNumber(m.plannedEndDate) - dayNumber(prev.date)) / span : 1;
      value = prev.value + (next.value - prev.value) * Math.max(0, Math.min(1, t));
    }
    const rounded = Math.round(value * 100) / 100;
    points.push({ date: m.plannedEndDate, value: rounded, milestoneId: m.id, explicit });
    prev = { date: m.plannedEndDate, value: rounded };
  }
  return points.length > 1 ? { trackerId: tracker.id, points } : null;
}

/**
 * The span a milestone measures its tracker over. Falls back to the tracker's
 * own `startingValue` → `goalValue` (the behaviour before milestones had
 * figures of their own) when the milestone isn't on a drawable path — e.g. no
 * sibling milestones were supplied, or it isn't the tracker's primary.
 */
export function milestoneSpan(
  milestone: Milestone,
  tracker: ProgressTracker,
  milestones: readonly Milestone[] | undefined,
  entries: readonly MetricEntry[],
  trackingStart?: string,
): MilestoneSpan | null {
  const all = milestones && milestones.some((m) => m.id === milestone.id) ? milestones : [...(milestones ?? []), milestone];
  const path = plannedTrackerPath(tracker, all, entries, trackingStart);
  const index = path?.points.findIndex((p) => p.milestoneId === milestone.id) ?? -1;
  if (path && index > 0) {
    return { from: path.points[index - 1].value, to: path.points[index].value };
  }
  if (tracker.goalValue === undefined) return null;
  const from = tracker.startingValue ?? sortedEntries(tracker.id, entries, trackingStart)[0]?.value;
  if (from === undefined) return null;
  return { from, to: tracker.goalValue };
}

/** The figure the path expects on `dateISO` — linear between checkpoints, held flat beyond either end. */
export function expectedValueOn(path: PlannedTrackerPath, dateISO: string): number {
  const { points } = path;
  if (dateISO <= points[0].date) return points[0].value;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (dateISO <= b.date) {
      const span = dayNumber(b.date) - dayNumber(a.date);
      const t = span > 0 ? (dayNumber(dateISO) - dayNumber(a.date)) / span : 1;
      return Math.round((a.value + (b.value - a.value) * t) * 100) / 100;
    }
  }
  return points[points.length - 1].value;
}

export interface PlanGap {
  /** What the plan says the tracker should read today. */
  expected: number;
  /** The latest logged figure on or before today. */
  actual: number;
  /** actual − expected, in the tracker's units. */
  delta: number;
  /** True when the gap is in the good direction (or zero). */
  ahead: boolean;
}

/** Actual vs planned today — "Plan: 24 km by today · you're at 21 km". Null without a path or an entry. */
export function planGap(
  tracker: Pick<ProgressTracker, "id" | "goalDirection">,
  path: PlannedTrackerPath | null,
  entries: readonly MetricEntry[],
  todayISO: string,
  trackingStart?: string,
): PlanGap | null {
  if (!path) return null;
  const logged = sortedEntries(tracker.id, entries, trackingStart).filter((e) => e.date <= todayISO);
  if (logged.length === 0) return null;
  const actual = logged[logged.length - 1].value;
  const expected = expectedValueOn(path, todayISO);
  const delta = Math.round((actual - expected) * 100) / 100;
  const ahead = tracker.goalDirection === "decrease_good" ? delta <= 0 : delta >= 0;
  return { expected, actual, delta, ahead };
}

/** Decimal places in a number as written (82 → 0, 81.2 → 1). */
function decimalsOf(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * A planned figure (an implied checkpoint like 78.7857…) shown at the
 * precision the person actually logs this tracker in: the most decimals
 * among its start, goal and entries, capped at 2. 78.79 kg on a tracker
 * logged as 81.2, 80.6 reads as 78.8 kg.
 */
export function formatTrackerFigure(
  value: number,
  tracker: Pick<ProgressTracker, "id" | "startingValue" | "goalValue">,
  metricEntries: readonly MetricEntry[] = [],
): string {
  let places = 0;
  for (const v of [tracker.startingValue, tracker.goalValue]) {
    if (typeof v === "number") places = Math.max(places, decimalsOf(v));
  }
  for (const e of metricEntries) {
    if (e.trackerId === tracker.id) places = Math.max(places, decimalsOf(e.value));
  }
  places = Math.min(2, places);
  const factor = 10 ** places;
  return String(Math.round((value + Number.EPSILON) * factor) / factor);
}
