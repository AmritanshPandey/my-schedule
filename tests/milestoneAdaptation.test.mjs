/**
 * Coverage for lib/milestoneAdaptation.ts — turning an off-pace milestone into
 * concrete adjustments, and applying the one the user picks.
 *
 * The properties worth pinning are the ones that make this trustworthy rather
 * than merely clever: it proposes nothing for a milestone that isn't running,
 * it never mutates during proposal, the offers arrive as an escalation ladder
 * (recover → move the line → step away), extending anchors to the real
 * forecast, and applying is safe against anything the user changed in between.
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

const {
  proposeAdaptations,
  applyAdaptation,
  RECOVERABLE_LOOKBACK_DAYS,
  DEFAULT_EXTENSION_DAYS,
  MAX_RECOVERABLE_OCCURRENCES,
} = await import("@/lib/milestoneAdaptation.ts");
const { calculateMilestoneState } = await import("@/lib/milestoneHealth.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-14T18:00:00");
const TODAY = "2026-09-14";

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Marathon Training", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function milestone(overrides = {}) {
  return {
    id: "m1",
    planId: "p1",
    title: "Run 10k",
    startDate: "2026-08-01",
    plannedDurationDays: 20,
    plannedEndDate: "2026-08-20",
    status: "active",
    linkedActivities: ["t1"],
    linkedTrackers: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

function missedEvent(taskId, dateISO) {
  return {
    id: `${taskId}-${dateISO}`,
    taskId,
    completedAt: new Date(`${dateISO}T12:00:00`).toISOString(),
    completionType: "missed",
  };
}

function task(overrides = {}) {
  return {
    id: "t1",
    title: "Long run",
    startTime: "7:00 AM",
    endTime: "8:30 AM",
    planId: "p1",
    completionHistory: [],
    ...overrides,
  };
}

/** Places one task into every weekday bucket, the way a recurring task lives. */
function activitiesWith(tasks) {
  const activities = emptyActivities();
  for (const t of tasks) for (const d of ALL_DAYS) activities[d].push(t);
  return activities;
}

function schedule(overrides = {}) {
  return {
    goals: [],
    plans: [plan()],
    categories: [],
    activities: emptyActivities(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [milestone()],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
    ...overrides,
  };
}

function stateFor(sched, ms = milestone(), pl = plan()) {
  return calculateMilestoneState({
    milestone: ms,
    plan: pl,
    activities: sched.activities,
    trackers: sched.progressTrackers,
    metricEntries: sched.metricEntries,
    now: NOW,
  });
}

function propose(sched, ms = milestone(), pl = plan()) {
  return proposeAdaptations({ milestone: ms, plan: pl, state: stateFor(sched, ms, pl), schedule: sched, now: NOW });
}

// ── Nothing to adapt ─────────────────────────────────────────────────────────

test("a completed milestone gets no offers", () => {
  const done = milestone({ status: "completed", actualCompletedDate: "2026-08-15" });
  assert.deepEqual(propose(schedule({ milestones: [done] }), done), []);
});

test("a milestone with nothing linked gets no offers — link work, don't adapt a plan that isn't running", () => {
  const empty = milestone({ linkedActivities: [] });
  assert.deepEqual(propose(schedule({ milestones: [empty] }), empty), []);
});

// ── The escalation ladder ────────────────────────────────────────────────────

test("offers arrive recover → extend → pause", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-10")] });
  const offers = propose(schedule({ activities: activitiesWith([t]) }));
  assert.deepEqual(offers.map((o) => o.adaptation.kind), [
    "reschedule_missed",
    "extend_target",
    "pause_plan",
  ]);
});

test("with no recoverable misses the ladder starts at extend", () => {
  const offers = propose(schedule({ activities: activitiesWith([task()]) }));
  assert.deepEqual(offers.map((o) => o.adaptation.kind), ["extend_target", "pause_plan"]);
});

test("an already-paused plan is not offered a pause", () => {
  const held = plan({ status: "paused" });
  const offers = propose(schedule({ activities: activitiesWith([task()]), plans: [held] }), milestone(), held);
  assert.ok(!offers.some((o) => o.adaptation.kind === "pause_plan"));
});

test("proposing mutates nothing", () => {
  const before = schedule({ activities: activitiesWith([task({ completionHistory: [missedEvent("t1", "2026-09-10")] })]) });
  const snapshot = JSON.stringify(before);
  propose(before);
  assert.equal(JSON.stringify(before), snapshot);
});

