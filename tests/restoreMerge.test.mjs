/**
 * Restore-by-merge: a backup adds back what is missing and never deletes.
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

const { restoreMissing, restoredCount } = await import("@/lib/restoreMerge.ts");
const { stampSchedule, taskKey } = await import("@/lib/stampSchedule.ts");
const { mergeSchedules } = await import("@/lib/mergeSchedule.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");

const T0 = Date.UTC(2026, 7, 20, 9, 0, 0);
const MIN = 60_000;
const sec = (ms) => Math.floor(ms / 1000);

function emptyDays() {
  return Object.fromEntries(DAYS.map((d) => [d, []]));
}

function sched(over = {}) {
  return {
    goals: [], plans: [], categories: [], activities: emptyDays(), progressTrackers: [],
    metricEntries: [], milestones: [], rituals: [], ritualCompletions: [], notes: [],
    events: [], preferences: {}, ...over,
  };
}

const task = (id, over = {}) => ({ id, title: id, startTime: "09:00 AM", endTime: "10:00 AM", planId: "p1", ...over });
const note = (id, over = {}) => ({ id, title: id, body: "", createdAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString(), ...over });
const done = (id, at) => ({ id, completedAt: new Date(at).toISOString() });
const withDay = (day, tasks, over = {}) => sched({ activities: { ...emptyDays(), [day]: tasks }, ...over });

test("keeps everything current and adds back what only the backup has", () => {
  const current = withDay("monday", [task("new")], { notes: [note("n-new")] });
  const backup = withDay("monday", [task("old")], { notes: [note("n-old")] });
  const out = restoreMissing(current, backup);
  assert.deepEqual(out.activities.monday.map((t) => t.id), ["new", "old"]);
  assert.deepEqual(out.notes.map((n) => n.id), ["n-new", "n-old"]);
  assert.equal(restoredCount(current, out), 2);
});

test("the current copy wins where both have an entity", () => {
  const current = sched({ notes: [note("n1", { title: "edited today" })] });
  const backup = sched({ notes: [note("n1", { title: "last month" })] });
  const out = restoreMissing(current, backup);
  assert.equal(out, current, "nothing to add returns the same object");
  assert.equal(out.notes[0].title, "edited today");
});

test("a task's completion history is a union, so old history comes back", () => {
  const current = withDay("monday", [task("t1", { completionHistory: [done("e2", T0)] })]);
  const backup = withDay("monday", [task("t1", { completionHistory: [done("e1", T0 - 200 * 24 * 60 * MIN)] })]);
  const out = restoreMissing(current, backup);
  assert.deepEqual(out.activities.monday[0].completionHistory.map((e) => e.id).sort(), ["e1", "e2"]);
  assert.equal(restoredCount(current, out), 0, "history is not a new entity");
});

test("brings back entities a bad sync tombstoned, and clears the tombstones", () => {
  const current = sched({ notes: [], syncMeta: { deleted: { "n|lost": sec(T0) } } });
  const backup = sched({ notes: [note("lost")] });
  const stamped = stampSchedule(current, restoreMissing(current, backup), T0 + MIN);
  assert.equal(stamped.notes.length, 1);
  assert.equal(stamped.syncMeta.deleted?.["n|lost"], undefined);
  // And the other device, still holding the tombstone, takes it back too.
  const other = { schedule: current, lastUpdated: T0 };
  assert.equal(mergeSchedules({ schedule: stamped, lastUpdated: T0 + MIN }, other).notes.length, 1);
});

test("never tombstones anything, unlike a replace", () => {
  const current = withDay("tuesday", [task("since-backup")]);
  const backup = sched();
  const merged = stampSchedule(current, restoreMissing(current, backup), T0);
  assert.equal(merged.syncMeta?.deleted?.[taskKey("tuesday", "since-backup")], undefined);
  const replaced = stampSchedule(current, backup, T0);
  assert.ok(replaced.syncMeta.deleted[taskKey("tuesday", "since-backup")], "replace still expresses removals");
});

test("ritual completions without ids dedupe by ritual, date and step", () => {
  const c = { ritualId: "r1", date: "2026-08-01" };
  const current = sched({ ritualCompletions: [c] });
  const backup = sched({ ritualCompletions: [{ ...c }, { ritualId: "r1", date: "2026-07-31" }] });
  assert.equal(restoreMissing(current, backup).ritualCompletions.length, 2);
});
