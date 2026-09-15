/**
 * Coverage for lib/goalConnections.ts — typed relationships between goals, and
 * the consequences that stop them being decorative.
 *
 * The properties that matter: a directional connection reads as the opposite
 * thing from each end, duplicates and self-links can't be created, deleting a
 * goal takes its connections with it, and an impact appears only when the
 * relationship currently says something.
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
        return resolveWithTsFallback(url, context, nextResolve);
      }
      throw error;
    }
  },
});

const {
  connectGoals,
  disconnectGoals,
  removeConnectionsForGoal,
  connectionsForGoal,
  deriveConnectionImpacts,
  weeklyLoadMinutes,
  isMutualType,
  perspectiveLabel,
} = await import("@/lib/goalConnections.ts");
const { deleteGoal } = await import("@/lib/goalMutations.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-15T18:00:00");

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function goal(id, overrides = {}) {
  return {
    id,
    title: `Goal ${id}`,
    status: "active",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function plan(id, goalId, overrides = {}) {
  return { id, title: `Plan ${id}`, category: "fitness", emoji: "🏃", color: "emerald", items: [], goalId, ...overrides };
}

function milestone(id, planId, overrides = {}) {
  return {
    id,
    planId,
    title: `Milestone ${id}`,
    startDate: "2026-08-01",
    plannedDurationDays: 20,
    plannedEndDate: "2026-08-20",
    status: "active",
    linkedActivities: [],
    linkedTrackers: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

function task(id, planId, startTime, endTime) {
  return { id, title: `Task ${id}`, startTime, endTime, planId, completionHistory: [] };
}

function schedule(overrides = {}) {
  return {
    goals: [goal("a"), goal("b")],
    goalConnections: [],
    plans: [],
    categories: [],
    activities: emptyActivities(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
    ...overrides,
  };
}

/** A goal whose single milestone is unambiguously delayed. */
function delayedGoalSetup(goalId, planId, taskId) {
  return {
    plans: [plan(planId, goalId)],
    milestones: [milestone(`m-${planId}`, planId, { linkedActivities: [taskId] })],
    activities: Object.fromEntries(
      ALL_DAYS.map((d) => [d, [task(taskId, planId, "7:00 AM", "8:00 AM")]]),
    ),
  };
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

test("only conflicts_with and shares_resource are mutual", () => {
  assert.equal(isMutualType("conflicts_with"), true);
  assert.equal(isMutualType("shares_resource"), true);
  assert.equal(isMutualType("supports"), false);
  assert.equal(isMutualType("depends_on"), false);
});

// ── Creating and removing ────────────────────────────────────────────────────

test("a goal cannot be connected to itself", () => {
  const before = schedule();
  assert.equal(connectGoals(before, "a", "a", "supports"), before);
});

test("a connection to a goal that doesn't exist is refused", () => {
  const before = schedule();
  assert.equal(connectGoals(before, "a", "ghost", "supports"), before);
});

test("the same directional connection is not recorded twice", () => {
  const once = connectGoals(schedule(), "a", "b", "depends_on");
  assert.equal(once.goalConnections.length, 1);
  assert.equal(connectGoals(once, "a", "b", "depends_on"), once);
});

test("a mutual connection recorded from the other side is the same statement", () => {
  const once = connectGoals(schedule(), "a", "b", "conflicts_with");
  assert.equal(connectGoals(once, "b", "a", "conflicts_with"), once);
});

test("a directional connection IS allowed in both directions — they mean different things", () => {
  const once = connectGoals(schedule(), "a", "b", "depends_on");
  const twice = connectGoals(once, "b", "a", "depends_on");
  assert.equal(twice.goalConnections.length, 2);
});

test("different types between the same pair coexist", () => {
  let s = connectGoals(schedule(), "a", "b", "supports");
  s = connectGoals(s, "a", "b", "conflicts_with");
  assert.equal(s.goalConnections.length, 2);
});

test("disconnecting removes exactly one row, and an unknown id is a no-op", () => {
  const s = connectGoals(schedule(), "a", "b", "supports");
  const id = s.goalConnections[0].id;
  assert.equal(disconnectGoals(s, id).goalConnections.length, 0);
  assert.equal(disconnectGoals(s, "nope"), s);
});

test("deleting a goal takes its connections with it", () => {
  const s = connectGoals(schedule({ goals: [goal("a"), goal("b"), goal("c")] }), "a", "b", "supports");
  const after = deleteGoal(s, "b");
  assert.equal(after.goalConnections.length, 0);
  assert.equal(after.goals.length, 2);
});

test("removeConnectionsForGoal is a no-op when nothing touches the goal", () => {
  const s = connectGoals(schedule({ goals: [goal("a"), goal("b"), goal("c")] }), "a", "b", "supports");
  assert.equal(removeConnectionsForGoal(s, "c"), s);
});

// ── Perspective ──────────────────────────────────────────────────────────────

test("a directional connection reads as the opposite thing from each end", () => {
  const s = connectGoals(schedule(), "a", "b", "depends_on");
  assert.equal(connectionsForGoal(s, "a")[0].perspective, "depends_on");
  assert.equal(connectionsForGoal(s, "b")[0].perspective, "blocks");

  const sup = connectGoals(schedule(), "a", "b", "supports");
  assert.equal(connectionsForGoal(sup, "a")[0].perspective, "supports");
  assert.equal(connectionsForGoal(sup, "b")[0].perspective, "supported_by");
});

test("a mutual connection reads the same from both ends", () => {
  const s = connectGoals(schedule(), "a", "b", "conflicts_with");
  assert.equal(connectionsForGoal(s, "a")[0].perspective, "conflicts_with");
  assert.equal(connectionsForGoal(s, "b")[0].perspective, "conflicts_with");
});

test("each end resolves to the OTHER goal", () => {
  const s = connectGoals(schedule(), "a", "b", "supports");
  assert.equal(connectionsForGoal(s, "a")[0].other.id, "b");
  assert.equal(connectionsForGoal(s, "b")[0].other.id, "a");
});

test("every perspective has a label", () => {
  for (const p of ["supports", "supported_by", "depends_on", "blocks", "conflicts_with", "shares_resource"]) {
    assert.ok(perspectiveLabel(p).length > 0, p);
  }
});

// ── Impact: depends_on ───────────────────────────────────────────────────────

test("depending on a delayed goal blocks this one", () => {
  const setup = delayedGoalSetup("b", "pb", "tb");
  const s = connectGoals(schedule({ ...setup }), "a", "b", "depends_on");
  const impacts = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].severity, "warning");
  assert.match(impacts[0].message, /depends on it/i);
});

