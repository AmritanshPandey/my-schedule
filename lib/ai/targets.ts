/**
 * Which plan, which task — resolved deterministically, or not at all.
 *
 * The AI names its target as free text (`planTitle`, `taskTitle`) and the app
 * has to turn that into a real entity. The matcher this replaces (the removed
 * `lib/planLookup.ts`) did it with `t === q || t.includes(q) || q.includes(t)` — substring, in *both*
 * directions — so the query "run" claimed `Run`, `Long run` and `Recovery run`
 * alike. `add_subtasks` then wrote to every one of them, and an unmatched plan
 * silently became `plans[0]`.
 *
 * This module answers with a status instead of a guess. "I can't tell" is a
 * first-class outcome the caller must handle by asking, which is the whole point:
 * a wrong target that is written silently is far worse than a question.
 *
 * Pure, and free of value imports from `useScheduleDB` — importing that pulls in
 * React and `contexts/AuthProvider`, which would make this untestable under the
 * node test runner.
 */

import type { DayKey, Plan, Schedule, Task } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";

export type TargetMatch<T> =
  /** Exactly one best match. */
  | { status: "resolved"; value: T }
  /** Several equally good matches — the caller must ask which. */
  | { status: "ambiguous"; query: string; candidates: T[] }
  /** A name was given but nothing matched it. */
  | { status: "not-found"; query: string }
  /** No name was given at all. */
  | { status: "unspecified"; candidates: T[] };

/**
 * How well a candidate title answers a query, or null for no match.
 * Lower is better, so the best score wins and equal scores tie.
 *
 * Deliberately excludes the reverse containment (`query.includes(title)`) the
 * old matcher allowed: it is what let a short title match a long query and
 * turned one request into several writes.
 */
export function matchScore(title: string, query: string): number | null {
  const t = title.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!t || !q) return null;
  if (t === q) return 0;
  // A prefix only counts when it ends on a word boundary. Plain `startsWith`
  // scored "Runway design" as a better match for "run" than "Long run" is,
  // because a partial-word prefix outranked a whole-word hit.
  if (t.startsWith(q) && isBoundary(t.charAt(q.length))) return 1;
  // Whole-word containment, so "run" matches "Long run" but not "runway".
  if (new RegExp(`\\b${escapeRegExp(q)}\\b`).test(t)) return 2;
  return null;
}

/** End of string, or a non-word character — i.e. the match ended a word. */
function isBoundary(ch: string): boolean {
  return ch === "" || /\W/.test(ch);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Best-scoring candidates. Ties at the winning score are returned together so
 * the caller can tell "one clear answer" from "several equally good ones".
 */
function bestMatches<T>(items: readonly T[], titleOf: (item: T) => string, query: string): T[] {
  let best: number | null = null;
  let winners: T[] = [];
  for (const item of items) {
    const score = matchScore(titleOf(item), query);
    if (score === null) continue;
    if (best === null || score < best) {
      best = score;
      winners = [item];
    } else if (score === best) {
      winners.push(item);
    }
  }
  return winners;
}

function resolve<T>(items: readonly T[], titleOf: (item: T) => string, query?: string): TargetMatch<T> {
  const q = query?.trim();
  if (!q) {
    // One candidate and no name given is not ambiguous — there is nothing to
    // choose between, so it resolves. Anything else has to be asked about.
    if (items.length === 1) return { status: "resolved", value: items[0] };
    return { status: "unspecified", candidates: [...items] };
  }
  const winners = bestMatches(items, titleOf, q);
  if (winners.length === 0) return { status: "not-found", query: q };
  if (winners.length === 1) return { status: "resolved", value: winners[0] };
  return { status: "ambiguous", query: q, candidates: winners };
}

/** Which plan the AI meant. Never falls back to an arbitrary plan. */
export function resolvePlanTarget(plans: readonly Plan[], title?: string): TargetMatch<Plan> {
  return resolve(plans, (p) => p.title, title);
}

/** A task as the resolver sees it — one entry per task id, not per weekday copy. */
export interface TaskCandidate {
  id: string;
  title: string;
  /** Every weekday bucket this task id appears in. */
  days: DayKey[];
  planId: string;
}

/** Unique tasks in the schedule, deduped across the weekday buckets they recur in. */
export function taskCandidates(schedule: Pick<Schedule, "activities">): TaskCandidate[] {
  const byId = new Map<string, TaskCandidate>();
  for (const day of DAYS) {
    for (const task of schedule.activities?.[day] ?? ([] as Task[])) {
      const existing = byId.get(task.id);
      if (existing) existing.days.push(day);
      else byId.set(task.id, { id: task.id, title: task.title, days: [day], planId: task.planId });
    }
  }
  return [...byId.values()];
}

/**
 * Which task the AI meant.
 *
 * Returns at most ONE task. The old helper returned every loose match and the
 * caller handed the whole array to `addSubtaskToTasks`, so "add steps to Run"
 * edited three different tasks at once.
 */
export function resolveTaskTarget(
  schedule: Pick<Schedule, "activities">,
  title?: string,
): TargetMatch<TaskCandidate> {
  return resolve(taskCandidates(schedule), (t) => t.title, title);
}

/** Whether a match needs a question before anything is written. */
export function needsClarification<T>(match: TargetMatch<T>): boolean {
  return match.status !== "resolved";
}

/** Short, human phrasing of why a target could not be settled. */
export function describeTargetProblem<T>(
  match: TargetMatch<T>,
  noun: string,
): string | null {
  switch (match.status) {
    case "resolved":
      return null;
    case "ambiguous":
      return `More than one ${noun} matches "${match.query}" — pick which one.`;
    case "not-found":
      return `No ${noun} named "${match.query}".`;
    case "unspecified":
      return match.candidates.length === 0
        ? `There is no ${noun} to add this to yet.`
        : `Which ${noun} should this go to?`;
  }
}
