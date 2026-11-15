/**
 * Logged sets: one row per subtask per day (see SetLog in scheduleTypes.ts).
 *
 * Pure helpers shared by the "Log sets" sheet, focus mode and both apps'
 * cloud sync, so the id scheme, the "Previous" lookup and the trim rule exist
 * exactly once.
 */

import type { TargetValues } from "./scheduleEntry";
import type { LoggedSet, Schedule, SetLog } from "./scheduleTypes";

/** One session per subtask per day — logging it again overwrites, never duplicates. */
export function setLogId(taskId: string, subtaskId: string, dateISO: string): string {
  return `${taskId}~${subtaskId}~${dateISO}`;
}

/** This day's row for the subtask, if any. */
export function setLogFor(
  logs: readonly SetLog[] | undefined,
  taskId: string,
  subtaskId: string,
  dateISO: string,
): SetLog | null {
  const id = setLogId(taskId, subtaskId, dateISO);
  return logs?.find((l) => l.id === id) ?? null;
}

/**
 * The latest session before `beforeISO` that logged at least one set — what
 * the "Previous" column shows. A day opened and left empty isn't a session.
 */
export function previousSetLog(
  logs: readonly SetLog[] | undefined,
  taskId: string,
  subtaskId: string,
  beforeISO: string,
): SetLog | null {
  let best: SetLog | null = null;
  for (const l of logs ?? []) {
    if (l.taskId !== taskId || l.subtaskId !== subtaskId || l.dateISO >= beforeISO) continue;
    if (!l.sets.some((s) => s.done)) continue;
    if (!best || l.dateISO > best.dateISO) best = l;
  }
  return best;
}

/**
 * The rows a new session starts with: one per target set, prefilled with the
 * target weight and reps. With no set count, it follows the last session's
 * shape, and failing that starts with a single row.
 */
export function startingSets(targets: TargetValues, previous: SetLog | null): LoggedSet[] {
  const working = previous?.sets.filter((s) => !s.warmup) ?? [];
  const count = targets.sets ?? (working.length || 1);
  return Array.from({ length: count }, (_, i) => {
    const row: LoggedSet = { done: false };
    const weight = targets.weight ?? working[i]?.weight ?? working[working.length - 1]?.weight;
    const reps = targets.reps ?? working[i]?.reps ?? working[working.length - 1]?.reps;
    if (weight != null) row.weight = weight;
    if (reps != null) row.reps = reps;
    if (targets.minutes != null && targets.weight == null && targets.reps == null) row.minutes = targets.minutes;
    return row;
  });
}

/** Insert or replace a day's row. An entirely empty session removes the row. */
export function upsertSetLog(schedule: Schedule, log: SetLog): Schedule {
  const rest = (schedule.setLogs ?? []).filter((l) => l.id !== log.id);
  const keep = log.sets.length > 0;
  return { ...schedule, setLogs: keep ? [...rest, log] : rest };
}

/** Logged figures, summed over the done working sets — for a one-line recap. */
export function setLogSummary(log: SetLog): { sets: number; reps: number; topWeight: number | null } {
  const done = log.sets.filter((s) => s.done && !s.warmup);
  return {
    sets: done.length,
    reps: done.reduce((n, s) => n + (s.reps ?? 0), 0),
    topWeight: done.reduce<number | null>((max, s) => (s.weight != null && (max == null || s.weight > max) ? s.weight : max), null),
  };
}

/**
 * The cloud copy keeps 90 days of sessions, but always each subtask's most
 * recent one, so "Previous" still works on a fresh device for something done
 * less than once a quarter. The local copy is never trimmed.
 */
export function trimSetLogsForSync(logs: readonly SetLog[] | undefined, cutoffISO: string): SetLog[] | undefined {
  if (!logs) return logs;
  const latest = new Map<string, string>();
  for (const l of logs) {
    const key = `${l.taskId}~${l.subtaskId}`;
    if ((latest.get(key) ?? "") < l.dateISO) latest.set(key, l.dateISO);
  }
  return logs.filter((l) => l.dateISO >= cutoffISO || latest.get(`${l.taskId}~${l.subtaskId}`) === l.dateISO);
}