test("depending on a healthy goal says nothing", () => {
  const s = connectGoals(
    schedule({
      plans: [plan("pb", "b")],
      milestones: [milestone("mb", "pb", { status: "completed", actualCompletedDate: "2026-08-10" })],
    }),
    "a", "b", "depends_on",
  );
  assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), []);
});

test("depending on a PAUSED goal is called out by name", () => {
  const s = connectGoals(schedule({ goals: [goal("a"), goal("b", { status: "paused" })] }), "a", "b", "depends_on");
  const impacts = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(impacts.length, 1);
  assert.match(impacts[0].message, /is paused/i);
});

test("the blocking side is only surfaced when THIS goal is the problem", () => {
  // b depends on a. a is delayed → a should be told it is holding b up.
  const setup = delayedGoalSetup("a", "pa", "ta");
  const s = connectGoals(schedule({ ...setup }), "b", "a", "depends_on");
  const fromA = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(fromA.length, 1);
  assert.equal(fromA[0].perspective, "blocks");
  assert.match(fromA[0].message, /waiting on this goal/i);
});

test("a healthy goal is not told it is blocking anything", () => {
  const s = connectGoals(
    schedule({
      plans: [plan("pa", "a")],
      milestones: [milestone("ma", "pa", { status: "completed", actualCompletedDate: "2026-08-10" })],
    }),
    "b", "a", "depends_on",
  );
  assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), []);
});

// ── Impact: supports ─────────────────────────────────────────────────────────

