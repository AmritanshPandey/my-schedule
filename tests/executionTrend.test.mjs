/**
 * Coverage for lib/executionAnalytics.ts — the weekly done/missed counts on
 * the "Task completion trend" card and the Overview's "N missed".
 *
 * What these protect:
 *  1. One occurrence is counted once. A recurring task lives in several
 *     weekday buckets under one id, and those copies can carry the same
 *     completion log; counting per bucket multiplied a single miss by the
 *     number of copies (6 missed beside 3 of 6 done).
 *  2. Done + missed never exceeds what was scheduled.
 *  3. Nothing before the tracking start counts — not its days, not its
 *     done or missed events — so moving the start date actually resets the
 *     week, as the setting promises.
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
        return resolveWithTsFallback(url, context, nextResolve);
      }
      throw error;
    }
  },
});

const { computeExecutionTrend } = await import("@/lib/executionAnalytics.ts");

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
// Sunday 2026-11-01: this week runs Monday 2026-10-26 → today.
const NOW = new Date("2026-11-01T18:00:00");
const WEEK = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];

function ev(type, dateISO, hour = 12) {
  return { id: `${type}-${dateISO}`, taskId: "t", completedAt: new Date(`${dateISO}T${String(hour).padStart(2, "0")}:00:00`).toISOString(), completionType: type };
}

function schedule(activities, preferences = {}) {
  return {
    goals: [], goalConnections: [], plans: [], categories: [], progressTrackers: [], metricEntries: [],
    milestones: [], rituals: [], ritualCompletions: [], notes: [], events: [], preferences,
    activities: { ...Object.fromEntries(ALL_DAYS.map((d) => [d, []])), ...activities },
  };
}

/** One daily task whose every weekday copy carries the same log. */
function dailySharedHistory(history) {
  const task = { id: "t", title: "Daily", startTime: "7:00 AM", endTime: "8:00 AM", completionHistory: history };
  return Object.fromEntries(ALL_DAYS.map((d) => [d, [{ ...task }]]));
}

test("a shared log across weekday copies counts each occurrence once", () => {
  const history = [ev("missed", WEEK[0]), ev("task", WEEK[1]), ev("missed", WEEK[2])];
  const trend = computeExecutionTrend(schedule(dailySharedHistory(history)), 2, NOW);
  assert.equal(trend.current.scheduled, 7);
  assert.equal(trend.current.completed, 1);
  assert.equal(trend.current.missed, 2);
  assert.equal(trend.currentMissed, 2);
});

test("done plus missed never exceeds scheduled", () => {
  const history = WEEK.flatMap((d) => [ev("missed", d), ev("task", d)]);
  const trend = computeExecutionTrend(schedule(dailySharedHistory(history)), 2, NOW);
  // A completion wins over a miss for the same occurrence.
  assert.equal(trend.current.completed, 7);
  assert.equal(trend.current.missed, 0);
});

test("a late-night tick still counts for its task", () => {
  // Monday's 11 PM task ticked at 00:30 Tuesday lives only in Monday's bucket.
  const activities = { monday: [{ id: "late", title: "Late", startTime: "11:00 PM", endTime: "11:30 PM", completionHistory: [{ ...ev("task", WEEK[1], 0), taskId: "late" }] }] };
  const trend = computeExecutionTrend(schedule(activities), 2, NOW);
  assert.equal(trend.current.completed, 1);
});

test("days and events before the tracking start don't count", () => {
  const history = [ev("missed", WEEK[0]), ev("missed", WEEK[1]), ev("missed", WEEK[2]), ev("task", WEEK[4])];
  // Tracking starts Thursday: Thu–Sun are scheduled, and only Friday's done counts.
  const trend = computeExecutionTrend(schedule(dailySharedHistory(history), { startDate: WEEK[3] }), 2, NOW);
  assert.equal(trend.current.scheduled, 4);
  assert.equal(trend.current.completed, 1);
  assert.equal(trend.current.missed, 0);
});
