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

const { plannedTrackerPath, milestoneSpan, expectedValueOn, planGap, formatTrackerFigure } = await import("@/packages/core/lib/milestoneTargets.ts");
const {
  milestonesForTask, milestonesForTracker, milestonesForRitual, linkableMilestones,
  linkItem, unlinkItem, unlinkEverywhere,
} = await import("@/packages/core/lib/milestoneLinks.ts");
const { calculateMilestoneState, calculateConsistency, routineOccurrences, planProgressFromMilestones, linkedRoutineFollowThrough } = await import("@/packages/core/lib/milestoneHealth.ts");
const { migrate } = await import("@/packages/core/lib/scheduleMigrate.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

function milestone(overrides = {}) {
  return {
    id: "m1", planId: "p1", title: "M", startDate: "2026-09-01", plannedDurationDays: 30,
    plannedEndDate: "2026-09-30", status: "active", linkedActivities: [], linkedTrackers: [],
    linkedRituals: [], createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z",
    sortOrder: 0, ...overrides,
  };
}
const plan = { id: "p1", title: "P", category: "fitness", emoji: "🎯", color: "emerald", items: [] };
const distance = { id: "t1", planId: "p1", title: "Long run", type: "number", unit: "km", goalDirection: "increase_good", startingValue: 5, goalValue: 35 };
const entry = (date, value, trackerId = "t1") => ({ id: `${trackerId}-${date}`, planId: "p1", trackerId, value, date });

// Three milestones sharing one tracker, back to back over 90 days.
const base = milestone({ id: "base", startDate: "2026-07-01", plannedEndDate: "2026-07-30", linkedTrackers: ["t1"], sortOrder: 0 });
const half = milestone({ id: "half", startDate: "2026-07-31", plannedEndDate: "2026-08-29", linkedTrackers: ["t1"], sortOrder: 1 });
const thirty = milestone({ id: "thirty", startDate: "2026-08-30", plannedEndDate: "2026-09-28", linkedTrackers: ["t1"], sortOrder: 2 });

// ── Planned path / implied targets ───────────────────────────────────────────

test("goal-only: targets are implied by spreading the goal across milestones by date", () => {
  const path = plannedTrackerPath(distance, [base, half, thirty], []);
  assert.deepEqual(path.points.map((p) => [p.milestoneId ?? "origin", p.value]), [
    ["origin", 5], ["base", 14.78], ["half", 24.89], ["thirty", 35],
  ]);
  assert.equal(path.points[3].explicit, false);
});

test("explicit targets are kept and gaps interpolate between them", () => {
  const path = plannedTrackerPath(distance, [{ ...base, targetValue: 15 }, half, { ...thirty, targetValue: 30 }], []);
  assert.deepEqual(path.points.map((p) => p.value), [5, 15, 22.5, 30]);
  assert.equal(path.points[1].explicit, true);
  assert.equal(path.points[2].explicit, false);
});

test("no goal and no targets after a milestone: that milestone gets no checkpoint", () => {
  const noGoal = { ...distance, goalValue: undefined };
  const path = plannedTrackerPath(noGoal, [{ ...base, targetValue: 15 }, half], []);
  assert.deepEqual(path.points.map((p) => p.milestoneId ?? "origin"), ["origin", "base"]);
  assert.equal(plannedTrackerPath(noGoal, [half], []), null);
});

test("origin falls back to the earliest entry, and no origin means no path", () => {
  const noStart = { ...distance, startingValue: undefined };
  assert.equal(plannedTrackerPath(noStart, [base], []), null);
  const path = plannedTrackerPath(noStart, [base], [entry("2026-07-03", 8), entry("2026-07-02", 6)]);
  assert.equal(path.points[0].value, 6);
});

test("only milestones whose primary tracker this is take part", () => {
  const secondary = milestone({ id: "x", linkedTrackers: ["other", "t1"] });
  const path = plannedTrackerPath(distance, [base, secondary], []);
  assert.deepEqual(path.points.map((p) => p.milestoneId ?? "origin"), ["origin", "base"]);
});

test("milestoneSpan: each milestone measures from the previous checkpoint", () => {
  const all = [{ ...base, targetValue: 15 }, { ...half, targetValue: 21 }, { ...thirty, targetValue: 30 }];
  assert.deepEqual(milestoneSpan(all[1], distance, all, []), { from: 15, to: 21 });
  // Without siblings it falls back to the tracker's own goal.
  assert.deepEqual(milestoneSpan(half, distance, undefined, []), { from: 5, to: 35 });
});

test("expectedValueOn interpolates and holds flat outside the path", () => {
  const path = plannedTrackerPath(distance, [{ ...base, targetValue: 15 }], []);
  assert.equal(expectedValueOn(path, "2026-06-01"), 5);
  assert.equal(expectedValueOn(path, "2026-07-30"), 15);
  assert.ok(expectedValueOn(path, "2026-07-15") > 9.8 && expectedValueOn(path, "2026-07-15") < 9.9);
  assert.equal(expectedValueOn(path, "2026-12-01"), 15);
});

test("planGap compares the latest entry with the plan, direction-aware", () => {
  const path = plannedTrackerPath(distance, [{ ...base, targetValue: 15 }], []);
  const gap = planGap(distance, path, [entry("2026-07-20", 10), entry("2026-07-30", 12)], "2026-07-30");
  assert.deepEqual(gap, { expected: 15, actual: 12, delta: -3, ahead: false });
  const weight = { ...distance, goalDirection: "decrease_good" };
  assert.equal(planGap(weight, path, [entry("2026-07-30", 12)], "2026-07-30").ahead, true);
  assert.equal(planGap(distance, path, [], "2026-07-30"), null);
  assert.equal(planGap(distance, null, [entry("2026-07-30", 12)], "2026-07-30"), null);
});

// ── Milestone state against its own figure ──────────────────────────────────

test("a later milestone is measured over its own span, not the overall goal", () => {
  const all = [{ ...base, targetValue: 15 }, { ...half, targetValue: 21 }, { ...thirty, targetValue: 30 }];
  const entries = [entry("2026-07-29", 15), entry("2026-08-14", 18)];
  const state = calculateMilestoneState({
    milestone: all[1], plan, activities: {}, trackers: [distance], metricEntries: entries,
    now: new Date("2026-08-15T12:00:00"), milestones: all,
  });
  assert.equal(state.metricProgress, 50); // 15 → 21, at 18
  assert.equal(state.metricTargetValue, 21);
  // Without siblings (and no figure of its own) it falls back to the overall goal.
  const legacy = calculateMilestoneState({
    milestone: half, plan, activities: {}, trackers: [distance], metricEntries: entries,
    now: new Date("2026-08-15T12:00:00"),
  });
  assert.equal(legacy.metricProgress, 43); // 5 → 35, at 18
});

// ── Routines ─────────────────────────────────────────────────────────────────

const daily = { id: "r1", title: "Stretch", time: "07:00" };
const done = (date, extra = {}) => ({ ritualId: "r1", date, ...extra });

test("routine due days count, with a done day weighted by how closely it was followed", () => {
  const m = milestone({ startDate: "2026-09-01", plannedEndDate: "2026-09-10", linkedRituals: ["r1"] });
  const counts = routineOccurrences(m, { rituals: [daily], completions: [done("2026-09-01"), done("2026-09-02", { followed: 50 })] }, "2026-09-01", "2026-09-04");
  assert.deepEqual(counts, { expected: 4, completed: 1.5 });
});

test("routines respect repeat days and the tracking start", () => {
  const weekdays = { ...daily, repeatDays: ["monday", "wednesday"] };
  const m = milestone({ linkedRituals: ["r1"] });
  // 2026-09-01 is a Tuesday; Mon 7 and Wed 2, 9 are due in 1–9 Sep.
  assert.equal(routineOccurrences(m, { rituals: [weekdays], completions: [] }, "2026-09-01", "2026-09-09").expected, 3);
  assert.equal(routineOccurrences(m, { rituals: [weekdays], completions: [], trackingStart: "2026-09-05" }, "2026-09-01", "2026-09-09").expected, 2);
});

test("a routine-only milestone has data, consistency and a routine progress source", () => {
  const m = milestone({ startDate: "2026-09-01", plannedEndDate: "2026-09-10", linkedRituals: ["r1"] });
  const completions = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map((d) => done(d));
  const now = new Date("2026-09-05T12:00:00");
  const state = calculateMilestoneState({ milestone: m, plan, activities: {}, trackers: [], metricEntries: [], now, rituals: [daily], ritualCompletions: completions });
  assert.equal(state.hasData, true);
  assert.equal(state.routineProgress, 40); // 4 of 10 due days
  assert.deepEqual(state.progressSources, [{ kind: "routines", pct: 40 }]);
  assert.equal(state.overallProgress, 40);
  assert.equal(state.consistency, 80); // 4 of 5 due so far
  assert.equal(calculateConsistency(m, {}, now), null, "no routine inputs: routines are ignored");
});

test("the headline blends metric and routines with equal weight", () => {
  const m = milestone({ startDate: "2026-09-01", plannedEndDate: "2026-09-10", linkedTrackers: ["t1"], linkedRituals: ["r1"], targetValue: 15 });
  const completions = ["2026-09-01", "2026-09-02"].map((d) => done(d));
  const state = calculateMilestoneState({
    milestone: m, plan, activities: {}, trackers: [distance], metricEntries: [entry("2026-09-04", 10)],
    now: new Date("2026-09-05T12:00:00"), milestones: [m], rituals: [daily], ritualCompletions: completions,
  });
  assert.deepEqual(state.progressSources, [{ kind: "metric", pct: 50 }, { kind: "routines", pct: 20 }]);
  assert.equal(state.overallProgress, 35);
});

test("secondary trackers join the metric average against their own goals", () => {
  const pages = { id: "t2", planId: "p1", title: "Pages", type: "number", startingValue: 0, goalValue: 100 };
  const m = milestone({ linkedTrackers: ["t1", "t2"], targetValue: 15 });
  const state = calculateMilestoneState({
    milestone: m, plan, activities: {}, trackers: [distance, pages],
    metricEntries: [entry("2026-09-04", 10), entry("2026-09-04", 30, "t2")],
    now: new Date("2026-09-05T12:00:00"), milestones: [m],
  });
  assert.deepEqual(state.progressSources, [{ kind: "metric", pct: 40 }]); // (50 + 30) / 2
});

// ── Item-side links ─────────────────────────────────────────────────────────

test("reverse lookups find every milestone linking an item", () => {
  const a = milestone({ id: "a", startDate: "2026-09-05", linkedActivities: ["task1"], linkedRituals: ["r1"] });
  const b = milestone({ id: "b", startDate: "2026-09-01", linkedActivities: ["task1"], linkedTrackers: ["t1"] });
  assert.deepEqual(milestonesForTask([a, b], "task1").map((m) => m.id), ["b", "a"]);
  assert.deepEqual(milestonesForTracker([a, b], "t1").map((m) => m.id), ["b"]);
  assert.deepEqual(milestonesForRitual([a, b], "r1").map((m) => m.id), ["a"]);
  const legacy = { ...a, linkedRituals: undefined };
  assert.deepEqual(milestonesForRitual([legacy], "r1"), []);
});

test("linkableMilestones skips completed ones and scopes to a plan", () => {
  const open = milestone({ id: "open" });
  const closed = milestone({ id: "closed", status: "completed", actualCompletedDate: "2026-09-02" });
  const other = milestone({ id: "other", planId: "p2" });
  assert.deepEqual(linkableMilestones([open, closed, other], "p1").map((m) => m.id), ["open"]);
  assert.deepEqual(linkableMilestones([open, closed, other]).map((m) => m.id), ["open", "other"]);
});

test("link / unlink are idempotent and keep the tracker mirror in step", () => {
  const ms = [milestone({ id: "a", linkedRituals: undefined })];
  const linked = linkItem(ms, "a", "ritual", "r1");
  assert.deepEqual(linked[0].linkedRituals, ["r1"]);
  assert.equal(linkItem(linked, "a", "ritual", "r1"), linked);
  const withTracker = linkItem(linked, "a", "tracker", "t1");
  assert.equal(withTracker[0].linkedTrackerId, "t1");
  assert.deepEqual(unlinkItem(withTracker, "a", "ritual", "r1")[0].linkedRituals, []);
  assert.equal(unlinkItem(ms, "a", "task", "nope"), ms);
});

test("unlinkEverywhere drops a deleted item from every milestone", () => {
  const ms = [milestone({ id: "a", linkedRituals: ["r1", "r2"] }), milestone({ id: "b", linkedRituals: ["r1"] }), milestone({ id: "c" })];
  const next = unlinkEverywhere(ms, "ritual", "r1");
  assert.deepEqual(next.map((m) => m.linkedRituals), [["r2"], [], []]);
  assert.equal(next[2], ms[2]);
});

// ── Migration ────────────────────────────────────────────────────────────────

test("normalization defaults linkedRituals and keeps a valid targetValue", () => {
  const raw = { ...milestone({ id: "a", targetValue: 12 }), linkedRituals: undefined };
  const bad = { ...milestone({ id: "b", targetValue: "x" }), linkedRituals: ["r1", 3] };
  const activities = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, []]));
  const s = migrate({ plans: [plan], activities, milestones: [raw, bad] });
  const byId = Object.fromEntries(s.milestones.map((m) => [m.id, m]));
  const { a, b } = byId;
  assert.deepEqual(a.linkedRituals, []);
  assert.equal(a.targetValue, 12);
  assert.deepEqual(b.linkedRituals, ["r1"]);
  assert.equal(b.targetValue, undefined);
});

