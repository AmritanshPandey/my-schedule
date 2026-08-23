import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Same shim as tests/goal.test.mjs — some transitively-imported files (e.g.
// useScheduleDB's `@/contexts/AuthProvider`) are .tsx, reached only via
// `import type`, but Node's resolver still needs to find *a* URL for them
// before the type-only statement is erased.
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

const { buildCreateTaskProposal } = await import("../lib/aiProposal.ts");
const { validateProposal, AIProposalSchema } = await import("../lib/ai/validation/proposalSchema.ts");
const {
  recordProposalCreated,
  recordProposalRejected,
  recordProposalFailed,
  executeCreateTaskProposal,
} = await import("../lib/proposalMutations.ts");
const { createTask } = await import("../lib/taskMutations.ts");
const { validateSchedule } = await import("../lib/scheduleSchema.ts");

/** Minimal empty Schedule — mirrors emptySchedule() in tests/goal.test.mjs. */
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
      { id: "plan-1", title: "Marathon Training", category: "fitness", emoji: "run", color: "orange", items: [], ...overrides },
    ],
  };
}

function addTaskAction(overrides = {}) {
  return {
    type: "add_task",
    payload: {
      title: "Morning Run",
      taskType: "session",
      day: "monday",
      days: ["monday", "wednesday", "friday"],
      startTime: "07:00",
      endTime: "08:00",
      icon: "run",
      subtasks: ["Warm up", "5K run"],
      planTitle: "Marathon Training",
      ...overrides,
    },
  };
}

// ── Builder ──────────────────────────────────────────────────────────────────

test("buildCreateTaskProposal produces a valid pending proposal with a human-readable changes list", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);

  assert.equal(proposal.operation, "create");
  assert.equal(proposal.entity, "task");
  assert.equal(proposal.status, "pending");
  assert.equal(proposal.entityId, undefined);
  assert.equal(proposal.data.planId, "plan-1");
  assert.ok(proposal.changes.length >= 3);
  assert.ok(proposal.changes.some((c) => c.label === "Title" && c.value === "Morning Run"));
  assert.ok(proposal.changes.some((c) => c.label === "Plan" && c.value === "Marathon Training"));
  // No raw JSON anywhere in the human-readable diff.
  assert.ok(!proposal.changes.some((c) => c.value.includes("{") || c.value.includes("[")));
});

test("buildCreateTaskProposal never touches Schedule — it only takes plans, not a Schedule", () => {
  // Structural guarantee: the function signature itself has no Schedule
  // parameter, so this asserts the *documented* invariant by checking the
  // builder's arity/behavior rather than a Schedule identity (there is none
  // to compare against).
  assert.equal(buildCreateTaskProposal.length, 2); // (action, plans)
});

test("buildCreateTaskProposal flags an unmatched plan title without failing", () => {
  const proposal = buildCreateTaskProposal(addTaskAction({ planTitle: "Nonexistent Plan" }), []);
  assert.equal(proposal.data.planId, undefined);
  const planRow = proposal.changes.find((c) => c.label === "Plan");
  // Uses lib/ai/targets.ts's resolvePlanTarget/describeTargetProblem now
  // (the deterministic resolver, not a loose substring match) — assert on
  // the invariant that matters (no silent false-positive match) rather than
  // exact wording.
  assert.ok(planRow?.value.includes("Nonexistent Plan"));
  assert.ok(planRow?.value.includes("without one"));
});

// ── Schema validation ────────────────────────────────────────────────────────

test("AIProposalSchema accepts a well-formed create_task proposal", () => {
  const proposal = buildCreateTaskProposal(addTaskAction(), withPlan(emptySchedule()).plans);
  assert.equal(validateProposal(proposal).success, true);
});

test("AIProposalSchema rejects a malformed startTime", () => {
  const proposal = buildCreateTaskProposal(addTaskAction(), []);
  proposal.data.startTime = "7am";
  assert.equal(validateProposal(proposal).success, false);
});

test("AIProposalSchema rejects an empty days[] array", () => {
  const proposal = buildCreateTaskProposal(addTaskAction(), []);
  proposal.data.days = [];
  assert.equal(validateProposal(proposal).success, false);
});

test("AIProposalSchema rejects a too-short title", () => {
  const proposal = buildCreateTaskProposal(addTaskAction(), []);
  proposal.data.title = "A";
  assert.equal(validateProposal(proposal).success, false);
});

test("AIProposalSchema rejects an unsupported operation/entity", () => {
  const proposal = buildCreateTaskProposal(addTaskAction(), []);
  const bad = { ...proposal, operation: "delete" };
  assert.equal(AIProposalSchema.safeParse(bad).success, false);
});

// ── No mutation on creation ──────────────────────────────────────────────────

test("recordProposalCreated appends exactly one AI_PROPOSAL_CREATED event and leaves domain data untouched", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const next = recordProposalCreated(schedule, proposal);

  assert.deepEqual(next.plans, schedule.plans);
  assert.deepEqual(next.activities, schedule.activities);
  assert.deepEqual(next.milestones, schedule.milestones);
  assert.deepEqual(next.progressTrackers, schedule.progressTrackers);
  assert.deepEqual(next.categories, schedule.categories);

  const events = next.events.filter((e) => e.entityId === proposal.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "AI_PROPOSAL_CREATED");
});

// ── Lifecycle 1: create → pending → accepted ────────────────────────────────

