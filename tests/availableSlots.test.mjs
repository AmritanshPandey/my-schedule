import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Same shim as tests/goal.test.mjs / tests/proposal.test.mjs.
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

const { findAvailableSlots, suggestSlots } = await import("../lib/availableSlots.ts");
const { DEFAULT_TIMELINE_START_MINUTES } = await import("../lib/timeline/displayWindow.ts");
const { resolveWakingWindow, DEFAULT_SLEEP_HOURS } = await import("../lib/timeline/sleepWindow.ts");

const DATE = "2026-08-24"; // a Monday

function task(overrides = {}) {
  return {
    id: overrides.id ?? "t-1",
    title: overrides.title ?? "Task",
    startTime: overrides.startTime ?? "09:00",
    endTime: overrides.endTime ?? "10:00",
    planId: "plan-1",
    ...overrides,
  };
}

function defaultBounds() {
  const dayStart = DEFAULT_TIMELINE_START_MINUTES; // 240 (4:00 AM)
  const dayEnd = resolveWakingWindow(undefined, undefined).endMinutes; // default sleep window end
  return { dayStart, dayEnd };
}

// ── findAvailableSlots ───────────────────────────────────────────────────────

test("empty day: one gap spanning the whole configured window", () => {
  const { dayStart, dayEnd } = defaultBounds();
  const gaps = findAvailableSlots([], DATE, undefined);
  assert.deepEqual(gaps, [{ startMinutes: dayStart, endMinutes: dayEnd }]);
});

test("single mid-day task: exactly two gaps, before and after", () => {
  const { dayStart, dayEnd } = defaultBounds();
  const tasks = [task({ startTime: "12:00", endTime: "13:00" })]; // 720-780
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  assert.deepEqual(gaps, [
    { startMinutes: dayStart, endMinutes: 720 },
    { startMinutes: 780, endMinutes: dayEnd },
  ]);
});

test("back-to-back tasks: zero gap between them", () => {
  const tasks = [
    task({ id: "a", startTime: "09:00", endTime: "10:00" }),
    task({ id: "b", startTime: "10:00", endTime: "11:00" }),
  ];
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  // No gap should exist strictly between 540 (9:00) and 660 (11:00).
  const gapBetween = gaps.find((g) => g.startMinutes >= 540 && g.endMinutes <= 660);
  assert.equal(gapBetween, undefined);
});

test("overlapping tasks: merged into one busy interval, not double-counted", () => {
  const tasks = [
    task({ id: "a", startTime: "09:00", endTime: "11:00" }),
    task({ id: "b", startTime: "10:00", endTime: "12:00" }),
  ];
  const { dayStart, dayEnd } = defaultBounds();
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  assert.deepEqual(gaps, [
    { startMinutes: dayStart, endMinutes: 540 }, // before 9:00
    { startMinutes: 720, endMinutes: dayEnd },   // after 12:00
  ]);
});

test("overnight task is normalized and clipped against the day-end bound", () => {
  const tasks = [task({ startTime: "23:00", endTime: "01:00" })]; // wraps past midnight
  const { dayEnd } = defaultBounds();
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  // 23:00 = 1380 minutes; the default waking window ends at 1380 too, so this
  // task should consume right up to the bound with no trailing gap.
  assert.ok(gaps.every((g) => g.endMinutes <= dayEnd));
  assert.equal(gaps.some((g) => g.startMinutes >= 1380 && g.endMinutes <= dayEnd), false);
});

test("respects a configured dayStartTime", () => {
  const gaps = findAvailableSlots([], DATE, { dayStartTime: "08:00" });
  assert.equal(gaps[0].startMinutes, 8 * 60);
});