test("a routine-limited status message names routines, not tasks", () => {
  const m = milestone({ startDate: "2026-09-01", plannedEndDate: "2026-09-30", linkedTrackers: ["t1"], linkedRituals: ["r1"], targetValue: 15 });
  // Metric well ahead of pace, routine done 1 day in 10 → consistency limits health.
  const entries = [entry("2026-09-01", 5), entry("2026-09-05", 9), entry("2026-09-10", 14)];
  const state = calculateMilestoneState({
    milestone: m, plan, activities: {}, trackers: [distance], metricEntries: entries,
    now: new Date("2026-09-10T12:00:00"), milestones: [m], rituals: [daily], ritualCompletions: [done("2026-09-01")],
  });
  assert.match(state.statusMessage, /routine consistency/);
  assert.doesNotMatch(state.statusMessage, /task consistency/);
});

test("behind a milestone's planned start is not 'moved away from the target' while still ahead of the real start", () => {
  // 5 → 35 km over three milestones; the second milestone's planned span
  // starts at 15. A long run of 14 km is behind that checkpoint but well up
  // on where the tracker began, so it has not moved the wrong way.
  const all = [base, half, thirty];
  const state = calculateMilestoneState({
    milestone: half, plan, activities: {}, trackers: [distance],
    metricEntries: [entry("2026-07-01", 5), entry("2026-08-05", 14)],
    now: new Date("2026-08-05T12:00:00"), milestones: all,
  });
  assert.equal(state.metricMovedWrongDirection, false);
  assert.equal(state.metricProgress, 0, "still behind this milestone's own starting checkpoint");

  // Dropping below the real starting figure is moving the wrong way.
  const worse = calculateMilestoneState({
    milestone: half, plan, activities: {}, trackers: [distance],
    metricEntries: [entry("2026-07-01", 5), entry("2026-08-05", 4)],
    now: new Date("2026-08-05T12:00:00"), milestones: all,
  });
  assert.equal(worse.metricMovedWrongDirection, true);
});

