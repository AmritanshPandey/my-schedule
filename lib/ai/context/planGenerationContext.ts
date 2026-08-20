/**
 * Context builder for the task-generation surface — today's busy blocks,
 * today's rituals, and near-term deadlines. Distinct from (and not a
 * replacement for) lib/ai.ts's buildCoachContext, which serves the per-plan
 * Coach chat and needs the caller to have already resolved task/milestone/
 * tracker summaries for one specific plan. This one is plan-agnostic —
 * summarizes the whole day, for a "what am I generating tasks into" ask.
 *
 * Follows buildCoachContext's exact discipline: summarize and cap, never
 * dump the whole Schedule into the prompt. Everything here is already
 * in-memory client-side (IndexedDB/Firestore via useScheduleDB) — there is
 * no server-side data fetch possible or needed in this app.
 */

import type { DayKey, Schedule } from "@/lib/useScheduleDB";
import { todayISO, localISODate } from "@/lib/dateUtils";
import { isTrackedTask } from "@/lib/taskCompletion";

export function buildTaskGenerationContext(schedule: Schedule, todayKey: DayKey): string {
  const parts: string[] = [];

  const todayTasks = (schedule.activities[todayKey] ?? [])
    .filter(isTrackedTask)
    .slice(0, 10)
    .map((t) => `- ${t.title} (${t.startTime}–${t.endTime})`);
  if (todayTasks.length > 0) parts.push(`Today's schedule:\n${todayTasks.join("\n")}`);

  const todayRituals = (schedule.rituals ?? [])
    .filter((r) => !r.repeatDays?.length || r.repeatDays.includes(todayKey))
    .slice(0, 6)
    .map((r) => `- ${r.title} at ${r.time}`);
  if (todayRituals.length > 0) parts.push(`Today's rituals:\n${todayRituals.join("\n")}`);

  const today = todayISO();
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + 30);
  const soon = localISODate(soonDate);

  const upcoming = (schedule.milestones ?? [])
    .filter((m) => m.status !== "completed" && m.plannedEndDate >= today && m.plannedEndDate <= soon)
    .slice(0, 6)
    .map((m) => `- ${m.title} due ${m.plannedEndDate}`);
  if (upcoming.length > 0) parts.push(`Upcoming deadlines (next 30 days):\n${upcoming.join("\n")}`);

  return parts.join("\n\n");
}
