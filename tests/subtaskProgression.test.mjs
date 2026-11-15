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
  applyPercent, subtaskConsistency, pendingProgression, decideProgression, periodRange, canProgress,
  describeStep, describeEvidence, progressionStepId,
} = await import("../lib/subtaskProgression.ts");
const { currentTargets } = await import("../lib/subtaskTargets.ts");
const { DAYS } = await import("../lib/scheduleConstants.ts");

// Weeks start Monday. 2026-10-12 is a Monday; "today" is in the week after.
const TODAY = "2026-10-21"; // Wednesday
const LAST_WEEK = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

const legPress = (over = {}) => ({
  id: "s1", task: "Leg Press", targets: { sets: 3, reps: 10, weight: 60, weightUnit: "kg" },
  progression: { percent: 5, cadence: "weekly", figure: "weight", threshold: 80, startISO: "2026-10-01" },
  ...over,
});
const subEvent = (dateISO, sub = "s1") => ({ id: `e-${dateISO}-${sub}`, taskId: "t1", completedAt: `${dateISO}T10:00:00`, completionType: "subtask", subtaskId: sub });
const taskEvent = (dateISO) => ({ id: `e-${dateISO}-task`, taskId: "t1", completedAt: `${dateISO}T10:00:00`, completionType: "task" });

/** A Mon/Wed/Fri task; each weekday copy holds only its own day's events, as in the app. */
function schedule({ events = [], entry = legPress(), steps = [], plan = { id: "p1", status: "active" }, subtasks } = {}) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const day of ["monday", "wednesday", "friday"]) {
    const mine = events.filter((e) => {
      const js = new Date(e.completedAt).getDay();
      return ({ monday: 1, wednesday: 3, friday: 5 })[day] === js;
    });
    activities[day] = [{
      id: "t1", title: "Legs", startTime: "07:00 AM", endTime: "08:00 AM", planId: "p1",
      subtasks: subtasks === undefined ? [entry] : subtasks, completionHistory: mine,
    }];
  }
  return {
    goals: [], plans: [{ id: "p1", title: "Strength", items: [entry], ...plan }], categories: [], activities,
    progressTrackers: [], metricEntries: [], milestones: [], rituals: [], ritualCompletions: [], notes: [], events: [],
    preferences: {}, progressionSteps: steps,
  };
}
const task = (s) => s.activities.monday[0];

// ── Rounding ───────────────────────────────────────────────────────────────

test("weight rounds to the plate step, counts to whole numbers, and every step moves", () => {
  assert.deepEqual(applyPercent({ weight: 60, weightUnit: "kg" }, 5, "weight"), { weight: 63, weightUnit: "kg" });
  assert.deepEqual(applyPercent({ weight: 20, weightUnit: "kg" }, 1, "weight"), { weight: 20.5, weightUnit: "kg" }, "+1% of 20 kg would round away; it still moves a plate");
  assert.deepEqual(applyPercent({ weight: 135, weightUnit: "lb" }, 5, "weight"), { weight: 142, weightUnit: "lb" });
  assert.deepEqual(applyPercent({ reps: 10 }, 5, "reps"), { reps: 11 }, "10.5 would round down to 10 — min one rep");
  assert.deepEqual(applyPercent({ minutes: 30 }, 10, "minutes"), { minutes: 33 });
});

test("'all' raises every figure that is set, and only those", () => {
  assert.deepEqual(applyPercent({ sets: 3, reps: 10, weight: 60, weightUnit: "kg", minutes: 5 }, 10, "all"),
    { sets: 4, reps: 11, minutes: 6, weight: 66, weightUnit: "kg" });
  assert.deepEqual(applyPercent({ reps: 10 }, 10, "weight"), {}, "nothing to raise");
});

// ── Consistency ────────────────────────────────────────────────────────────

test("consistency counts scheduled days only, across every weekday copy", () => {
  const s = schedule({ events: [subEvent("2026-10-12"), subEvent("2026-10-14"), subEvent("2026-10-16")] });
  assert.deepEqual(subtaskConsistency(s, "t1", "s1", LAST_WEEK[0], LAST_WEEK[6]), { scheduled: 3, done: 3, rate: 1 },
    "Mon/Wed/Fri: Tuesday is not a missed day");
});

test("a whole-task completion counts for its subtasks", () => {
  const s = schedule({ events: [taskEvent("2026-10-12"), subEvent("2026-10-14")] });
  assert.equal(subtaskConsistency(s, "t1", "s1", LAST_WEEK[0], LAST_WEEK[6]).done, 2);
});

test("another subtask's ticks don't count, and skipped days aren't scheduled", () => {
  const s = schedule({ events: [subEvent("2026-10-12", "s2")] });
  s.activities.friday[0].exceptions = { "2026-10-16": { skipped: true } };
  assert.deepEqual(subtaskConsistency(s, "t1", "s1", LAST_WEEK[0], LAST_WEEK[6]), { scheduled: 2, done: 0, rate: 0 });
});