test("a slipping supporter is reported to the goal it was supporting", () => {
  const setup = delayedGoalSetup("b", "pb", "tb");
  const s = connectGoals(schedule({ ...setup }), "b", "a", "supports");
  const impacts = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].perspective, "supported_by");
  assert.equal(impacts[0].severity, "info");
});

test("supporting another goal is never a warning about this one", () => {
  const setup = delayedGoalSetup("a", "pa", "ta");
  const s = connectGoals(schedule({ ...setup }), "a", "b", "supports");
  assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), []);
});

// ── Impact: conflicts / shared resources ─────────────────────────────────────

test("weeklyLoadMinutes sums tracked work across a normal week", () => {
  const s = schedule({
    plans: [plan("pa", "a")],
    activities: Object.fromEntries(ALL_DAYS.map((d) => [d, [task("ta", "pa", "7:00 AM", "8:00 AM")]])),
  });
  assert.equal(weeklyLoadMinutes(s, "a"), 7 * 60);
});

test("a paused plan contributes no weekly load", () => {
  const s = schedule({
    plans: [plan("pa", "a", { status: "paused" })],
    activities: Object.fromEntries(ALL_DAYS.map((d) => [d, [task("ta", "pa", "7:00 AM", "8:00 AM")]])),
  });
  assert.equal(weeklyLoadMinutes(s, "a"), 0);
});

test("a conflict reports the real combined weekly load", () => {
  const s = connectGoals(
    schedule({
      plans: [plan("pa", "a"), plan("pb", "b")],
      activities: Object.fromEntries(
        ALL_DAYS.map((d) => [d, [task("ta", "pa", "7:00 AM", "8:00 AM"), task("tb", "pb", "6:00 PM", "7:00 PM")]]),
      ),
    }),
    "a", "b", "conflicts_with",
  );
  const impacts = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(impacts.length, 1);
  assert.match(impacts[0].message, /14h a week/);
  assert.match(impacts[0].message, /7h here/);
  assert.match(impacts[0].message, /7h there/);
});

test("no conflict is reported when one side schedules nothing", () => {
  const s = connectGoals(
    schedule({
      plans: [plan("pa", "a")],
      activities: Object.fromEntries(ALL_DAYS.map((d) => [d, [task("ta", "pa", "7:00 AM", "8:00 AM")]])),
    }),
    "a", "b", "conflicts_with",
  );
  assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), []);
});

// ── Impact: scoping ──────────────────────────────────────────────────────────

test("a completed or archived counterpart is history, not a live constraint", () => {
  for (const status of ["completed", "archived"]) {
    const setup = delayedGoalSetup("b", "pb", "tb");
    const s = connectGoals(
      schedule({ ...setup, goals: [goal("a"), goal("b", { status })] }),
      "a", "b", "depends_on",
    );
    assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), [], status);
  }
});

test("a non-active goal is not given impacts of its own", () => {
  const setup = delayedGoalSetup("b", "pb", "tb");
  const s = connectGoals(
    schedule({ ...setup, goals: [goal("a", { status: "archived" }), goal("b")] }),
    "a", "b", "depends_on",
  );
  assert.deepEqual(deriveConnectionImpacts(s, "a", NOW), []);
});

test("warnings sort ahead of information", () => {
  const setup = delayedGoalSetup("b", "pb", "tb");
  let s = schedule({
    ...setup,
    goals: [goal("a"), goal("b"), goal("c")],
    plans: [...setup.plans, plan("pa", "a"), plan("pc", "c")],
    activities: Object.fromEntries(
      ALL_DAYS.map((d) => [d, [
        task("tb", "pb", "7:00 AM", "8:00 AM"),
        task("ta", "pa", "9:00 AM", "10:00 AM"),
        task("tc", "pc", "6:00 PM", "7:00 PM"),
      ]]),
    ),
  });
  s = connectGoals(s, "a", "c", "conflicts_with"); // info
  s = connectGoals(s, "a", "b", "depends_on");     // warning
  const impacts = deriveConnectionImpacts(s, "a", NOW);
  assert.equal(impacts.length, 2);
  assert.equal(impacts[0].severity, "warning");
  assert.equal(impacts[1].severity, "info");
});
