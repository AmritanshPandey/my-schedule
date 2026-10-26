export type GoalDirection = "increase_good" | "decrease_good";
export type TrendDirection = "up" | "down" | "neutral";
export type TrendState = "positive" | "negative" | "neutral";

export interface TrendResult {
  direction: TrendDirection;
  state: TrendState;
  delta: number;
  pct: number | null;
}

export function getTrendDirection(previous: number, current: number): TrendDirection {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "neutral";
}

export function getTrendState(params: {
  previous: number;
  current: number;
  goalDirection: GoalDirection;
}): TrendState {
  const { previous, current, goalDirection } = params;
  const direction = getTrendDirection(previous, current);
  if (direction === "neutral") return "neutral";
  if (goalDirection === "increase_good") return direction === "up" ? "positive" : "negative";
  return direction === "down" ? "positive" : "negative";
}

export function computeTrend(params: {
  previous: number;
  current: number;
  goalDirection: GoalDirection;
}): TrendResult {
  const { previous, current, goalDirection } = params;
  const delta = current - previous;
  const pct = previous !== 0 ? (delta / Math.abs(previous)) * 100 : null;
  return {
    direction: getTrendDirection(previous, current),
    state: getTrendState({ previous, current, goalDirection }),
    delta,
    pct,
  };
}
