import type { HealthRun } from '@planr/core/lib/healthMatch';

/** The parts of a HealthKit workout sample a run needs (kept narrow so tests need no native module). */
export interface WorkoutLike {
  uuid: string;
  startDate: Date;
  duration: { unit: string; quantity: number };
  totalDistance?: { unit: string; quantity: number };
}

const METRES_PER: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, yd: 0.9144, ft: 0.3048 };
const SECONDS_PER: Record<string, number> = { s: 1, min: 60, hr: 3600, h: 3600, ms: 0.001 };

/**
 * A HealthKit running workout as a HealthRun for core's applyHealthRuns.
 * Units come from HealthKit as strings; a workout with no distance, or a unit
 * we don't know, is skipped rather than guessed at.
 */
export function toHealthRun(w: WorkoutLike): HealthRun | null {
  const toM = w.totalDistance ? METRES_PER[w.totalDistance.unit] : undefined;
  const toS = SECONDS_PER[w.duration.unit];
  if (!w.totalDistance || toM === undefined || toS === undefined) return null;
  return {
    id: w.uuid,
    startMs: w.startDate.getTime(),
    distanceM: Math.round(w.totalDistance.quantity * toM),
    durationSec: Math.round(w.duration.quantity * toS),
  };
}
