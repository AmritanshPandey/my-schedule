import type { Schedule, SessionLog } from "./scheduleTypes";
import { localISODate } from "./dateUtils";
import { plannedDistanceM } from "./sessions";
import { uid } from "./id";
import { isPlanRunning } from "./planLifecycle";

/**
 * Apple Health → sessions. Pure, so the matching can be tested without a
 * phone; apps/native/src/lib/health.ts reads the workouts and calls this.
 */

/** A running workout as read from HealthKit. */
export interface HealthRun {
  /** HealthKit workout UUID. */
  id: string;
  startMs: number;
  distanceM: number;
  durationSec: number;
}

/** The device-local calendar date of a moment: a run at 23:40 belongs to that day, not UTC's. */
export function localDateOf(ms: number): string {
  return localISODate(new Date(ms));
}

/**
 * Fill sessions from runs. Each run not already logged (by workout id) goes to
 * a session on its local date that is planned or done and has no Health log
 * yet, choosing the closest planned distance. One run fills one session; runs
 * with no session that day are ignored.
 */
export function applyHealthRuns(schedule: Schedule, runs: HealthRun[], nowISO: string): { schedule: Schedule; matched: number } {
  const logs = schedule.sessionLogs ?? [];
  const seen = new Set(logs.map((l) => l.healthWorkoutId).filter((id): id is string => !!id));
  const filled = new Set(logs.filter((l) => l.source === "health").map((l) => l.sessionId));
  const added: SessionLog[] = [];
  const doneIds = new Set<string>();
  // Only plans that still exist and are running can take a run.
  const running = new Set(schedule.plans.filter((p) => isPlanRunning(p)).map((p) => p.id));

  for (const run of [...runs].sort((a, b) => a.startMs - b.startMs)) {
    if (seen.has(run.id) || run.distanceM <= 0 || run.durationSec <= 0) continue;
    const date = localDateOf(run.startMs);
    const candidates = (schedule.sessions ?? []).filter(
      (s) => s.dateISO === date && s.status !== "skipped" && running.has(s.planId) && !filled.has(s.id),
    );
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) =>
      Math.abs(plannedDistanceM(b) - run.distanceM) < Math.abs(plannedDistanceM(a) - run.distanceM) ? b : a,
    );
    added.push({
      id: uid(),
      sessionId: best.id,
      source: "health",
      actual: { distanceM: run.distanceM, durationSec: run.durationSec },
      healthWorkoutId: run.id,
      loggedAt: nowISO,
    });
    seen.add(run.id);
    filled.add(best.id);
    doneIds.add(best.id);
  }

  if (added.length === 0) return { schedule, matched: 0 };
  return {
    matched: added.length,
    schedule: {
      ...schedule,
      sessions: (schedule.sessions ?? []).map((s) => (doneIds.has(s.id) ? { ...s, status: "done", updatedAt: nowISO } : s)),
      sessionLogs: [...logs, ...added],
    },
  };
}