test("plan progress is the mean of milestone headlines, a completed one counting as 100", () => {
  const ms = [
    { id: "a", status: "completed" },
    { id: "b", status: "active" },
    { id: "c", status: "active" },
  ];
  const states = new Map([["a", { overallProgress: 40 }], ["b", { overallProgress: 2 }], ["c", { overallProgress: null }]]);
  assert.equal(planProgressFromMilestones(ms, states), 34);
  // Nothing to measure anywhere: null, so the caller can fall back.
  assert.equal(planProgressFromMilestones([{ id: "x", status: "active" }], new Map([["x", { overallProgress: null }]])), null);
  assert.equal(planProgressFromMilestones([], new Map()), null);
});

test("planned figures round to the precision the tracker is logged in", () => {
  const tracker = { id: "w", startingValue: 82, goalValue: 72 };
  const entries = [{ trackerId: "w", value: 81.2 }, { trackerId: "other", value: 1.234 }];
  assert.equal(formatTrackerFigure(78.7857, tracker, entries), "78.8");
  assert.equal(formatTrackerFigure(75.45, tracker, entries), "75.5");
  // Whole-number tracker: whole-number figures.
  assert.equal(formatTrackerFigure(21.6, { id: "km", startingValue: 5, goalValue: 35 }), "22");
});

test("a linked routine's follow-through counts its due days so far, not the whole window", () => {
  const milestone = { id: "m", startDate: "2026-10-26", plannedEndDate: "2026-11-22", linkedRituals: [] };
  const daily = { id: "r", title: "Protein", time: "08:00", repeatDays: ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"], color: "emerald" };
  const routines = {
    rituals: [daily],
    completions: [
      { id: "c1", ritualId: "r", date: "2026-10-26" },
      { id: "c2", ritualId: "r", date: "2026-10-27" },
    ],
  };
  const f = linkedRoutineFollowThrough(milestone, routines, "r", "2026-10-29");
  assert.equal(f.expected, 4);
  assert.equal(f.completed, 2);
  assert.equal(f.pct, 50);
  // Before the milestone starts there is nothing to report.
  assert.equal(linkedRoutineFollowThrough(milestone, routines, "r", "2026-10-20"), null);
});
