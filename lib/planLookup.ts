/**
 * Pure read-only lookups for resolving AI-chat action payloads (which name
 * their target by title, e.g. "add this tracker to the GMAT plan") against
 * the user's actual Plan/Task data. Not mutations — see lib/taskMutations.ts
 * for those. No fuzzy-match library exists in this repo; an exact-then-
 * substring two-pass match is deliberately simple and good enough for a
 * user naming their own plan/task back to the assistant.
 */
import type { Plan, Schedule } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";

export function findPlanByTitle(plans: Plan[], title?: string): Plan | undefined {
  const q = title?.trim().toLowerCase();
  if (!q) return undefined;
  return (
    plans.find((p) => p.title.toLowerCase() === q) ??
    plans.find((p) => p.title.toLowerCase().includes(q) || q.includes(p.title.toLowerCase()))
  );
}

/** Unique task ids (deduped across weekday copies of a recurring task) whose title matches. */
export function findTasksByTitle(schedule: Schedule, title: string): string[] {
  const q = title.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? []) {
      if (seen.has(task.id)) continue;
      const t = task.title.toLowerCase();
      if (t === q || t.includes(q) || q.includes(t)) seen.add(task.id);
    }
  }
  return [...seen];
}
