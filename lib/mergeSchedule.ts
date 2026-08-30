/**
 * Per-entity merge of two schedules — pure, no React, no Firebase.
 *
 * The rule the product asked for: never lose data. Two devices that edited
 * different things must end up with both sets of edits; two devices that edited
 * the SAME thing resolve to the newer edit rather than the newer document.
 *
 * Deletions are the reason this can't be a plain union. `ritualCompletions` in
 * particular is not append-only — unchecking a habit, undoing a log and
 * clearing a day all REMOVE rows — so a naive union would silently re-check
 * every habit the user unchecked. Removals are therefore carried explicitly as
 * tombstones in `Schedule.syncMeta.deleted` (see lib/stampSchedule.ts), and an
 * entity survives only if no newer tombstone covers it.
 *
 * Timestamps come from `syncMeta.updated`, falling back to the snapshot's own
 * `lastUpdated` for anything never stamped. That fallback is what makes the
 * function safe to ship against existing data: an all-legacy merge degrades to
 * today's document-level "newer snapshot wins" rather than resolving at random.
 */

import type {
  DayKey,
  Goal,
  MetricEntry,
  Milestone,
  Note,
  Plan,
  ProgressTracker,
  Ritual,
  RitualCompletion,
  Schedule,
  ScheduleEvent,
  SchedulePreferences,
  Task,
  TaskCategory,
  TaskCompletionEvent,
} from "@/lib/useScheduleDB";
import { DAYS, MAX_SCHEDULE_EVENTS } from "@/lib/scheduleConstants";
import { NS, entityKey, ritualCompletionKey, taskKey } from "@/lib/stampSchedule";

/** One side of the merge: its data plus the clock to fall back on. */
export interface MergeSide {
  schedule: Schedule;
  /** The snapshot's document timestamp, in ms (cloud `lastUpdated`). */
  lastUpdated: number;
}

interface Times {
  updated: Record<string, number>;
  deleted: Record<string, number>;
  fallback: number;
}

function timesOf(side: MergeSide): Times {
  return {
    updated: side.schedule.syncMeta?.updated ?? {},
    deleted: side.schedule.syncMeta?.deleted ?? {},
    fallback: Math.floor((side.lastUpdated || 0) / 1000),
  };
}

function editedAt(t: Times, key: string): number {
  return t.updated[key] ?? t.fallback;
}

/**
 * Stamp meaning "this copy is a transport artefact, prefer any other".
 *
 * cloudSync blanks large note bodies to fit Firestore's document limit and
 * marks them with this (see demoteBlankedNotes). It needs to lose to a real
 * copy, but "no stamp at all" is not the same statement — an unstamped entity
 * is merely unknown, and now legitimately loses to a stamped one.
 */
export const PLACEHOLDER_STAMP = 0;

/**
 * Choose between two copies of one entity.
 *
 * A real per-entity stamp always beats the *absence* of one, and only falls
 * back to the document clock when neither side knows anything. Comparing a
 * stamp against the other side's document clock — which is what this used to do
 * — let an untouched copy in a newer document overwrite a deliberate edit: two
 * tabs editing different tasks would keep losing whichever edit landed first.
 *
 * The asymmetry is sound because `syncMeta` travels with the data and is itself
 * merged, so once an entity is stamped every replica that has seen that version
 * carries the stamp. One side having no stamp therefore means it has not seen
 * the edit, not that it made a competing one.
 *
 * Deterministic tiebreak: on an exact tie side "a" wins — and because pickBase
 * already made the sides' roles content-derived rather than positional, both
 * devices reach the same answer.
 */
