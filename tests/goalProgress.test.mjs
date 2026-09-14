/**
 * Coverage for lib/goalProgress.ts — the Goal → Plans → Milestones rollup.
 *
 * The behaviours worth pinning are the ones that would quietly lie to a user:
 * a goal with nothing linked must not read 0% (that is a setup gap, not
 * failure), completing a milestone must never lower the percentage, and one
 * delayed milestone inside several healthy ones must not be averaged away.
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

const { calculateGoalProgress, goalNeedsAttention } = await import("@/lib/goalProgress.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = (dateISO) => new Date(`${dateISO}T18:00:00`);

function goal(overrides = {}) {
  return {
    id: "g1",
    title: "Run a half marathon",
    status: "active",
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    schemaVersion: 1,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return { id: "p1", title: "Training Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function milestone(overrides = {}) {
  return {
    id: "m1",
    planId: "p1",
    title: "Run 10k",
    startDate: "2026-09-01",
    plannedDurationDays: 30,
    plannedEndDate: "2026-09-30",
    status: "active",
    linkedActivities: [],
    linkedTrackers: [],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

function taskEvent(taskId, dateISO) {
  return { id: `${taskId}-${dateISO}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: "task" };
}

function activitiesFor(tasks) {
  const activities = Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
  for (const t of tasks) {
    for (const d of t.days ?? ALL_DAYS) {
      activities[d].push({
        id: t.id,
        title: t.id,
        startTime: "8:00 AM",
        endTime: "9:00 AM",
        planId: t.planId ?? "p1",
        completionHistory: t.events ?? [],
      });
    }
  }
  return activities;
}

function schedule(overrides = {}) {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: activitiesFor([]),
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

// ── Setup gaps are never rendered as failure ─────────────────────────────────

test("a goal with no linked plans reports no_plans, not 0%", () => {
  const state = calculateGoalProgress(schedule(), goal(), NOW("2026-09-10"));
  assert.equal(state.health, "no_plans");
  assert.equal(state.hasData, false);
  assert.equal(state.progress, null);
  assert.equal(state.planCount, 0);
  assert.match(state.statusMessage, /No plans linked yet/i);
});

test("a goal with plans but no milestones names the actual gap", () => {
  const state = calculateGoalProgress(
    schedule({ plans: [plan({ goalId: "g1" })] }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.health, "no_plans");
  assert.equal(state.planCount, 1);
  assert.equal(state.milestoneTotal, 0);
  assert.match(state.statusMessage, /no milestones yet/i);
});

test("plans belonging to another goal are not counted", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ id: "p9", goalId: "other" })],
      milestones: [milestone({ planId: "p9" })],
    }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.planCount, 0);
  assert.equal(state.milestoneTotal, 0);
});

// ── Rollup arithmetic ────────────────────────────────────────────────────────

test("progress is the equal-weight mean of its milestones", () => {
  // t1 fully done (100%), t2 never done (0%) — one milestone each.
  const activities = activitiesFor([
    { id: "t1", events: [taskEvent("t1", "2026-09-02")] },
    { id: "t2", events: [] },
  ]);
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      activities,
      milestones: [
        milestone({ id: "m1", linkedActivities: ["t1"] }),
        milestone({ id: "m2", linkedActivities: ["t2"] }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.milestoneTotal, 2);
  assert.equal(state.progress, 50);
  assert.equal(state.hasData, true);
});

test("a completed milestone counts as 100 even with nothing linked to it", () => {
  // The regression this guards: `overallProgress` is null for a milestone with
  // no linked tasks/tracker, so dropping nulls from the mean would make
  // *finishing* a milestone lower the goal's percentage.
  const withoutCompletion = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      activities: activitiesFor([{ id: "t1", events: [taskEvent("t1", "2026-09-02")] }]),
      milestones: [
        milestone({ id: "m1", linkedActivities: ["t1"] }),
        milestone({ id: "m2", status: "active" }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );

  const withCompletion = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      activities: activitiesFor([{ id: "t1", events: [taskEvent("t1", "2026-09-02")] }]),
      milestones: [
        milestone({ id: "m1", linkedActivities: ["t1"] }),
        milestone({ id: "m2", status: "completed", actualCompletedDate: "2026-09-05" }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );

  assert.equal(withCompletion.milestonesCompleted, 1);
  assert.ok(
    withCompletion.progress >= withoutCompletion.progress,
    `completing a milestone lowered progress: ${withoutCompletion.progress} -> ${withCompletion.progress}`,
  );
});

// ── Health aggregation ───────────────────────────────────────────────────────

test("one delayed milestone makes the whole goal delayed", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      activities: activitiesFor([{ id: "t1", events: [taskEvent("t1", "2026-09-02")] }]),
      milestones: [
        milestone({ id: "m1", linkedActivities: ["t1"] }),
        // Its planned end is in the past with nothing linked and nothing done.
        milestone({ id: "m2", startDate: "2026-08-01", plannedEndDate: "2026-08-20" }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.health, "delayed");
  assert.ok(state.milestonesOffTrack >= 1);
  assert.equal(goalNeedsAttention(state), true);
});

test("an all-complete goal reads completed and says so", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      milestones: [
        milestone({ id: "m1", status: "completed", actualCompletedDate: "2026-09-05" }),
        milestone({ id: "m2", status: "completed", actualCompletedDate: "2026-09-08" }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.health, "completed");
  assert.equal(state.progress, 100);
  assert.equal(state.milestonesCompleted, 2);
  assert.equal(goalNeedsAttention(state), false);
});

test("an explicitly completed goal reads completed regardless of its milestones", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      milestones: [milestone({ startDate: "2026-08-01", plannedEndDate: "2026-08-20" })],
    }),
    goal({ status: "completed" }),
    NOW("2026-09-10"),
  );
  assert.equal(state.health, "completed");
  assert.equal(state.statusMessage, "Goal completed.");
});

test("a paused goal is not graded", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ goalId: "g1" })],
      milestones: [milestone({ startDate: "2026-08-01", plannedEndDate: "2026-08-20" })],
    }),
    goal({ status: "paused" }),
    NOW("2026-09-10"),
  );
  assert.match(state.statusMessage, /Paused/i);
});

// ── Next milestone & target ──────────────────────────────────────────────────

test("nextMilestone is the soonest unfinished one across all linked plans", () => {
  const state = calculateGoalProgress(
    schedule({
      plans: [plan({ id: "p1", goalId: "g1" }), plan({ id: "p2", title: "Strength", goalId: "g1" })],
      milestones: [
        milestone({ id: "m1", planId: "p1", plannedEndDate: "2026-10-30" }),
        milestone({ id: "m2", planId: "p2", title: "Squat bodyweight", plannedEndDate: "2026-09-20" }),
        milestone({ id: "m3", planId: "p1", plannedEndDate: "2026-09-12", status: "completed", actualCompletedDate: "2026-09-09" }),
      ],
    }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.planCount, 2);
  assert.equal(state.nextMilestone.milestone.id, "m2");
  assert.equal(state.nextMilestone.plan.id, "p2");
  assert.equal(state.nextMilestone.daysUntil, 10);
});

test("daysToTarget counts down to the goal's own target date", () => {
  const state = calculateGoalProgress(
    schedule({ plans: [plan({ goalId: "g1" })], milestones: [milestone()] }),
    goal({ targetDate: "2026-09-25" }),
    NOW("2026-09-10"),
  );
  assert.equal(state.daysToTarget, 15);
  assert.match(state.statusMessage, /15 days until/i);
});

test("a passed target date is stated as passed, not as a negative countdown", () => {
  const state = calculateGoalProgress(
    schedule({ plans: [plan({ goalId: "g1" })], milestones: [milestone()] }),
    goal({ targetDate: "2026-09-05" }),
    NOW("2026-09-10"),
  );
  assert.equal(state.daysToTarget, -5);
  assert.match(state.statusMessage, /passed 5 days ago/i);
});

test("no target date means no target clause", () => {
  const state = calculateGoalProgress(
    schedule({ plans: [plan({ goalId: "g1" })], milestones: [milestone()] }),
    goal(),
    NOW("2026-09-10"),
  );
  assert.equal(state.daysToTarget, null);
  assert.ok(!/target/i.test(state.statusMessage));
});
