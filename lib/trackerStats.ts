/**
 * One tracker's numbers, derived once.
 *
 * `latest` / `previous` / the sparkline series are currently re-derived by hand
 * in three places that quietly disagree — OverviewDashboard sorts descending and
 * slices from the front, IOSScheduleApp sorts ascending with an index tiebreak
 * and synthesizes fallback trackers, PlanDetailView sorts ascending and takes
 * the last two. This module is the single answer; the new Tracking page reads
 * it, and the three existing sites can migrate onto it later (deliberately not
 * done in one go — each has its own regression surface).
 *
 * Two kinds of metric live here, told apart by `tracker.dailyTarget`:
 *
 *  - **cumulative daily** (water, protein): you add to it through the day and it
 *    resets at midnight. Progress is today's summed entries over the target.
 *  - **point-in-time** (weight, a test score): each entry replaces the last as
 *    the truth. Progress, if any, is distance travelled from `startingValue`
 *    toward `goalValue` — the same shape lib/milestoneHealth.ts already uses.
 *
 * Pure and dependency-light so it can be unit-tested directly.
 */

import type { MetricEntry, ProgressTracker } from "./useScheduleDB";
import { dailyTotals, sumEntriesForDate } from "./metricEntries";
import { computeTrend, type TrendResult } from "./trendUtils";

/** How many daily points the sparkline shows. */
export const TRACKER_SERIES_LENGTH = 8;

export interface TrackerStat {
  tracker: ProgressTracker;
  /** True when `dailyTarget` is set — the card renders a ring rather than a value. */
  isDaily: boolean;
  /** Sum of today's entries. Meaningful for both kinds; the headline for a daily one. */
  todayTotal: number;
  /** How many times it was logged today — what the "logged" affordance counts. */
  todayCount: number;
  /** The most recent entry's value, or null when nothing has ever been logged. */
  latestValue: number | null;
  /** ISO date of that entry, for "last logged" copy. */
  latestDate: string | null;
  /** Movement against the previous *day*, direction-aware. Null without two days. */
  trend: TrendResult | null;
  /**
   * 0–100, clamped, or null when the tracker has no target of either kind.
   * Daily: today vs `dailyTarget`. Point-in-time: `startingValue` → `goalValue`.
   */
  percent: number | null;
  /** The target `percent` is measured against, for the "500 / 2000 ml" label. */
  targetValue: number | null;
  /** Daily metrics only: whether today's total has reached the target. */
  metToday: boolean;
  /** Per-day totals, oldest first — the sparkline's data. */
  series: number[];
  /**
   * Per-day totals with their dates, oldest first — what the chart plots.
   * One point per day even for a metric logged several times, so a busy
   * afternoon reads as one day rather than a spike.
   */
  points: Array<{ date: string; value: number }>;
  /**
   * Today's entries, already filtered by `trackingStart`.
   *
   * Carried on the stat rather than re-derived by the card: filtering the raw
   * list there let a card show "TODAY 107 kg" directly under "Nothing logged
   * yet", because the stats honoured the tracking-start date and the list
   * didn't. One source, one answer.
   */
  todayEntries: MetricEntry[];
  /** The value the tracker started from — the chart's reference line begins here. */
  startingValue: number | null;
}

/**
 * Entries this tracker's stats are allowed to see.
 *
 * `trackingStart` is honoured here because the setting promises it ("streaks,
 * trends, and consistency ignore everything before it") while no tracker query
 * in the app actually applied it. Filtering at the single point every stat is
 * derived from is what makes that promise true rather than approximately true.
 */
export function visibleEntries(
  entries: readonly MetricEntry[],
  trackerId: string,
  trackingStart?: string,
): MetricEntry[] {
  return entries.filter(
    (e) => e.trackerId === trackerId && (!trackingStart || e.date >= trackingStart),
  );
}

/**
 * Distance travelled from where the tracker started toward its overall goal.
 *
 * Mirrors calculateMetricProgress in lib/milestoneHealth.ts, which is reachable
 * only through a Milestone — this page is tracker-first and has no milestone to
 * resolve from. Kept in the same shape so the two never disagree about the same
 * tracker: an unset `startingValue` falls back to the earliest logged entry, and
 * a zero-width span reports 100 or 0 rather than dividing by it.
 */