test("tracking start and paused plans mean no evidence", () => {
  const s = schedule({ events: [subEvent("2026-10-16")] });
  s.preferences.startDate = "2026-10-15";
  assert.equal(subtaskConsistency(s, "t1", "s1", LAST_WEEK[0], LAST_WEEK[6]).scheduled, 1);
  assert.equal(subtaskConsistency(schedule({ plan: { status: "paused" } }), "t1", "s1", LAST_WEEK[0], LAST_WEEK[6]), null);
  assert.equal(subtaskConsistency(schedule(), "t1", "s1", "2026-10-13", "2026-10-13"), null, "a Tuesday alone schedules nothing");
});

// ── Suggestions ────────────────────────────────────────────────────────────

const consistentWeek = [subEvent("2026-10-12"), subEvent("2026-10-14"), subEvent("2026-10-16")];

test("a consistent last week suggests the step, judged on the complete period", () => {
  const s = schedule({ events: consistentWeek });
  const suggestion = pendingProgression(s, task(s), legPress(), TODAY);
  assert.equal(suggestion.periodStartISO, "2026-10-12");
  assert.deepEqual(suggestion.to, { weight: 63, weightUnit: "kg" });
  assert.equal(describeStep(suggestion.from, suggestion.to), "60 → 63 kg");
  assert.equal(describeEvidence(suggestion.consistency, "weekly"), "Done 3 of 3 times last week");
});

test("below the threshold, nothing is suggested; the threshold is the user's", () => {
  const twoOfThree = schedule({ events: consistentWeek.slice(0, 2) });
  assert.equal(pendingProgression(twoOfThree, task(twoOfThree), legPress(), TODAY), null, "67% < 80%");
  const lenient = legPress({ progression: { ...legPress().progression, threshold: 60 } });
  const s = schedule({ events: consistentWeek.slice(0, 2), entry: lenient });
  assert.ok(pendingProgression(s, task(s), lenient, TODAY));
});

test("progression switched on mid-period waits for a full period", () => {
  const late = legPress({ progression: { ...legPress().progression, startISO: "2026-10-14" } });
  const s = schedule({ events: consistentWeek, entry: late });
  assert.equal(pendingProgression(s, task(s), late, TODAY), null);
});

test("editing the targets by hand restarts the evidence", () => {
  const edited = legPress({ targetsSetAt: "2026-10-15T09:00:00.000Z" });
  const s = schedule({ events: consistentWeek, entry: edited });
  assert.equal(pendingProgression(s, task(s), edited, TODAY), null);
});

test("accepting records the new figures and applies them; the next period must be earned", () => {
  const s = schedule({ events: consistentWeek });
  const suggestion = pendingProgression(s, task(s), legPress(), TODAY);
  const accepted = decideProgression(s, suggestion, "accepted", "2026-10-21T08:00:00.000Z");
  assert.equal(accepted.progressionSteps[0].id, progressionStepId("t1", "s1", "2026-10-12"));
  assert.equal(currentTargets(legPress(), "t1", accepted.progressionSteps).weight, 63);
  assert.equal(pendingProgression(accepted, task(accepted), legPress(), TODAY), null, "the decided period isn't offered again");
  // A week later, last week (Oct 19–25) is the first period at the new weight.
  const nextWeek = schedule({ events: [...consistentWeek, subEvent("2026-10-19"), subEvent("2026-10-21"), subEvent("2026-10-23")], steps: accepted.progressionSteps });
  const next = pendingProgression(nextWeek, task(nextWeek), legPress(), "2026-10-28");
  assert.deepEqual(next.to, { weight: 66, weightUnit: "kg" }, "steps compound from the accepted figures");
});

test("holding skips that period only", () => {
  const s = schedule({ events: consistentWeek });
  const held = decideProgression(s, pendingProgression(s, task(s), legPress(), TODAY), "held");
  assert.equal(pendingProgression(held, task(held), legPress(), TODAY), null);
  assert.equal(currentTargets(legPress(), "t1", held.progressionSteps).weight, 60, "a hold changes nothing");
  const nextWeek = schedule({ events: [...consistentWeek, subEvent("2026-10-19"), subEvent("2026-10-21"), subEvent("2026-10-23")], steps: held.progressionSteps });
  assert.ok(pendingProgression(nextWeek, task(nextWeek), legPress(), "2026-10-28"), "the next consistent period suggests again");
});

test("plan-template subtasks can't progress", () => {
  const s = schedule({ events: consistentWeek, subtasks: null });
  for (const day of DAYS) for (const t of s.activities[day]) delete t.subtasks;
  assert.equal(canProgress(task(s)), false);
  assert.equal(pendingProgression(s, task(s), legPress(), TODAY), null);
});

test("period ranges are inclusive and calendar-true", () => {
  assert.deepEqual(periodRange("weekly", "2026-10-21"), { startISO: "2026-10-19", endISO: "2026-10-25" });
  assert.deepEqual(periodRange("monthly", "2026-02-10"), { startISO: "2026-02-01", endISO: "2026-02-28" });
  assert.deepEqual(periodRange("yearly", "2026-06-01"), { startISO: "2026-01-01", endISO: "2026-12-31" });
});
