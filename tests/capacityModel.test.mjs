/**
 * Coverage for lib/capacityModel.ts — the observed weekly ceiling, and the
 * verdict on whether a planned week is one this person has ever actually done.
 *
 * The properties that matter are the ones that keep the number honest: the
 * median must resist a single heroic or absent week, the partial current week
 * must never drag it down, commitments and paused plans must stay out of both
 * sides of the comparison, and the whole thing must stay silent rather than
 * guess when there isn't enough history.
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
  computeCapacityModel,
  plannedWeeklyMinutes,
  assessPlannedLoad,
  completedMinutesOn,
  heaviestDay,
  weekStartISO,
  MIN_CAPACITY_WEEKS,
  STRETCH_RATIO,
  UNREALISTIC_RATIO,
} = await import("@/lib/capacityModel.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
// A Saturday, so "this week" starts Monday 2026-09-14.
const NOW = new Date("2026-09-19T18:00:00");

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function doneEvent(taskId, dateISO) {
  return {
    id: `${taskId}-${dateISO}`,
    taskId,
    completedAt: new Date(`${dateISO}T12:00:00`).toISOString(),
    completionType: "task",
  };
}

function slotEvent(taskId, dateISO, slotIndex) {
  return {
    id: `${taskId}-${dateISO}-${slotIndex}`,
    taskId,
    completedAt: new Date(`${dateISO}T12:00:00`).toISOString(),
    completionType: "slot",
    slotIndex,
  };
}

/** A 1-hour task, present in every weekday bucket (a daily recurring task). */
function hourTask(id, events, overrides = {}) {
  return {
    id,
    title: id,
    startTime: "7:00 AM",
    endTime: "8:00 AM",
    planId: "p1",
    completionHistory: events,
    ...overrides,
  };
}