function pickWinner<T>(
  inA: T,
  inB: T,
  aStamp: number | undefined,
  bStamp: number | undefined,
  aFallback: number,
  bFallback: number,
): T {
  // A placeholder loses to anything real, including an unstamped copy.
  const aPlaceholder = aStamp === PLACEHOLDER_STAMP;
  const bPlaceholder = bStamp === PLACEHOLDER_STAMP;
  if (aPlaceholder !== bPlaceholder) return aPlaceholder ? inB : inA;

  if (aStamp !== undefined && bStamp !== undefined) return bStamp > aStamp ? inB : inA;
  if (aStamp !== undefined) return inA;
  if (bStamp !== undefined) return inB;
  return bFallback > aFallback ? inB : inA;
}

// -- Ordering ----------------------------------------------------------------
// Both devices must compute the same array order or they will keep pushing
// cosmetically different documents at each other. The base side supplies the
// order; the other side's extras are appended in their own order. Choosing the
// base from the data (never from which argument happened to be "local") is what
// makes mergeSchedules(a, b) and mergeSchedules(b, a) agree.

function pickBase(aKeys: string[], aTime: number, bKeys: string[], bTime: number): "a" | "b" {
  if (aTime !== bTime) return aTime > bTime ? "a" : "b";
  const aJoined = aKeys.join(" ");
  const bJoined = bKeys.join(" ");
  if (aJoined !== bJoined) return aJoined < bJoined ? "a" : "b";
  return "a";
}

// -- Generic keyed merge -----------------------------------------------------

interface KeyedResult<T> {
  items: T[];
  survivors: Set<string>;
}

/**
 * Merge two keyed collections.
 *
 * @param combine optional per-entity reconciliation applied after a winner is
 *                chosen (used to union task completion history, which must
 *                survive whichever side wins).
 */
function mergeKeyed<T>(
  a: T[] | undefined,
  b: T[] | undefined,
  keyOf: (item: T) => string,
  at: Times,
  bt: Times,
  combine?: (winner: T, loser: T) => T,
): KeyedResult<T> {
  const aMap = new Map<string, T>();
  for (const item of a ?? []) aMap.set(keyOf(item), item);
  const bMap = new Map<string, T>();
  for (const item of b ?? []) bMap.set(keyOf(item), item);

  const aKeys = [...aMap.keys()];
  const bKeys = [...bMap.keys()];
  const base = pickBase(aKeys, at.fallback, bKeys, bt.fallback);
  const order =
    base === "a"
      ? [...aKeys, ...bKeys.filter((k) => !aMap.has(k))]
      : [...bKeys, ...aKeys.filter((k) => !bMap.has(k))];

  const items: T[] = [];
  const survivors = new Set<string>();
  for (const key of order) {
    const inA = aMap.get(key);
    const inB = bMap.get(key);

    if (inA !== undefined && inB !== undefined) {
      const winner = pickWinner(inA, inB, at.updated[key], bt.updated[key], at.fallback, bt.fallback);
      const loser = winner === inA ? inB : inA;
      items.push(combine ? combine(winner, loser) : winner);
      survivors.add(key);
      continue;
    }

    // Present on one side only: it is either new there, or deleted on the
    // other. Only a tombstone NEWER than the surviving edit may remove it, so
    // a re-creation always beats a stale delete.
    const present = (inA ?? inB) as T;
    const presentTimes = inA !== undefined ? at : bt;
    const otherTimes = inA !== undefined ? bt : at;
    const tombstone = otherTimes.deleted[key];
    if (tombstone !== undefined && tombstone > editedAt(presentTimes, key)) continue;
    items.push(present);
    survivors.add(key);
  }

  return { items, survivors };
}

// -- Tasks -------------------------------------------------------------------

/**
 * Union a task's completion history by event id.
 *
 * This runs whichever side wins the task itself, and it is what makes the
 * cloud payload's 90-day history trim non-destructive: a device receiving a
 * trimmed snapshot keeps its own longer archive instead of adopting the gap.
 */
