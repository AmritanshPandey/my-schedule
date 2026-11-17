/**
 * The per-entity merge that lets two devices edit the same account without
 * either losing work.
 *
 * The properties matter more than the cases here: a merge is wrong in classes,
 * not instances. Anything that survives "no entity disappears unless a newer
 * tombstone covers it" and "both devices compute the same result" is very hard
 * to make lose data by accident.
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
const { migrate } = await import("@/lib/scheduleMigrate.ts");
const R = await import("@/lib/runPlan.ts");
const S = await import("@/lib/sessions.ts");
const A = await import("@/lib/runAdjustments.ts");

const NOW = "2026-11-14T09:00:00.000Z";
const INPUTS = {
  currentDistanceKm: 3, easyPaceSecPerKm: 360, targetDistanceKm: 5, targetPaceSecPerKm: 330,
  weeks: 8, runDays: ["monday", "wednesday", "friday", "sunday"], startISO: "2026-11-16",
};
const AFTER_W1 = "2026-11-23";

function plan() {
  return R.createRunPlan(migrate({}), INPUTS, { createGoal: false }, NOW);
}
const week = (schedule, k) => schedule.sessions.filter((s) => s.generated.weekIndex === k).sort((a, b) => a.dateISO.localeCompare(b.dateISO));

/** Log a session at a pace offset (s/km) from its planned average pace. */
function run(schedule, session, offsetSec, effort = "ok") {
  const km = S.plannedDistanceM(session) / 1000;
  const pace = A.plannedAvgPace(session, INPUTS.easyPaceSecPerKm) + offsetSec;
  return S.logSessionRun(schedule, session.id, { distanceM: km * 1000, durationSec: Math.round(km * pace), effort }, undefined, NOW);
}

function evaluate(schedule) {
  return A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW).planAdjustments ?? [];
}

test("planWeekIndex counts from the plan start", () => {
  const { schedule, planId } = plan();
  const p = schedule.plans.find((x) => x.id === planId);
  assert.equal(A.planWeekIndex(p, "2026-11-16"), 1);
  assert.equal(A.planWeekIndex(p, "2026-11-22"), 1);
  assert.equal(A.planWeekIndex(p, "2026-11-23"), 2);
});

test("two missed runs suggest repeating the week", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  schedule = run(run(schedule, w[0], 0), w[1], 0);
  const [adj] = evaluate(schedule);
  assert.equal(adj.kind, "repeat-week");
  assert.equal(adj.weekIndex, 2);
  assert.equal(adj.reason, "You missed 2 runs last week.");
  assert.equal(adj.decision, "pending");
});

test("two hard runs suggest easing off", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  for (const [i, s] of w.entries()) schedule = run(schedule, s, 0, i < 2 ? "hard" : "ok");
  const [adj] = evaluate(schedule);
  assert.equal(adj.kind, "ease");
  assert.equal(adj.reason, "Two or more runs last week felt hard.");
});

test("most runs well slower than planned suggest easing off", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  schedule = run(schedule, w[0], 20);
  schedule = run(schedule, w[1], 20);
  schedule = run(schedule, w[2], 20);
  schedule = run(schedule, w[3], 0);
  const [adj] = evaluate(schedule);
  assert.equal(adj.kind, "ease");
  assert.equal(adj.reason, "Most runs last week were slower than planned.");
});

test("beating pace on 3 of the last 4 timed runs suggests speeding up", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  schedule = run(schedule, w[0], -12);
  schedule = run(schedule, w[1], -12);
  schedule = run(schedule, w[2], 0);
  schedule = run(schedule, w[3], -12);
  const [adj] = evaluate(schedule);
  assert.equal(adj.kind, "pace");
  assert.deepEqual(adj.detail, { paceDeltaSec: -10 });
  assert.equal(adj.reason, "You beat your target pace on 3 of your last 4 runs.");
});

test("marked-done runs never count as timed", () => {
  let { schedule } = plan();
  for (const s of week(schedule, 1)) schedule = S.markSessionDone(schedule, s.id, NOW);
  assert.deepEqual(evaluate(schedule), []);
});

