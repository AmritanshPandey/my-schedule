/**
 * Coverage for lib/overview.ts — the read model all three Overview shells
 * share (desktop web, mobile PWA, native iOS).
 *
 * What these protect:
 *  1. Next up is the first *open* task in Today's order. A missed task is
 *     resolved (it belongs to Needs attention), and a finished day says so
 *     rather than pointing at nothing.
 *  2. The week verdict only judges recorded outcomes: a Monday morning with
 *     nothing done yet, or a task added today, is not "Behind", and the ramp
 *     boundaries match DESIGN.md (70 / 40), not the old 35.
 *  3. Goal pace lists running plans worst-first, and mobile's
 *     milestone-only view drops plans with nothing to pace.
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

const { statusTone, selectNextUp, selectWeekStatus, selectGoalPace, selectSetupSteps } = await import("@/lib/overview.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
// A Saturday; this week runs Monday 2026-09-14 → Sunday 2026-09-20.
const SATURDAY = "2026-09-19";

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function doneEvent(taskId, dateISO) {
  return { id: `${taskId}-${dateISO}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: "task" };
}

function task(id, overrides = {}) {
  return { id, title: id, startTime: "7:00 AM", endTime: "8:00 AM", planId: "p1", ...overrides };
}

function schedule(overrides = {}) {
  return {
    goals: [],
    goalConnections: [],
    plans: [plan()],
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

function daily(tasks) {
  const activities = emptyActivities();
  for (const t of tasks) for (const d of ALL_DAYS) activities[d].push(t);
  return activities;
}

function milestone(id, overrides = {}) {
  return {
    id,
    planId: "p1",
    title: id,
    startDate: "2026-08-01",
    plannedDurationDays: 30,
    plannedEndDate: "2026-12-31",
    status: "active",
    linkedActivities: [],
    linkedTrackers: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

// ── Status ramp ──────────────────────────────────────────────────────────────

test("the status ramp breaks at 70 and 40, and zero is neutral", () => {
  assert.equal(statusTone(70), "good");
  assert.equal(statusTone(69), "warn");
  assert.equal(statusTone(40), "warn");
  assert.equal(statusTone(39), "bad");
  assert.equal(statusTone(1), "bad");
  assert.equal(statusTone(0), "none");
});

// ── Setup ────────────────────────────────────────────────────────────────────

test("setup shows until two steps are done and points at the first undone one", () => {
  const fresh = selectSetupSteps(schedule({ plans: [] }));
  assert.equal(fresh.doneCount, 0);
  assert.equal(fresh.next.key, "plan");
  assert.equal(fresh.show, true);

  const twoDone = selectSetupSteps(schedule({ activities: daily([task("a")]) }));
  assert.equal(twoDone.doneCount, 2);
  assert.equal(twoDone.next.key, "ritual");
  assert.equal(twoDone.show, false);
});

// ── Next up ──────────────────────────────────────────────────────────────────

test("next up is empty when nothing is scheduled today", () => {
  assert.deepEqual(selectNextUp(schedule(), SATURDAY, "saturday"), { kind: "empty" });
});

test("next up is the first open task in time order, skipping done and missed ones", () => {
  const activities = emptyActivities();
  activities.saturday = [
    task("late", { startTime: "6:00 PM", endTime: "7:00 PM" }),
    task("done", { startTime: "7:00 AM", endTime: "8:00 AM", completed: true }),
    task("missed", { startTime: "9:00 AM", endTime: "10:00 AM", missed: true }),
    task("noon", { startTime: "12:00 PM", endTime: "12:30 PM" }),
  ];
  const next = selectNextUp(schedule({ activities }), SATURDAY, "saturday");
  assert.equal(next.kind, "task");
  assert.equal(next.task.id, "noon");
  assert.equal(next.timeLabel, "12:00 PM");
  assert.equal(next.openCount, 2);
  assert.equal(next.remainingMinutes, 90);
  assert.equal(next.done, 1);
  assert.equal(next.total, 4);
  assert.equal(next.plan?.id, "p1");
});

test("next up reports a finished day instead of pointing at nothing", () => {
  const activities = emptyActivities();
  activities.saturday = [task("a", { completed: true }), task("b", { missed: true })];
  assert.deepEqual(selectNextUp(schedule({ activities }), SATURDAY, "saturday"), { kind: "day-done", done: 1, total: 2 });
});

test("next up on a multi-slot task points at its first open slot", () => {
  const activities = emptyActivities();
  activities.saturday = [
    task("split", {
      slots: [
        { startTime: "7:00 AM", endTime: "8:00 AM" },
        { startTime: "5:00 PM", endTime: "6:00 PM" },
      ],
      completedSlotIndices: [0],
    }),
  ];
  const next = selectNextUp(schedule({ activities }), SATURDAY, "saturday");
  assert.equal(next.kind, "task");
  assert.equal(next.slotIndex, 1);
  assert.equal(next.timeLabel, "5:00 PM");
});

test("commitments never become next up", () => {
  const activities = emptyActivities();
  activities.saturday = [task("held", { taskType: "commitment" })];
  assert.deepEqual(selectNextUp(schedule({ activities }), SATURDAY, "saturday"), { kind: "empty" });
});

// ── Week status ──────────────────────────────────────────────────────────────

test("open work today is not late yet — a fresh Monday has no verdict", () => {
  const status = selectWeekStatus(schedule({ activities: daily([task("a")]) }), "2026-09-14");
  assert.equal(status.verdict, null);
  assert.equal(status.days[0].isToday, true);
  assert.equal(status.days[1].isFuture, true);
  assert.equal(status.hasData, true);
});

function missedEvent(taskId, dateISO) {
  return { id: `${taskId}-${dateISO}-missed`, taskId, completedAt: new Date(`${dateISO}T23:00:00`).toISOString(), completionType: "missed" };
}

test("the verdict judges recorded outcomes: done against missed", () => {
  const WEEKDAYS = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
  const history = (doneDates) =>
    schedule({
      activities: daily([
        task("a", {
          completionHistory: WEEKDAYS.map((d) => (doneDates.includes(d) ? doneEvent("a", d) : missedEvent("a", d))),
        }),
      ]),
    });

  // Mon–Fri all done, Saturday still open → 5/5.
  const all = selectWeekStatus(history(WEEKDAYS), SATURDAY);
  assert.equal(all.verdict, "on-track");
  assert.equal(all.verdictPct, 100);
  assert.equal(all.tasksDone, 5);
  assert.equal(all.tasksTotal, 7);

  // 2 done, 3 missed → exactly 40 → amber, not rose.
  const two = selectWeekStatus(history(WEEKDAYS.slice(0, 2)), SATURDAY);
  assert.equal(two.verdict, "at-risk");
  assert.equal(two.days[2].missed, 1);

  // 1 done, 4 missed → 20 → behind.
  assert.equal(selectWeekStatus(history(WEEKDAYS.slice(0, 1)), SATURDAY).verdict, "behind");
});

test("a task added today doesn't make the past week read as missed", () => {
  // In every weekday bucket, but with no history at all: nothing was recorded
  // Mon–Fri, so there is nothing to judge yet.
  const status = selectWeekStatus(schedule({ activities: daily([task("new")]) }), SATURDAY);
  assert.equal(status.verdict, null);
});

test("a completion beats a missed mark on the same day, and today's misses count", () => {
  const sameDay = schedule({
    activities: daily([task("a", { completionHistory: [missedEvent("a", "2026-09-14"), doneEvent("a", "2026-09-14")] })]),
  });
  const status = selectWeekStatus(sameDay, SATURDAY);
  assert.equal(status.days[0].missed, 0);
  assert.equal(status.verdictPct, 100);

  const activities = emptyActivities();
  activities.saturday = [task("x", { missed: true })];
  assert.equal(selectWeekStatus(schedule({ activities }), SATURDAY).verdict, "behind");
});

test("days before the tracking start are left out of the week", () => {
  const s = schedule({
    activities: daily([task("a", { completionHistory: ["2026-09-14", "2026-09-15", "2026-09-16"].map((d) => missedEvent("a", d)).concat(doneEvent("a", "2026-09-18")) })]),
    preferences: { startDate: "2026-09-17" },
  });
  const status = selectWeekStatus(s, SATURDAY);
  assert.deepEqual(status.days.slice(0, 3).map((d) => d.total), [0, 0, 0]);
  assert.equal(status.verdict, "on-track");
  assert.equal(status.verdictPct, 100);
  assert.equal(status.missed, 0);
});

test("days run Monday first and an empty week has no data", () => {
  const status = selectWeekStatus(schedule(), SATURDAY);
  assert.deepEqual(status.days.map((d) => d.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.equal(status.days[5].isToday, true);
  assert.equal(status.hasData, false);
  assert.equal(status.verdict, null);
});

// ── Goal pace ────────────────────────────────────────────────────────────────

test("goal pace skips paused plans and, for mobile, plans with nothing to pace", () => {
  const s = schedule({
    plans: [plan(), plan({ id: "p2", title: "Paused", status: "paused" }), plan({ id: "p3", title: "No milestones" })],
    milestones: [milestone("m1"), milestone("m2", { planId: "p2" })],
  });
  const all = selectGoalPace(s, { now: new Date(`${SATURDAY}T12:00:00`) });
  assert.deepEqual(all.rows.map((r) => r.plan.id).sort(), ["p1", "p3"]);
  const p3 = all.rows.find((r) => r.plan.id === "p3");
  assert.equal(p3.milestone, null);
  assert.equal(p3.state, null);

  const mobile = selectGoalPace(s, { now: new Date(`${SATURDAY}T12:00:00`), withMilestoneOnly: true });
  assert.deepEqual(mobile.rows.map((r) => r.plan.id), ["p1"]);
});

test("goal pace picks the earliest unfinished milestone and counts finished ones", () => {
  const s = schedule({
    milestones: [
      milestone("third", { sortOrder: 2 }),
      milestone("first", { sortOrder: 0, status: "completed" }),
      milestone("second", { sortOrder: 1 }),
    ],
  });
  const [row] = selectGoalPace(s, { now: new Date(`${SATURDAY}T12:00:00`) }).rows;
  assert.equal(row.milestone.id, "second");
  assert.equal(row.milestonesDone, 1);
  assert.equal(row.milestonesTotal, 3);
});

test("goal pace sorts worst health first and honours the limit", () => {
  const s = schedule({
    activities: daily([task("work", { planId: "p2" })]),
    plans: [plan({ id: "p1", title: "Fresh" }), plan({ id: "p2", title: "Overdue" }), plan({ id: "p3", title: "Spare" })],
    milestones: [
      milestone("fresh", { planId: "p1", startDate: "2026-09-18", plannedEndDate: "2026-12-31" }),
      // Its window closed weeks ago with its linked task never done.
      milestone("overdue", { planId: "p2", startDate: "2026-06-01", plannedEndDate: "2026-07-01", linkedActivities: ["work"] }),
      milestone("spare", { planId: "p3", startDate: "2026-09-18", plannedEndDate: "2026-12-31" }),
    ],
  });
  const result = selectGoalPace(s, { now: new Date(`${SATURDAY}T12:00:00`), limit: 2 });
  assert.equal(result.totalCount, 3);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].plan.id, "p2");
  assert.equal(result.rows[0].state.health, "delayed");
});