function unionHistory(
  a: TaskCompletionEvent[] | undefined,
  b: TaskCompletionEvent[] | undefined,
): TaskCompletionEvent[] | undefined {
  if (!a?.length) return b?.length ? b : a;
  if (!b?.length) return a;
  const byId = new Map<string, TaskCompletionEvent>();
  for (const e of a) byId.set(e.id, e);
  let added = false;
  for (const e of b) {
    if (byId.has(e.id)) continue;
    byId.set(e.id, e);
    added = true;
  }
  if (!added) return a;
  return [...byId.values()].sort((x, y) => x.completedAt.localeCompare(y.completedAt));
}

function combineTasks(winner: Task, loser: Task): Task {
  const history = unionHistory(winner.completionHistory, loser.completionHistory);
  if (history === winner.completionHistory) return winner;
  return { ...winner, completionHistory: history };
}

// -- Preferences -------------------------------------------------------------

/**
 * Preferences are a single small object with no per-field stamps, so the newer
 * snapshot wins wholesale — except for the two fields where that would destroy
 * information. `acknowledgedMisses` is a set the user only ever adds to, and
 * `lastRolloverISO` is a watermark defined to move forward only.
 */
function mergePreferences(a: MergeSide, b: MergeSide): SchedulePreferences {
  const ap = a.schedule.preferences ?? {};
  const bp = b.schedule.preferences ?? {};
  const base = b.lastUpdated > a.lastUpdated ? bp : ap;

  const acknowledged = [
    ...new Set([...(ap.acknowledgedMisses ?? []), ...(bp.acknowledgedMisses ?? [])]),
  ].sort();
  const rollovers = [ap.lastRolloverISO, bp.lastRolloverISO]
    .filter((v): v is string => !!v)
    .sort();

  return {
    ...base,
    ...(acknowledged.length > 0 ? { acknowledgedMisses: acknowledged } : {}),
    ...(rollovers.length > 0 ? { lastRolloverISO: rollovers[rollovers.length - 1] } : {}),
  };
}

// -- Events ------------------------------------------------------------------

function mergeEvents(a: ScheduleEvent[] | undefined, b: ScheduleEvent[] | undefined): ScheduleEvent[] {
  const byId = new Map<string, ScheduleEvent>();
  for (const e of [...(a ?? []), ...(b ?? [])]) if (!byId.has(e.id)) byId.set(e.id, e);
  const all = [...byId.values()].sort((x, y) =>
    x.timestamp === y.timestamp ? x.id.localeCompare(y.id) : x.timestamp.localeCompare(y.timestamp),
  );
  // Append-only log capped from the front, matching pushEvent in
  // lib/scheduleEvents.ts — the newest MAX_SCHEDULE_EVENTS survive.
  return all.length > MAX_SCHEDULE_EVENTS ? all.slice(all.length - MAX_SCHEDULE_EVENTS) : all;
}

// -- Entry point -------------------------------------------------------------