test("a week is only evaluated once, and a held suggestion is not asked again", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  schedule = run(run(schedule, w[0], 0), w[1], 0);
  schedule = A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW);
  schedule = A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW);
  assert.equal(schedule.planAdjustments.length, 1);
  schedule = A.decideAdjustment(schedule, schedule.planAdjustments[0].id, "held", AFTER_W1, NOW);
  schedule = A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW);
  assert.equal(schedule.planAdjustments.length, 1);
  assert.equal(schedule.planAdjustments[0].decision, "held");
});

test("nothing is proposed for the final week", () => {
  let { schedule } = plan();
  const w7 = week(schedule, 7);
  schedule = run(run(schedule, w7[0], 0), w7[1], 0);
  const out = A.evaluateFinishedWeeks(schedule, "2027-01-04", NOW).planAdjustments ?? [];
  assert.deepEqual(out.filter((a) => a.weekIndex === 8), []);
});

test("accepting rebuilds the plan; pendingAdjustment finds the open one", () => {
  let { schedule, planId } = plan();
  const w = week(schedule, 1);
  schedule = run(run(schedule, w[0], 0), w[1], 0);
  schedule = A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW);
  const pending = A.pendingAdjustment(schedule, planId);
  assert.equal(pending.kind, "repeat-week");
  schedule = A.decideAdjustment(schedule, pending.id, "accepted", AFTER_W1, NOW);
  assert.equal(A.pendingAdjustment(schedule, planId), undefined);
  assert.equal(schedule.planAdjustments[0].decision, "accepted");
  assert.equal(schedule.planAdjustments[0].decidedAt, NOW);
  assert.equal(schedule.sessions.filter((s) => s.planId === planId).length, 36);
});

test("two devices evaluating the same week make the same suggestion", () => {
  let { schedule } = plan();
  const w = week(schedule, 1);
  schedule = run(run(schedule, w[0], 0), w[1], 0);
  const a = A.evaluateFinishedWeeks(schedule, AFTER_W1, NOW).planAdjustments;
  const b = A.evaluateFinishedWeeks(schedule, AFTER_W1, "2026-11-23T08:00:00.000Z").planAdjustments;
  assert.equal(a[0].id, b[0].id);
});

test("duplicate accepted suggestions for one week apply once", () => {
  let { schedule, planId } = plan();
  const dup = (id) => ({ id, planId, weekIndex: 3, kind: "repeat-week", detail: {}, reason: "", decision: "accepted", createdAt: NOW });
  schedule = { ...schedule, planAdjustments: [dup("x1"), dup("x2")] };
  schedule = R.rebuildRunPlan(schedule, planId, "2026-11-14", NOW);
  assert.equal(schedule.sessions.filter((s) => s.planId === planId).length, 36);
});

test("a second suggestion for an already-decided week can't be accepted", () => {
  let { schedule, planId } = plan();
  const adj = (id, decision) => ({ id, planId, weekIndex: 3, kind: "repeat-week", detail: {}, reason: "", decision, createdAt: NOW });
  schedule = { ...schedule, planAdjustments: [adj("x1", "held"), adj("x2", "pending")] };
  assert.equal(A.pendingAdjustment(schedule, planId), undefined);
  const after = A.decideAdjustment(schedule, "x2", "accepted", "2026-11-14", NOW);
  assert.equal(after.sessions.filter((s) => s.planId === planId).length, 32);
});

test("a newer suggestion retires an unanswered older one", () => {
  let { schedule, planId } = plan();
  schedule = { ...schedule, planAdjustments: [{ id: "old", planId, weekIndex: 3, kind: "ease", detail: {}, reason: "Older", decision: "pending", createdAt: NOW }] };
  const w5 = week(schedule, 4);
  schedule = run(run(schedule, w5[0], 0), w5[1], 0);
  schedule = A.evaluateFinishedWeeks(schedule, "2026-12-14", NOW);
  assert.equal(schedule.planAdjustments.find((a) => a.id === "old").decision, "held");
  assert.equal(A.pendingAdjustment(schedule, planId).weekIndex, 5);
});

test("a paused plan gets no suggestions", () => {
  let { schedule, planId } = plan();
  schedule = { ...schedule, plans: schedule.plans.map((p) => (p.id === planId ? { ...p, status: "paused" } : p)) };
  assert.deepEqual(evaluate(schedule), []);
});
