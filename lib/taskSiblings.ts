/**
 * One logical task, one `id`.
 *
 * `createTask` (lib/taskMutations.ts) and `lib/taskMerge.ts` both state the
 * model's rule: a recurring task is ONE `Task.id` with a copy of that record in
 * each `activities[weekday]` bucket it runs on. `repeatDays` is not a field —
 * which weekdays a task runs on is expressed purely by which buckets hold the
 * id.
 *
 * Several writers broke that rule by calling `uid()` once per weekday, so one
 * logical task became N records with N ids: an AI-generated "Cycling Mon–Sat"
 * arrived as six separate tasks. Every reader then disagreed about how to clean
 * up after them — one counting six rows, another collapsing them by title.
 *
 * This module is the repair and the prevention: a single definition of "these
 * records are the same task", plus the pure, idempotent collapse that enforces
 * it on load and after every sync merge.
 *
 * Pure and React-free so the node test runner can import it directly.
 */

import type { DayKey, Schedule, Task, TaskRecurrence } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { getSlots } from "./taskMutations";
import { missKey } from "./missedRecovery";
import { slotRiskKey } from "./attentionDismissal";
import { unionHistory } from "./mergeSchedule";

/**
 * Recurrence as identity.
 *
 * This is the part of the key that cannot be dropped. `lib/curriculumParser.ts`
 * emits one task per dated session *precisely because* `TaskException` carries
 * no `subtasks` field, so a single weekly task cannot hold week 1's checklist
 * and week 12's different one. Those sessions share a title, a time and a
 * weekday bucket, and differ only by `dateISO` — collapsing them would delete
 * every week's checklist but one, irreversibly.
 *
 * `anchorISO` matters for the same reason at lower stakes: two every-2-weeks
 * tasks on opposite anchors run on disjoint weeks and are not the same task.
 */
function recurrenceKey(r: TaskRecurrence | undefined): string {
  if (!r) return "weekly";
  return r.type === "once" ? `once:${r.dateISO}` : `weekly:${r.interval}:${r.anchorISO}`;
}

/**
 * The identity of a task, independent of its id.
 *
 * Deliberately STRICTER than "same title at the same time". Every fragment set
 * this exists to repair was written by a single loop — the AI committer, bulk
 * import, `duplicateDay` — so its members agree on all of these fields and
 * still group. The strictness only ever costs an un-collapsed duplicate the
 * user can merge by hand, where looseness costs data nobody can get back.
 *
 * Excluded on purpose: `description`, `subtasks`, `sortOrder`, `streakEnabled`,
 * `stepBufferMinutes`, `mergeGroupId`, and all completion/exception state —
 * those are things one copy can legitimately differ on.
 */
export function taskSiblingKey(task: Task): string {
  return [
    task.planId,
    task.taskType ?? "task",
    task.title.trim().toLowerCase().replace(/\s+/g, " "),
    getSlots(task)
      .map((s) => `${s.startTime}~${s.endTime}`)
      .join(","),
    task.categoryId ?? "",
    recurrenceKey(task.recurrence),
    task.activeFrom ?? "",
    task.activeUntil ?? "",
  ].join("|");
}

/**
 * The id a group of siblings collapses onto: the lexicographically smallest.
 *
 * Content-derived rather than chosen, which is what makes the collapse safe
 * across devices. Two phones that each see the same group independently pick
 * the same winner, so a sync merge cannot resurrect the losers — see the note
 * on the post-merge call site in lib/mergeSchedule.ts.
 *
 * `uid()` is `Date.now().toString(36) + random`, so smallest is also oldest,
 * which is the id existing milestone and note links most likely already hold.
 */
export function canonicalTaskId(ids: readonly string[]): string {
  return ids.reduce((min, id) => (id < min ? id : min));
}

/** Every sibling group in a schedule, keyed by identity. For tests and diagnostics. */
export function planSiblingGroups(
  activities: Schedule["activities"],
): Map<string, { ids: Set<string>; days: DayKey[] }> {
  const groups = new Map<string, { ids: Set<string>; days: DayKey[] }>();
  for (const day of DAYS) {
    for (const task of activities[day] ?? []) {
      const key = taskSiblingKey(task);
      const g = groups.get(key);
      if (g) {
        g.ids.add(task.id);
        if (!g.days.includes(day)) g.days.push(day);
      } else {
        groups.set(key, { ids: new Set([task.id]), days: [day] });
      }
    }
  }
  return groups;
}

