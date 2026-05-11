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
  labelDays: number[];
  showMonthLabels: boolean;
  skipMonths: number;
}

export const MODE_CONFIG: Record<HeatmapMode, ModeConfig> = {
  compact: {
    gap: 2,
    labelDays: [0, 1, 2, 3, 4, 5, 6],
    showMonthLabels: true,
    skipMonths: 1,
  },
  standard: {
    gap: 2,
    labelDays: [0, 1, 2, 3, 4, 5, 6],
    showMonthLabels: true,
    skipMonths: 1,
  },
  dense: {
    gap: 2,
    labelDays: [0, 1, 2, 3, 4, 5, 6],
    showMonthLabels: true,
    skipMonths: 1,
  },
};

export const DAY_LABEL_COL = 22;
export const DAY_LABEL_GAP = 4;

export function resolveHeatmapMode(weekCount: number): HeatmapMode {
  if (weekCount <= 3) return "compact";
  if (weekCount <= 16) return "standard";
  return "dense";
}
