/**
 * The per-entity merge that lets two devices edit the same account without
 * either losing work.
 *
 * The properties matter more than the cases here: a merge is wrong in classes,
 * not instances. Anything that survives "no entity disappears unless a newer
 * tombstone covers it" and "both devices compute the same result" is very hard
 * to make lose data by accident.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

function resolveWithTsFallback(url, context, nextResolve) {
  try {
    return nextResolve(url, context);
  } catch {
    try {
      return nextResolve(`${url}.ts`, context);
    } catch {
      return nextResolve(`${url}.tsx`, context);
    }
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      return resolveWithTsFallback(url, context, nextResolve);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        const url = new URL(specifier, context.parentURL).href;
        try {
          return nextResolve(`${url}.ts`, context);
        } catch {
          return nextResolve(`${url}.tsx`, context);
        }
      }
      throw error;
    }
  },
});

const { mergeSchedules } = await import("@/lib/mergeSchedule.ts");
const { stampSchedule, normalizeSyncMeta, entityMap, taskKey, ritualCompletionKey } =
  await import("@/lib/stampSchedule.ts");
const { validateSchedule } = await import("@/lib/scheduleSchema.ts");
const { DAYS, MAX_SCHEDULE_EVENTS } = await import("@/lib/scheduleConstants.ts");

// ── Fixtures ────────────────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 7, 20, 9, 0, 0); // ms
const MIN = 60_000;
const sec = (ms) => Math.floor(ms / 1000);

function emptyDays() {
  return Object.fromEntries(DAYS.map((d) => [d, []]));
}

function sched(over = {}) {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: emptyDays(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
    ...over,
  };
}

function task(id, over = {}) {
  return { id, title: id, startTime: "09:00 AM", endTime: "10:00 AM", planId: "p1", ...over };
}

function ritual(id, over = {}) {
  return { id, title: id, time: "08:00", ...over };
}

function note(id, over = {}) {
  return {
    id,
    title: id,
    body: "",
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...over,
  };
}

function withDay(day, tasks, over = {}) {
  return sched({ activities: { ...emptyDays(), [day]: tasks }, ...over });
}

/** A merge side: schedule plus the document timestamp it was written with. */
const side = (schedule, lastUpdated = T0) => ({ schedule, lastUpdated });

// ── Properties ──────────────────────────────────────────────────────────────

function allKeys(schedule) {
  return new Set(entityMap(schedule).keys());
}

/** Every entity from either input, unless a newer tombstone removed it. */
function assertNoLoss(a, b, merged) {
  const survived = allKeys(merged);
  const tombstones = {
    ...(a.schedule.syncMeta?.deleted ?? {}),
    ...(b.schedule.syncMeta?.deleted ?? {}),
  };
  for (const source of [a, b]) {
    for (const key of allKeys(source.schedule)) {
      if (survived.has(key)) continue;
      assert.ok(
        key in tombstones,
        `${key} vanished from the merge with no tombstone to justify it`,
      );
    }
  }
}

function assertValid(schedule) {
  const result = validateSchedule(schedule);
  assert.ok(result.success, `merge produced an invalid schedule: ${result.error?.issues?.[0]?.message}`);
}

/** Run the whole property suite over one pair. */
function checkPair(a, b) {
  const ab = mergeSchedules(a, b);
  const ba = mergeSchedules(b, a);
  assertValid(ab);
  assertNoLoss(a, b, ab);
  assert.deepEqual(ab, ba, "mergeSchedules(a, b) and mergeSchedules(b, a) disagree");
  // Idempotence: re-merging a result with one of its inputs changes nothing.
  assert.deepEqual(mergeSchedules(side(ab, Math.max(a.lastUpdated, b.lastUpdated)), b), ab);
  return ab;
}

test("merging a schedule with itself is a no-op", () => {
  const s = withDay("monday", [task("t1"), task("t2")], {
    rituals: [ritual("r1")],
    notes: [note("n1")],
  });
  const merged = mergeSchedules(side(s), side(s));
  assert.deepEqual(merged.activities.monday, s.activities.monday);
  assert.deepEqual(merged.rituals, s.rituals);
  assert.deepEqual(merged.notes, s.notes);
});

