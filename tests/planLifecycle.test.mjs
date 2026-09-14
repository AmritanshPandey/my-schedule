/**
 * Coverage for Plan lifecycle status (`Plan.status`) and the rule that gives
 * pausing its meaning: a paused plan's work stops being expected.
 *
 * The behaviours pinned here are the ones that would make pausing cosmetic if
 * they regressed — a paused plan must not accrue misses, must not appear in
 * Today, must not nag from Needs Attention, and must not drag its goal's
 * health down. Pausing has to be a way *out* of a failing streak, not a quiet
 * way to keep failing.
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

const { pausePlan, resumePlan, completePlan, togglePlanPaused, planLifecycleLabel, isPlanRunning } =
  await import("@/lib/planLifecycle.ts");

const { selectTodayTasks } = await import("@/lib/todayTasks.ts");
const { selectNeedsAttention } = await import("@/lib/needsAttention.ts");
const { calculateGoalProgress } = await import("@/lib/goalProgress.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Training Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function task(overrides = {}) {
  return {
    id: "t1",
    title: "Easy run",
    startTime: "8:00 AM",
    endTime: "9:00 AM",
    planId: "p1",
    completionHistory: [],
    ...overrides,
  };
}

function milestone(overrides = {}) {
  return {
    id: "m1",
    planId: "p1",
    title: "Run 10k",
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

function schedule(overrides = {}) {
  return {
    goals: [],
    plans: [plan()],
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

// ── The predicate ────────────────────────────────────────────────────────────

test("a plan with no status is running — no stored plan needs migrating", () => {
  assert.equal(isPlanRunning(plan()), true);
  assert.equal(isPlanRunning(undefined), true);
  assert.equal(isPlanRunning(plan({ status: "active" })), true);
  assert.equal(isPlanRunning(plan({ status: "paused" })), false);
  assert.equal(isPlanRunning(plan({ status: "completed" })), false);
});

// ── Mutations ────────────────────────────────────────────────────────────────

test("pause / resume / complete set exactly one field and nothing else", () => {
  const before = schedule();
  const paused = pausePlan(before, "p1");
  assert.equal(paused.plans[0].status, "paused");
  assert.equal(paused.plans[0].title, before.plans[0].title);
  assert.equal(resumePlan(paused, "p1").plans[0].status, "active");
  assert.equal(completePlan(before, "p1").plans[0].status, "completed");
});

test("mutating an unknown plan, or a no-op transition, returns the same schedule", () => {
  const before = schedule();
  assert.equal(pausePlan(before, "nope"), before);
  assert.equal(resumePlan(before, "p1"), before); // already active
});

test("toggle flips between paused and active", () => {
  const once = togglePlanPaused(schedule(), "p1");
  assert.equal(once.plans[0].status, "paused");
  assert.equal(togglePlanPaused(once, "p1").plans[0].status, "active");
});

test("planStatusLabel reads for humans", () => {
  assert.equal(planLifecycleLabel(plan()), "Active");
  assert.equal(planLifecycleLabel(plan({ status: "paused" })), "Paused");
  assert.equal(planLifecycleLabel(plan({ status: "completed" })), "Completed");
});

// ── Today ────────────────────────────────────────────────────────────────────

test("a paused plan's tasks drop out of Today", () => {
  const activities = { ...emptyActivities(), monday: [task()] };

  const running = selectTodayTasks(schedule({ activities }), "2026-08-10", "monday");
  assert.equal(running.total, 1);

  const held = selectTodayTasks(
    schedule({ activities, plans: [plan({ status: "paused" })] }),
    "2026-08-10",
    "monday",
  );
  assert.equal(held.total, 0);
  assert.equal(held.done, 0);
});

test("a task with no plan is unaffected by any plan being paused", () => {
  const activities = { ...emptyActivities(), monday: [task({ id: "loose", planId: "" })] };
  const held = selectTodayTasks(
    schedule({ activities, plans: [plan({ status: "paused" })] }),
    "2026-08-10",
    "monday",
  );
  assert.equal(held.total, 1);
});

// ── Needs attention ──────────────────────────────────────────────────────────

test("a paused plan's overdue milestone stops nagging", () => {
  const withMilestone = (status) =>
    selectNeedsAttention(
      schedule({ plans: [plan({ status })], milestones: [milestone()] }),
      "2026-09-14",
    );

  assert.equal(withMilestone("active").overdueMilestones.length, 1);
  assert.equal(withMilestone("paused").overdueMilestones.length, 0);
});

test("a paused plan's missed tasks stop being listed", () => {
  const missedEvent = {
    id: "e1",
    taskId: "t1",
    completedAt: new Date("2026-09-12T12:00:00").toISOString(),
    completionType: "missed",
  };
  const activities = { ...emptyActivities(), saturday: [task({ completionHistory: [missedEvent] })] };

  const running = selectNeedsAttention(schedule({ activities }), "2026-09-14");
  assert.equal(running.missedTasks.length, 1);

  const held = selectNeedsAttention(
    schedule({ activities, plans: [plan({ status: "paused" })] }),
    "2026-09-14",
  );
  assert.equal(held.missedTasks.length, 0);
});

// ── Goal rollup ──────────────────────────────────────────────────────────────

function goal(overrides = {}) {
  return {
    id: "g1",
    title: "Run a half marathon",
    status: "active",
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

test("a paused plan's delayed milestone does not drag the goal down", () => {
  // The milestone needs a linked task to read "delayed" at all: with nothing
  // linked, `calculateMilestoneHealth` returns "getting_started" by design —
  // an empty milestone is a setup gap, not a failure.
  const activities = { ...emptyActivities(), monday: [task()] };
  const overdue = milestone({ linkedActivities: ["t1"] }); // plannedEndDate 2026-08-20
  const NOW = new Date("2026-09-14T18:00:00");

  const running = calculateGoalProgress(
    schedule({ activities, plans: [plan({ goalId: "g1" })], milestones: [overdue] }),
    goal(),
    NOW,
  );
  assert.equal(running.health, "delayed");

  const held = calculateGoalProgress(
    schedule({ activities, plans: [plan({ goalId: "g1", status: "paused" })], milestones: [overdue] }),
    goal(),
    NOW,
  );
  assert.notEqual(held.health, "delayed");
  assert.equal(held.milestoneTotal, 0);
});

test("an all-paused goal says so instead of claiming it has no milestones", () => {
  const held = calculateGoalProgress(
    schedule({ plans: [plan({ goalId: "g1", status: "paused" })], milestones: [milestone()] }),
    goal(),
    new Date("2026-09-14T18:00:00"),
  );
  assert.equal(held.planCount, 1);
  assert.equal(held.pausedPlanCount, 1);
  assert.match(held.statusMessage, /only plan is paused/i);
  assert.ok(!/no milestones yet/i.test(held.statusMessage));
});

test("planCount stays honest while paused plans leave the rollup", () => {
  const mixed = calculateGoalProgress(
    schedule({
      plans: [plan({ id: "p1", goalId: "g1" }), plan({ id: "p2", goalId: "g1", status: "paused" })],
      milestones: [milestone({ id: "m1", planId: "p1" }), milestone({ id: "m2", planId: "p2" })],
    }),
    goal(),
    new Date("2026-09-14T18:00:00"),
  );
  assert.equal(mixed.planCount, 2);
  assert.equal(mixed.pausedPlanCount, 1);
  assert.equal(mixed.milestoneTotal, 1); // only p1's
});
