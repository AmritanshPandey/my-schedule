// ── Heatmap display modes ─────────────────────────────────────────────────────

export type HeatmapMode = "compact" | "standard" | "dense";
export type RangeKey = "7D" | "30D" | "90D" | "1Y";

/** Number of complete weeks to show per range key. */
export const RANGE_WEEKS: Record<RangeKey, number> = {
  "7D":  2,
  "30D": 5,
  "90D": 14,
  "1Y":  53,
};

export const RANGE_OPTIONS: RangeKey[] = ["7D", "30D", "90D", "1Y"];

export interface ModeConfig {
  gap: number;        // px between cells
  cellAspect: number; // cellHeight = cellWidth * cellAspect (slightly rectangular)
  minCell: number;    // px — never shrink below this
  maxCell: number;    // px — never grow beyond this
  labelDays: number[]; // which day-rows (0=Sun…6=Sat) get axis labels
  showMonthLabels: boolean;
  skipMonths: number;  // for dense: label every N months (1 = every, 2 = every other)
}

export const MODE_CONFIG: Record<HeatmapMode, ModeConfig> = {
  compact: {
    gap: 4,
    cellAspect: 0.82,
    minCell: 10,
    maxCell: 18,
    labelDays: [0, 1, 2, 3, 4, 5, 6],
    showMonthLabels: false,
    skipMonths: 1,
  },
  standard: {
    gap: 3,
    cellAspect: 0.82,
    minCell: 9,
    maxCell: 16,
    labelDays: [1, 3, 5],
    showMonthLabels: true,
    skipMonths: 1,
  },
  dense: {
    gap: 2,
    cellAspect: 0.82,
    minCell: 8,
    maxCell: 13,
    labelDays: [1, 3, 5],
    showMonthLabels: true,
    skipMonths: 2,
  },
};

/** Day-label column reserved width in px. */
export const DAY_LABEL_COL = 22;
/** Gap between day-label column and first cell column. */
export const DAY_LABEL_GAP = 3;

export function resolveHeatmapMode(weekCount: number): HeatmapMode {
  if (weekCount <= 3) return "compact";
  if (weekCount <= 13) return "standard";
  return "dense";
}