test("respects configured sleepHours — a shorter sleep need extends the trailing bound", () => {
  const shortSleep = findAvailableSlots([], DATE, { sleepHours: 6 });
  const longSleep = findAvailableSlots([], DATE, { sleepHours: 10 });
  assert.ok(shortSleep[0].endMinutes > longSleep[0].endMinutes, "less sleep -> later end-of-day bound");

  // Unset falls back to DEFAULT_SLEEP_HOURS.
  const unset = findAvailableSlots([], DATE, {});
  const { endMinutes: defaultEnd } = resolveWakingWindow(undefined, undefined);
  assert.equal(unset[0].endMinutes, defaultEnd);

  // Out-of-range clamps to the nearer bound rather than being ignored.
  const tooMuchSleep = findAvailableSlots([], DATE, { sleepHours: 99 });
  const { endMinutes: maxSleepEnd } = resolveWakingWindow(undefined, 99);
  assert.equal(tooMuchSleep[0].endMinutes, maxSleepEnd);
  assert.ok(tooMuchSleep[0].endMinutes < unset[0].endMinutes, "clamped-to-max sleep still shortens the waking window vs. the default");
});

test("isTaskScheduledOn gating: a skipped occurrence doesn't count as busy", () => {
  const tasks = [task({ startTime: "09:00", endTime: "10:00", exceptions: { [DATE]: { skipped: true } } })];
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  // The 9-10 window should now be free, i.e. no gap boundary sits at 540/600.
  assert.ok(gaps.some((g) => g.startMinutes <= 540 && g.endMinutes >= 600));
});

test("isTaskScheduledOn gating: outside activeFrom/activeUntil doesn't count as busy", () => {
  const tasks = [task({ startTime: "09:00", endTime: "10:00", activeFrom: "2026-09-01" })];
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  assert.ok(gaps.some((g) => g.startMinutes <= 540 && g.endMinutes >= 600));
});

test("isTaskScheduledOn gating: a 'once' recurrence for a different date doesn't count as busy", () => {
  const tasks = [task({ startTime: "09:00", endTime: "10:00", recurrence: { type: "once", dateISO: "2026-08-25" } })];
  const gaps = findAvailableSlots(tasks, DATE, undefined);
  assert.ok(gaps.some((g) => g.startMinutes <= 540 && g.endMinutes >= 600));
});

test("minimum-duration filtering: a tiny gap is dropped by default, surfaced with a lower floor", () => {
  const tasks = [
    task({ id: "a", startTime: "09:00", endTime: "10:00" }),
    task({ id: "b", startTime: "10:05", endTime: "11:00" }), // 5-minute gap between a and b
  ];
  const defaultGaps = findAvailableSlots(tasks, DATE, undefined);
  assert.equal(defaultGaps.some((g) => g.startMinutes === 600 && g.endMinutes === 605), false);

  const lowFloor = findAvailableSlots(tasks, DATE, undefined, { minDurationMinutes: 1 });
  assert.equal(lowFloor.some((g) => g.startMinutes === 600 && g.endMinutes === 605), true);
});

// ── suggestSlots ─────────────────────────────────────────────────────────────

test("suggestSlots caps at maxSuggestions, prefers larger gaps, returns chronological order", () => {
  const gaps = [
    { startMinutes: 240, endMinutes: 300 },   // 60 min (early)
    { startMinutes: 600, endMinutes: 900 },   // 300 min (largest)
    { startMinutes: 1000, endMinutes: 1100 }, // 100 min
    { startMinutes: 1200, endMinutes: 1230 }, // 30 min (too small for 60-min asks below)
  ];
  const suggestions = suggestSlots(gaps, 60, 2);
  assert.equal(suggestions.length, 2);
  // Largest two gaps (600-900 and 1000-1100) become 60-min suggestions,
  // returned in chronological order.
  assert.deepEqual(suggestions, [
    { startMinutes: 600, endMinutes: 660 },
    { startMinutes: 1000, endMinutes: 1060 },
  ]);
});

test("suggestSlots excludes gaps smaller than the requested duration", () => {
  const gaps = [{ startMinutes: 0, endMinutes: 20 }];
  assert.deepEqual(suggestSlots(gaps, 30), []);
});

test("suggestSlots defaults maxSuggestions to 3", () => {
  const gaps = [
    { startMinutes: 0, endMinutes: 100 },
    { startMinutes: 200, endMinutes: 300 },
    { startMinutes: 400, endMinutes: 500 },
    { startMinutes: 600, endMinutes: 700 },
  ];
  assert.equal(suggestSlots(gaps, 30).length, 3);
});