// ── Re-pointing everything that holds a task id ───────────────────────────────

/**
 * Rewrite every task id in the schedule through `remap`.
 *
 * Five holders, not one. Missing any of them is the quiet failure mode: a
 * milestone whose `linkedActivities` still names a dropped id reads as 0%
 * progress, because `calculateLinkedTaskProgress` returns null for an id with
 * no copies — it looks to the user like their progress was deleted.
 */
export function remapTaskIds(schedule: Schedule, remap: ReadonlyMap<string, string>): Schedule {
  if (remap.size === 0) return schedule;
  const to = (id: string) => remap.get(id) ?? id;
  const uniq = (ids: string[]) => Array.from(new Set(ids));

  const activities = { ...schedule.activities };
  for (const day of DAYS) {
    activities[day] = (activities[day] ?? []).map((t) => {
      const history = t.completionHistory?.map((e) =>
        remap.has(e.taskId) ? { ...e, taskId: to(e.taskId) } : e,
      );
      return history ? { ...t, completionHistory: history } : t;
    });
  }

  const prefs = schedule.preferences;
  // Composite keys are rebuilt through the helpers that mint them rather than
  // split inline, so the two formats stay defined in one place each.
  const acknowledgedMisses = prefs?.acknowledgedMisses
    ? uniq(
        prefs.acknowledgedMisses.map((k) => {
          const at = k.lastIndexOf("|");
          if (at < 0) return k;
          return missKey(to(k.slice(0, at)), k.slice(at + 1));
        }),
      )
    : prefs?.acknowledgedMisses;

  // Only `slot-risk|<taskId>|<iso>` rows carry a task id; ritual|, ms-risk| and
  // ms-late| rows are keyed by other entities and must be left alone.
  const acknowledgedAttention = prefs?.acknowledgedAttention
    ? uniq(
        prefs.acknowledgedAttention.map((k) => {
          const parts = k.split("|");
          return parts.length === 3 && parts[0] === "slot-risk"
            ? slotRiskKey(to(parts[1]), parts[2])
            : k;
        }),
      )
    : prefs?.acknowledgedAttention;

  return {
    ...schedule,
    activities,
    milestones: (schedule.milestones ?? []).map((m) =>
      m.linkedActivities?.length
        ? { ...m, linkedActivities: uniq(m.linkedActivities.map(to)) }
        : m,
    ),
    notes: (schedule.notes ?? []).map((n) =>
      n.linkedTaskIds?.length ? { ...n, linkedTaskIds: uniq(n.linkedTaskIds.map(to)) } : n,
    ),
    ...(prefs
      ? { preferences: { ...prefs, acknowledgedMisses, acknowledgedAttention } }
      : {}),
  };
}

// ── The collapse ─────────────────────────────────────────────────────────────

/** Same phases, in the same order — the guard on unioning slot-indexed state. */
function sameSlots(a: Task, b: Task): boolean {
  const x = getSlots(a);
  const y = getSlots(b);
  return (
    x.length === y.length &&
    x.every((s, i) => s.startTime === y[i].startTime && s.endTime === y[i].endTime)
  );
}

const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Fold a losing record into the surviving one, within a single weekday bucket.
 *
 * Only reached for the *same-bucket* case — two records of one task in one day,
 * which is what the append bug in `updateTaskDays` produced. Cross-bucket
 * siblings keep their own state untouched, because one copy per weekday each
 * accumulating its own history is the model working as designed.
 */