test("disjoint edits from two devices both survive", () => {
  const a = withDay("monday", [task("t1")], { notes: [note("n1")] });
  const b = withDay("monday", [task("t2")], { notes: [note("n2")] });
  const merged = checkPair(side(a, T0), side(b, T0 + MIN));

  assert.deepEqual(
    merged.activities.monday.map((t) => t.id).sort(),
    ["t1", "t2"],
  );
  assert.deepEqual(merged.notes.map((n) => n.id).sort(), ["n1", "n2"]);
});

test("the newer edit of the SAME entity wins, per entity", () => {
  const key = taskKey("monday", "t1");
  const a = withDay("monday", [task("t1", { title: "old" })], {
    syncMeta: { updated: { [key]: sec(T0) } },
  });
  const b = withDay("monday", [task("t1", { title: "new" })], {
    syncMeta: { updated: { [key]: sec(T0 + MIN) } },
  });
  const merged = checkPair(side(a, T0), side(b, T0));
  assert.equal(merged.activities.monday[0].title, "new");
});

test("a stale document clock cannot override a newer per-entity edit", () => {
  // The whole point of stamping: device A's document is newer overall, but the
  // task itself was last edited on B.
  const key = taskKey("monday", "t1");
  const a = withDay("monday", [task("t1", { title: "A" })], {
    syncMeta: { updated: { [key]: sec(T0) } },
  });
  const b = withDay("monday", [task("t1", { title: "B" })], {
    syncMeta: { updated: { [key]: sec(T0 + 5 * MIN) } },
  });
  const merged = mergeSchedules(side(a, T0 + 60 * MIN), side(b, T0));
  assert.equal(merged.activities.monday[0].title, "B");
});

// ── The (day, id) trap ──────────────────────────────────────────────────────
// updateTaskDays writes the SAME task id into up to seven weekday buckets, each
// with its own slots and completion state. Keying on the id alone would collapse
// a recurring task onto a single day.

test("the same task id on two weekdays keeps both days' state", () => {
  const a = sched({
    activities: {
      ...emptyDays(),
      monday: [task("t1", { completed: true })],
      tuesday: [task("t1", { completed: false })],
    },
  });
  const b = sched({
    activities: {
      ...emptyDays(),
      monday: [task("t1", { completed: true })],
      tuesday: [task("t1", { completed: false })],
    },
  });
  const merged = checkPair(side(a, T0), side(b, T0 + MIN));
  assert.equal(merged.activities.monday.length, 1);
  assert.equal(merged.activities.tuesday.length, 1);
  assert.equal(merged.activities.monday[0].completed, true);
  assert.equal(merged.activities.tuesday[0].completed, false);
});

test("a stamp on monday's copy must not decide tuesday's copy", () => {
  // The sharp edge of keying on (day, id). Both days differ between the two
  // devices, but only MONDAY was stamped. Monday therefore resolves by that
  // stamp and tuesday must fall back to the document clock — if the key lost
  // its day, monday's stamp would silently decide tuesday too.
  const mondayKey = taskKey("monday", "t1");
  const both = (mondayTitle, tuesdayTitle) =>
    sched({
      activities: {
        ...emptyDays(),
        monday: [task("t1", { title: mondayTitle })],
        tuesday: [task("t1", { title: tuesdayTitle })],
      },
    });
  const a = { ...both("A-mon", "A-tue"), syncMeta: { updated: { [mondayKey]: sec(T0) } } };
  const b = { ...both("B-mon", "B-tue"), syncMeta: { updated: { [mondayKey]: sec(T0 + MIN) } } };

  // A's document is newer; B's monday EDIT is newer.
  const merged = mergeSchedules(side(a, T0 + 60 * MIN), side(b, T0));
  assert.equal(merged.activities.monday[0].title, "B-mon", "per-entity stamp should decide monday");
  assert.equal(merged.activities.tuesday[0].title, "A-tue", "tuesday has no stamp — the newer document wins");
});

test("entityMap keeps the same task id on two weekdays apart", () => {
  const s = sched({
    activities: { ...emptyDays(), monday: [task("t1")], tuesday: [task("t1")] },
  });
  const keys = [...entityMap(s).keys()];
  assert.equal(keys.length, 2, "a recurring task collapsed into a single entity");
  assert.deepEqual(keys.sort(), [taskKey("monday", "t1"), taskKey("tuesday", "t1")].sort());
});