// ── Recovering missed work ───────────────────────────────────────────────────

test("misses outside the lookback window, and today's, are not offered", () => {
  const stale = `2026-08-01`; // well beyond RECOVERABLE_LOOKBACK_DAYS
  const t = task({
    completionHistory: [missedEvent("t1", stale), missedEvent("t1", TODAY), missedEvent("t1", "2026-09-12")],
  });
  const offer = propose(schedule({ activities: activitiesWith([t]) }))[0];
  assert.equal(offer.adaptation.kind, "reschedule_missed");
  assert.deepEqual(offer.adaptation.occurrences.map((o) => o.dateISO), ["2026-09-12"]);
});

test("an already-acknowledged miss is not offered again", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-12")] });
  const offers = propose(
    schedule({
      activities: activitiesWith([t]),
      preferences: { acknowledgedMisses: ["t1|2026-09-12"] },
    }),
  );
  assert.ok(!offers.some((o) => o.adaptation.kind === "reschedule_missed"));
});

test("recovered sessions are spread one per day from tomorrow, never stacked", () => {
  const t = task({
    completionHistory: ["2026-09-09", "2026-09-10", "2026-09-11"].map((d) => missedEvent("t1", d)),
  });
  const offer = propose(schedule({ activities: activitiesWith([t]) }))[0];
  const targets = offer.adaptation.occurrences.map((o) => o.targetDateISO);
  assert.deepEqual(targets, ["2026-09-15", "2026-09-16", "2026-09-17"]);
  assert.equal(new Set(targets).size, targets.length);
});

test("recovery is capped so it can't propose a wall of catch-up work", () => {
  const dates = Array.from({ length: 14 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
  const t = task({ completionHistory: dates.map((d) => missedEvent("t1", d)) });
  const offer = propose(schedule({ activities: activitiesWith([t]) }))[0];
  assert.equal(offer.adaptation.occurrences.length, MAX_RECOVERABLE_OCCURRENCES);
});

test("applying a reschedule adds a dated one-off and dismisses the original miss", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-12")] });
  const before = schedule({ activities: activitiesWith([t]) });
  const offer = propose(before)[0];
  const after = applyAdaptation(before, offer.adaptation);

  const tuesday = after.activities.tuesday; // 2026-09-15 is a Tuesday
  const clone = tuesday.find((x) => x.id !== "t1");
  assert.ok(clone, "expected a one-off clone on the target day");
  assert.deepEqual(clone.recurrence, { type: "once", dateISO: "2026-09-15" });
  assert.equal(clone.completed, false);
  assert.deepEqual(clone.completionHistory, []);
  assert.ok(after.preferences.acknowledgedMisses.includes("t1|2026-09-12"));
});

test("applying a reschedule skips occurrences whose task was deleted meanwhile", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-12")] });
  const before = schedule({ activities: activitiesWith([t]) });
  const offer = propose(before)[0];
  const deleted = { ...before, activities: emptyActivities() };
  assert.equal(applyAdaptation(deleted, offer.adaptation), deleted);
});

// ── Extending the target ─────────────────────────────────────────────────────

test("extending anchors to the real forecast when there is one", () => {
  // A task completed on some days gives the engine enough to forecast with.
  const t = task({
    completionHistory: [
      { id: "c1", taskId: "t1", completedAt: "2026-08-02T12:00:00.000Z", completionType: "task" },
    ],
  });
  const sched = schedule({ activities: activitiesWith([t]) });
  const state = stateFor(sched);
  const offer = propose(sched).find((o) => o.adaptation.kind === "extend_target");

  if (state.forecastDate && state.forecastDate > "2026-08-20") {
    assert.equal(offer.adaptation.basis, "forecast");
    assert.equal(offer.adaptation.newEndDate, state.forecastDate);
    assert.match(offer.rationale, /current pace projects/i);
  } else {
    assert.equal(offer.adaptation.basis, "default");
  }
});

test("with no usable forecast it falls back to a flat, stated default", () => {
  const sched = schedule({ activities: activitiesWith([task()]) });
  const offer = propose(sched).find((o) => o.adaptation.kind === "extend_target");
  assert.equal(offer.adaptation.basis, "default");
  assert.equal(offer.adaptation.daysAdded, DEFAULT_EXTENSION_DAYS);
  assert.equal(offer.adaptation.newEndDate, "2026-09-03"); // 2026-08-20 + 14
  assert.match(offer.rationale, /no reliable forecast/i);
});

