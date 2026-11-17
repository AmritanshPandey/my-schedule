import type { RunEffort, Schedule, Session, SessionLog, SessionTask } from "./scheduleTypes";
import { uid } from "./id";
import { isPlanRunning } from "./planLifecycle";

/**
 * Sessions: the dated, planned occurrences of a plan's routines, and what was
 * logged against them. Pure helpers shared by the PWA and the native app.
 *
 * The planned tasks on a Session are never rewritten by logging: what happened
 * lives in SessionLog, so planned and actual can always be compared.
 */

export type SessionState = "planned" | "done" | "skipped" | "missed";

export function sessionState(session: Session, todayISO: string): SessionState {
  if (session.status !== "planned") return session.status;
  return session.dateISO < todayISO ? "missed" : "planned";
}

/**
 * A day's sessions, timed ones by start time and then the any-time ones. A
 * session whose plan was deleted or is paused only shows if it was done (it
 * is history); a paused plan's runs aren't due, as its tasks aren't.
 */
export function sessionsForDate(schedule: Schedule, dateISO: string): Session[] {
  const running = new Set(schedule.plans.filter((p) => isPlanRunning(p)).map((p) => p.id));
  return (schedule.sessions ?? [])
    .filter((s) => s.dateISO === dateISO && (running.has(s.planId) || s.status === "done"))
    .sort((a, b) => {
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });
}

export function logsFor(schedule: Schedule, sessionId: string): SessionLog[] {
  return (schedule.sessionLogs ?? []).filter((l) => l.sessionId === sessionId);
}

/**
 * What actually happened: what the user typed first (it carries effort and a
 * note), else what Apple Health recorded, else a plain "mark done". Nothing
 * while the session isn't done, so unticking a run never leaves an actual on show.
 */
export function actualFor(schedule: Schedule, sessionId: string): SessionLog | undefined {
  const session = (schedule.sessions ?? []).find((s) => s.id === sessionId);
  if (!session || session.status !== "done") return undefined;
  const logs = logsFor(schedule, sessionId).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  return logs.find((l) => l.source === "manual") ?? logs.find((l) => l.source === "health") ?? logs[0];
}

export function paceSecPerKm(actual: { distanceM: number; durationSec: number }): number {
  return Math.round(actual.durationSec / (actual.distanceM / 1000));
}

/** Error copy for the typed-log form, or null when it can be saved. */
export function validateRunLog(input: { distanceKm: number; minutes: number; seconds: number }): string | null {
  // Checked on the values as saved (rounded to whole metres and seconds): a
  // log that rounds to zero would be rejected by the schema and block saving.
  if (!Number.isFinite(input.distanceKm) || Math.round(input.distanceKm * 1000) < 10) return "Enter how far you ran.";
  const minutes = Number.isFinite(input.minutes) ? input.minutes : 0;
  const seconds = Number.isFinite(input.seconds) ? input.seconds : 0;
  if (minutes < 0 || seconds < 0 || Math.round(minutes * 60 + seconds) < 1) return "Enter how long it took.";
  return null;
}

function updateSession(schedule: Schedule, sessionId: string, patch: (s: Session) => Session): Schedule {
  return { ...schedule, sessions: (schedule.sessions ?? []).map((s) => (s.id === sessionId ? patch(s) : s)) };
}

export function markSessionDone(schedule: Schedule, sessionId: string, nowISO: string): Schedule {
  if ((schedule.sessions ?? []).find((s) => s.id === sessionId)?.status === "done") return schedule;
  const next = updateSession(schedule, sessionId, (s) => ({ ...s, status: "done", updatedAt: nowISO }));
  const log: SessionLog = { id: uid(), sessionId, source: "mark", loggedAt: nowISO };
  return { ...next, sessionLogs: [...(schedule.sessionLogs ?? []), log] };
}