test("stamping one weekday of a recurring task leaves the other alone", () => {
  const before = sched({
    activities: { ...emptyDays(), monday: [task("t1", { completed: false })], tuesday: [task("t1", { completed: false })] },
  });
  const after = {
    ...before,
    activities: { ...before.activities, monday: [task("t1", { completed: true })] },
  };
  const stamped = stampSchedule(before, after, T0);
  assert.deepEqual(Object.keys(stamped.syncMeta.updated), [taskKey("monday", "t1")]);
  assert.equal(stamped.syncMeta.deleted?.[taskKey("tuesday", "t1")], undefined);
});

// ── Ritual completions are NOT append-only ──────────────────────────────────
// toggleRitualCompletion, toggleRitualStep, removeRitualLog, undoLastRitualLog
// and clearRitualDay all REMOVE rows. A plain union would re-check every habit
// the user unchecked.

test("an unchecked routine stays unchecked — a union would re-check it", () => {
  const row = { ritualId: "r1", date: "2026-08-20", id: "c1" };
  const key = ritualCompletionKey(row);
  const stillChecked = sched({ rituals: [ritual("r1")], ritualCompletions: [row] });
  const unchecked = sched({
    rituals: [ritual("r1")],
    ritualCompletions: [],
    syncMeta: { deleted: { [key]: sec(T0 + MIN) } },
  });

  const merged = mergeSchedules(side(stillChecked, T0), side(unchecked, T0 + MIN));
  assert.deepEqual(merged.ritualCompletions, []);
  // And the other way round, so the answer doesn't depend on argument order.
  assert.deepEqual(mergeSchedules(side(unchecked, T0 + MIN), side(stillChecked, T0)).ritualCompletions, []);
});

test("legacy sentinel rows without an id still get a stable identity", () => {
  // Rows written before the tracking work are bare {ritualId, date}. Two of
  // them for the same day are the same row, not two rows.
  const legacy = { ritualId: "r1", date: "2026-08-20" };
  const a = sched({ rituals: [ritual("r1")], ritualCompletions: [legacy] });
  const b = sched({ rituals: [ritual("r1")], ritualCompletions: [{ ...legacy }] });
  const merged = checkPair(side(a, T0), side(b, T0 + MIN));
  assert.equal(merged.ritualCompletions.length, 1);
});

test("a checklist step tick and a day sentinel are different rows", () => {
  const a = sched({
    rituals: [ritual("r1", { trackingType: "checklist", steps: [{ id: "s1", label: "A" }] })],
    ritualCompletions: [{ ritualId: "r1", date: "2026-08-20" }],
  });
  const b = sched({
    rituals: [ritual("r1", { trackingType: "checklist", steps: [{ id: "s1", label: "A" }] })],
    ritualCompletions: [{ ritualId: "r1", date: "2026-08-20", stepId: "s1" }],
  });
  const merged = checkPair(side(a, T0), side(b, T0 + MIN));
  assert.equal(merged.ritualCompletions.length, 2);
});

// ── Tombstones ──────────────────────────────────────────────────────────────

test("a delete on one device removes the entity on the other", () => {
  const key = `n|n1`;
  const has = sched({ notes: [note("n1")] });
  const deleted = sched({ notes: [], syncMeta: { deleted: { [key]: sec(T0 + MIN) } } });
  const merged = mergeSchedules(side(has, T0), side(deleted, T0 + MIN));
  assert.deepEqual(merged.notes, []);
});

test("a re-creation beats a stale tombstone", () => {
  const key = `n|n1`;
  const recreated = sched({
    notes: [note("n1", { title: "back" })],
    syncMeta: { updated: { [key]: sec(T0 + 10 * MIN) } },
  });
  const deleted = sched({ notes: [], syncMeta: { deleted: { [key]: sec(T0 + MIN) } } });
  const merged = mergeSchedules(side(recreated, T0), side(deleted, T0 + MIN));
  assert.equal(merged.notes.length, 1);
  assert.equal(merged.notes[0].title, "back");
  // The spent tombstone must not survive to kill it on the next merge.
  assert.equal(merged.syncMeta?.deleted?.[key], undefined);
});

