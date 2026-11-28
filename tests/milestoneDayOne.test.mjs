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

const { calculateMilestoneState, gettingStartedDays } = await import("@/packages/core/lib/milestoneHealth.ts");
const { proposeAdaptations } = await import("@/packages/core/lib/milestoneAdaptation.ts");

// A new "Morning Fitness"-style plan: two daily tasks, a one-week first
// milestone that starts today (Thursday 2026-11-26), and three later ones.
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const task = (id, history = []) => ({ id, planId: "p1", title: id, startTime: "6:00 AM", endTime: "7:00 AM", completionHistory: history });
const doneOn = (iso) => [{ id: `e-${iso}`, completedAt: `${iso}T08:00:00`, completionType: "task" }];
const plan = { id: "p1", title: "Morning Fitness", emoji: "🎯", color: "emerald", items: [], status: "active" };
const milestone = (overrides = {}) => ({
  id: "m1", planId: "p1", title: "First week complete", startDate: "2026-11-26", plannedDurationDays: 7,
  plannedEndDate: "2026-12-02", status: "active", linkedActivities: [], linkedTrackers: [], linkedRituals: [],
  createdAt: "2026-11-26T00:00:00Z", updatedAt: "2026-11-26T00:00:00Z", sortOrder: 0, ...overrides,
});
const later = [1, 2, 3].map((n) => milestone({ id: `m${n + 1}`, title: `Later ${n}`, sortOrder: n, startDate: "2026-12-03", plannedEndDate: "2027-01-01", plannedDurationDays: 30 }));

function activitiesWith(workoutHistory) {
  return Object.fromEntries(DAYS.map((d) => [d, [task("workout", workoutHistory), task("stretch")]]));
}
function stateAt(m, activities, nowISO) {
  return calculateMilestoneState({ milestone: m, plan, activities, trackers: [], metricEntries: [], now: new Date(`${nowISO}T14:00:00`) });
}

test("a short milestone gets a shorter grace period, a long one the full week", () => {
  assert.equal(gettingStartedDays(milestone()), 3);
  assert.equal(gettingStartedDays(milestone({ plannedEndDate: "2026-12-25" })), 7);
  assert.equal(gettingStartedDays(milestone({ plannedEndDate: "2026-11-27" })), 2);
});

test("doing the first task on day one never makes the milestone at risk", () => {
  const state = stateAt(milestone(), activitiesWith(doneOn("2026-11-26")), "2026-11-26");
  assert.equal(state.health, "getting_started");
});

test("the day-one forecast reads the rate since the milestone began, not over two weeks", () => {
  const state = stateAt(milestone(), activitiesWith(doneOn("2026-11-26")), "2026-11-26");
  // One session in one day is ~7 a week; 13 remain → about two weeks, not months.
  assert.ok(state.forecastDate !== null);
  assert.ok(state.forecastDate <= "2026-12-12", state.forecastDate);
});

test("past the grace period a real slip is still flagged", () => {
  const state = stateAt(milestone(), activitiesWith(doneOn("2026-11-26")), "2026-11-29");
  assert.ok(state.health === "at_risk" || state.health === "delayed", state.health);
});

test("an extension is never longer than the milestone (or two weeks), even on a far forecast", () => {
  const m = milestone();
  const schedule = { activities: activitiesWith(doneOn("2026-11-26")), milestones: [m, ...later], plans: [plan], preferences: {} };
  const state = { ...stateAt(m, schedule.activities, "2026-11-29"), forecastDate: "2027-05-27", health: "at_risk", hasData: true };
  const offers = proposeAdaptations({ milestone: m, plan, state, schedule, now: new Date("2026-11-29T14:00:00") });
  const extend = offers.find((o) => o.adaptation.kind === "extend_target");
  assert.ok(extend);
  assert.equal(extend.adaptation.daysAdded, 14);
  assert.equal(extend.label, "Extend target by 14 days");
  assert.match(extend.rationale, /would finish May 27/);
});

test("a forecast within the cap still moves the target to match it", () => {
  const m = milestone();
  const schedule = { activities: activitiesWith(doneOn("2026-11-26")), milestones: [m], plans: [plan], preferences: {} };
  const state = { ...stateAt(m, schedule.activities, "2026-11-29"), forecastDate: "2026-12-09", health: "at_risk", hasData: true };
  const extend = proposeAdaptations({ milestone: m, plan, state, schedule, now: new Date("2026-11-29T14:00:00") })
    .find((o) => o.adaptation.kind === "extend_target");
  assert.equal(extend.adaptation.newEndDate, "2026-12-09");
  assert.match(extend.rationale, /moves the target to match/);
});
