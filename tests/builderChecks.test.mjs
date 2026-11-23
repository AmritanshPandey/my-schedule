/**
 * Coverage for lib/intelligence/builderChecks.ts — hints while writing goals,
 * milestones and tasks.
 *
 * Two failure modes matter: missing a real problem (a goal with no finish line,
 * a task parked where this person never finishes anything), and nagging about
 * a fine one. Both directions are tested.
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
  reviewGoalDraft,
  reviewMilestoneDraft,
  reviewTaskDraft,
  buildTaskReviewContext,
  looksCompound,
  titleSimilarity,
  MAX_HINTS,
} = await import("@/lib/intelligence/builderChecks.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-19T18:00:00"); // a Saturday
const TODAY = "2026-09-19";

function weekdayOf(iso) {
  return ALL_DAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];
}

/** The N dates immediately before today, most recent first. */
function recentDates(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${TODAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function event(taskId, dateISO, type) {
  return { id: `${taskId}-${dateISO}-${type}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: type };
}

/** One task, outcome decided per date by `outcomeFor(dateISO)` → "task" | "missed" | null. */
function task(id, startTime, endTime, outcomeFor, { days = ALL_DAYS, planId = "p1", lookback = 28 } = {}) {
  const events = recentDates(lookback)
    .filter((d) => days.includes(weekdayOf(d)))
    .map((d) => [d, outcomeFor(d)])
    .filter(([, type]) => type)
    .map(([d, type]) => event(id, d, type));
  return { id, title: id, startTime, endTime, planId, completionHistory: events, _days: days };
}

function schedule(tasks, overrides = {}) {
  const activities = Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
  for (const t of tasks) {
    const { _days, ...clean } = t;
    for (const d of _days) activities[d].push({ ...clean });
  }
  return {
    goals: [],
    goalConnections: [],
    plans: [
      { id: "p1", title: "Fitness", category: "fitness", emoji: "run", color: "emerald", items: [] },
      { id: "p2", title: "Spanish", category: "learning", emoji: "language", color: "blue", items: [] },
    ],
    categories: [],
    activities,
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: { dayStartTime: "5:00 AM" },
    ...overrides,
  };
}

const always = () => "task";
const never = () => "missed";
/** Done only on the oldest days, missed recently — rate ≤ 40%, still slipping. */
const mostlyMissed = (d) => (d < "2026-08-28" ? "task" : "missed");


const ids = (hints) => hints.map((h) => h.id);

// ── Text helpers ─────────────────────────────────────────────────────────────

test("compound goals are spotted without flagging a single compound action", () => {
  assert.equal(looksCompound("Lose 5kg and learn Spanish"), true);
  assert.equal(looksCompound("Read and summarise 10 papers"), false);
  assert.equal(looksCompound("Ship the beta and get 100 users"), true);
  assert.equal(looksCompound("Salt and pepper shaker business"), false);
});

test("near-duplicate titles match regardless of order and filler words", () => {
  assert.ok(titleSimilarity("Morning run", "Run (morning)") >= 0.75);
  assert.ok(titleSimilarity("Morning run", "Evening review") < 0.3);
});

// ── Goals ────────────────────────────────────────────────────────────────────

test("a vague goal with no number and no date gets the two most useful hints", () => {
  const hints = reviewGoalDraft({ title: "Get better at Spanish" }, NOW);
  assert.ok(hints.length <= MAX_HINTS);
  assert.deepEqual(ids(hints), ["goal-vague", "goal-deadline"]);
  assert.match(hints[0].message, /get better/i);
});

test("a concrete, dated goal gets no hints", () => {
  assert.deepEqual(reviewGoalDraft({ title: "Run a 10K under 55 min", targetDate: "2026-12-01" }, NOW), []);
  assert.deepEqual(reviewGoalDraft({ title: "Pass the GMAT with 705", targetDate: "2027-03-01" }, NOW), []);
});

test("impossible dates are called out first", () => {
  assert.equal(reviewGoalDraft({ title: "Run a 10K", startDate: "2026-10-01", targetDate: "2026-09-01" }, NOW)[0].id, "goal-dates");
  assert.equal(reviewGoalDraft({ title: "Run a 10K", targetDate: "2026-01-01" }, NOW)[0].id, "goal-past");
});

test("half-typed titles get nothing", () => {
  assert.deepEqual(reviewGoalDraft({ title: "Ru" }, NOW), []);
});

// ── Milestones ───────────────────────────────────────────────────────────────

const msDraft = (over = {}) => ({ title: "Run 5K without stopping", startDate: "2026-09-20", plannedDurationDays: 21, plannedEndDate: "2026-10-10", ...over });

test("a measurable milestone of sensible length is left alone", () => {
  assert.deepEqual(reviewMilestoneDraft(msDraft(), [], { mode: "create", now: NOW }), []);
});

test("duplicates, vague finish lines and odd lengths are caught", () => {
  assert.equal(
    reviewMilestoneDraft(msDraft({ title: "5K run without stopping" }), [{ id: "m0", title: "Run 5K without stopping" }], { mode: "create", now: NOW })[0].id,
    "ms-duplicate",
  );
  assert.deepEqual(ids(reviewMilestoneDraft(msDraft({ title: "Build running habit" }), [], { mode: "create", now: NOW })), ["ms-vague"]);
  assert.deepEqual(ids(reviewMilestoneDraft(msDraft({ plannedDurationDays: 2 }), [], { mode: "create", now: NOW })), ["ms-short"]);
  assert.deepEqual(ids(reviewMilestoneDraft(msDraft({ plannedDurationDays: 120 }), [], { mode: "create", now: NOW })), ["ms-long"]);
});

test("editing a milestone doesn't flag it as a duplicate of itself", () => {
  const hints = reviewMilestoneDraft(msDraft({ linkedActivities: ["t1"] }), [{ id: "m1", title: "Run 5K without stopping" }], { mode: "edit", editingId: "m1", now: NOW });
  assert.deepEqual(hints, []);
});

// ── Tasks ────────────────────────────────────────────────────────────────────

test("a new task in a slot this person rarely finishes gets the evidence and a free better time", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);
  const ctx = buildTaskReviewContext(s, NOW);
  const hints = reviewTaskDraft({ title: "Journal", days: ["monday", "tuesday"], startTime: "22:00", endTime: "22:30" }, ctx);
  const band = hints.find((h) => h.id === "task-band");
  assert.ok(band, ids(hints).join(","));
  assert.match(band.message, /late at night/);
  assert.ok(band.action, "a one-tap fix is offered when there's room");
  assert.match(band.action.startTime, /^0[5-8]:\d{2}$/, `moved into the early morning (${band.action.startTime})`);
});

test("a task in a reliable slot, with no history problems, gets no hints", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always)]);
  const ctx = buildTaskReviewContext(s, NOW);
  assert.deepEqual(reviewTaskDraft({ title: "Stretch", days: ["monday"], startTime: "08:00", endTime: "08:15" }, ctx), []);
});

test("duplicates are flagged for new tasks only", () => {
  const s = schedule([task("Morning run", "7:00 AM", "7:45 AM", always)]);
  const ctx = buildTaskReviewContext(s, NOW);
  const fresh = reviewTaskDraft({ title: "Run morning", days: ["monday"], startTime: "08:00", endTime: "08:30" }, ctx);
  assert.equal(fresh[0]?.id, "task-duplicate");
  const editing = reviewTaskDraft({ title: "Morning run", days: ["monday"], startTime: "07:00", endTime: "07:45", taskId: "Morning run" }, ctx);
  assert.ok(!ids(editing).includes("task-duplicate"));
});

test("commitments are never coached on timing", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);
  const ctx = buildTaskReviewContext(s, NOW);
  const hints = reviewTaskDraft({ title: "Commute", taskType: "commitment", days: ["monday"], startTime: "22:00", endTime: "22:30" }, ctx);
  assert.deepEqual(hints, []);
});

// ── Clashes ──────────────────────────────────────────────────────────────────

const clash = (hints) => hints.find((h) => h.id === "task-overlap");

test("a task that sits on top of another is flagged first, with the next free time", () => {
  const s = schedule([task("Strength workout", "7:00 AM", "8:00 AM", always, { days: ["monday", "wednesday"] })]);
  const hints = reviewTaskDraft({ title: "Read", days: ["monday"], startTime: "07:30", endTime: "08:00" }, buildTaskReviewContext(s, NOW));
  assert.equal(hints[0]?.id, "task-overlap", ids(hints).join(","));
  assert.match(hints[0].message, /Overlaps "Strength workout" \(7:00 AM–8:00 AM\) on Monday/);
  assert.deepEqual([hints[0].action?.startTime, hints[0].action?.endTime], ["08:00", "08:30"]);
});

test("back-to-back is not a clash", () => {
  const s = schedule([task("Strength workout", "7:00 AM", "8:00 AM", always)]);
  const hints = reviewTaskDraft({ title: "Read", days: ["monday"], startTime: "08:00", endTime: "08:30" }, buildTaskReviewContext(s, NOW));
  assert.equal(clash(hints), undefined);
});

test("the move skips a second block that would also clash, and must be free on every day", () => {
  const s = schedule([
    task("Workout", "7:00 AM", "8:00 AM", always, { days: ["monday"] }),
    task("Standup", "8:00 AM", "8:30 AM", always, { days: ["tuesday"] }),
  ]);
  const hint = clash(reviewTaskDraft({ title: "Read", days: ["monday", "tuesday"], startTime: "07:30", endTime: "08:00" }, buildTaskReviewContext(s, NOW)));
  assert.equal(hint.action?.startTime, "08:30");
});

test("editing a task never clashes with itself, or with the task it is merged with", () => {
  const s = schedule([
    { ...task("A", "7:00 AM", "8:00 AM", always, { days: ["monday"] }), mergeGroupId: "g" },
    { ...task("B", "7:00 AM", "8:00 AM", always, { days: ["monday"] }), mergeGroupId: "g" },
  ]);
  const hints = reviewTaskDraft({ title: "A", days: ["monday"], startTime: "07:00", endTime: "08:00", taskId: "A" }, buildTaskReviewContext(s, NOW));
  assert.equal(clash(hints), undefined);
});

test("a task that no longer runs, or a past one-off, doesn't count", () => {
  const s = schedule([
    { ...task("Old", "7:00 AM", "8:00 AM", always, { days: ["monday"] }), activeUntil: "2026-09-01" },
    { ...task("Done once", "7:00 AM", "8:00 AM", always, { days: ["monday"] }), recurrence: { type: "once", dateISO: "2026-09-14" } },
  ]);
  const hints = reviewTaskDraft({ title: "Read", days: ["monday"], startTime: "07:30", endTime: "08:00" }, buildTaskReviewContext(s, NOW));
  assert.equal(clash(hints), undefined);
});

test("a one-off is checked against that date only", () => {
  const s = schedule([task("Weekly call", "9:00 AM", "10:00 AM", always, { days: ["monday"] })]);
  const ctx = buildTaskReviewContext(s, NOW);
  const onMonday = reviewTaskDraft({ title: "Dentist", days: ["monday"], dateISO: "2026-09-21", startTime: "09:30", endTime: "10:30" }, ctx);
  assert.equal(onMonday[0]?.id, "task-overlap");
  assert.doesNotMatch(onMonday[0].message, / on Monday/, "a one-off doesn't name a weekday");
});

test("held time clashes too", () => {
  const s = schedule([task("Commute", "8:00 AM", "9:00 AM", always, { days: ["monday"] })]);
  const hints = reviewTaskDraft({ title: "Gym", taskType: "commitment", days: ["monday"], startTime: "08:30", endTime: "09:30" }, buildTaskReviewContext(s, NOW));
  assert.equal(hints[0]?.id, "task-overlap");
});
