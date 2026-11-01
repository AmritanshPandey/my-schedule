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
const { autoTaskIds, autoTrackerIds, withAutoLinks, resolveMilestoneLinks, materializeLinks } = mod;
const { linkItem } = await import("@/packages/core/lib/milestoneLinks.ts");
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

test("hand-made task links win over the automatic set", () => {
  const m = milestone({ linkedActivities: ["lift"] });
  assert.equal(withAutoLinks(m, activities), m);
});

// ── Tracker ──────────────────────────────────────────────────────────────────

test("a plan with exactly one tracker lends it to unlinked milestones", () => {
  assert.deepEqual(autoTrackerIds(milestone(), [tracker("w"), tracker("x", "p2")]), ["w"]);
});

test("with several trackers the choice stays the person's", () => {
  assert.deepEqual(autoTrackerIds(milestone(), [tracker("w"), tracker("z")]), []);
});

test("hand-made tracker link wins, and auto tasks still fill alongside it", () => {
  const m = withAutoLinks(milestone({ linkedTrackers: ["z"] }), activities, [tracker("w")]);
  assert.deepEqual(m.linkedTrackers, ["z"]);
  assert.ok(m.linkedActivities.includes("run"));
});

test("nothing to fill returns the same milestone object", () => {
  const empty = milestone({ planId: "nothing" });
  assert.equal(withAutoLinks(empty, activities, [tracker("w")]), empty);
  assert.deepEqual(resolveMilestoneLinks([empty], activities), [empty]);
});

// ── Manual edits start from what was shown ───────────────────────────────────

test("linking one task to an automatic milestone keeps the others it was counting", () => {
  const ms = materializeLinks([milestone()], "m1", "task", activities);
  const next = linkItem(ms, "m1", "task", "other-plan");
  assert.deepEqual(next[0].linkedActivities.sort(), ["lift", "one-off-in", "other-plan", "run"]);
});

test("materializing leaves an already hand-linked milestone alone", () => {
  const ms = [milestone({ linkedActivities: ["lift"] })];
  assert.deepEqual(materializeLinks(ms, "m1", "task", activities), ms);
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

test("a hand-linked milestone reports nothing automatic", () => {
  const state = calculateMilestoneState({
    milestone: milestone({ linkedActivities: ["lift"], linkedTrackers: ["w"] }), plan, activities, trackers: [tracker("w")], metricEntries: [], now: new Date("2026-09-15T12:00:00"),
  });
  assert.deepEqual(state.autoLinked, { tasks: false, tracker: false });
});

test("unlinking the last automatic item switches that kind off instead of refilling it", () => {
  const { setMilestoneLink } = mod;
  const schedule = { milestones: [milestone()], activities, progressTrackers: [tracker("w")] };
  const ms = setMilestoneLink(schedule, "m1", "tracker", "w", false);
  assert.deepEqual(ms[0].linkedTrackers, []);
  assert.equal(ms[0].autoLinkOff.tracker, true);
  assert.deepEqual(withAutoLinks(ms[0], activities, [tracker("w")]).linkedTrackers, []);
});

test("unlinking one of several automatic tasks keeps the rest and stays hand-made", () => {
  const { setMilestoneLink } = mod;
  const ms = setMilestoneLink({ milestones: [milestone()], activities }, "m1", "task", "run", false);
  assert.deepEqual(ms[0].linkedActivities.sort(), ["lift", "one-off-in"]);
  assert.ok(!ms[0].autoLinkOff?.tasks);
});