/** A typed run. Replaces an earlier typed log for the same session (editing the log); marks and Health logs stay. */
export function logSessionRun(
  schedule: Schedule,
  sessionId: string,
  actual: { distanceM: number; durationSec: number; effort?: RunEffort },
  note: string | undefined,
  nowISO: string,
): Schedule {
  const next = updateSession(schedule, sessionId, (s) => ({ ...s, status: "done", updatedAt: nowISO }));
  const log: SessionLog = { id: uid(), sessionId, source: "manual", actual, loggedAt: nowISO, ...(note ? { note } : {}) };
  const kept = (schedule.sessionLogs ?? []).filter((l) => !(l.sessionId === sessionId && l.source === "manual"));
  return { ...next, sessionLogs: [...kept, log] };
}

/**
 * Back to planned. Only the plain "mark done" goes: a typed log stays (one
 * mistaken tap shouldn't erase the run's numbers, effort and note) and so does
 * a Health log (so the workout isn't imported again). actualFor hides both
 * while the session is planned, and they show again when it's ticked.
 */
export function undoSessionDone(schedule: Schedule, sessionId: string, nowISO: string): Schedule {
  const next = updateSession(schedule, sessionId, (s) => ({ ...s, status: "planned", updatedAt: nowISO }));
  return {
    ...next,
    sessionLogs: (schedule.sessionLogs ?? []).filter((l) => !(l.sessionId === sessionId && l.source === "mark")),
  };
}

export function skipSession(schedule: Schedule, sessionId: string, nowISO: string): Schedule {
  return updateSession(schedule, sessionId, (s) => ({ ...s, status: "skipped", updatedAt: nowISO }));
}

/** Moving by hand marks the session edited, so a plan rebuild leaves it where the user put it. */
export function moveSession(schedule: Schedule, sessionId: string, dateISO: string, startTime: string | undefined, nowISO: string): Schedule {
  return updateSession(schedule, sessionId, (s) => {
    const { startTime: _old, ...rest } = s;
    void _old;
    return { ...rest, dateISO, ...(startTime ? { startTime } : {}), editedAt: nowISO, updatedAt: nowISO };
  });
}

/** A deleted plan takes its unfinished sessions and open suggestions with it; done runs stay as history. */
export function deletePlanSessions(schedule: Schedule, planId: string): Schedule {
  const sessions = (schedule.sessions ?? []).filter((s) => s.planId !== planId || s.status === "done");
  const live = new Set(sessions.map((s) => s.id));
  return {
    ...schedule,
    sessions,
    sessionLogs: (schedule.sessionLogs ?? []).filter((l) => live.has(l.sessionId)),
    planAdjustments: (schedule.planAdjustments ?? []).filter((a) => a.planId !== planId),
  };
}

/** "Clear history": every session back to planned, every log and suggestion gone. The plan itself stays. */
export function clearSessionProgress(schedule: Schedule): Pick<Schedule, "sessions" | "sessionLogs" | "planAdjustments"> {
  return {
    sessions: (schedule.sessions ?? []).map((s) => (s.status === "planned" ? s : { ...s, status: "planned" as const })),
    sessionLogs: [],
    planAdjustments: [],
  };
}

/** "400 m", "3 km", "2.5 km". */
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  const km = Math.round(distanceM / 100) / 10;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/** "5:40/km". */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/km`;
}

function taskHeadline(task: SessionTask): string {
  if (task.kind === "simple") return task.title;
  const { distanceM, paceSecPerKm, repeats } = task.plan;
  const d = repeats && repeats > 1 ? `${repeats} × ${formatDistance(distanceM)}` : formatDistance(distanceM);
  if (paceSecPerKm) return `${d} @ ${formatPace(paceSecPerKm)}`;
  return task.title.toLowerCase() === "easy" ? `${d} easy` : d;
}

/** One line for a row: "1 km easy · 4 × 400 m @ 5:40/km · 1 km easy". */
export function headline(session: Session): string {
  return session.tasks.map(taskHeadline).join(" · ");
}

/** Total planned distance of a session in metres (repeats included). */
export function plannedDistanceM(session: Session): number {
  return session.tasks.reduce((sum, t) => (t.kind === "distance" ? sum + t.plan.distanceM * (t.plan.repeats ?? 1) : sum), 0);
}