function goalProgress(tracker: ProgressTracker, sorted: readonly MetricEntry[]): number | null {
  if (tracker.goalValue === undefined || sorted.length === 0) return null;
  const current = sorted[sorted.length - 1].value;
  const start = tracker.startingValue ?? sorted[0].value;
  const target = tracker.goalValue;

  if (tracker.goalDirection === "decrease_good") {
    const span = start - target;
    return span !== 0 ? ((start - current) / span) * 100 : current <= target ? 100 : 0;
  }
  const span = target - start;
  return span !== 0 ? ((current - start) / span) * 100 : current >= target ? 100 : 0;
}

export function buildTrackerStat(
  tracker: ProgressTracker,
  entries: readonly MetricEntry[],
  todayISO: string,
  trackingStart?: string,
): TrackerStat {
  const mine = visibleEntries(entries, tracker.id, trackingStart);
  // Ascending, with a stable tiebreak: several entries can share a date, and
  // "the latest value" must not depend on array order.
  const sorted = mine
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map((x) => x.entry);

  const totals = dailyTotals(mine as MetricEntry[], tracker.id);
  const todayTotal = sumEntriesForDate(mine as MetricEntry[], tracker.id, todayISO);
  const todayCount = mine.filter((e) => e.date === todayISO).length;
  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  // Day-over-day, not entry-over-entry: for a cumulative metric two logs in one
  // afternoon are not a trend, and comparing them would report one.
  const trend =
    totals.length >= 2
      ? computeTrend({
          previous: totals[totals.length - 2].value,
          current: totals[totals.length - 1].value,
          // An unclassified tracker gets a neutral read rather than an assumed
          // "up is good" — the same call the Overview card already makes.
          goalDirection: tracker.goalDirection ?? "increase_good",
        })
      : null;

  const isDaily = typeof tracker.dailyTarget === "number" && tracker.dailyTarget > 0;

  let percent: number | null = null;
  let targetValue: number | null = null;
  if (isDaily) {
    targetValue = tracker.dailyTarget!;
    percent = Math.max(0, Math.min(100, (todayTotal / targetValue) * 100));
  } else {
    const raw = goalProgress(tracker, sorted);
    if (raw !== null) {
      targetValue = tracker.goalValue!;
      percent = Math.max(0, Math.min(100, raw));
    }
  }

  return {
    tracker,
    isDaily,
    todayTotal,
    todayCount,
    latestValue: latest ? latest.value : null,
    latestDate: latest ? latest.date : null,
    trend: tracker.goalDirection ? trend : trend ? { ...trend, state: "neutral" } : null,
    percent,
    targetValue,
    metToday: isDaily && todayTotal >= tracker.dailyTarget!,
    series: totals.slice(-TRACKER_SERIES_LENGTH).map((t) => t.value),
    points: totals,
    todayEntries: mine.filter((e) => e.date === todayISO),
    // Same fallback calculateMetricProgress uses, surfaced so the chart can
    // anchor its reference line without re-deriving it.
    startingValue: tracker.startingValue ?? (sorted.length > 0 ? sorted[0].value : null),
  };
}

export interface TrackerGroup<P> {
  plan: P | null;
  stats: TrackerStat[];
}

/**
 * Trackers bucketed under their plan, in first-seen order.
 *
 * Grouping rather than a flat list because a metric takes its meaning from the
 * plan it serves — and because two plans can hold a "Score" apiece, which read
 * as duplicates in a flat list.
 */
export function groupTrackerStatsByPlan<P extends { id: string }>(
  stats: readonly TrackerStat[],
  plansById: ReadonlyMap<string, P>,
): Array<TrackerGroup<P>> {
  const groups = new Map<string, TrackerGroup<P>>();
  for (const stat of stats) {
    const key = stat.tracker.planId;
    let group = groups.get(key);
    if (!group) {
      group = { plan: plansById.get(key) ?? null, stats: [] };
      groups.set(key, group);
    }
    group.stats.push(stat);
  }
  return [...groups.values()];
}

/** Status-ramp band for the instruments (DESIGN.md): green ≥70, amber 40–69, rose <40. */
export function trackerRampTone(percent: number | null): "on-track" | "at-risk" | "behind" | "none" {
  if (percent === null) return "none";
  if (percent >= 70) return "on-track";
  if (percent >= 40) return "at-risk";
  return "behind";
}
