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

const { buildRoutineInsights } = await import("../lib/consistency/routineInsights.ts");
const { localISODate } = await import("../lib/dateUtils.ts");

function ritual(overrides = {}) {
  return { id: "r1", title: "Test", time: "08:00", ...overrides };
}

test("no rituals at all: every field is null, nothing fabricated", () => {
  const insights = buildRoutineInsights([], [], "2026-01-10");
  assert.deepEqual(insights, {
    overallPct: null,
    deltaVsLastWeek: null,
    mostConsistent: null,
    needsAttention: null,
  });
});

test("a routine whose interval cycle hasn't started yet: zero scheduled days reads as no data, not struggling", () => {
  // Anchored in the future — never due in the last 30 days, so its 0%
  // adherencePct (nothing to divide by) must not be mistaken for a real miss.
  const r = ritual({ id: "fresh", recurrence: { kind: "interval", intervalDays: 5, anchorDate: "2026-02-01" } });
  const insights = buildRoutineInsights([r], [], "2026-01-10");
  assert.equal(insights.needsAttention, null);
  assert.equal(insights.mostConsistent, null);
});

test("overallPct reflects this week's completed/scheduled across all routines", () => {
  const r = ritual();
  // Due every day; done on 3 of the last 7 days (2026-01-04..2026-01-10).
  const completions = [
    { ritualId: "r1", date: "2026-01-10" },
    { ritualId: "r1", date: "2026-01-09" },
    { ritualId: "r1", date: "2026-01-08" },
  ];
  const insights = buildRoutineInsights([r], completions, "2026-01-10");
  assert.equal(insights.overallPct, Math.round((3 / 7) * 100));
});

test("deltaVsLastWeek compares this week's pct against the prior 7-day window", () => {
  const r = ritual();
  // This week (01-04..01-10): 7/7 done. Last week (2025-12-28..2026-01-03): 0/7.
  const completions = [];
  for (let d = 4; d <= 10; d++) completions.push({ ritualId: "r1", date: `2026-01-${String(d).padStart(2, "0")}` });
  const insights = buildRoutineInsights([r], completions, "2026-01-10");
  assert.equal(insights.overallPct, 100);
  assert.equal(insights.deltaVsLastWeek, 100);
});

test("mostConsistent only surfaces a routine whose streak clears the highlight bar", () => {
  const strong = ritual({ id: "strong", title: "Strong" });
  const weak = ritual({ id: "weak", title: "Weak" });
  const completions = [
    { ritualId: "strong", date: "2026-01-10" },
    { ritualId: "strong", date: "2026-01-09" },
    { ritualId: "strong", date: "2026-01-08" },
    // weak has a single isolated day — streak of 1, below the bar
    { ritualId: "weak", date: "2026-01-08" },
  ];
  const insights = buildRoutineInsights([strong, weak], completions, "2026-01-10");
  assert.equal(insights.mostConsistent?.ritual.id, "strong");
  assert.equal(insights.mostConsistent?.streak, 3);
});

test("needsAttention surfaces the lowest-adherence routine that actually had scheduled days", () => {
  const good = ritual({ id: "good", title: "Good" });
  const bad = ritual({ id: "bad", title: "Bad" });
  // good: done every day for the last 10 days.
  const completions = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date("2026-01-10T00:00:00");
    d.setDate(d.getDate() - i);
    completions.push({ ritualId: "good", date: localISODate(d) });
  }
  // bad: never done, but scheduled every day — adherence 0%.
  const insights = buildRoutineInsights([good, bad], completions, "2026-01-10");
  assert.equal(insights.needsAttention?.ritual.id, "bad");
});