test("a tombstone newer than the surviving edit wins", () => {
  const key = `n|n1`;
  const edited = sched({
    notes: [note("n1", { title: "edited" })],
    syncMeta: { updated: { [key]: sec(T0 + MIN) } },
  });
  const deleted = sched({ notes: [], syncMeta: { deleted: { [key]: sec(T0 + 10 * MIN) } } });
  const merged = mergeSchedules(side(edited, T0), side(deleted, T0));
  assert.deepEqual(merged.notes, []);
  assert.equal(merged.syncMeta.deleted[key], sec(T0 + 10 * MIN));
});

test("an unstamped entity is not deleted by an unrelated device that never had it", () => {
  // No tombstone anywhere: the absence just means the other device is behind.
  const a = sched({ notes: [note("n1")] });
  const b = sched({ notes: [] });
  assert.equal(mergeSchedules(side(a, T0), side(b, T0 + 60 * MIN)).notes.length, 1);
});

// ── Completion history ──────────────────────────────────────────────────────

test("a remote trimmed to 90 days does not shrink the local archive", () => {
  const old = { id: "e1", taskId: "t1", completedAt: "2026-01-01T09:00:00.000Z", completionType: "task" };
  const recent = { id: "e2", taskId: "t1", completedAt: "2026-08-01T09:00:00.000Z", completionType: "task" };
  const full = withDay("monday", [task("t1", { completionHistory: [old, recent] })]);
  const trimmed = withDay("monday", [task("t1", { completionHistory: [recent] })]);

  // The trimmed side is newer and wins the task itself — the history still unions.
  const merged = mergeSchedules(side(full, T0), side(trimmed, T0 + MIN));
  assert.deepEqual(merged.activities.monday[0].completionHistory.map((e) => e.id), ["e1", "e2"]);
});

test("completion events recorded on different devices all survive", () => {
  const a = withDay("monday", [
    task("t1", { completionHistory: [{ id: "e1", taskId: "t1", completedAt: "2026-08-01T09:00:00.000Z", completionType: "task" }] }),
  ]);
  const b = withDay("monday", [
    task("t1", { completionHistory: [{ id: "e2", taskId: "t1", completedAt: "2026-08-02T09:00:00.000Z", completionType: "task" }] }),
  ]);
  const merged = checkPair(side(a, T0), side(b, T0 + MIN));
  assert.deepEqual(merged.activities.monday[0].completionHistory.map((e) => e.id), ["e1", "e2"]);
});

// ── Events and preferences ──────────────────────────────────────────────────

test("the domain event log unions and stays capped", () => {
  const ev = (i, ts) => ({ id: `e${i}`, type: "GOAL_CREATED", entityId: "g1", timestamp: ts });
  const a = sched({ events: Array.from({ length: 200 }, (_, i) => ev(i, `2026-08-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`)) });
  const b = sched({ events: Array.from({ length: 200 }, (_, i) => ev(1000 + i, `2026-08-02T00:00:${String(i % 60).padStart(2, "0")}.000Z`)) });
  const merged = mergeSchedules(side(a, T0), side(b, T0 + MIN));
  assert.equal(merged.events.length, MAX_SCHEDULE_EVENTS);
  // Capped from the front, so the newest survive — same as pushEvent.
  assert.ok(merged.events.at(-1).timestamp.startsWith("2026-08-02"));
});

test("acknowledged misses union rather than one device's list winning", () => {
  const a = sched({ preferences: { acknowledgedMisses: ["t1|2026-08-01"], sleepHours: 7 } });
  const b = sched({ preferences: { acknowledgedMisses: ["t2|2026-08-02"], sleepHours: 8 } });
  const merged = mergeSchedules(side(a, T0), side(b, T0 + MIN));
  assert.deepEqual(merged.preferences.acknowledgedMisses, ["t1|2026-08-01", "t2|2026-08-02"]);
  assert.equal(merged.preferences.sleepHours, 8, "the newer document wins ordinary preference fields");
});

test("the rollover watermark only ever moves forward", () => {
  const a = sched({ preferences: { lastRolloverISO: "2026-08-20" } });
  const b = sched({ preferences: { lastRolloverISO: "2026-08-18" } });
  // Even when the device with the OLDER watermark wrote more recently.
  assert.equal(mergeSchedules(side(a, T0), side(b, T0 + MIN)).preferences.lastRolloverISO, "2026-08-20");
});

// ── Legacy data ─────────────────────────────────────────────────────────────

