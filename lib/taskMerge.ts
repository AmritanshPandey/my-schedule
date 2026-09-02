/**
 * Merged tasks — two independent tasks that share a time slot (e.g. "Cardio"
 * and "Workout" both at the gym at 6pm) and should render as one combined
 * calendar block instead of splitting into lanes.
 *
 * Deliberately a rendering hint only: each task keeps its own category,
 * completion state, and stats — see `Task.mergeGroupId` in useScheduleDB.ts.
 * v1 is strictly pairwise (a group ever has exactly two members); the field
 * itself is a generic shared id so N-way merging is a cheap follow-up later,
 * not something enforced by this module beyond `findMergePairs` ignoring any
 * group that isn't exactly two.
 *
 * Pure and React-free so it can be shared by the week grid, the single-day
 * timeline, and unit-tested directly.
 */

import type { Schedule, Task } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { uid } from "./id";
import { getSlots } from "./taskMutations";
import { parseTimeToMinutes } from "./timeUtils";

// ── Grouping (used by the week grid + single-day timeline's lane layout) ────

/**
 * Given a day's worth of rendered interval entries, finds the pairs that
 * should collapse into one merged block: entries sharing a `mergeGroupId`,
 * where *both* members of that pair are present in `entries`. Callers run
 * this before their own lane/cluster packing — a merge pair overlaps in time
 * by definition, so it needs no cluster-boundary awareness of its own.
 *
 * A group with only one member present (its partner isn't scheduled today,
 * or was deleted, leaving a dangling id) is left out of the result on
 * purpose — the caller renders that entry alone rather than merged, which is
 * also how a task with no partner at all behaves. A group with more than two
 * members shouldn't occur (merging is strictly pairwise, see module doc) but
 * is left out too rather than guessing which two to combine.
 */
export function findMergePairs<E extends { task: Pick<Task, "mergeGroupId"> }>(
  entries: readonly E[]
): Map<string, [E, E]> {
  const byGroup = new Map<string, E[]>();
  for (const e of entries) {
    const groupId = e.task.mergeGroupId;
    if (!groupId) continue;
    const list = byGroup.get(groupId);
    if (list) list.push(e);
    else byGroup.set(groupId, [e]);
  }
  const pairs = new Map<string, [E, E]>();
  for (const [groupId, list] of byGroup) {
    if (list.length === 2) pairs.set(groupId, [list[0], list[1]]);
  }
  return pairs;
}

// ── Candidates (used by TaskSheet's "Occurs with" section) ──────────────────

/** Whole-minute overlap test: true when [aStart,aEnd) and [bStart,bEnd) share
 *  any time — a 6:00–7:00 task doesn't "overlap" a 7:00–8:00 one just because
 *  their edges touch, it needs an actual shared interval. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** True when any slot of `a` overlaps any slot of `b` — both read via
 *  `getSlots` so single- and multi-slot tasks compare the same way. */
export function tasksOverlapInTime(a: Task, b: Task): boolean {
  const aSlots = getSlots(a);
  const bSlots = getSlots(b);
  for (const sa of aSlots) {
    const aStart = parseTimeToMinutes(sa.startTime);
    const aEnd = parseTimeToMinutes(sa.endTime);
    if (aStart === null || aEnd === null) continue;
    for (const sb of bSlots) {
      const bStart = parseTimeToMinutes(sb.startTime);
      const bEnd = parseTimeToMinutes(sb.endTime);
      if (bStart === null || bEnd === null) continue;
      if (overlaps(aStart, aEnd, bStart, bEnd)) return true;
    }
  }
  return false;
}

/**
 * Other tasks in `dayTasks` (typically one weekday's `schedule.activities`
 * bucket) that `task` could merge with: overlapping in time, not itself, and
 * not already paired with someone else (v1's strictly-pairwise rule — unmerge
 * first to pick a different partner).
 */
export function mergeCandidates(task: Task, dayTasks: readonly Task[]): Task[] {
  return dayTasks.filter(
    (t) => t.id !== task.id && !t.mergeGroupId && tasksOverlapInTime(task, t)
  );
}

// ── Mutations (Schedule updaters, same `(prev) => next` shape as taskMutations.ts) ──

/**
 * Pairs two tasks under a fresh shared `mergeGroupId`, across every weekday
 * bucket either one appears in (a recurring task has one Task copy per day it
 * repeats on, all sharing one `id` — see createTask in taskMutations.ts).
 */
export function mergeTasks(taskIdA: string, taskIdB: string): (prev: Schedule) => Schedule {
  const groupId = uid();
  return (prev) => {
    const activities = { ...prev.activities };
    for (const day of DAYS) {
      activities[day] = activities[day].map((t) =>
        t.id === taskIdA || t.id === taskIdB ? { ...t, mergeGroupId: groupId } : t
      );
    }
    return { ...prev, activities };
  };
}

/** Clears `mergeGroupId` from every task sharing `taskId`'s group — v1 is
 *  strictly pairwise, so this always dissolves the whole pair, not just
 *  `taskId`'s own membership. A no-op if `taskId` isn't merged with anyone. */
export function unmergeTask(taskId: string): (prev: Schedule) => Schedule {
  return (prev) => {
    let groupId: string | undefined;
    outer: for (const day of DAYS) {
      for (const t of prev.activities[day]) {
        if (t.id === taskId && t.mergeGroupId) {
          groupId = t.mergeGroupId;
          break outer;
        }
      }
    }
    if (!groupId) return prev;
    const activities = { ...prev.activities };
    for (const day of DAYS) {
      activities[day] = activities[day].map((t) =>
        t.mergeGroupId === groupId ? { ...t, mergeGroupId: undefined } : t
      );
    }
    return { ...prev, activities };
  };
}
