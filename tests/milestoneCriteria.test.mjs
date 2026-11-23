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

const { milestoneCriteria, criteriaMet, milestonesReadyToComplete, completeMilestones, undoAutoComplete } =
  await import("@/packages/core/lib/milestoneCriteria.ts");

// September 2026: the 1st is a Tuesday.
const NOW = new Date("2026-09-15T12:00:00");

function milestone(overrides = {}) {
  return {
    id: "m1", planId: "p1", title: "M", startDate: "2026-09-01", plannedDurationDays: 30,
    plannedEndDate: "2026-09-30", status: "active", linkedActivities: [], linkedTrackers: [],
    linkedRituals: [], createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
    sortOrder: 0, ...overrides,
  };
}
const weight = { id: "w", planId: "p1", title: "Weight", type: "number", unit: "kg", goalDirection: "decrease_good", startingValue: 80, goalValue: 70 };
const pages = { id: "pg", planId: "p1", title: "Pages", type: "number", unit: "pages", startingValue: 0, goalValue: 300 };
const entry = (trackerId, date, value) => ({ id: `${trackerId}-${date}`, planId: "p1", trackerId, date, value });
const done = (date) => ({ id: `e-${date}`, completedAt: `${date}T08:00:00`, completionType: "task" });
// A one-off per date, so "due" is exactly the dates listed.
function oneOffs(dates, doneDates = []) {
  const tasks = dates.map((date) => ({
    id: `t-${date}`, planId: "p1", title: date, startTime: "7:00 AM", endTime: "8:00 AM",
    recurrence: { type: "once", dateISO: date },
    completionHistory: doneDates.includes(date) ? [done(date)] : [],
  }));
  const activities = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  const DAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const t of tasks) activities[DAY[new Date(`${t.recurrence.dateISO}T00:00:00`).getDay()]].push(t);
  return activities;
}
const ctx = (over = {}) => ({ activities: oneOffs([]), trackers: [weight, pages], metricEntries: [], ...over });

// ── Tracker targets ─────────────────────────────────────────────────────────

test("no targets means no criteria, and nothing to complete", () => {
  assert.deepEqual(milestoneCriteria(milestone(), ctx(), NOW), []);
  assert.equal(criteriaMet([]), false);
});

test("a tracker target is met in the tracker's good direction, from the latest entry", () => {
  const m = milestone({ trackerTargets: { w: 75, pg: 100 } });
  const c = milestoneCriteria(m, ctx({ metricEntries: [entry("w", "2026-09-02", 74), entry("w", "2026-09-10", 76), entry("pg", "2026-09-10", 120)] }), NOW);
  assert.deepEqual(c.map((x) => [x.trackerId, x.current, x.met]), [["w", 76, false], ["pg", 120, true]]);
  assert.equal(criteriaMet(c), false, "every target must be met");
});

test("future and pre-tracking entries don't count", () => {
  const m = milestone({ trackerTargets: { pg: 100 } });
  const c = milestoneCriteria(m, ctx({ trackingStart: "2026-09-05", metricEntries: [entry("pg", "2026-09-01", 150), entry("pg", "2026-09-20", 150)] }), NOW);
  assert.equal(c[0].current, null);
  assert.equal(c[0].met, false);
});

test("the legacy single targetValue is a criterion too", () => {
  const m = milestone({ linkedTrackers: ["w"], targetValue: 75 });
  const c = milestoneCriteria(m, ctx({ metricEntries: [entry("w", "2026-09-10", 74)] }), NOW);
  assert.equal(criteriaMet(c), true);
});

// ── Consistency target ──────────────────────────────────────────────────────

test("consistency counts the plan's tasks due across the whole milestone", () => {
  const dates = ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"];
  const m = milestone({ consistencyTarget: 75 });
  const two = milestoneCriteria(m, ctx({ activities: oneOffs(dates, dates.slice(0, 2)) }), NOW)[0];
  assert.deepEqual([two.completed, two.expectedTotal, two.needed, two.met], [2, 4, 3, false]);
  // Three of four done can't drop below 75%, so it's met before the end date.
  const three = milestoneCriteria(m, ctx({ activities: oneOffs(dates, dates.slice(0, 3)) }), new Date("2026-09-17T12:00:00"))[0];
  assert.equal(three.met, true);
});

test("both kinds together: complete only when both are met", () => {
  const dates = ["2026-09-02", "2026-09-09"];
  const m = milestone({ consistencyTarget: 50, trackerTargets: { pg: 100 } });
  const tasksOnly = milestoneCriteria(m, ctx({ activities: oneOffs(dates, dates) }), NOW);
  assert.equal(criteriaMet(tasksOnly), false);
  const both = milestoneCriteria(m, ctx({ activities: oneOffs(dates, dates), metricEntries: [entry("pg", "2026-09-12", 100)] }), NOW);
  assert.equal(criteriaMet(both), true);
});

// ── Completing ──────────────────────────────────────────────────────────────

function schedule(milestones, over = {}) {
  return {
    plans: [{ id: "p1", title: "P", category: "fitness", emoji: "run", color: "emerald", items: [], startDate: "2026-09-01" }],
    activities: oneOffs([]), progressTrackers: [weight, pages], metricEntries: [entry("pg", "2026-09-10", 120)],
    milestones, rituals: [], ritualCompletions: [], categories: [], notes: [], goals: [], events: [], preferences: {}, ...over,
  };
}

test("ready: met and open; not ready once completed or handed back", () => {
  const met = milestone({ trackerTargets: { pg: 100 } });
  assert.deepEqual(milestonesReadyToComplete(schedule([met]), NOW).map((m) => m.id), ["m1"]);
  assert.deepEqual(milestonesReadyToComplete(schedule([{ ...met, status: "completed", actualCompletedDate: "2026-09-12" }]), NOW), []);
  assert.deepEqual(milestonesReadyToComplete(schedule([{ ...met, autoComplete: false }]), NOW), []);
});

test("a paused plan's milestones don't complete themselves", () => {
  const met = milestone({ trackerTargets: { pg: 100 } });
  const paused = schedule([met], { plans: [{ id: "p1", title: "P", category: "fitness", emoji: "run", color: "emerald", items: [], status: "paused" }] });
  assert.deepEqual(milestonesReadyToComplete(paused, NOW), []);
});

test("complete, then undo: back as it was and handed to the person", () => {
  const met = milestone({ trackerTargets: { pg: 100 } });
  const s = schedule([met]);
  const completed = completeMilestones(s, ["m1"], "2026-09-15");
  assert.equal(completed.milestones[0].status, "completed");
  assert.equal(completed.milestones[0].actualCompletedDate, "2026-09-15");
  const undone = undoAutoComplete(completed, [met]);
  assert.notEqual(undone.milestones[0].status, "completed");
  assert.equal(undone.milestones[0].autoComplete, false);
  assert.deepEqual(milestonesReadyToComplete(undone, NOW), []);
});
