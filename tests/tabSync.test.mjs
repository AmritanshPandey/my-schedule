/**
 * Two tabs of ONE browser, sharing one IndexedDB record.
 *
 * The bug these pin: the cloud compare-and-swap protects two *devices*, because
 * each has its own localStorage. Two tabs share it — so Tab A's push advanced
 * the base revision on Tab B's behalf and Tab B's stale tree sailed through the
 * CAS. Worse, `writeDB` was an unconditional `put()`, so the same loss happened
 * on disk with no network involved at all.
 *
 * The fix is a revision check on the local record, and that is what is tested
 * here: correctness must not depend on the cross-tab message arriving.
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

const { resolveLocalWrite } = await import("@/lib/mergeSchedule.ts");
const { stampSchedule, taskKey } = await import("@/lib/stampSchedule.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");

const T0 = Date.UTC(2026, 7, 30, 9, 0, 0);
const MIN = 60_000;

function emptyDays() {
  return Object.fromEntries(DAYS.map((d) => [d, []]));
}
function sched(over = {}) {
  return {
    goals: [], plans: [], categories: [], activities: emptyDays(),
    progressTrackers: [], metricEntries: [], milestones: [], rituals: [],
    ritualCompletions: [], notes: [], events: [], preferences: {}, ...over,
  };
}
function task(id, over = {}) {
  return { id, title: id, startTime: "09:00 AM", endTime: "10:00 AM", planId: "p1", ...over };
}
function withTasks(tasks, over = {}) {
  return sched({ activities: { ...emptyDays(), monday: tasks }, ...over });
}
const ids = (s) => s.activities.monday.map((t) => t.id).sort();

// ── The revision check ──────────────────────────────────────────────────────

test("a tab whose revision matches writes straight through", () => {
  const mine = withTasks([task("a")]);
  const stored = withTasks([task("b")]);
  const out = resolveLocalWrite({
    mine, stored, storedRev: 4, expectedRev: 4, otherLastUpdated: T0, now: T0 + MIN,
  });
  assert.equal(out, mine, "an uncontended write should not pay for a merge");
});

test("a tab whose revision is behind merges instead of clobbering", () => {
  // Tab A wrote task "b" (rev 4 -> 5). Tab B still thinks the record is at 4.
  const mine = withTasks([task("a")]);
  const stored = withTasks([task("b")]);
  const out = resolveLocalWrite({
    mine, stored, storedRev: 5, expectedRev: 4, otherLastUpdated: T0, now: T0 + MIN,
  });
  assert.deepEqual(ids(out), ["a", "b"], "the other tab's task was erased");
});

test("a tab that has never read the record does not write blind", () => {
  // expectedRev undefined is the dangerous case: writing over a record this tab
  // has never seen is exactly the bug.
  const out = resolveLocalWrite({
    mine: withTasks([task("a")]),
    stored: withTasks([task("b")]),
    storedRev: 5, expectedRev: undefined, otherLastUpdated: T0, now: T0 + MIN,
  });
  assert.deepEqual(ids(out), ["a", "b"]);
});

test("nothing on disk yet means nothing to merge", () => {
  const mine = withTasks([task("a")]);
  assert.equal(
    resolveLocalWrite({ mine, stored: null, storedRev: 0, expectedRev: undefined, otherLastUpdated: 0, now: T0 }),
    mine,
  );
});

// ── The interleaving that was losing work ───────────────────────────────────

test("two tabs editing different tasks end with both edits", () => {
  const base = withTasks([task("a", { title: "A" }), task("b", { title: "B" })]);

  // Tab A retitles task a; Tab B retitles task b. Both stamp through setSchedule.
  const tabA = stampSchedule(base, {
    ...base,
    activities: { ...base.activities, monday: [task("a", { title: "A edited" }), base.activities.monday[1]] },
  }, T0 + MIN);
  const tabB = stampSchedule(base, {
    ...base,
    activities: { ...base.activities, monday: [base.activities.monday[0], task("b", { title: "B edited" })] },
  }, T0 + 2 * MIN);

  // A writes first (rev 1). B is still on rev 0, so its write merges.
  const afterB = resolveLocalWrite({
    mine: tabB, stored: tabA, storedRev: 1, expectedRev: 0, otherLastUpdated: T0 + MIN, now: T0 + 2 * MIN,
  });

  const byId = Object.fromEntries(afterB.activities.monday.map((t) => [t.id, t.title]));
  assert.equal(byId.a, "A edited", "the first tab's edit was lost");
  assert.equal(byId.b, "B edited", "the second tab's edit was lost");
});

test("the merge is order-independent — whichever tab writes second, both edits survive", () => {
  const base = withTasks([task("a", { title: "A" }), task("b", { title: "B" })]);
  const tabA = stampSchedule(base, {
    ...base,
    activities: { ...base.activities, monday: [task("a", { title: "A edited" }), base.activities.monday[1]] },
  }, T0 + MIN);
  const tabB = stampSchedule(base, {
    ...base,
    activities: { ...base.activities, monday: [base.activities.monday[0], task("b", { title: "B edited" })] },
  }, T0 + 2 * MIN);

  const aSecond = resolveLocalWrite({
    mine: tabA, stored: tabB, storedRev: 1, expectedRev: 0, otherLastUpdated: T0 + 2 * MIN, now: T0 + MIN,
  });
  const byId = Object.fromEntries(aSecond.activities.monday.map((t) => [t.id, t.title]));
  assert.equal(byId.a, "A edited");
  assert.equal(byId.b, "B edited");
});

// ── Whole-schedule replacement must still replace ───────────────────────────
// clearData / clearProgress / restoreData go through the same write path, so
// the merge must not quietly resurrect what they removed.

test("a clear survives the merge, because it carries tombstones", () => {
  const before = withTasks([task("a"), task("b")]);
  // What clearData does: stamp the emptied schedule so removals become tombstones.
  const cleared = stampSchedule(before, sched(), T0 + MIN);

  const out = resolveLocalWrite({
    mine: cleared, stored: before, storedRev: 5, expectedRev: 4, otherLastUpdated: T0, now: T0 + MIN,
  });
  assert.deepEqual(ids(out), [], "the clear was undone by merging with the pre-clear record");
});

test("an untombstoned removal does NOT delete the other tab's work", () => {
  // The complement of the test above, and the reason clears must stamp: an
  // absence with no tombstone is "I never had it", not "I deleted it".
  const stored = withTasks([task("a"), task("b")]);
  const mine = withTasks([task("a")]); // no syncMeta at all
  const out = resolveLocalWrite({
    mine, stored, storedRev: 5, expectedRev: 4, otherLastUpdated: T0, now: T0 + MIN,
  });
  assert.deepEqual(ids(out), ["a", "b"]);
});

test("a re-creation in one tab beats a stale delete in the other", () => {
  const withA = withTasks([task("a")]);
  const deleted = stampSchedule(withA, withTasks([]), T0 + MIN);
  const recreated = stampSchedule(withTasks([]), withTasks([task("a", { title: "back" })]), T0 + 10 * MIN);

  const out = resolveLocalWrite({
    mine: recreated, stored: deleted, storedRev: 5, expectedRev: 4, otherLastUpdated: T0 + MIN, now: T0 + 10 * MIN,
  });
  assert.deepEqual(ids(out), ["a"]);
  assert.equal(out.activities.monday[0].title, "back");
  assert.equal(out.syncMeta?.deleted?.[taskKey("monday", "a")], undefined, "a spent tombstone must not survive");
});