export function mergeSchedules(a: MergeSide, b: MergeSide): Schedule {
  const at = timesOf(a);
  const bt = timesOf(b);
  const survivors = new Set<string>();
  const collect = <T,>(r: KeyedResult<T>): T[] => {
    for (const key of r.survivors) survivors.add(key);
    return r.items;
  };

  const activities = {} as Record<DayKey, Task[]>;
  for (const day of DAYS) {
    activities[day as DayKey] = collect(
      mergeKeyed<Task>(
        a.schedule.activities?.[day as DayKey],
        b.schedule.activities?.[day as DayKey],
        (task) => taskKey(day, task.id),
        at,
        bt,
        combineTasks,
      ),
    );
  }

  const byId = <T extends { id: string }>(ns: string) => (x: T) => entityKey(ns, x.id);

  const merged: Schedule = {
    goals: collect(mergeKeyed<Goal>(a.schedule.goals, b.schedule.goals, byId(NS.goal), at, bt)),
    plans: collect(mergeKeyed<Plan>(a.schedule.plans, b.schedule.plans, byId(NS.plan), at, bt)),
    categories: collect(
      mergeKeyed<TaskCategory>(a.schedule.categories, b.schedule.categories, byId(NS.category), at, bt),
    ),
    activities,
    progressTrackers: collect(
      mergeKeyed<ProgressTracker>(
        a.schedule.progressTrackers,
        b.schedule.progressTrackers,
        byId(NS.tracker),
        at,
        bt,
      ),
    ),
    metricEntries: collect(
      mergeKeyed<MetricEntry>(a.schedule.metricEntries, b.schedule.metricEntries, byId(NS.metric), at, bt),
    ),
    milestones: collect(
      mergeKeyed<Milestone>(a.schedule.milestones, b.schedule.milestones, byId(NS.milestone), at, bt),
    ),
    rituals: collect(mergeKeyed<Ritual>(a.schedule.rituals, b.schedule.rituals, byId(NS.ritual), at, bt)),
    ritualCompletions: collect(
      mergeKeyed<RitualCompletion>(
        a.schedule.ritualCompletions,
        b.schedule.ritualCompletions,
        ritualCompletionKey,
        at,
        bt,
      ),
    ),
    notes: collect(mergeKeyed<Note>(a.schedule.notes, b.schedule.notes, byId(NS.note), at, bt)),
    events: mergeEvents(a.schedule.events, b.schedule.events),
    preferences: mergePreferences(a, b),
  };

  const syncMeta = mergeSyncMeta(at, bt, survivors);
  return syncMeta ? { ...merged, syncMeta } : merged;
}

/**
 * Carry both sides' bookkeeping forward: the later stamp per surviving entity,
 * and every tombstone that no surviving entity contradicts. A tombstone whose
 * entity is alive in the result has been overruled and is dropped, so it can
 * never come back to kill the entity on a later merge.
 */
function mergeSyncMeta(at: Times, bt: Times, survivors: Set<string>): Schedule["syncMeta"] {
  const updated: Record<string, number> = {};
  for (const key of survivors) {
    const t = Math.max(at.updated[key] ?? 0, bt.updated[key] ?? 0);
    if (t > 0) updated[key] = t;
  }
  const deleted: Record<string, number> = {};
  for (const source of [at.deleted, bt.deleted]) {
    for (const [key, t] of Object.entries(source)) {
      if (survivors.has(key)) continue;
      if (!(key in deleted) || t > deleted[key]) deleted[key] = t;
    }
  }
  const hasUpdated = Object.keys(updated).length > 0;
  const hasDeleted = Object.keys(deleted).length > 0;
  if (!hasUpdated && !hasDeleted) return undefined;
  return {
    ...(hasUpdated ? { updated } : {}),
    ...(hasDeleted ? { deleted } : {}),
  };
}

// -- Local record (two tabs of one browser) ----------------------------------

/**
 * What a tab should actually persist to its shared IndexedDB record.
 *
 * Two tabs share the record but not a line of state, so a plain `put()` erased
 * whichever tab wrote second — on disk, offline, with no network involved. The
 * revision comparison is the local analogue of the cloud compare-and-swap:
 *
 * - `expectedRev` is what THIS tab last read or wrote (per-tab module memory).
 * - `storedRev` is what is on disk right now.
 *
 * Equal means nothing happened in between and this tab's tree is authoritative.
 * Anything else — including `undefined`, meaning this tab has never read the
 * record and would otherwise be writing blind — means another tab wrote, and
 * the two are merged per entity instead.
 */
export function resolveLocalWrite(args: {
  mine: Schedule;
  stored: Schedule | null;
  storedRev: number;
  expectedRev: number | undefined;
  /** The shared local clock, last set by whichever tab wrote the record. */
  otherLastUpdated: number;
  now: number;
}): Schedule {
  const { mine, stored, storedRev, expectedRev, otherLastUpdated, now } = args;
  if (!stored) return mine;
  if (expectedRev !== undefined && storedRev === expectedRev) return mine;
  return mergeSchedules(
    { schedule: mine, lastUpdated: now },
    { schedule: stored, lastUpdated: otherLastUpdated },
  );
}