function foldInto(survivor: Task, loser: Task): Task {
  const indicesSafe = sameSlots(survivor, loser);
  const union = (a?: number[], b?: number[]) =>
    a || b ? Array.from(new Set([...(a ?? []), ...(b ?? [])])).sort((x, y) => x - y) : undefined;

  return {
    ...survivor,
    completed: survivor.completed || loser.completed || undefined,
    completedAt: later(survivor.completedAt, loser.completedAt),
    missed: survivor.missed || loser.missed || undefined,
    missedAt: later(survivor.missedAt, loser.missedAt),
    completedSubtaskIds:
      survivor.completedSubtaskIds || loser.completedSubtaskIds
        ? Array.from(
            new Set([...(survivor.completedSubtaskIds ?? []), ...(loser.completedSubtaskIds ?? [])]),
          )
        : undefined,
    // Slot indices only mean the same thing when the phase lists match. When
    // they don't, the survivor's own indices stand and the unioned history
    // below carries the durable record — every analytical reader uses that.
    completedSlotIndices: indicesSafe
      ? union(survivor.completedSlotIndices, loser.completedSlotIndices)
      : survivor.completedSlotIndices,
    missedSlotIndices: indicesSafe
      ? union(survivor.missedSlotIndices, loser.missedSlotIndices)
      : survivor.missedSlotIndices,
    completionHistory: unionHistory(survivor.completionHistory, loser.completionHistory),
    exceptions:
      survivor.exceptions || loser.exceptions
        ? { ...loser.exceptions, ...survivor.exceptions }
        : undefined,
    // Never unioned: subtask ids are referenced by completedSubtaskIds and by
    // completionHistory.subtaskId, so mixing two lists would orphan both.
    subtasks: survivor.subtasks,
  };
}

/** How much durable state a record carries — the tie-break for "which copy leads". */
function stateWeight(t: Task): number {
  return (
    (t.completionHistory?.length ?? 0) * 100 +
    (t.completedSubtaskIds?.length ?? 0) * 10 +
    Object.keys(t.exceptions ?? {}).length * 10 +
    (t.completed ? 1 : 0)
  );
}

/**
 * Give every sibling group one shared id, and leave at most one record per day.
 *
 * Pure and idempotent: a schedule with no groups of more than one id comes back
 * by reference, so React's bail-out and `schedulesEqual` keep working and this
 * costs nothing in the steady state.
 *
 * Runs in two places (see lib/useScheduleDB.ts and lib/mergeSchedule.ts). The
 * post-merge call is the one that matters for correctness: `mergeSchedules`
 * keys tasks on `taskKey(day, task.id)`, so a device that has not yet collapsed
 * would otherwise reintroduce every id its peer just retired. Because the
 * surviving id is `canonicalTaskId` — content-derived, not chosen — both
 * devices compute the same answer over the merged union and converge in one
 * step, with no version flag and no coordination.
 */
export function collapseTaskSiblings(schedule: Schedule): Schedule {
  const groups = planSiblingGroups(schedule.activities);

  const remap = new Map<string, string>();
  for (const { ids } of groups.values()) {
    if (ids.size < 2) continue;
    const winner = canonicalTaskId([...ids]);
    for (const id of ids) if (id !== winner) remap.set(id, winner);
  }

  // A same-bucket duplicate can exist even when every id already matches.
  const hasBucketDupes = DAYS.some((day) => {
    const seen = new Set<string>();
    return (schedule.activities[day] ?? []).some((t) => {
      const key = taskSiblingKey(t);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  });

  if (remap.size === 0 && !hasBucketDupes) return schedule;

  const activities = { ...schedule.activities };
  for (const day of DAYS) {
    const bySibling = new Map<string, Task>();
    const order: string[] = [];
    for (const task of schedule.activities[day] ?? []) {
      const id = remap.get(task.id) ?? task.id;
      const key = taskSiblingKey(task);
      const existing = bySibling.get(key);
      if (!existing) {
        bySibling.set(key, task.id === id ? task : { ...task, id });
        order.push(key);
        continue;
      }
      // Two records of one task in one day. The survivor is whichever carries
      // more durable state, so a fold never demotes the richer copy.
      const [keep, drop] =
        stateWeight(existing) >= stateWeight(task) ? [existing, { ...task, id }] : [{ ...task, id }, existing];
      bySibling.set(key, foldInto(keep, drop));
    }
    activities[day] = order.map((k) => bySibling.get(k)!);
  }

  return remapTaskIds({ ...schedule, activities }, remap);
}
