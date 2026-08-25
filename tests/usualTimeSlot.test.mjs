import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Same shim as tests/availableSlots.test.mjs / tests/goal.test.mjs.
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

const { computeUsualTimeSlot } = await import("../lib/usualTimeSlot.ts");

let nextId = 0;
function task(overrides = {}) {
  nextId += 1;
  return {
    id: overrides.id ?? `t-${nextId}`,
    title: overrides.title ?? "Task",
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "10:00",
    planId: overrides.planId ?? "plan-1",
    ...overrides,
  };
}

test("fewer than minSamples matches returns null", () => {
  const activities = {
    monday: [task({ categoryId: "workout", startTime: "07:00", endTime: "07:45" })],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "workout", planId: "plan-1" }, undefined);
  assert.equal(result, null);
});

test("category match takes priority over plan fallback", () => {
  const activities = {
    monday: [
      task({ categoryId: "workout", planId: "plan-1", startTime: "07:00", endTime: "07:45" }),
      task({ categoryId: "workout", planId: "plan-1", startTime: "07:10", endTime: "07:55" }),
    ],
    tuesday: [
      // Same plan, no category — should NOT count when a categoryId is given.
      task({ planId: "plan-1", startTime: "20:00", endTime: "21:00" }),
    ],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "workout", planId: "plan-1" }, undefined);
  assert.ok(result);
  assert.equal(result.sampleSize, 2);
  // Median of 07:00 and 07:10 is 07:05 -> 420+5=425, already a multiple of 5.
  assert.equal(result.startMinutes, 425);
});

test("no categoryId falls back to grouping by planId", () => {
  const activities = {
    monday: [task({ planId: "plan-2", startTime: "18:00", endTime: "18:30" })],
    tuesday: [task({ planId: "plan-2", startTime: "18:10", endTime: "18:40" })],
    wednesday: [task({ planId: "other-plan", startTime: "09:00", endTime: "09:30" })],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: undefined, planId: "plan-2" }, undefined);
  assert.ok(result);
  assert.equal(result.sampleSize, 2);
});

test("excluded task id is never counted, even if it would otherwise match", () => {
  const excluded = task({ id: "self", categoryId: "workout", startTime: "07:00", endTime: "07:45" });
  const activities = {
    monday: [
      excluded,
      task({ categoryId: "workout", startTime: "07:00", endTime: "07:45" }),
    ],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "workout", planId: "plan-1" }, "self");
  // Only one other real match remains — below the default minSamples of 2.
  assert.equal(result, null);
});

test("a recurring task appearing on multiple weekday buckets is only counted once", () => {
  const recurring = task({ id: "recurring", categoryId: "workout", startTime: "07:00", endTime: "07:45" });
  const activities = {
    monday: [recurring],
    wednesday: [recurring], // same id, same object — a Mon/Wed/Fri habit
    friday: [recurring],
    tuesday: [task({ categoryId: "workout", startTime: "07:00", endTime: "07:45" })],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "workout", planId: "plan-1" }, undefined);
  assert.ok(result);
  assert.equal(result.sampleSize, 2, "the recurring task should contribute exactly one sample, not three");
});

test("median start/duration with an odd sample size", () => {
  const activities = {
    monday: [
      task({ categoryId: "study", startTime: "18:00", endTime: "19:00" }), // 1080, 60m
      task({ categoryId: "study", startTime: "18:20", endTime: "19:10" }), // 1100, 50m
      task({ categoryId: "study", startTime: "19:00", endTime: "19:40" }), // 1140, 40m
    ],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "study", planId: "plan-1" }, undefined);
  assert.ok(result);
  assert.equal(result.sampleSize, 3);
  // Median start = 1100 (18:20), median duration = 50 -> end = 1150.
  assert.equal(result.startMinutes, 1100);
  assert.equal(result.endMinutes, 1150);
});

test("median start/duration with an even sample size averages the middle two", () => {
  const activities = {
    monday: [
      task({ categoryId: "reading", startTime: "21:00", endTime: "21:30" }), // 1260, 30m
      task({ categoryId: "reading", startTime: "21:10", endTime: "21:40" }), // 1270, 30m
      task({ categoryId: "reading", startTime: "21:20", endTime: "21:50" }), // 1280, 30m
      task({ categoryId: "reading", startTime: "21:30", endTime: "22:00" }), // 1290, 30m
    ],
  };
  const result = computeUsualTimeSlot(activities, { categoryId: "reading", planId: "plan-1" }, undefined);
  assert.ok(result);
  // Median of [1260,1270,1280,1290] = (1270+1280)/2 = 1275, already a multiple of 5.
  assert.equal(result.startMinutes, 1275);
  assert.equal(result.endMinutes, 1275 + 30);
});