function activitiesWith(tasks, days = ALL_DAYS) {
  const activities = emptyActivities();
  for (const t of tasks) for (const d of days) activities[d].push(t);
  return activities;
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

/** ISO dates for one weekday across the N complete weeks before this one. */
function pastMondays(count) {
  const out = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date("2026-09-14T12:00:00"); // this week's Monday
    d.setDate(d.getDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ── Week boundaries ──────────────────────────────────────────────────────────

test("weeks start on Monday", () => {
  assert.equal(weekStartISO("2026-09-19"), "2026-09-14"); // Saturday → Monday
  assert.equal(weekStartISO("2026-09-14"), "2026-09-14"); // Monday → itself
  assert.equal(weekStartISO("2026-09-20"), "2026-09-14"); // Sunday → same week
  assert.equal(weekStartISO("2026-09-21"), "2026-09-21"); // next Monday
});

// ── Pricing a completion ─────────────────────────────────────────────────────

test("a whole-task completion prices the whole task", () => {
  const t = hourTask("t1", [doneEvent("t1", "2026-09-07")]);
  assert.equal(completedMinutesOn(t, "2026-09-07"), 60);
  assert.equal(completedMinutesOn(t, "2026-09-08"), 0);
});

test("a multi-slot task prices only the phases actually done", () => {
  const t = hourTask("t1", [slotEvent("t1", "2026-09-07", 0)], {
    slots: [
      { startTime: "7:00 AM", endTime: "8:00 AM" },
      { startTime: "6:00 PM", endTime: "6:30 PM" },
    ],
  });
  assert.equal(completedMinutesOn(t, "2026-09-07"), 60); // first phase only
});

test("commitments contribute nothing — held time is not executed work", () => {
  const t = hourTask("t1", [doneEvent("t1", "2026-09-07")], { taskType: "commitment" });
  assert.equal(completedMinutesOn(t, "2026-09-07"), 0);
});

// ── The median ───────────────────────────────────────────────────────────────

test("the sustained figure is the median of completed weeks", () => {
  // One hour completed on the Monday of each of the last 4 weeks.
  const events = pastMondays(4).map((d) => doneEvent("t1", d));
  const s = schedule({ activities: activitiesWith([hourTask("t1", events)]) });
  const model = computeCapacityModel(s, NOW);

  assert.equal(model.hasEnoughData, true);
  assert.equal(model.sustainedWeeklyMinutes, 60);
});

test("one heroic week does not move the median", () => {
  const mondays = pastMondays(5);
  const events = mondays.map((d) => doneEvent("t1", d));
  // An extra six hours in a single week, via a second task.
  const heroWeek = mondays[2];
  const hero = hourTask("t2", [1, 2, 3, 4, 5, 6].map((n) => {
    const d = new Date(`${heroWeek}T12:00:00`);
    d.setDate(d.getDate() + n);
    return doneEvent("t2", d.toISOString().slice(0, 10));
  }));

  const s = schedule({ activities: activitiesWith([hourTask("t1", events), hero]) });
  const model = computeCapacityModel(s, NOW);

  assert.equal(model.sustainedWeeklyMinutes, 60, "median ignores the spike");
  assert.equal(model.bestWeekMinutes, 420, "but the spike is still reported as the best week");
});

test("the current partial week is excluded, so it can't drag the median down", () => {
  const events = pastMondays(4).map((d) => doneEvent("t1", d));
  const s = schedule({ activities: activitiesWith([hourTask("t1", events)]) });
  const model = computeCapacityModel(s, NOW);
  assert.ok(
    model.weeks.every((w) => w.weekStartISO < "2026-09-14"),
    "no sampled week may be the current one",
  );
});

test("weeks before the tracking start date are not this user's history", () => {
  const events = pastMondays(6).map((d) => doneEvent("t1", d));
  const all = computeCapacityModel(schedule({ activities: activitiesWith([hourTask("t1", events)]) }), NOW);
  const scoped = computeCapacityModel(
    schedule({
      activities: activitiesWith([hourTask("t1", events)]),
      preferences: { startDate: "2026-08-24" },
    }),
    NOW,
  );
  assert.ok(scoped.weeks.length < all.weeks.length);
  assert.ok(scoped.weeks.every((w) => w.weekStartISO >= "2026-08-17"));
});

test("pre-adoption weeks are absence of data, not zero-capacity weeks", () => {
  // Four weeks of history, sampled against an 8-week window and NO explicit
  // tracking start. Counting the four empty pre-adoption weeks as zeroes would
  // halve the median — the trap this guards.
  const events = pastMondays(4).map((d) => doneEvent("t1", d));
  const model = computeCapacityModel(
    schedule({ activities: activitiesWith([hourTask("t1", events)]) }),
    NOW,
  );
  assert.equal(model.weeks.length, 4, "only weeks the user actually existed for");
  assert.equal(model.sustainedWeeklyMinutes, 60);
});

test("a genuine empty week AFTER adoption still counts against capacity", () => {
  // Weeks 1 and 3 worked, week 2 skipped. That zero is real signal, not a gap.
  const [w1, , w3] = pastMondays(3);
  const events = [doneEvent("t1", w1), doneEvent("t1", w3)];
  const model = computeCapacityModel(
    schedule({ activities: activitiesWith([hourTask("t1", events)]) }),
    NOW,
  );
  assert.equal(model.weeks.length, 3);
  assert.deepEqual(model.weeks.map((w) => w.completedMinutes), [60, 0, 60]);
  assert.equal(model.sustainedWeeklyMinutes, 60);
});

test("too little history reports no number rather than a guess", () => {
  const events = pastMondays(Math.max(1, MIN_CAPACITY_WEEKS - 2)).map((d) => doneEvent("t1", d));
  const s = schedule({
    activities: activitiesWith([hourTask("t1", events)]),
    // Tracking started recently, so only a couple of weeks are in scope.
    preferences: { startDate: "2026-09-07" },
  });
  const model = computeCapacityModel(s, NOW);
  assert.equal(model.hasEnoughData, false);
  assert.equal(model.sustainedWeeklyMinutes, null);
  assert.equal(assessPlannedLoad(model, 600), null);
});

// ── Planned load ─────────────────────────────────────────────────────────────

test("planned minutes count each weekday the task recurs on", () => {
  const s = schedule({ activities: activitiesWith([hourTask("t1", [])], ["monday", "wednesday", "friday"]) });
  assert.equal(plannedWeeklyMinutes(s, NOW), 180);
});

test("a paused plan's work is not planned work", () => {
  const s = schedule({
    plans: [plan({ status: "paused" })],
    activities: activitiesWith([hourTask("t1", [])]),
  });
  assert.equal(plannedWeeklyMinutes(s, NOW), 0);
});

test("commitments are excluded from planned load too, so both sides match", () => {
  const s = schedule({
    activities: activitiesWith([hourTask("t1", [], { taskType: "commitment" })]),
  });
  assert.equal(plannedWeeklyMinutes(s, NOW), 0);
});

// ── The verdict ──────────────────────────────────────────────────────────────

function modelWithSustained(minutesPerWeek) {
  return {
    weeks: [{ weekStartISO: "2026-09-07", completedMinutes: minutesPerWeek }],
    sustainedWeeklyMinutes: minutesPerWeek,
    byWeekday: Object.fromEntries(ALL_DAYS.map((d) => [d, 0])),
    bestWeekMinutes: minutesPerWeek,
    hasEnoughData: true,
  };
}

test("a week within the usual ceiling reads comfortable", () => {
  const v = assessPlannedLoad(modelWithSustained(600), 600);
  assert.equal(v.level, "comfortable");
  assert.match(v.message, /within your usual/i);
});

test("the stretch and unrealistic thresholds are where they claim to be", () => {
  const sustained = 600;
  assert.equal(assessPlannedLoad(modelWithSustained(sustained), sustained * STRETCH_RATIO).level, "stretch");
  assert.equal(
    assessPlannedLoad(modelWithSustained(sustained), sustained * STRETCH_RATIO - 1).level,
    "comfortable",
  );
  assert.equal(
    assessPlannedLoad(modelWithSustained(sustained), sustained * UNREALISTIC_RATIO).level,
    "unrealistic",
  );
});

test("the verdict quotes both real figures, never a generic caution", () => {
  const v = assessPlannedLoad(modelWithSustained(600), 1200);
  assert.match(v.message, /20h/);
  assert.match(v.message, /10h/);
  assert.equal(v.ratio, 2);
});

test("an unrealistic week names the best week only when it beats it", () => {
  const over = assessPlannedLoad({ ...modelWithSustained(600), bestWeekMinutes: 700 }, 1200);
  assert.match(over.message, /Even your best week was 11\.7h/);

  const under = assessPlannedLoad({ ...modelWithSustained(600), bestWeekMinutes: 1500 }, 1200);
  assert.ok(!/best week/i.test(under.message), "no point naming a best week the plan doesn't exceed");
});

test("a user with history but zero completions gets no verdict", () => {
  // Nothing to measure against — "∞× your usual" helps nobody.
  assert.equal(assessPlannedLoad(modelWithSustained(0), 600), null);
});

// ── Lumpiness ────────────────────────────────────────────────────────────────

test("heaviestDay finds the day most over its own usual, not the busiest day", () => {
  const model = {
    ...modelWithSustained(600),
    byWeekday: { ...Object.fromEntries(ALL_DAYS.map((d) => [d, 60])), sunday: 15 },
  };
  // Monday 2h (2x its usual 1h), Sunday 1h (4x its usual 15m).
  const activities = emptyActivities();
  activities.monday.push(hourTask("m1", []), hourTask("m2", []));
  activities.sunday.push(hourTask("s1", []));

  const worst = heaviestDay(schedule({ activities }), model, NOW);
  assert.equal(worst.day, "sunday", "relative overload beats absolute hours");
  assert.equal(worst.ratio, 4);
});

test("heaviestDay is silent without enough history, or when nothing stands out", () => {
  const activities = emptyActivities();
  activities.monday.push(hourTask("m1", []));
  assert.equal(heaviestDay(schedule({ activities }), { ...modelWithSustained(600), hasEnoughData: false }, NOW), null);

  const roomy = { ...modelWithSustained(600), byWeekday: Object.fromEntries(ALL_DAYS.map((d) => [d, 600])) };
  assert.equal(heaviestDay(schedule({ activities }), roomy, NOW), null);
});
