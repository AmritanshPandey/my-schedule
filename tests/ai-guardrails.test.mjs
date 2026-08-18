/**
 * Guardrails on what the AI may write.
 *
 * The behaviour under test is the one that caused the reported problem: the old
 * matcher scored on `t === q || t.includes(q) || q.includes(t)`, so "run"
 * claimed Run, Long run and Recovery run at once, and an unmatched plan name
 * silently became `plans[0]`. The point of these tests is that "I can't tell"
 * is now a real answer rather than a quiet guess.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try {
        return nextResolve(url, context);
      } catch {
        return nextResolve(`${url}.ts`, context);
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

const {
  matchScore,
  resolvePlanTarget,
  resolveTaskTarget,
  taskCandidates,
  needsClarification,
  describeTargetProblem,
} = await import("@/lib/ai/targets.ts");

const { checkLimits, countCreations, clampMaxTokens, SOFT_LIMITS, MAX_TOKENS_CEILING } =
  await import("@/lib/ai/limits.ts");

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function scheduleWith(tasks) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const t of tasks) for (const d of t.days ?? ["monday"]) activities[d].push(t);
  return { activities };
}

const plan = (id, title) => ({ id, title, category: "learning", emoji: "book", color: "cyan", items: [] });

// ── The reported bug ─────────────────────────────────────────────────────────

const RUNS = scheduleWith([
  { id: "t1", title: "Run", planId: "p1", days: ["monday"] },
  { id: "t2", title: "Long run", planId: "p1", days: ["saturday"] },
  { id: "t3", title: "Recovery run", planId: "p1", days: ["sunday"] },
]);

test('REGRESSION: "run" resolves to the exact task, not all three', () => {
  const match = resolveTaskTarget(RUNS, "run");
  assert.equal(match.status, "resolved");
  assert.equal(match.value.id, "t1");
  assert.equal(match.value.title, "Run");
});

test("a name that matches nothing is not-found, never a silent pick", () => {
  const match = resolveTaskTarget(RUNS, "swimming");
  assert.equal(match.status, "not-found");
  assert.equal(match.query, "swimming");
  assert.ok(needsClarification(match));
});

test("a genuine tie is ambiguous and names the candidates", () => {
  const tied = scheduleWith([
    { id: "a", title: "Morning review", planId: "p1", days: ["monday"] },
    { id: "b", title: "Morning routine", planId: "p1", days: ["tuesday"] },
  ]);
  const match = resolveTaskTarget(tied, "morning");
  assert.equal(match.status, "ambiguous");
  assert.deepEqual(match.candidates.map((c) => c.id).sort(), ["a", "b"]);
  assert.match(describeTargetProblem(match, "task"), /More than one task/);
});

test("matching is whole-word only, and never reversed", () => {
  assert.equal(matchScore("Run", "run"), 0, "exact wins");
  assert.equal(matchScore("Run club", "run"), 1, "a prefix ending on a word boundary");
  assert.equal(matchScore("Long run", "run"), 2, "a whole word inside the title");

  // Partial words are not matches. "Runway" and "Running" both contain the
  // letters of "run", and the old matcher took both — which is how one request
  // reached several unrelated tasks.
  assert.equal(matchScore("Runway design", "run"), null);
  assert.equal(matchScore("Running club", "run"), null);

  // The old matcher also allowed query-contains-title, letting a long query
  // claim a short unrelated title.
  assert.equal(matchScore("Run", "go for a run in the park"), null);
});

test("a whole-word hit outranks nothing at all, so the right task wins", () => {
  // The ranking that matters: with no exact match, "run" must reach "Long run"
  // rather than a partial-word lookalike.
  const mixed = scheduleWith([
    { id: "a", title: "Runway design", planId: "p1", days: ["monday"] },
    { id: "b", title: "Long run", planId: "p1", days: ["saturday"] },
  ]);
  const match = resolveTaskTarget(mixed, "run");
  assert.equal(match.status, "resolved");
  assert.equal(match.value.title, "Long run");
});

// ── Never an arbitrary plan ──────────────────────────────────────────────────

const PLANS = [plan("p1", "Marathon Training"), plan("p2", "Spanish Fluency")];

test("no unresolved plan target ever yields an arbitrary plan", () => {
  for (const query of ["Nonexistent", "zzz", "Marathon Trainingg "]) {
    const match = resolvePlanTarget(PLANS, query);
    if (match.status === "resolved") {
      // Only acceptable if it genuinely matched that name.
      assert.match(match.value.title.toLowerCase(), new RegExp(query.trim().toLowerCase().slice(0, 8)));
    } else {
      assert.ok(needsClarification(match));
      assert.equal(match.status, "not-found");
    }
  }
});

test("naming no plan with several present is unspecified, not the first one", () => {
  const match = resolvePlanTarget(PLANS, undefined);
  assert.equal(match.status, "unspecified");
  assert.equal(match.candidates.length, 2);
  assert.match(describeTargetProblem(match, "plan"), /Which plan/);
});

test("naming no plan when only one exists resolves — nothing to choose between", () => {
  const match = resolvePlanTarget([PLANS[0]], undefined);
  assert.equal(match.status, "resolved");
  assert.equal(match.value.id, "p1");
});

test("no plans at all says so rather than crashing", () => {
  const match = resolvePlanTarget([], undefined);
  assert.equal(match.status, "unspecified");
  assert.match(describeTargetProblem(match, "plan"), /no plan to add this to/i);
});

test("taskCandidates dedupes a task across the weekdays it recurs on", () => {
  const recurring = scheduleWith([
    { id: "t1", title: "Easy run", planId: "p1", days: ["monday", "wednesday", "friday"] },
  ]);
  const candidates = taskCandidates(recurring);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].days, ["monday", "wednesday", "friday"]);
});

// ── Size guardrails ──────────────────────────────────────────────────────────

const bigPlan = (taskCount, subtasksEach = 0) => ({
  type: "create_plan",
  payload: {
    title: "Big", description: "", emoji: "book", color: "cyan",
    tasks: Array.from({ length: taskCount }, (_, i) => ({
      title: `T${i}`, day: "monday", startTime: "09:00", endTime: "10:00", icon: "star",
      subtasks: Array.from({ length: subtasksEach }, (_, j) => `S${j}`),
    })),
  },
});

test("a normal action is under every cap", () => {
  const check = checkLimits(bigPlan(4, 3));
  assert.equal(check.needsConfirmation, false);
  assert.equal(check.rejected, false);
  assert.equal(check.counts.tasks, 4);
  assert.equal(check.counts.subtasks, 12);
  assert.equal(check.counts.plans, 1);
});

test("a large but legitimate plan asks for confirmation rather than failing", () => {
  const check = checkLimits(bigPlan(SOFT_LIMITS.tasks + 1));
  assert.equal(check.needsConfirmation, true, "must pause");
  assert.equal(check.rejected, false, "but must not be blocked outright");
  assert.ok(check.softBreaches.some((b) => b.kind === "tasks"));
});

test("an absurd payload is rejected as malformed", () => {
  const check = checkLimits(bigPlan(400));
  assert.equal(check.rejected, true);
  assert.ok(check.hardBreaches.length > 0);
});

test("subtask counts are summed across a plan's tasks", () => {
  const counts = countCreations(bigPlan(10, 5));
  assert.equal(counts.subtasks, 50);
  assert.equal(counts.total, 1 + 10 + 50);
});

test("maxTokens is clamped, never trusted", () => {
  assert.equal(clampMaxTokens(999_999), MAX_TOKENS_CEILING);
  assert.equal(clampMaxTokens(undefined), 1024);
  assert.equal(clampMaxTokens(-5), 1);
  assert.equal(clampMaxTokens(512), 512);
});

test("a question creates nothing", () => {
  const counts = countCreations({
    type: "ask_clarification",
    payload: { question: "Which plan?", options: ["A", "B"] },
  });
  assert.equal(counts.total, 0);
});