test("with no stamps anywhere the merge degrades to newer-document-wins", () => {
  const a = withDay("monday", [task("t1", { title: "A" })]);
  const b = withDay("monday", [task("t1", { title: "B" })]);
  assert.equal(mergeSchedules(side(a, T0), side(b, T0 + MIN)).activities.monday[0].title, "B");
  assert.equal(mergeSchedules(side(a, T0 + MIN), side(b, T0)).activities.monday[0].title, "A");
});

test("all-legacy inputs still converge on the same answer from both sides", () => {
  const a = withDay("monday", [task("t1"), task("t3")], { notes: [note("n1")] });
  const b = withDay("monday", [task("t2"), task("t1")], { notes: [note("n2")] });
  checkPair(side(a, T0), side(b, T0 + MIN));
});

test("identical document clocks still converge", () => {
  // No timestamp can break the tie, so ordering has to come from the content.
  const a = withDay("monday", [task("t1"), task("t2")]);
  const b = withDay("monday", [task("t3")]);
  checkPair(side(a, T0), side(b, T0));
});

// ── Stamping ────────────────────────────────────────────────────────────────

test("stamping records only the entity that actually changed", () => {
  const before = withDay("monday", [task("t1"), task("t2")]);
  const after = {
    ...before,
    activities: { ...before.activities, monday: [{ ...before.activities.monday[0], title: "edited" }, before.activities.monday[1]] },
  };
  const stamped = stampSchedule(before, after, T0);
  assert.deepEqual(Object.keys(stamped.syncMeta.updated), [taskKey("monday", "t1")]);
});

test("stamping records a removal as a tombstone", () => {
  const before = withDay("monday", [task("t1"), task("t2")]);
  const after = { ...before, activities: { ...before.activities, monday: [before.activities.monday[0]] } };
  const stamped = stampSchedule(before, after, T0);
  assert.equal(stamped.syncMeta.deleted[taskKey("monday", "t2")], sec(T0));
});

test("stamping an unchanged schedule returns it untouched", () => {
  // React's bail-out and the write effect both depend on this identity.
  const s = withDay("monday", [task("t1")]);
  const copy = { ...s };
  assert.equal(stampSchedule(s, copy, T0), copy);
});

test("re-creating an entity clears its tombstone", () => {
  const gone = sched({ notes: [], syncMeta: { deleted: { "n|n1": sec(T0) } } });
  const back = { ...gone, notes: [note("n1")] };
  const stamped = stampSchedule(gone, back, T0 + MIN);
  assert.equal(stamped.syncMeta.deleted?.["n|n1"], undefined);
  assert.equal(stamped.syncMeta.updated["n|n1"], sec(T0 + MIN));
});

test("a whole-schedule replacement is expressed as deletions", () => {
  // clearData/restoreData depend on this: without tombstones the other device
  // simply refills everything on the next merge.
  const before = withDay("monday", [task("t1")], { notes: [note("n1")], rituals: [ritual("r1")] });
  const stamped = stampSchedule(before, sched(), T0);
  assert.deepEqual(
    Object.keys(stamped.syncMeta.deleted).sort(),
    [taskKey("monday", "t1"), "n|n1", "r|r1"].sort(),
  );
});

test("undo re-stamps forward, so an undone delete is not re-deleted", () => {
  const withNote = sched({ notes: [note("n1")] });
  const afterDelete = stampSchedule(withNote, { ...withNote, notes: [] }, T0);
  // Undo restores the OLD snapshot, whose own map knows nothing of the delete.
  const undone = stampSchedule(afterDelete, withNote, T0 + MIN);
  assert.equal(undone.syncMeta.deleted?.["n|n1"], undefined);

  const other = sched({ notes: [], syncMeta: { deleted: { "n|n1": sec(T0) } } });
  assert.equal(mergeSchedules(side(undone, T0 + MIN), side(other, T0)).notes.length, 1);
});

// ── Housekeeping ────────────────────────────────────────────────────────────

test("normalizeSyncMeta drops stamps for entities that no longer exist", () => {
  const meta = normalizeSyncMeta({ updated: { "n|gone": sec(T0), "n|here": sec(T0) } }, new Set(["n|here"]), T0);
  assert.deepEqual(Object.keys(meta.updated), ["n|here"]);
});

