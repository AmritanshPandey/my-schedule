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

const mod = await import("@/packages/core/lib/milestoneAutoLinks.ts");
const { autoTaskIds, autoTrackerIds, withAutoLinks } = mod;
const { calculateMilestoneState } = await import("@/packages/core/lib/milestoneHealth.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────
// September 2026: the 1st is a Tuesday.

function milestone(overrides = {}) {
  return {
    id: "m1", planId: "p1", title: "M", startDate: "2026-09-01", plannedDurationDays: 30,
    plannedEndDate: "2026-09-30", status: "active", linkedActivities: [], linkedTrackers: [],
    linkedRituals: [], createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
    sortOrder: 0, ...overrides,
  };
}
function task(id, overrides = {}) {
  return { id, planId: "p1", title: id, start: "07:00", end: "08:00", completionHistory: [], ...overrides };
}
const plan = { id: "p1", title: "P", category: "fitness", emoji: "🎯", color: "emerald", items: [] };
const tracker = (id, planId = "p1") => ({ id, planId, title: id, type: "number", unit: "kg", goalDirection: "decrease_good", startingValue: 80, goalValue: 72 });

const activities = {
  monday: [task("run"), task("other-plan", { planId: "p2" })],
  tuesday: [task("commit", { taskType: "commitment" })],
  wednesday: [task("lift"), task("ended", { activeUntil: "2026-08-20" })],
  thursday: [task("one-off-in", { recurrence: { type: "once", dateISO: "2026-09-10" } }), task("one-off-out", { recurrence: { type: "once", dateISO: "2026-10-08" } })],
  friday: [task("run")], // a second weekday copy of the same task
};

// ── Tasks ────────────────────────────────────────────────────────────────────

test("an unlinked milestone counts its plan's tracked tasks due in its window", () => {
  assert.deepEqual(autoTaskIds(milestone(), activities).sort(), ["lift", "one-off-in", "run"]);
});

test("other plans, commitments, ended tasks and one-offs outside the window are left out", () => {
  const ids = autoTaskIds(milestone(), activities);
  for (const id of ["other-plan", "commit", "ended", "one-off-out"]) assert.ok(!ids.includes(id), id);
});

test("a one-off only counts toward the milestone whose dates hold it", () => {
  const october = milestone({ id: "m2", startDate: "2026-10-01", plannedEndDate: "2026-10-31" });
  assert.ok(autoTaskIds(october, activities).includes("one-off-out"));
  assert.ok(!autoTaskIds(october, activities).includes("one-off-in"));
});

test("stored task links are ignored: the plan's own tasks always count", () => {
  const m = withAutoLinks(milestone({ linkedActivities: ["lift"] }), activities);
  assert.deepEqual([...m.linkedActivities].sort(), ["lift", "one-off-in", "run"]);
});

// ── Tracker ──────────────────────────────────────────────────────────────────

test("a plan with exactly one tracker lends it to unlinked milestones", () => {
  assert.deepEqual(autoTrackerIds(milestone(), [tracker("w"), tracker("x", "p2")]), ["w"]);
});

test("with several trackers the choice stays the person's", () => {
  assert.deepEqual(autoTrackerIds(milestone(), [tracker("w"), tracker("z")]), []);
});

test("trackers with a target count; a bare hand link doesn't", () => {
  const withTarget = withAutoLinks(milestone({ trackerTargets: { z: 70 } }), activities, [tracker("w"), tracker("z")]);
  assert.deepEqual(withTarget.linkedTrackers, ["z"]);
  assert.equal(withTarget.targetValue, 70);
  const bare = withAutoLinks(milestone({ linkedTrackers: ["z"] }), activities, [tracker("w"), tracker("z")]);
  assert.deepEqual(bare.linkedTrackers, []);
});

test("the legacy single targetValue reads as a target on its tracker", () => {
  const m = withAutoLinks(milestone({ linkedTrackers: ["z"], targetValue: 75 }), activities, [tracker("w"), tracker("z")]);
  assert.deepEqual(m.linkedTrackers, ["z"]);
  assert.deepEqual(m.trackerTargets, { z: 75 });
});

test("several targets: every tracker counts, the first is primary", () => {
  const m = withAutoLinks(milestone({ trackerTargets: { w: 74, z: 10 } }), activities, [tracker("w"), tracker("z")]);
  assert.deepEqual(m.linkedTrackers, ["w", "z"]);
  assert.equal(m.targetValue, 74);
});

// ── Progress actually reads it ───────────────────────────────────────────────

test("an unlinked milestone now has data, and says its links are automatic", () => {
  const done = { id: "e1", completedAt: "2026-09-02T08:00:00", completionType: "task" };
  const acts = { ...activities, wednesday: [task("lift", { completionHistory: [done] })] };
  const state = calculateMilestoneState({
    milestone: milestone(), plan, activities: acts, trackers: [tracker("w")], metricEntries: [], now: new Date("2026-09-15T12:00:00"),
  });
  assert.equal(state.hasData, true);
  assert.deepEqual(state.autoLinked, { tasks: true, tracker: true });
  assert.ok(state.taskProgress !== null);
});
