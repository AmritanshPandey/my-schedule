/**
 * Interval arithmetic over schedule-day minutes.
 *
 * Extracted from lib/availableSlots.ts, which had the only correct
 * sort-and-merge in the app. lib/dayBreakdown.ts lacked one entirely and so
 * summed overlapping blocks as if they were sequential — the bug that let a
 * 24-hour day report "25h 30m scheduled". Both now share this code rather than
 * each carrying its own loop, so a day can only ever be measured one way.
 */

export interface Interval {
  start: number;
  end: number;
}

/**
 * Sorted, non-overlapping cover of the input. Touching intervals (one ending
 * exactly where the next begins) collapse into one — for measuring occupied
 * time that is the same thing, and it keeps the gap-finder from emitting
 * zero-length holes.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

/** Total length of the union — each minute counted once, however many blocks cover it. */
export function unionMinutes(intervals: readonly Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Total length of every interval, counting overlaps as many times as they occur. */
export function summedMinutes(intervals: readonly Interval[]): number {
  return intervals.reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}

export interface OwnedInterval<T> extends Interval {
  owner: T;
}

/**
 * Split overlapping intervals so every minute is owned by exactly one of them,
 * then total the minutes per owner.
 *
 * The ownership rule: the block that **started earliest** keeps the contested
 * minutes; ties go to the one ending later (the larger commitment), then to
 * whichever owner sorts first, so the result never depends on input order.
 *
 * This is what lets the donut tile a real 24 hours. Summing per-category
 * durations double-counts an overlap into both wedges; splitting the day into
 * owned segments means the wedges add up to the union exactly, and the
 * difference between that union and the naive sum is the double-booked time,
 * which the card reports on its own line instead of silently absorbing.
 */
export function ownedMinutesByOwner<T>(
  intervals: readonly OwnedInterval<T>[],
  /** Stable tie-break for two blocks with identical bounds. */
  compareOwners: (a: T, b: T) => number,
): Map<T, number> {
  const totals = new Map<T, number>();
  if (intervals.length === 0) return totals;

  // Every point where ownership could change. Sweeping between consecutive
  // edges means each segment has a constant set of covering intervals, so one
  // winner per segment settles it — no minute-by-minute loop.
  const edges = Array.from(new Set(intervals.flatMap((i) => [i.start, i.end]))).sort((a, b) => a - b);

  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i];
    const to = edges[i + 1];
    if (to <= from) continue;

    let winner: OwnedInterval<T> | null = null;
    for (const candidate of intervals) {
      if (candidate.start > from || candidate.end < to) continue; // doesn't cover this segment
      if (
        winner === null
        || candidate.start < winner.start
        || (candidate.start === winner.start && candidate.end > winner.end)
        || (candidate.start === winner.start
          && candidate.end === winner.end
          && compareOwners(candidate.owner, winner.owner) < 0)
      ) {
        winner = candidate;
      }
    }
    if (!winner) continue;
    totals.set(winner.owner, (totals.get(winner.owner) ?? 0) + (to - from));
  }

  return totals;
}
