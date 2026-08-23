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

const { completedRitualIdsOn, groupRitualEntriesForDate } =
  await import("../lib/consistency/ritualDayStatus.ts");
const { appendRitualLog, toggleRitualCompletion, toggleRitualStep } =
  await import("../lib/ritualCompletions.ts");

const DAY = "2026-01-09";

function ritual(overrides = {}) {
  return { id: "r1", title: "Test", time: "08:00", ...overrides };
}

// ── The D2 regression: partial logs must not read as complete ───────────────
// This is the exact bug the Today bar, the done-counter and Needs Attention
// all shared — "any row dated today" instead of asking the tracking rules.

test("a partial quantity log does NOT count as done for the day", () => {
  const water = ritual({ trackingType: "quantity", target: 3000, unit: "ml" });
  const completions = appendRitualLog([], "r1", DAY, 250);
  assert.equal(completedRitualIdsOn([water], completions, DAY).has("r1"), false);
});

test("quantity logs that reach the target DO count as done", () => {
  const water = ritual({ trackingType: "quantity", target: 3000, unit: "ml" });
  let completions = appendRitualLog([], "r1", DAY, 1500);
  completions = appendRitualLog(completions, "r1", DAY, 1500);
  assert.equal(completedRitualIdsOn([water], completions, DAY).has("r1"), true);
});

test("a partially ticked checklist does NOT count as done", () => {
  const steps = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  const skincare = ritual({ trackingType: "checklist", steps });
  const completions = toggleRitualStep([], "r1", DAY, "a");
  assert.equal(completedRitualIdsOn([skincare], completions, DAY).has("r1"), false);
});

test("a plain checkbox routine still counts as done from one toggle", () => {
  const habit = ritual();
  const completions = toggleRitualCompletion([], "r1", DAY);
  assert.equal(completedRitualIdsOn([habit], completions, DAY).has("r1"), true);
});

test("a legacy sentinel row still completes any tracking type (backward compat)", () => {
  const water = ritual({ trackingType: "quantity", target: 3000, unit: "ml" });
  const legacy = [{ ritualId: "r1", date: DAY }];
  assert.equal(completedRitualIdsOn([water], legacy, DAY).has("r1"), true);
});

test("completedRitualIdsOn ignores rows from other dates and other routines", () => {
  const a = ritual({ id: "a", trackingType: "quantity", target: 100, unit: "ml" });
  const b = ritual({ id: "b" });
  let completions = appendRitualLog([], "a", "2026-01-08", 999); // yesterday
  completions = toggleRitualCompletion(completions, "b", DAY);
  const done = completedRitualIdsOn([a, b], completions, DAY);
  assert.equal(done.has("a"), false);
  assert.equal(done.has("b"), true);
});

test("groupRitualEntriesForDate buckets only the requested date", () => {
  let completions = appendRitualLog([], "r1", DAY, 10);
  completions = appendRitualLog(completions, "r1", "2026-01-10", 10);
  const grouped = groupRitualEntriesForDate(completions, DAY);
  assert.equal(grouped.get("r1").length, 1);
});