test("extending lengthens the duration, because the end date is derived from it", () => {
  const before = schedule({ activities: activitiesWith([task()]) });
  const offer = propose(before).find((o) => o.adaptation.kind === "extend_target");
  const after = applyAdaptation(before, offer.adaptation);
  const updated = after.milestones.find((m) => m.id === "m1");

  assert.equal(updated.plannedEndDate, "2026-09-03");
  // start 2026-08-01 → end 2026-09-03 inclusive is 34 days
  assert.equal(updated.plannedDurationDays, 34);
  assert.equal(updated.targetDate, "2026-09-03", "legacy mirror field kept in step");
});

test("cascading shifts later milestones; not cascading leaves them alone", () => {
  const later = milestone({ id: "m2", title: "Run 20k", sortOrder: 1, startDate: "2026-08-21", plannedEndDate: "2026-09-10", plannedDurationDays: 21 });
  const before = schedule({ activities: activitiesWith([task()]), milestones: [milestone(), later] });
  const offer = propose(before).find((o) => o.adaptation.kind === "extend_target");

  assert.equal(offer.adaptation.downstreamCount, 1);
  assert.equal(offer.adaptation.cascade, true, "cascading is the safer default");

  const cascaded = applyAdaptation(before, offer.adaptation);
  const m2After = cascaded.milestones.find((m) => m.id === "m2");
  assert.ok(m2After.startDate > "2026-08-21", "later milestone moved");

  const isolated = applyAdaptation(before, { ...offer.adaptation, cascade: false });
  const m2Untouched = isolated.milestones.find((m) => m.id === "m2");
  assert.equal(m2Untouched.startDate, "2026-08-21");
});

test("a milestone on another plan is never touched by a cascade", () => {
  const other = milestone({ id: "other", planId: "p2", sortOrder: 0, startDate: "2026-08-21", plannedEndDate: "2026-09-10" });
  const before = schedule({
    activities: activitiesWith([task()]),
    plans: [plan(), plan({ id: "p2", title: "Other" })],
    milestones: [milestone(), other],
  });
  const offer = propose(before).find((o) => o.adaptation.kind === "extend_target");
  const after = applyAdaptation(before, offer.adaptation);
  const otherAfter = after.milestones.find((m) => m.id === "other");
  assert.equal(otherAfter.startDate, "2026-08-21");
  assert.equal(otherAfter.plannedEndDate, "2026-09-10");
});

test("extending a milestone that was deleted meanwhile is a no-op", () => {
  const before = schedule({ activities: activitiesWith([task()]) });
  const offer = propose(before).find((o) => o.adaptation.kind === "extend_target");
  const without = { ...before, milestones: [] };
  assert.equal(applyAdaptation(without, offer.adaptation), without);
});

// ── Pausing ──────────────────────────────────────────────────────────────────

test("applying a pause holds the plan and nothing else", () => {
  const before = schedule({ activities: activitiesWith([task()]) });
  const offer = propose(before).find((o) => o.adaptation.kind === "pause_plan");
  const after = applyAdaptation(before, offer.adaptation);
  assert.equal(after.plans[0].status, "paused");
  assert.deepEqual(after.milestones, before.milestones);
  assert.deepEqual(after.activities, before.activities);
});

test("every offer explains itself in plain language", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-12")] });
  for (const offer of propose(schedule({ activities: activitiesWith([t]) }))) {
    assert.ok(offer.label.length > 0, "needs a label");
    assert.ok(offer.rationale.length > 0, "needs a rationale");
    assert.ok(offer.changes.length > 0, "needs at least one change row");
    // Never leak an id or raw JSON into user-facing copy.
    for (const row of [offer.label, offer.rationale, ...offer.changes]) {
      assert.ok(!row.includes("{"), `raw JSON in copy: ${row}`);
      assert.ok(!/\bm1\b|\bt1\b|\bp1\b/.test(row), `raw id in copy: ${row}`);
    }
  }
});

test("RECOVERABLE_LOOKBACK_DAYS is the window the rationale actually quotes", () => {
  const t = task({ completionHistory: [missedEvent("t1", "2026-09-12")] });
  const offer = propose(schedule({ activities: activitiesWith([t]) }))[0];
  assert.match(offer.rationale, new RegExp(`${RECOVERABLE_LOOKBACK_DAYS} days`));
});
