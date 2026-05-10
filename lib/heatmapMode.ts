export type HeatmapMode = "compact" | "standard" | "dense";
export type RangeKey = "7D" | "30D" | "90D" | "1Y";

export const RANGE_WEEKS: Record<RangeKey, number> = {
  "7D":  2,
  "30D": 5,
  "90D": 14,
  "1Y":  53,
};

export const RANGE_OPTIONS: RangeKey[] = ["7D", "30D", "90D", "1Y"];

export interface ModeConfig {
  gap: number;
  minCell: number;
  maxCell: number;
  labelDays: number[];
  showMonthLabels: boolean;
  skipMonths: number;
}

export const MODE_CONFIG: Record<HeatmapMode, ModeConfig> = {
  compact: {
    gap: 2,
    minCell: 12,
    maxCell: 22,
    labelDays: [1, 3, 5],
    showMonthLabels: false,
    skipMonths: 1,
  },
  standard: {
    gap: 2,
    minCell: 10,
    maxCell: 16,
    labelDays: [1, 3, 5],
    showMonthLabels: true,
    skipMonths: 1,
  },
  dense: {
    gap: 2,
    minCell: 8,
    maxCell: 11,
    labelDays: [1, 3, 5],
    showMonthLabels: true,
    skipMonths: 2,
  },
};

export const DAY_LABEL_COL = 18;
export const DAY_LABEL_GAP = 3;

export function resolveHeatmapMode(weekCount: number): HeatmapMode {
  if (weekCount <= 3) return "compact";
  if (weekCount <= 16) return "standard";
  return "dense";
}
