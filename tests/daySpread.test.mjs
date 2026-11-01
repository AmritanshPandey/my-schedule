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

const { buildDaySpread, OTHER_SPREAD_ID } = await import("@/packages/core/lib/daySpread.ts");

const task = (id, startTime, endTime, extra = {}) => ({
  id, title: id, description: "", startTime, endTime, icon: "run", color: "orange",
  taskType: "task", completed: false, completedSubtaskIds: [], ...extra,
});

const base = (tasks, extra = {}) => ({
  activities: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: tasks, sunday: [] },
  categories: [{ id: "c-work", title: "Work", icon: "work", color: "sky" }, { id: "c-sleep", title: "Sleep", icon: "sleep", color: "indigo", kind: "sleep" }],
  plans: [{ id: "p-lean", title: "Get lean", description: "", category: "fitness", emoji: "run", color: "orange", items: [], metaFields: [], summary: [], goals: [] }],
  preferences: { dayStartTime: "06:00", sleepHours: 8 },
  ...extra,
});

const SAT = "2026-10-31";

test("groups by category, then plan, then Other", () => {
  const spread = buildDaySpread(base([
    task("deep", "09:00 AM", "11:00 AM", { categoryId: "c-work" }),
    task("walk", "07:00 PM", "07:45 PM", { planId: "p-lean" }),
    task("misc", "02:00 PM", "02:30 PM"),
  ]), "saturday", SAT);
  assert.deepEqual(spread.groups.map((g) => [g.id, g.label, g.minutes]), [
    ["cat:c-work", "Work", 120],
    ["plan:p-lean", "Get lean", 45],
    [OTHER_SPREAD_ID, "Other", 30],
  ]);
  assert.equal(spread.plannedMinutes, 195);
  // 06:00 to 22:00 with 8 hours of sleep: a 16-hour window.
  assert.equal(spread.windowEnd - spread.windowStart, 16 * 60);
  assert.equal(spread.freeMinutes, 16 * 60 - 195);
});

test("an overlap counts once, and sleep categories stay out", () => {
  const spread = buildDaySpread(base([
    task("a", "09:00 AM", "10:00 AM", { categoryId: "c-work" }),
    task("b", "09:30 AM", "10:30 AM", { planId: "p-lean" }),
    task("nap", "01:00 PM", "02:00 PM", { categoryId: "c-sleep" }),
  ]), "saturday", SAT);
  assert.equal(spread.plannedMinutes, 90);
  assert.equal(spread.groups.find((g) => g.id === "cat:c-sleep"), undefined);
  // Blocks keep their own positions, each group merged and in time order.
  assert.deepEqual(spread.blocks.map((b) => b.groupId), ["cat:c-work", "plan:p-lean"]);
});

test("blocks outside the waking window are clipped away", () => {
  const spread = buildDaySpread(base([task("late", "11:00 PM", "11:59 PM", { categoryId: "c-work" })]), "saturday", SAT);
  assert.equal(spread.plannedMinutes, 0);
  assert.equal(spread.blocks.length, 0);
});
