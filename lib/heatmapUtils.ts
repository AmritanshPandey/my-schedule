import type { DayCell } from "@/lib/roadmapEngine";
import {
  type HeatmapMode,
  type RangeKey,
  RANGE_WEEKS,
  MODE_CONFIG,
  DAY_LABEL_COL,
  DAY_LABEL_GAP,
  resolveHeatmapMode,
} from "@/lib/heatmapMode";

// Re-export so callers only need one import.
export { resolveHeatmapMode };

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

// ── Filtering ─────────────────────────────────────────────────────────────────

/**
 * Slice to the last `weeksNeeded * 7` cells (already week-aligned from the engine).
 * Returns the full array when fewer cells exist.
 */
export function filterCellsByRange(allCells: DayCell[], range: RangeKey): DayCell[] {
  const cellsNeeded = RANGE_WEEKS[range] * 7;
  if (allCells.length <= cellsNeeded) return allCells;
  return allCells.slice(allCells.length - cellsNeeded);
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/** Group the flat cell array into week columns (each column = 7 rows, Su→Sa). */
export function groupDaysIntoWeeks(cells: DayCell[]): DayCell[][] {
  if (cells.length === 0) return [];
  const totalWeeks = Math.ceil(cells.length / 7);
  return Array.from({ length: totalWeeks }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7)
  );
}

// ── Intensity normalization ────────────────────────────────────────────────────

/**
 * Map each dated in-plan cell to a 0–4 intensity level, normalised to the
 * user's own activity peak within the visible range.
 *
 * 0 → no activity
 * 1–4 → relative quartile buckets
 *
 * This ensures both high-performers and beginners get meaningful colour gradients.
 */
export function normalizeIntensity(cells: DayCell[]): Map<string, 0 | 1 | 2 | 3 | 4> {
  const result = new Map<string, 0 | 1 | 2 | 3 | 4>();

  const active = cells.filter((c) => c.date && !c.isOutsidePlan && !c.isFuture);
  const counts = active.map((c) => c.count);
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;

  for (const c of active) {
    if (!c.date) continue;
    if (maxCount === 0 || c.count === 0) {
      result.set(c.date, 0);
    } else {
      const ratio = c.count / maxCount;
      if (ratio <= 0.2) result.set(c.date, 1);
      else if (ratio <= 0.45) result.set(c.date, 2);
      else if (ratio <= 0.75) result.set(c.date, 3);
      else result.set(c.date, 4);
    }
  }

  return result;
}

// ── Cell sizing ───────────────────────────────────────────────────────────────

/**
 * Compute cell pixel width from the measured container width and visible week count.
 * Clamps to [minCell, maxCell] for the active mode.
 *
 * Formula:
 *   available = containerWidth − dayLabelCol − dayLabelGap
 *   totalGaps = (weekCount − 1) × gap
 *   raw       = (available − totalGaps) / weekCount
 */
export function calculateCellSize(
  containerWidth: number,
  weekCount: number,
  mode: HeatmapMode
): number {
  const { gap, minCell, maxCell } = MODE_CONFIG[mode];
  if (containerWidth === 0 || weekCount === 0) return minCell;

  const available = containerWidth - DAY_LABEL_COL - DAY_LABEL_GAP;
  const totalGaps = Math.max(0, weekCount - 1) * gap;
  const raw = (available - totalGaps) / weekCount;

  return Math.max(minCell, Math.min(maxCell, Math.floor(raw)));
}

// ── Month labels ──────────────────────────────────────────────────────────────

/**
 * Produce a label (or null) for each week column.
 * Labels appear at the week where a new month begins (day 1–7).
 * Dense mode skips every other month to avoid crowding.
 * Compact mode returns all nulls (date context comes from the range pill).
 */
export function resolveMonthLabels(
  weeks: DayCell[][],
  mode: HeatmapMode
): (string | null)[] {
  const raw: (string | null)[] = weeks.map(() => null);
  const labels = raw as Array<string | null>;
  const { showMonthLabels, skipMonths } = MODE_CONFIG[mode];

  if (!showMonthLabels) return labels;

  let lastLabeledMonth = -1;
  let monthsSeenSinceLabel = 0;
  let hasLabeled = false;

  for (let wi = 0; wi < weeks.length; wi++) {
    const firstValid = weeks[wi].find((c) => c.date && !c.isOutsidePlan);
    if (!firstValid) continue;

    const d = new Date(firstValid.date + "T00:00:00");
    const month = d.getMonth();
    const dayNum = d.getDate();

    if (!hasLabeled) {
      // Always label the first week that has valid cells.
      labels[wi] = MONTHS[month];
      lastLabeledMonth = month;
      monthsSeenSinceLabel = 0;
      hasLabeled = true;
    } else if (month !== lastLabeledMonth && dayNum <= 7) {
      monthsSeenSinceLabel++;
      if (monthsSeenSinceLabel >= skipMonths) {
        labels[wi] = MONTHS[month];
        lastLabeledMonth = month;
        monthsSeenSinceLabel = 0;
      } else {
        lastLabeledMonth = month; // track but suppress
      }
    }
  }

  return labels;
}

// ── Streak ────────────────────────────────────────────────────────────────────

/**
 * Count consecutive past days (up to and including today) where count > 0.
 * If today has no completions yet, counts backwards from yesterday.
 */
export function computeStreakFromCells(cells: DayCell[]): number {
  const todayStr = new Date().toISOString().split("T")[0];

  const completedSet = new Set(
    cells
      .filter((c) => c.date && !c.isOutsidePlan && !c.isFuture && c.count > 0)
      .map((c) => c.date)
  );

  if (completedSet.size === 0) return 0;

  const cursor = new Date(todayStr + "T00:00:00");

  // If today isn't done yet, start from yesterday.
  if (!completedSet.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (true) {
    const ds = cursor.toISOString().split("T")[0];
    if (completedSet.has(ds)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
