import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Resolves a bare URL by trying it as-is, then with a .ts extension, then
// .tsx — some imports we transitively pull in are .tsx files.
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

const { WELLNESS_PLAN_ID, ensureWellnessPlan, logMeal, logWellnessEntry, quickAmountsForUnit } =
  await import("../lib/wellness.ts");
const { sumEntriesForDate, entriesForDate, dailyTotals } = await import("../lib/metricEntries.ts");

/** Minimal empty Schedule — mirrors emptySchedule() in tests/goal.test.mjs. */
function emptySchedule() {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: {
      monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
    },
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    strategies: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
  };
}

// ── ensureWellnessPlan ───────────────────────────────────────────────────────

test("ensureWellnessPlan creates exactly one plan with 5 trackers", () => {
  const next = ensureWellnessPlan(emptySchedule());
  assert.equal(next.plans.filter((p) => p.id === WELLNESS_PLAN_ID).length, 1);
  const trackers = next.progressTrackers.filter((t) => t.planId === WELLNESS_PLAN_ID);
  assert.equal(trackers.length, 5);
});

test("ensureWellnessPlan is idempotent — calling it twice produces no duplicates", () => {
  const once = ensureWellnessPlan(emptySchedule());
  const twice = ensureWellnessPlan(once);
  assert.equal(twice.plans.filter((p) => p.id === WELLNESS_PLAN_ID).length, 1);
  assert.equal(twice.progressTrackers.filter((t) => t.planId === WELLNESS_PLAN_ID).length, 5);
});

test("ensureWellnessPlan returns the same reference when nothing changed", () => {
  const once = ensureWellnessPlan(emptySchedule());
  const twice = ensureWellnessPlan(once);
  assert.equal(twice, once);
});

test("ensureWellnessPlan never touches an already-renamed plan", () => {
  const withPlan = ensureWellnessPlan(emptySchedule());
  const renamed = {
    ...withPlan,
    plans: withPlan.plans.map((p) => (p.id === WELLNESS_PLAN_ID ? { ...p, title: "Health" } : p)),
  };
  const next = ensureWellnessPlan(renamed);
  const plan = next.plans.find((p) => p.id === WELLNESS_PLAN_ID);
  assert.equal(plan.title, "Health");
  assert.equal(next.plans.filter((p) => p.id === WELLNESS_PLAN_ID).length, 1);
});

test("ensureWellnessPlan recreates only a specifically deleted tracker", () => {
  const withPlan = ensureWellnessPlan(emptySchedule());
  const proteinId = withPlan.progressTrackers.find((t) => t.title === "Protein").id;
  const withoutProtein = {
    ...withPlan,
    progressTrackers: withPlan.progressTrackers.filter((t) => t.id !== proteinId),
  };
  const next = ensureWellnessPlan(withoutProtein);
  assert.equal(next.progressTrackers.filter((t) => t.planId === WELLNESS_PLAN_ID).length, 5);
  assert.ok(next.progressTrackers.some((t) => t.title === "Protein"));
});

// ── logMeal ──────────────────────────────────────────────────────────────────

test("logMeal appends only the provided macros, skipping blanks", () => {
  const next = logMeal(emptySchedule(), { dateISO: "2026-01-01", calories: 600, protein: 40 });
  const calTracker = next.progressTrackers.find((t) => t.title === "Calories");
  const proteinTracker = next.progressTrackers.find((t) => t.title === "Protein");
  const carbTracker = next.progressTrackers.find((t) => t.title === "Carbs");

  assert.equal(entriesForDate(next.metricEntries, calTracker.id, "2026-01-01").length, 1);
  assert.equal(entriesForDate(next.metricEntries, proteinTracker.id, "2026-01-01").length, 1);
  assert.equal(entriesForDate(next.metricEntries, carbTracker.id, "2026-01-01").length, 0);
  assert.equal(sumEntriesForDate(next.metricEntries, calTracker.id, "2026-01-01"), 600);
});

