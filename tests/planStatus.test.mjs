/**
 * When a plan is allowed to be called "needs focus".
 *
 * The bug these pin: `calculateConsistency` returns a flat 0 whenever a plan
 * has no completions yet, and the old rule graded anything under 35% as
 * delayed. A plan created this morning therefore opened in alarm red, and a
 * screen of brand-new plans was a screen of alarms — at which point the colour
 * stops carrying information.
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

const { derivePlanStatus, needsAttention, planDaysRunning, PROVING_DAYS } =
  await import("../lib/planInsights.ts");

const NOW = new Date("2026-08-29T09:00:00");
const plan = (startDate) => ({ id: "p1", title: "P", items: [], ...(startDate ? { startDate } : {}) });
/** An ISO date `n` days before NOW. */
const daysAgo = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// ── The reported problem ────────────────────────────────────────────────────

test("a plan created yesterday is not accused of needing focus", () => {
  const status = derivePlanStatus("incomplete", 0, plan(daysAgo(1)), NOW);
  assert.equal(status, "unproven");
  assert.equal(needsAttention(status), false);
});

test("a plan whose start date hasn't arrived is not graded either", () => {
  const future = new Date(NOW);
  future.setDate(future.getDate() + 5);
  const status = derivePlanStatus("incomplete", 0, plan(future.toISOString().slice(0, 10)), NOW);
  assert.equal(status, "unproven");
});

test("an undated plan is unproven rather than delayed", () => {
  // Nothing on the plan says when it was meant to start, so there is no
  // evidence it is behind. False calm beats a false alarm here.
  assert.equal(derivePlanStatus("incomplete", 0, plan(null), NOW), "unproven");
});

// ── But the alarm must still fire when it's earned ──────────────────────────

test("a plan with a long run and nothing done DOES need focus", () => {
  const status = derivePlanStatus("incomplete", 0, plan(daysAgo(90)), NOW);
  assert.equal(status, "delayed");
  assert.equal(needsAttention(status), true);
});

test("the grace window closes exactly at PROVING_DAYS", () => {
  assert.equal(derivePlanStatus("incomplete", 0, plan(daysAgo(PROVING_DAYS - 1)), NOW), "unproven");
  assert.equal(derivePlanStatus("incomplete", 0, plan(daysAgo(PROVING_DAYS)), NOW), "delayed");
});

test("grace only covers a total absence of data, never a real low score", () => {
  // 12% is a measurement, not a blank. A young plan that has been executed
  // badly should say so.
  assert.equal(derivePlanStatus("incomplete", 12, plan(daysAgo(2)), NOW), "delayed");
  assert.equal(derivePlanStatus("incomplete", 40, plan(daysAgo(2)), NOW), "at_risk");
});

// ── The ordinary ramp is unchanged ─────────────────────────────────────────

test("the status ramp still reads 70 / 35 as before", () => {
  const p = plan(daysAgo(60));
  assert.equal(derivePlanStatus("incomplete", 70, p, NOW), "on_track");
  assert.equal(derivePlanStatus("incomplete", 69, p, NOW), "at_risk");
  assert.equal(derivePlanStatus("incomplete", 35, p, NOW), "at_risk");
  assert.equal(derivePlanStatus("incomplete", 34, p, NOW), "delayed");
});

test("finishing today's work outranks any consistency figure", () => {
  assert.equal(derivePlanStatus("complete", 0, plan(daysAgo(90)), NOW), "on_track");
});

test("only at_risk and delayed count as needing attention", () => {
  assert.equal(needsAttention("on_track"), false);
  assert.equal(needsAttention("unproven"), false);
  assert.equal(needsAttention("at_risk"), true);
  assert.equal(needsAttention("delayed"), true);
});

// ── Elapsed-day arithmetic ─────────────────────────────────────────────────

test("planDaysRunning counts whole days, and goes negative before the start", () => {
  assert.equal(planDaysRunning(plan(daysAgo(3)), NOW), 3);
  assert.equal(planDaysRunning(plan("2026-08-29"), NOW), 0);
  assert.equal(planDaysRunning(plan("2026-09-05"), NOW), -7);
});

test("planDaysRunning reports null for undated or unparseable plans", () => {
  assert.equal(planDaysRunning(plan(null), NOW), null);
  assert.equal(planDaysRunning({ id: "p", title: "P", items: [], startDate: "nonsense" }, NOW), null);
});
