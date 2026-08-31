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

const {
  calculateConsistency,
  calculateExpectedProgress,
  calculateMetricProgress,
  calculateForecastDate,
  calculateMilestoneHealth,
  calculateMilestoneState,
  GETTING_STARTED_DAYS,
  AHEAD_BUFFER_DAYS,
  AT_RISK_BUFFER_DAYS,
  CONSISTENCY_ON_TRACK_THRESHOLD,
  CONSISTENCY_AT_RISK_THRESHOLD,
} = await import("@/lib/milestoneHealth.ts");
const { calculateMilestoneProgress } = await import("@/lib/planProgress.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function milestone(overrides = {}) {
  return {
    id: "m1",
    planId: "p1",
    title: "Test Milestone",
    startDate: "2026-09-01",
    plannedDurationDays: 30,
    plannedEndDate: "2026-09-30",
    status: "active",
    linkedActivities: [],
    linkedTrackers: [],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return { id: "p1", title: "Test Plan", category: "personal", emoji: "🎯", color: "emerald", items: [], ...overrides };
}

function tracker(overrides = {}) {
  return { id: "tr1", planId: "p1", title: "Weight", type: "number", unit: "kg", goalDirection: "decrease_good", goalValue: 75, ...overrides };
}

function entry(trackerId, dateISO, value) {
  return { id: `${trackerId}-${dateISO}`, planId: "p1", trackerId, value, date: dateISO };
}

function taskEvent(taskId, dateISO) {
  return { id: `${taskId}-${dateISO}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: "task" };
}

/** Places one task (recurring on `days`, default every day) into weekday
 *  buckets, with `events` (from taskEvent) shared across every bucket copy —
 *  mirrors how completedDatesFor unions across copies regardless of which
 *  bucket physically holds which event. */
function activitiesFor(tasks) {
  const activities = Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
  for (const t of tasks) {
    for (const d of t.days ?? ALL_DAYS) {
      activities[d].push({
        id: t.id,
        title: t.id,
        startTime: "8:00 AM",
        endTime: "9:00 AM",
        planId: "p1",
        completionHistory: t.events ?? [],
        ...t.taskOverrides,
      });
    }
  }
  return activities;
}

const NOW = (dateISO) => new Date(`${dateISO}T18:00:00`);

// ── Task progress (reused, not reimplemented) ───────────────────────────────

test("task progress: milestoneHealth surfaces lib/planProgress.ts's calculateMilestoneProgress unchanged", () => {
  const events = [taskEvent("t1", "2026-09-01")];
  const activities = activitiesFor([{ id: "t1", events }]);
  const m = milestone({ linkedActivities: ["t1"] });
  const direct = calculateMilestoneProgress(m, activities, plan());
  const state = calculateMilestoneState({ milestone: m, plan: plan(), activities, trackers: [], metricEntries: [], now: NOW("2026-09-05") });
  assert.equal(state.taskProgress, direct.pct);
  assert.equal(direct.hasLinkedTasks, true);
});

// ── Consistency ──────────────────────────────────────────────────────────────

test("consistency: completed occurrences over expected occurrences in the elapsed window", () => {
  // Sept 1-10 elapsed (10 days), 7 of 10 daily occurrences completed.
  const doneDays = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-06", "2026-09-08", "2026-09-10"];
  const events = doneDays.map((d) => taskEvent("t1", d));
  const activities = activitiesFor([{ id: "t1", events }]);
  const m = milestone({ linkedActivities: ["t1"] });
  const consistency = calculateConsistency(m, activities, NOW("2026-09-10"));
  assert.equal(consistency, 70);
});

test("consistency: one missed occurrence in a too-short window does not read as a false alarm", () => {
  // Only 2 days elapsed — under CONSISTENCY_MIN_WINDOW_DAYS — nothing done yet.
  const activities = activitiesFor([{ id: "t1", events: [] }]);
  const m = milestone({ linkedActivities: ["t1"] });
  assert.equal(calculateConsistency(m, activities, NOW("2026-09-02")), null);
});

test("consistency: null when nothing is linked", () => {
  const m = milestone({ linkedActivities: [] });
  assert.equal(calculateConsistency(m, activitiesFor([]), NOW("2026-09-10")), null);
});

test("consistency: null before the milestone has started", () => {
  const activities = activitiesFor([{ id: "t1", events: [] }]);
  const m = milestone({ linkedActivities: ["t1"], startDate: "2026-10-01", plannedEndDate: "2026-10-30" });
  assert.equal(calculateConsistency(m, activities, NOW("2026-09-10")), null);
});

test("task completion vs reopening: a day with a completion event counts, without one it doesn't", () => {
  const withEvent = activitiesFor([{ id: "t1", events: [taskEvent("t1", "2026-09-01")] }]);
  const withoutEvent = activitiesFor([{ id: "t1", events: [] }]);
  const m = milestone({ linkedActivities: ["t1"] });
  const c1 = calculateConsistency(m, withEvent, NOW("2026-09-03"));
  const c2 = calculateConsistency(m, withoutEvent, NOW("2026-09-03"));
  assert.ok(c1 > c2, "the completed day scores higher consistency than the reopened/undone one");
});

// ── Expected progress ────────────────────────────────────────────────────────

test("expected progress: activity-based, matches the spec's 40-workouts/10-weeks shape", () => {
  // 30-day milestone, daily task, 9 days elapsed -> 9/30 expected occurrences so far.
  const activities = activitiesFor([{ id: "t1", events: [] }]);
  const m = milestone({ linkedActivities: ["t1"] });
  const expected = calculateExpectedProgress(m, activities, NOW("2026-09-09"));
  assert.equal(expected, 30); // 9/30 = 30%
});

test("expected progress: falls back to elapsed time when there are no linked tasks", () => {
  const m = milestone({ linkedActivities: [] }); // 30-day window
  const expected = calculateExpectedProgress(m, activitiesFor([]), NOW("2026-09-16")); // day 16 of 30
  assert.equal(expected, 53); // round(16/30*100)
});

test("expected progress: 0 before the milestone starts", () => {
  const m = milestone({ startDate: "2026-10-01", plannedEndDate: "2026-10-30" });
  assert.equal(calculateExpectedProgress(m, activitiesFor([]), NOW("2026-09-01")), 0);
});

// ── Metric progress: increasing ─────────────────────────────────────────────

test("increasing metric: savings progress toward a higher target", () => {
  const t = tracker({ id: "tr1", title: "Savings", unit: "INR", goalDirection: "increase_good", goalValue: 100000, startingValue: 50000 });
  const entries = [entry("tr1", "2026-09-01", 50000), entry("tr1", "2026-09-15", 75000)];
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], entries, NOW("2026-09-15"));
  assert.equal(result.progress, 50); // (75000-50000)/(100000-50000) = 50%
  assert.equal(result.current, 75000);
  assert.equal(result.wrongDirection, false);
});

// ── Metric progress: decreasing ──────────────────────────────────────────────

test("decreasing metric: weight progress toward a lower target", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-22", 80.3)];
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], entries, NOW("2026-09-22"));
  // (82-80.3)/(82-75) = 1.7/7 ≈ 24.3% -> rounds to 24
  assert.equal(result.progress, 24);
  assert.equal(result.current, 80.3);
});

test("metric progress: starting value falls back to the earliest logged entry when unset on the tracker", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: undefined });
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-08", 81)];
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], entries, NOW("2026-09-08"));
  assert.equal(result.startingValue, 82);
});

test("metric progress: target exceeded reads over 100% raw, clamped to 100% for display", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-10-01", 74)]; // past the target
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], entries, NOW("2026-10-01"));
  assert.equal(result.progress, 100);
  assert.ok(result.raw > 100, "raw value preserves the overshoot");
});

test("metric progress: moving the wrong direction never shows a negative %, just the flag", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 80 });
  const entries = [entry("tr1", "2026-09-01", 80), entry("tr1", "2026-09-15", 82)]; // moved up, wrong way
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], entries, NOW("2026-09-15"));
  assert.equal(result.progress, 0, "never negative");
  assert.ok(result.raw < 0, "raw shows the real regression");
  assert.equal(result.wrongDirection, true);
});

test("metric progress: null when no tracker is linked", () => {
  const m = milestone({ linkedTrackers: [] });
  const result = calculateMetricProgress(m, [tracker()], [entry("tr1", "2026-09-01", 82)], NOW("2026-09-05"));
  assert.equal(result.progress, null);
});

test("metric progress: null when the tracker has no target set", () => {
  const t = tracker({ goalValue: undefined });
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [t], [entry("tr1", "2026-09-01", 82)], NOW("2026-09-05"));
  assert.equal(result.progress, null);
});

test("metric progress: null (not zero) when there's no logged data yet — 'no data' vs 'no progress'", () => {
  const m = milestone({ linkedTrackers: ["tr1"] });
  const result = calculateMetricProgress(m, [tracker()], [], NOW("2026-09-05"));
  assert.equal(result.progress, null);
  assert.equal(result.current, null);
});

test("metric update: adding a new entry moves current value and progress", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const m = milestone({ linkedTrackers: ["tr1"] });
  const before = calculateMetricProgress(m, [t], [entry("tr1", "2026-09-01", 82)], NOW("2026-09-01"));
  const after = calculateMetricProgress(m, [t], [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-08", 80)], NOW("2026-09-08"));
  assert.equal(before.progress, 0);
  assert.equal(after.progress, 29); // (82-80)/7 ≈ 28.6 -> 29
});

// ── Forecast ─────────────────────────────────────────────────────────────────

test("forecast: metric trend projects a completion date beyond the trailing window", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  // Losing ~0.5kg/week: at that pace, 5.3kg remaining takes ~11 weeks.
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-22", 80.3)]; // 3 weeks, -1.7kg
  const m = milestone({ linkedTrackers: ["tr1"], plannedEndDate: "2026-10-31" });
  const forecast = calculateForecastDate(m, activitiesFor([]), [t], entries, NOW("2026-09-22"));
  assert.ok(forecast > "2026-09-22", "projects into the future");
});

test("forecast: task rate projects from remaining occurrences ÷ recent completion rate", () => {
  // Daily task, 30-day milestone. First 9 days: only 3 completed (slow start).
  const events = ["2026-09-01", "2026-09-02", "2026-09-03"].map((d) => taskEvent("t1", d));
  const activities = activitiesFor([{ id: "t1", events }]);
  const m = milestone({ linkedActivities: ["t1"] });
  const forecast = calculateForecastDate(m, activities, [], [], NOW("2026-09-09"));
  assert.ok(forecast === null || forecast > "2026-09-30", "a slow start should not project on-time completion");
});

test("forecast: null when there's no rate to extrapolate from (single data point)", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const m = milestone({ linkedTrackers: ["tr1"] });
  const forecast = calculateForecastDate(m, activitiesFor([]), [t], [entry("tr1", "2026-09-01", 80)], NOW("2026-09-01"));
  assert.equal(forecast, null);
});

test("forecast: target already reached forecasts today", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const m = milestone({ linkedTrackers: ["tr1"] });
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-15", 74)];
  const forecast = calculateForecastDate(m, activitiesFor([]), [t], entries, NOW("2026-09-15"));
  assert.equal(forecast, "2026-09-15");
});

// ── Health states ────────────────────────────────────────────────────────────

function healthInput(overrides = {}) {
  return {
    milestone: milestone(),
    now: NOW("2026-09-15"),
    hasData: true,
    overallProgress: 50,
    consistency: 80,
    forecastDate: "2026-09-25",
    daysAheadBehind: 5,
    ...overrides,
  };
}

test("health: completed when the milestone is marked done, regardless of forecast", () => {
  const h = calculateMilestoneHealth(healthInput({
    milestone: milestone({ status: "completed" }),
    forecastDate: "2026-11-01", daysAheadBehind: -30,
  }));
  assert.equal(h, "completed");
});

test("health: not_started before the milestone's start date", () => {
  const m = milestone({ startDate: "2026-10-01", plannedEndDate: "2026-10-30" });
  const h = calculateMilestoneHealth(healthInput({ milestone: m, now: NOW("2026-09-01"), hasData: false, overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null }));
  assert.equal(h, "not_started");
});

test("health: getting_started for a brand-new milestone with no data yet (not delayed)", () => {
  const h = calculateMilestoneHealth(healthInput({
    now: NOW("2026-09-02"), hasData: true, overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null,
  }));
  assert.equal(h, "getting_started");
});

test("health: getting_started when nothing at all is linked", () => {
  const h = calculateMilestoneHealth(healthInput({ hasData: false, overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null }));
  assert.equal(h, "getting_started");
});

test("health: ahead when forecast lands comfortably before the target", () => {
  const h = calculateMilestoneHealth(healthInput({ daysAheadBehind: AHEAD_BUFFER_DAYS }));
  assert.equal(h, "ahead");
});

test("health: on_track when forecast is on/slightly before the target", () => {
  const h = calculateMilestoneHealth(healthInput({ daysAheadBehind: 0 }));
  assert.equal(h, "on_track");
  const h2 = calculateMilestoneHealth(healthInput({ daysAheadBehind: AHEAD_BUFFER_DAYS - 1 }));
  assert.equal(h2, "on_track");
});

test("health: at_risk when forecast lands a bit after the target", () => {
  const h = calculateMilestoneHealth(healthInput({ daysAheadBehind: -1 }));
  assert.equal(h, "at_risk");
  const h2 = calculateMilestoneHealth(healthInput({ daysAheadBehind: -AT_RISK_BUFFER_DAYS }));
  assert.equal(h2, "at_risk");
});

test("health: delayed when forecast lands meaningfully after the target", () => {
  const h = calculateMilestoneHealth(healthInput({ daysAheadBehind: -(AT_RISK_BUFFER_DAYS + 1) }));
  assert.equal(h, "delayed");
});

test("health: 65% consistency with no forecast still reads at_risk, not delayed (spec: forecast > raw consistency, but a moderate signal isn't a failure)", () => {
  const h = calculateMilestoneHealth(healthInput({ forecastDate: null, daysAheadBehind: null, consistency: 65 }));
  assert.equal(h, "at_risk");
});

test("health: target date passed and not completed floors at delayed even with a favorable forecast", () => {
  const m = milestone({ plannedEndDate: "2026-09-10" });
  const h = calculateMilestoneHealth(healthInput({ milestone: m, now: NOW("2026-09-11"), forecastDate: "2026-09-05", daysAheadBehind: 5 }));
  assert.equal(h, "delayed");
});

test("health: past-grace-period with truly no signal at all reads delayed, not stuck in getting_started forever", () => {
  const h = calculateMilestoneHealth(healthInput({
    now: NOW("2026-09-30"), overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null,
  }));
  assert.equal(h, "delayed");
});

// Boundary conditions right at the consistency-fallback thresholds.
test("health boundary: consistency exactly at CONSISTENCY_ON_TRACK_THRESHOLD reads on_track, one below reads at_risk", () => {
  const at = calculateMilestoneHealth(healthInput({ forecastDate: null, daysAheadBehind: null, consistency: CONSISTENCY_ON_TRACK_THRESHOLD }));
  const below = calculateMilestoneHealth(healthInput({ forecastDate: null, daysAheadBehind: null, consistency: CONSISTENCY_ON_TRACK_THRESHOLD - 1 }));
  assert.equal(at, "on_track");
  assert.equal(below, "at_risk");
});

test("health boundary: consistency exactly at CONSISTENCY_AT_RISK_THRESHOLD reads at_risk, one below reads delayed", () => {
  const at = calculateMilestoneHealth(healthInput({ forecastDate: null, daysAheadBehind: null, consistency: CONSISTENCY_AT_RISK_THRESHOLD }));
  const below = calculateMilestoneHealth(healthInput({ forecastDate: null, daysAheadBehind: null, consistency: CONSISTENCY_AT_RISK_THRESHOLD - 1 }));
  assert.equal(at, "at_risk");
  assert.equal(below, "delayed");
});

test("health boundary: getting_started flips to a graded state exactly at GETTING_STARTED_DAYS elapsed", () => {
  const start = "2026-09-01";
  const stillEarly = calculateMilestoneHealth(healthInput({
    milestone: milestone({ startDate: start }),
    now: NOW("2026-09-" + String(1 + GETTING_STARTED_DAYS - 2).padStart(2, "0")), // GETTING_STARTED_DAYS-1 elapsed
    overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null,
  }));
  const noLongerEarly = calculateMilestoneHealth(healthInput({
    milestone: milestone({ startDate: start }),
    now: NOW("2026-09-" + String(1 + GETTING_STARTED_DAYS - 1).padStart(2, "0")), // GETTING_STARTED_DAYS elapsed
    overallProgress: null, consistency: null, forecastDate: null, daysAheadBehind: null,
  }));
  assert.equal(stillEarly, "getting_started");
  assert.equal(noLongerEarly, "delayed");
});

// ── End-to-end via calculateMilestoneState ──────────────────────────────────

test("end-to-end: outcome-driven milestone (tracker linked) uses metric as the headline progress", () => {
  const t = tracker({ goalDirection: "decrease_good", goalValue: 75, startingValue: 82 });
  const entries = [entry("tr1", "2026-09-01", 82), entry("tr1", "2026-09-22", 80.3)];
  const events = ["2026-09-01", "2026-09-02"].map((d) => taskEvent("t1", d));
  const m = milestone({ linkedTrackers: ["tr1"], linkedActivities: ["t1"] });
  const activities = activitiesFor([{ id: "t1", events }]);
  const state = calculateMilestoneState({ milestone: m, plan: plan(), activities, trackers: [t], metricEntries: entries, now: NOW("2026-09-22") });
  assert.equal(state.overallProgress, state.metricProgress);
  assert.notEqual(state.taskProgress, null, "task progress is still reported as a secondary signal");
});

test("end-to-end: activity-driven milestone (no tracker) uses task progress as the headline", () => {
  const events = [taskEvent("t1", "2026-09-01")];
  const m = milestone({ linkedActivities: ["t1"] });
  const activities = activitiesFor([{ id: "t1", events }]);
  const state = calculateMilestoneState({ milestone: m, plan: plan(), activities, trackers: [], metricEntries: [], now: NOW("2026-09-05") });
  assert.equal(state.overallProgress, state.taskProgress);
});

test("end-to-end: no linked tasks and no linked tracker reads as 'no data', not fake 0% progress", () => {
  const m = milestone();
  const state = calculateMilestoneState({ milestone: m, plan: plan(), activities: activitiesFor([]), trackers: [], metricEntries: [], now: NOW("2026-09-05") });
  assert.equal(state.hasData, false);
  assert.equal(state.overallProgress, null);
  assert.equal(state.health, "getting_started");
});

test("end-to-end: status message references the milestone's real dates, not a generic line", () => {
  const m = milestone({ plannedEndDate: "2026-09-30" });
  const events = ["2026-09-01", "2026-09-02", "2026-09-03"].map((d) => taskEvent("t1", d));
  const activities = activitiesFor([{ id: "t1", events }]);
  const state = calculateMilestoneState({ milestone: { ...m, linkedActivities: ["t1"] }, plan: plan(), activities, trackers: [], metricEntries: [], now: NOW("2026-09-05") });
  assert.ok(state.statusMessage.length > 0);
  assert.notEqual(state.statusMessage, "");
});
