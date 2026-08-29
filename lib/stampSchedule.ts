/**
 * Per-entity change tracking for cloud merge — pure, no React or Firebase.
 *
 * Why a side map rather than an `updatedAt` on every entity: `Schedule` has ten
 * collections normalised by nine different functions, several of which rebuild
 * their objects field by field from an explicit allowlist. Adding a timestamp
 * to each one means touching every schema, every normaliser and the category
 * registry, and leaves a hole in each future one. A single map keyed by entity
 * — written in one place, at the `setSchedule` boundary — needs none of that,
 * and no reader anywhere has to learn about it.
 *
 * It also sidesteps a trap: `Goal`, `Milestone` and `Note` DO carry an
 * `updatedAt`, but their normalisers fabricate `new Date()` whenever the field
 * is missing, so legacy entities look freshly edited on every load on every
 * device. A key exists in this map only when a change was actually observed,
 * so absence is honest and the merge can fall back to the snapshot's own
 * timestamp instead of resolving at random.
 *
 * Times are epoch SECONDS: a heavy schedule has a few thousand entities and
 * this map rides along in a Firestore document capped at 1 MB.
 */

import type {
  DayKey,
  RitualCompletion,
  Schedule,
} from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";

export interface ScheduleSyncMeta {
  /** entity key → epoch seconds of the last observed change */
  updated?: Record<string, number>;
  /** entity key → epoch seconds the entity was removed */
  deleted?: Record<string, number>;
}

/**
 * Namespace prefixes. Short because they are repeated once per entity in a
 * size-capped payload; distinct so two collections can never collide on a
 * shared id.
 */
export const NS = {
  task: "a",
  goal: "g",
  plan: "p",
  category: "c",
  tracker: "k",
  metric: "e",
  milestone: "m",
  ritual: "r",
  ritualCompletion: "x",
  note: "n",
} as const;

export function entityKey(ns: string, id: string): string {
  return `${ns}|${id}`;
}

/**
 * Tasks key on (day, id), never id alone: `updateTaskDays` writes the SAME task
 * id into up to seven weekday buckets, each with its own slots, completion and
 * completed-slot indices. Keying on the id would collapse a recurring task onto
 * one day — a worse bug than the one merging exists to fix.
 */
export function taskKey(day: string, id: string): string {
  return `${NS.task}|${day}|${id}`;
}

/**
 * Ritual completions have an OPTIONAL id — every row written before the
 * generic-tracking work is a bare `{ritualId, date}` sentinel. Fall back to a
 * composite so legacy rows still get a stable identity, and so a step tick and
 * a day sentinel for the same routine and date stay distinct.
 */
export function ritualCompletionKey(c: RitualCompletion): string {
  if (c.id) return entityKey(NS.ritualCompletion, c.id);
  return `${NS.ritualCompletion}|${c.ritualId}~${c.date}~${c.stepId ?? ""}`;
}

/** Every live entity in a schedule, keyed for change tracking. */
export function entityMap(schedule: Schedule): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const day of DAYS) {
    for (const task of schedule.activities?.[day as DayKey] ?? []) {
      map.set(taskKey(day, task.id), task);
    }
  }
  const simple: Array<[string, ReadonlyArray<{ id: string }> | undefined]> = [
    [NS.goal, schedule.goals],
    [NS.plan, schedule.plans],
    [NS.category, schedule.categories],
    [NS.tracker, schedule.progressTrackers],
    [NS.metric, schedule.metricEntries],
    [NS.milestone, schedule.milestones],
    [NS.ritual, schedule.rituals],
    [NS.note, schedule.notes],
  ];
  for (const [ns, items] of simple) {
    for (const item of items ?? []) map.set(entityKey(ns, item.id), item);
  }
  for (const c of schedule.ritualCompletions ?? []) map.set(ritualCompletionKey(c), c);
  return map;
}

