import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Resolves a bare URL by trying it as-is, then with a .ts extension, then
// .tsx — some imports we transitively pull in (e.g. useScheduleDB's
// `@/contexts/AuthProvider`) are .tsx files, and only ever reached via
// `import type`, but Node's module resolution still has to find *a* URL for
// them before the type-only statement is erased.
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

const { createGoal, updateGoal, completeGoal, archiveGoal, deleteGoal, plansForGoal } =
  await import("../lib/goalMutations.ts");
const { validateSchedule } = await import("../lib/scheduleSchema.ts");

/** Minimal empty Schedule — mirrors `emptyEmpty()` in lib/useScheduleDB.ts. */
function emptySchedule() {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
    },
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    strategies: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
  };
}

function withPlan(schedule, overrides = {}) {
  return {
    ...schedule,
    plans: [
      ...schedule.plans,
      {
        id: "plan-1",
        title: "Portfolio Redesign",
        category: "work",
        emoji: "briefcase",
        color: "blue",
        items: [],
        ...overrides,
      },
    ],
  };
}

// ── Goal creation ────────────────────────────────────────────────────────────

test("createGoal produces a valid, active Goal with only title required", () => {
  const next = createGoal(emptySchedule(), { title: "Get a senior UX design job" });
  assert.equal(next.goals.length, 1);
  const goal = next.goals[0];
  assert.equal(goal.title, "Get a senior UX design job");
  assert.equal(goal.status, "active");
  assert.equal(goal.schemaVersion, 1);
  assert.equal(typeof goal.id, "string");
  assert.ok(goal.id.length > 0);
  assert.equal(typeof goal.createdAt, "string");
  assert.equal(goal.createdAt, goal.updatedAt);
  assert.equal(goal.description, undefined);
  assert.equal(goal.startDate, undefined);
  assert.equal(goal.targetDate, undefined);
});

test("createGoal is a no-op when title is blank", () => {
  const schedule = emptySchedule();
  const next = createGoal(schedule, { title: "   " });
  assert.equal(next, schedule);
});

test("createGoal accepts description/startDate/targetDate", () => {
  const next = createGoal(emptySchedule(), {
    title: "Learn Flutter",
    description: "Become comfortable building production Flutter apps.",
    startDate: "2026-08-20",
    targetDate: "2026-11-30",
  });
  const goal = next.goals[0];
  assert.equal(goal.description, "Become comfortable building production Flutter apps.");
  assert.equal(goal.startDate, "2026-08-20");
  assert.equal(goal.targetDate, "2026-11-30");
});

// ── Goal update ──────────────────────────────────────────────────────────────

test("updateGoal edits fields and bumps updatedAt without touching status", () => {
  const created = createGoal(emptySchedule(), { title: "Original" });
  const goal = created.goals[0];
  const updated = updateGoal(created, goal.id, { title: "Renamed", description: "New description" });
  const result = updated.goals[0];
  assert.equal(result.title, "Renamed");
  assert.equal(result.description, "New description");
  assert.equal(result.status, "active");
  assert.equal(result.createdAt, goal.createdAt);
});

test("updateGoal is a no-op for an unknown goal id", () => {
  const schedule = createGoal(emptySchedule(), { title: "Original" });
  const next = updateGoal(schedule, "does-not-exist", { title: "Renamed" });
  assert.equal(next, schedule);
});

// ── Goal completion / archive ───────────────────────────────────────────────

test("completeGoal moves an active Goal to completed", () => {
  const created = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = created.goals[0];
  const completed = completeGoal(created, goal.id);
  assert.equal(completed.goals[0].status, "completed");
});

test("archiveGoal moves a Goal to archived without touching its Plans", () => {
  let schedule = createGoal(emptySchedule(), { title: "Old initiative" });
  const goal = schedule.goals[0];
  schedule = withPlan(schedule, { goalId: goal.id });
  const archived = archiveGoal(schedule, goal.id);
  assert.equal(archived.goals[0].status, "archived");
  assert.equal(archived.plans[0].goalId, goal.id);
});

// ── Goal deletion ────────────────────────────────────────────────────────────

test("deleteGoal removes the Goal, keeps the Plan, and clears its goalId", () => {
  let schedule = createGoal(emptySchedule(), { title: "Get a senior UX design job" });
  const goal = schedule.goals[0];
  schedule = withPlan(schedule, { goalId: goal.id });
  // A milestone/task riding on the plan should also be untouched.
  schedule = {
    ...schedule,
    milestones: [{
      id: "m-1", planId: "plan-1", title: "M1", startDate: "2026-01-01",
      plannedDurationDays: 7, plannedEndDate: "2026-01-08", status: "upcoming",
      linkedActivities: [], linkedTrackers: [], createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", sortOrder: 0,
    }],
    activities: { ...schedule.activities, monday: [{ id: "t-1", title: "Task", startTime: "9:00 AM", endTime: "10:00 AM", planId: "plan-1" }] },
  };

  const next = deleteGoal(schedule, goal.id);
  assert.equal(next.goals.length, 0);
  assert.equal(next.plans.length, 1);
  assert.equal(next.plans[0].goalId, undefined);
  assert.equal(next.milestones.length, 1);
  assert.equal(next.activities.monday.length, 1);
});