test("logMeal never writes a false zero row for an omitted macro", () => {
  const next = logMeal(emptySchedule(), { dateISO: "2026-01-01", calories: 600 });
  const fatTracker = next.progressTrackers.find((t) => t.title === "Fat");
  assert.equal(entriesForDate(next.metricEntries, fatTracker.id, "2026-01-01").length, 0);
});

test("logMeal on a schedule that already has the plan doesn't re-append it", () => {
  const withPlan = ensureWellnessPlan(emptySchedule());
  const next = logMeal(withPlan, { dateISO: "2026-01-01", calories: 500 });
  assert.equal(next.plans.filter((p) => p.id === WELLNESS_PLAN_ID).length, 1);
  assert.equal(next.progressTrackers.filter((t) => t.planId === WELLNESS_PLAN_ID).length, 5);
});

test("logMeal with no positive macros bootstraps the plan but writes no entries", () => {
  const next = logMeal(emptySchedule(), { dateISO: "2026-01-01" });
  assert.equal(next.plans.filter((p) => p.id === WELLNESS_PLAN_ID).length, 1);
  assert.equal(next.metricEntries.length, 0);
});

// ── logWellnessEntry ─────────────────────────────────────────────────────────

test("logWellnessEntry bootstraps the plan and logs one entry", () => {
  const next = logWellnessEntry(emptySchedule(), "water", 250, "2026-01-01");
  const waterTracker = next.progressTrackers.find((t) => t.title === "Water");
  assert.equal(sumEntriesForDate(next.metricEntries, waterTracker.id, "2026-01-01"), 250);
});

test("logWellnessEntry ignores a non-positive value", () => {
  const next = logWellnessEntry(emptySchedule(), "water", 0, "2026-01-01");
  assert.equal(next.metricEntries.length, 0);
});

// ── metricEntries helpers ────────────────────────────────────────────────────

test("sumEntriesForDate sums same-date/same-tracker entries only", () => {
  let schedule = logWellnessEntry(emptySchedule(), "water", 250, "2026-01-01");
  schedule = logWellnessEntry(schedule, "water", 250, "2026-01-01");
  schedule = logWellnessEntry(schedule, "water", 250, "2026-01-02"); // different date
  schedule = logWellnessEntry(schedule, "calories", 100, "2026-01-01"); // different tracker

  const waterTracker = schedule.progressTrackers.find((t) => t.title === "Water");
  assert.equal(sumEntriesForDate(schedule.metricEntries, waterTracker.id, "2026-01-01"), 500);
});

test("dailyTotals sums per date and sorts ascending", () => {
  let schedule = logWellnessEntry(emptySchedule(), "water", 100, "2026-01-02");
  schedule = logWellnessEntry(schedule, "water", 200, "2026-01-01");
  schedule = logWellnessEntry(schedule, "water", 300, "2026-01-01");

  const waterTracker = schedule.progressTrackers.find((t) => t.title === "Water");
  const totals = dailyTotals(schedule.metricEntries, waterTracker.id);
  assert.deepEqual(totals, [
    { date: "2026-01-01", value: 500 },
    { date: "2026-01-02", value: 100 },
  ]);
});

// ── quickAmountsForUnit ──────────────────────────────────────────────────────

test("quickAmountsForUnit returns presets for known units", () => {
  assert.deepEqual(quickAmountsForUnit("ml"), [100, 250, 500]);
  assert.deepEqual(quickAmountsForUnit("kcal"), [100, 250, 500]);
  assert.deepEqual(quickAmountsForUnit("g"), [10, 25, 50]);
});

test("quickAmountsForUnit returns [] for unknown/missing units — no regression for existing trackers", () => {
  assert.deepEqual(quickAmountsForUnit("sets"), []);
  assert.deepEqual(quickAmountsForUnit(undefined), []);
  assert.deepEqual(quickAmountsForUnit(""), []);
});
