/**
 * Coverage for lib/ai/context/planGenerationContext.ts — the prompt context the
 * AI plan creator generates into.
 *
 * The case that matters most here is commitments. Held time (a commute, office
 * hours, an appointment) used to be dropped from this context by an
 * `isTrackedTask` filter, which answers "does this count toward a completion
 * statistic" — a different question from "is this time already spoken for".
 * The model was therefore shown an empty work day and planned into it. These
 * tests pin the corrected behaviour so the filter can't quietly come back.
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

const { buildTaskGenerationContext } = await import("@/lib/ai/context/planGenerationContext.ts");

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function emptyActivities() {
  return Object.fromEntries(DAY_KEYS.map((d) => [d, []]));
}

function schedule(overrides = {}) {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: emptyActivities(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    title: "Task",
    startTime: "09:00",
    endTime: "10:00",
    planId: "p1",
    ...overrides,
  };
}

test("a commitment is surfaced as fixed, immovable time", () => {
  const ctx = buildTaskGenerationContext(
    schedule({
      activities: {
        ...emptyActivities(),
        monday: [activity({ title: "Office hours", startTime: "09:00", endTime: "18:00", taskType: "commitment", planId: "" })],
      },
    }),
    "monday",
  );

  assert.match(ctx, /Fixed commitments today/i);
  assert.match(ctx, /immovable/i);
  assert.match(ctx, /Office hours \(09:00–18:00\)/);
});

test("commitments and tracked tasks are listed under separate headings", () => {
  const ctx = buildTaskGenerationContext(
    schedule({
      activities: {
        ...emptyActivities(),
        tuesday: [
          activity({ title: "Commute", startTime: "08:00", endTime: "09:00", taskType: "commitment", planId: "" }),
          activity({ title: "Study block", startTime: "19:00", endTime: "20:00" }),
        ],
      },
    }),
    "tuesday",
  );

  assert.match(ctx, /Fixed commitments today[^]*Commute/);
  assert.match(ctx, /Today's schedule:[^]*Study block/);
  // A commitment is held time, never an execution task — it must not be
  // repeated under the tracked heading.
  const trackedSection = ctx.slice(ctx.indexOf("Today's schedule:"));
  assert.ok(!trackedSection.includes("Commute"));
});

test("no commitments means no commitments heading at all", () => {
  const ctx = buildTaskGenerationContext(
    schedule({
      activities: { ...emptyActivities(), wednesday: [activity({ title: "Deep work" })] },
    }),
    "wednesday",
  );

  assert.ok(!/Fixed commitments/i.test(ctx));
  assert.match(ctx, /Today's schedule:[^]*Deep work/);
});

test("an empty day produces empty context rather than dangling headings", () => {
  assert.equal(buildTaskGenerationContext(schedule(), "friday"), "");
});

test("today's rituals are included", () => {
  const ctx = buildTaskGenerationContext(
    schedule({ rituals: [{ id: "r1", title: "Meditate", time: "07:00" }] }),
    "saturday",
  );
  assert.match(ctx, /Today's rituals:[^]*Meditate at 07:00/);
});