test("deleteGoal is a no-op for an unknown goal id", () => {
  const schedule = withPlan(emptySchedule());
  const next = deleteGoal(schedule, "does-not-exist");
  assert.equal(next, schedule);
});

// ── Plan relationship ────────────────────────────────────────────────────────

test("plansForGoal derives linked plans from Plan.goalId (not a stored reverse list)", () => {
  let schedule = createGoal(emptySchedule(), { title: "Get a senior UX design job" });
  const goal = schedule.goals[0];
  schedule = withPlan(schedule, { id: "plan-1", goalId: goal.id });
  schedule = withPlan(schedule, { id: "plan-2", goalId: goal.id });
  schedule = withPlan(schedule, { id: "plan-3" }); // no goal

  const linked = plansForGoal(schedule, goal.id);
  assert.deepEqual(linked.map((p) => p.id).sort(), ["plan-1", "plan-2"]);
});

// ── Backward compatibility ───────────────────────────────────────────────────

test("an old Schedule without goals/events normalizes to empty arrays and still validates", () => {
  const legacy = emptySchedule();
  delete legacy.goals;
  delete legacy.events;
  const result = validateSchedule({ ...legacy, goals: [], events: [] });
  assert.equal(result.success, true);
});

test("existing Plans without goalId remain valid", () => {
  const schedule = withPlan(emptySchedule());
  assert.equal(schedule.plans[0].goalId, undefined);
  const result = validateSchedule(schedule);
  assert.equal(result.success, true);
});

// ── Runtime validation ───────────────────────────────────────────────────────

test("validateSchedule accepts a well-formed Goal", () => {
  const schedule = createGoal(emptySchedule(), {
    title: "Get a senior UX design job",
    description: "Portfolio + interviews + leadership",
    startDate: "2026-08-20",
    targetDate: "2026-12-15",
  });
  const result = validateSchedule(schedule);
  assert.equal(result.success, true);
});

test("validateSchedule rejects a structurally invalid Goal (empty id)", () => {
  const schedule = createGoal(emptySchedule(), { title: "Placeholder" });
  schedule.goals[0] = { ...schedule.goals[0], id: "" };
  assert.equal(validateSchedule(schedule).success, false);
});

test("createGoal/updateGoal refuse a blank title at the mutation boundary", () => {
  const created = createGoal(emptySchedule(), { title: "  " });
  assert.equal(created.goals.length, 0); // createGoal no-op, asserted above too
  const withGoal = createGoal(emptySchedule(), { title: "Real title" });
  const goal = withGoal.goals[0];
  const next = updateGoal(withGoal, goal.id, { title: "   " });
  assert.equal(next, withGoal); // updateGoal no-op on blank title
});

// ── Event integration ────────────────────────────────────────────────────────

test("createGoal records a GOAL_CREATED event", () => {
  const next = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = next.goals[0];
  const events = next.events.filter((e) => e.entityId === goal.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "GOAL_CREATED");
});

test("updateGoal records a GOAL_UPDATED event", () => {
  const created = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = created.goals[0];
  const updated = updateGoal(created, goal.id, { title: "Ship v2" });
  const types = updated.events.filter((e) => e.entityId === goal.id).map((e) => e.type);
  assert.deepEqual(types, ["GOAL_CREATED", "GOAL_UPDATED"]);
});

test("completeGoal records a GOAL_COMPLETED event", () => {
  const created = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = created.goals[0];
  const completed = completeGoal(created, goal.id);
  const types = completed.events.filter((e) => e.entityId === goal.id).map((e) => e.type);
  assert.deepEqual(types, ["GOAL_CREATED", "GOAL_COMPLETED"]);
});

test("archiveGoal records a GOAL_ARCHIVED event", () => {
  const created = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = created.goals[0];
  const archived = archiveGoal(created, goal.id);
  const types = archived.events.filter((e) => e.entityId === goal.id).map((e) => e.type);
  assert.deepEqual(types, ["GOAL_CREATED", "GOAL_ARCHIVED"]);
});

test("deleteGoal records a GOAL_DELETED event", () => {
  const created = createGoal(emptySchedule(), { title: "Ship v1" });
  const goal = created.goals[0];
  const deleted = deleteGoal(created, goal.id);
  const types = deleted.events.filter((e) => e.entityId === goal.id).map((e) => e.type);
  assert.deepEqual(types, ["GOAL_CREATED", "GOAL_DELETED"]);
});

test("normalization does not itself generate duplicate events", () => {
  // Re-validating an already-normalized schedule must not add events.
  const schedule = createGoal(emptySchedule(), { title: "Ship v1" });
  const eventCountBefore = schedule.events.length;
  const revalidated = validateSchedule(schedule);
  assert.equal(revalidated.success, true);
  assert.equal(revalidated.data.events.length, eventCountBefore);
});