test("lifecycle: created proposal, once accepted, creates the task via the real createTask mutation and records both events", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);

  let s = recordProposalCreated(schedule, proposal);
  const result = executeCreateTaskProposal(s, proposal);
  assert.equal(result.ok, true);
  s = result.schedule;

  const types = s.events.filter((e) => e.entityId === proposal.id).map((e) => e.type);
  assert.deepEqual(types, ["AI_PROPOSAL_CREATED", "AI_PROPOSAL_ACCEPTED"]);

  const created = s.activities.monday.find((t) => t.title === "Morning Run");
  assert.ok(created, "task should exist on monday");
  assert.equal(s.activities.wednesday.some((t) => t.id === created.id), true);
  assert.equal(s.activities.friday.some((t) => t.id === created.id), true);
  assert.equal(created.planId, "plan-1");
  assert.equal(created.taskType, "session");
  assert.equal(created.startTime, "07:00");
  assert.equal(created.endTime, "08:00");
  assert.deepEqual(created.subtasks.map((s) => s.task), ["Warm up", "5K run"]);

  // Prove the executor used the real domain mutation, not a second
  // implementation: build the same draft directly and compare, ignoring the
  // randomly-generated task/subtask ids (uid() differs per call).
  const directDraft = {
    title: "Morning Run",
    startTime: "07:00",
    endTime: "08:00",
    categoryId: created.categoryId,
    planId: "plan-1",
    taskType: "session",
    subtasks: created.subtasks, // reuse ids so the comparison is meaningful
  };
  const direct = createTask(directDraft, ["monday", "wednesday", "friday"], null)({
    ...schedule,
    categories: s.categories,
  });
  const directTask = direct.activities.monday.find((t) => t.title === "Morning Run");
  const { id: _createdId, ...createdRest } = created;
  const { id: _directId, ...directRest } = directTask;
  assert.deepEqual(createdRest, directRest);
});

// ── Lifecycle 2: create → pending → rejected ────────────────────────────────

test("lifecycle: created proposal, once rejected, leaves activities untouched and records both events", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);

  let s = recordProposalCreated(schedule, proposal);
  s = recordProposalRejected(s, proposal);

  assert.deepEqual(s.activities, schedule.activities);
  const types = s.events.filter((e) => e.entityId === proposal.id).map((e) => e.type);
  assert.deepEqual(types, ["AI_PROPOSAL_CREATED", "AI_PROPOSAL_REJECTED"]);
});

// ── Staleness ────────────────────────────────────────────────────────────────

test("executeCreateTaskProposal rejects a proposal whose referenced plan no longer exists", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const scheduleWithoutPlan = { ...schedule, plans: [] }; // plan deleted after the proposal was built

  const result = executeCreateTaskProposal(scheduleWithoutPlan, proposal);
  assert.equal(result.ok, false);
  assert.match(result.error, /no longer exists/);
  assert.deepEqual(result.schedule, scheduleWithoutPlan);
  assert.equal(result.schedule.activities.monday.length, 0);
});

test("a standalone proposal (no plan referenced) is never considered stale", () => {
  const proposal = buildCreateTaskProposal(addTaskAction({ planTitle: undefined }), []);
  assert.equal(proposal.data.planId, undefined);
  const result = executeCreateTaskProposal(emptySchedule(), proposal);
  assert.equal(result.ok, true);
});

// ── Failure handling ─────────────────────────────────────────────────────────

test("recordProposalFailed appends exactly one AI_PROPOSAL_FAILED event with a reason, touching no domain array", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const next = recordProposalFailed(schedule, proposal, "The plan this task was going to attach to no longer exists.");

  assert.deepEqual(next.plans, schedule.plans);
  assert.deepEqual(next.activities, schedule.activities);
  const events = next.events.filter((e) => e.entityId === proposal.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "AI_PROPOSAL_FAILED");
  assert.equal(events[0].data.reason, "The plan this task was going to attach to no longer exists.");
});

test("a failed execution never corrupts Schedule: every domain array is unchanged", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const scheduleWithoutPlan = { ...schedule, plans: [] };

  const result = executeCreateTaskProposal(scheduleWithoutPlan, proposal);
  assert.equal(result.ok, false);
  const failed = recordProposalFailed(result.schedule, proposal, result.error);

  assert.deepEqual(failed.plans, scheduleWithoutPlan.plans);
  assert.deepEqual(failed.activities, scheduleWithoutPlan.activities);
  assert.deepEqual(failed.milestones, scheduleWithoutPlan.milestones);
  assert.deepEqual(failed.progressTrackers, scheduleWithoutPlan.progressTrackers);
  assert.deepEqual(failed.categories, scheduleWithoutPlan.categories);
});

// ── Events never carry raw AI content ───────────────────────────────────────

test("AI_PROPOSAL_* events only ever carry whitelisted metadata, never raw AI text", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const allowedKeys = new Set(["entity", "source", "changeCount", "reason"]);

  let s = recordProposalCreated(schedule, proposal);
  const accepted = executeCreateTaskProposal(s, proposal);
  s = accepted.schedule;
  s = recordProposalFailed(s, proposal, "example reason");

  for (const event of s.events) {
    if (!event.type.startsWith("AI_PROPOSAL_")) continue;
    for (const key of Object.keys(event.data ?? {})) {
      assert.ok(allowedKeys.has(key), `unexpected event data key: ${key}`);
    }
    const serialized = JSON.stringify(event.data ?? {});
    assert.ok(!serialized.includes("Morning Run"), "event data must not embed proposal free-text content");
  }
});

// ── Backward/forward schema compatibility ───────────────────────────────────

test("a Schedule containing AI_PROPOSAL_* events still validates via validateSchedule", () => {
  const schedule = withPlan(emptySchedule());
  const proposal = buildCreateTaskProposal(addTaskAction(), schedule.plans);
  const withEvents = recordProposalCreated(schedule, proposal);
  const result = validateSchedule(withEvents);
  assert.equal(result.success, true);
});