test("normalizeSyncMeta expires tombstones past the 90-day horizon", () => {
  const ancient = T0 - 91 * 24 * 60 * 60 * 1000;
  const meta = normalizeSyncMeta(
    { deleted: { "n|old": sec(ancient), "n|recent": sec(T0 - 60_000) } },
    new Set(),
    T0,
  );
  assert.deepEqual(Object.keys(meta.deleted), ["n|recent"]);
});

test("normalizeSyncMeta drops a tombstone for something that exists again", () => {
  assert.equal(normalizeSyncMeta({ deleted: { "n|n1": sec(T0) } }, new Set(["n|n1"]), T0), undefined);
});

test("normalizeSyncMeta rejects garbage rather than passing it to the merge", () => {
  assert.equal(normalizeSyncMeta({ updated: "nope" }, new Set(), T0), undefined);
  assert.equal(normalizeSyncMeta(null, new Set(), T0), undefined);
  const meta = normalizeSyncMeta({ updated: { "n|a": "soon", "n|b": sec(T0) } }, new Set(["n|a", "n|b"]), T0);
  assert.deepEqual(Object.keys(meta.updated), ["n|b"]);
});

// ── Round trip ──────────────────────────────────────────────────────────────

test("a merged schedule survives serialization and validation intact", () => {
  const key = taskKey("monday", "t1");
  const a = withDay("monday", [task("t1")], {
    notes: [note("n1")],
    syncMeta: { updated: { [key]: sec(T0) }, deleted: { "n|gone": sec(T0) } },
  });
  const b = withDay("tuesday", [task("t2")]);
  const merged = mergeSchedules(side(a, T0), side(b, T0 + MIN));

  const roundTripped = JSON.parse(JSON.stringify(merged));
  const result = validateSchedule(roundTripped);
  assert.ok(result.success, "merged schedule failed validation after a JSON round trip");
  assert.deepEqual(result.data.syncMeta, merged.syncMeta, "syncMeta was dropped in transit");
});

// ── The unguarded seam ──────────────────────────────────────────────────────
// `syncMeta` is a top-level Schedule field. Zod's .passthrough() carries it,
// but `migrate()` rebuilds the schedule from explicit object literals, so a
// field missing from ANY of them is silently dropped on every single load —
// which for this field means every tombstone disappears and deleted entities
// come back. Nothing else in the codebase catches that, hence this source
// check: cheap, and it fails loudly the moment a fourth branch is added.

test("every migrate() return literal carries syncMeta forward", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/useScheduleDB.ts", import.meta.url), "utf8");

  const start = source.indexOf("function migrate(raw: unknown): Schedule {");
  assert.ok(start > -1, "migrate() was renamed — update this guard");
  const rest = source.slice(start + 10);
  const nextTopLevel = rest.search(/\n(?:function|const|export) /);
  const body = rest.slice(0, nextTopLevel === -1 ? undefined : nextTopLevel);

  const returns = body.split("return {").length - 1;
  const carried = body.split("syncMeta:").length - 1;
  assert.equal(
    carried,
    returns,
    `migrate() has ${returns} return literal(s) but only ${carried} carry syncMeta — ` +
      "the ones that don't will silently drop every tombstone on load",
  );
});

// ── Transport artefacts must never win ──────────────────────────────────────
// capPayloadSize blanks note bodies to fit Firestore's document limit. That
// blanking is transport, not an edit — cloudSync backdates those notes to the
// epoch so this merge can never let one erase a body that is still intact.

test("a body blanked for transport loses to a device that still has it", () => {
  const full = sched({ notes: [note("n1", { body: "the whole thing" })] });
  const blanked = sched({
    notes: [note("n1", { body: "" })],
    syncMeta: { updated: { "n|n1": 0 } },
  });
  // Even though the blanked copy arrives in the newer document.
  const merged = mergeSchedules(side(full, T0), side(blanked, T0 + 60 * MIN));
  assert.equal(merged.notes[0].body, "the whole thing");
});

test("a blanked note still reaches a device that has never seen it", () => {
  const blanked = sched({
    notes: [note("n1", { body: "" })],
    syncMeta: { updated: { "n|n1": 0 } },
  });
  const merged = mergeSchedules(side(sched(), T0), side(blanked, T0 + MIN));
  assert.equal(merged.notes.length, 1, "the note itself must still sync, body or not");
});
