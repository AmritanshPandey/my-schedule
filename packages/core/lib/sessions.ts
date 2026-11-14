import type { Schedule } from "./scheduleTypes";

/**
 * Sessions: the dated, planned occurrences of a plan's routines, and what was
 * logged against them. Pure helpers shared by the PWA and the native app.
 */

/** "Clear history": every session back to planned, every log and suggestion gone. The plan itself stays. */
export function clearSessionProgress(schedule: Schedule): Pick<Schedule, "sessions" | "sessionLogs" | "planAdjustments"> {
  return {
    sessions: (schedule.sessions ?? []).map((s) => (s.status === "planned" ? s : { ...s, status: "planned" as const })),
    sessionLogs: [],
    planAdjustments: [],
  };
}