/**
 * Did this entity actually change?
 *
 * Reference inequality is the fast path — every mutation helper in the app
 * builds new objects immutably, so an untouched entity keeps its identity and
 * a typical edit reaches the content compare for one entity, not thousands.
 * The content compare is a JSON round-trip, which can report a change when only
 * key ORDER differs. That error is one-directional and deliberate: an extra
 * stamp is harmless ("this device touched it"), a missed one loses an edit.
 */
/** Union of two key→time maps, keeping the later time for shared keys. */
function laterOf(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [key, at] of Object.entries(b ?? {})) {
    if (!(key in out) || at > out[key]) out[key] = at;
  }
  return out;
}

function changed(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Record what changed between two schedules.
 *
 * Called from `setSchedule` — the single boundary every user edit passes
 * through — rather than from the mutation helpers, because most call sites
 * build their next schedule inline in the two app shells and would never be
 * covered.
 *
 * Returns `next` untouched when nothing changed, so React's bail-out and the
 * write effect's reference checks still work.
 */
export function stampSchedule(prev: Schedule, next: Schedule, nowMs: number = Date.now()): Schedule {
  if (prev === next) return next;

  const before = entityMap(prev);
  const after = entityMap(next);
  const at = Math.floor(nowMs / 1000);

  // Base on BOTH sides, keeping the later stamp per key. In the ordinary case
  // `next` is spread from `prev` and the two are the same object. They diverge
  // for undo and for restore-from-backup, where `next` is an older snapshot
  // (or a file) whose map has forgotten deletions that really happened since —
  // and a forgotten tombstone resurrects a deleted entity on the next merge.
  const updated = laterOf(prev.syncMeta?.updated, next.syncMeta?.updated);
  const deleted = laterOf(prev.syncMeta?.deleted, next.syncMeta?.deleted);
  let touched = false;

  for (const [key, value] of after) {
    if (changed(before.get(key), value)) {
      updated[key] = at;
      // A re-creation outlives its own tombstone.
      if (key in deleted) delete deleted[key];
      touched = true;
    }
  }

  for (const key of before.keys()) {
    if (after.has(key)) continue;
    deleted[key] = at;
    delete updated[key];
    touched = true;
  }

  if (!touched) return next;
  const hasUpdated = Object.keys(updated).length > 0;
  const hasDeleted = Object.keys(deleted).length > 0;
  return {
    ...next,
    syncMeta: {
      ...(hasUpdated ? { updated } : {}),
      ...(hasDeleted ? { deleted } : {}),
    },
  };
}

// ── Persistence hygiene ───────────────────────────────────────────────────────

const TOMBSTONE_TTL_SECONDS = 90 * 24 * 60 * 60; // matches the sync payload's history horizon

function numberMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Validate stored sync metadata and drop what can no longer matter: stamps for
 * entities that no longer exist, and tombstones past the 90-day horizon the
 * cloud payload already trims to. Without this the maps only ever grow.
 *
 * Returns undefined when nothing is left, so an untouched schedule doesn't
 * carry an empty object around.
 */
export function normalizeSyncMeta(raw: unknown, live: Set<string>, nowMs: number = Date.now()): ScheduleSyncMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as { updated?: unknown; deleted?: unknown };
  const horizon = Math.floor(nowMs / 1000) - TOMBSTONE_TTL_SECONDS;

  const updated: Record<string, number> = {};
  for (const [key, at] of Object.entries(numberMap(source.updated))) {
    if (live.has(key)) updated[key] = at;
  }
  const deleted: Record<string, number> = {};
  for (const [key, at] of Object.entries(numberMap(source.deleted))) {
    // A tombstone for something that exists again is spent; the re-creation won.
    if (at >= horizon && !live.has(key)) deleted[key] = at;
  }

  const hasUpdated = Object.keys(updated).length > 0;
  const hasDeleted = Object.keys(deleted).length > 0;
  if (!hasUpdated && !hasDeleted) return undefined;
  return {
    ...(hasUpdated ? { updated } : {}),
    ...(hasDeleted ? { deleted } : {}),
  };
}
