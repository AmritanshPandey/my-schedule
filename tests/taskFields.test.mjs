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

const { inferFieldKind, categoryFieldKind, taskFieldTemplate, filledFields, detailsDurationMinutes, formatFieldValue, normalizeTaskDetails, reconcileFinanceEntries } =
  await import("@/packages/core/lib/taskFields.ts");
const { subtaskDraftToEntry, entryToSubtaskDraft } = await import("@/packages/core/lib/subtaskDraft.ts");
const { migrate } = await import("@/packages/core/lib/scheduleMigrate.ts");

// ── Which template ──────────────────────────────────────────────────────────

test("a category's name or icon suggests its kind", () => {
  assert.equal(inferFieldKind({ title: "Grocery run", icon: "star" }), "shopping");
  assert.equal(inferFieldKind({ title: "Untitled", icon: "chefhat" }), "cooking");
  assert.equal(inferFieldKind({ title: "Untitled", icon: "star" }), null);
  assert.equal(inferFieldKind({ title: "Workout", icon: "star" }), "fitness");
  assert.equal(inferFieldKind({ title: "Deep work", icon: "star" }), "work");
  assert.equal(inferFieldKind({ title: "Start the day", icon: "star" }), null);
});

test("a chosen kind wins, and 'none' turns fields off", () => {
  assert.equal(categoryFieldKind({ title: "Workout", icon: "barbell", fieldKind: "creative" }), "creative");
  assert.equal(categoryFieldKind({ title: "Workout", icon: "barbell", fieldKind: "none" }), null);
  assert.equal(categoryFieldKind(null), null);
});

test("a task reaches its template through its category", () => {
  const categories = [{ id: "c1", title: "Meals", icon: "chefhat", color: "amber" }];
  assert.equal(taskFieldTemplate({ categoryId: "c1" }, categories).listLabel, "Ingredients");
  assert.equal(taskFieldTemplate({ categoryId: "gone" }, categories), null);
});

// ── Values ──────────────────────────────────────────────────────────────────

test("blank fields are hidden; filled ones keep template order", () => {
  const t = taskFieldTemplate({ categoryId: "c" }, [{ id: "c", title: "Study", icon: "school", color: "blue" }]);
  const shown = filledFields(t, { difficulty: "Hard", subject: "Physics", topic: "" });
  assert.deepEqual(shown.map((f) => f.def.key), ["subject", "difficulty"]);
});

test("duration fields add up to the planned length", () => {
  const cooking = taskFieldTemplate({ categoryId: "c" }, [{ id: "c", title: "Cooking", icon: "chefhat", color: "amber" }]);
  assert.equal(detailsDurationMinutes(cooking, { prepMinutes: 15, cookMinutes: 40, servings: 4 }), 55);
  assert.equal(detailsDurationMinutes(cooking, { servings: 4 }), null);
});

test("values format for display", () => {
  assert.equal(formatFieldValue({ key: "d", label: "D", type: "minutes" }, 95), "1h 35m");
  assert.equal(formatFieldValue({ key: "p", label: "P", type: "percent" }, 42.4), "42%");
  assert.equal(formatFieldValue({ key: "t", label: "T", type: "tracker" }, "k1", () => "Spending"), "Spending");
});

test("details keep only non-empty strings and finite numbers", () => {
  assert.deepEqual(normalizeTaskDetails({ a: " x ", b: "", c: 3, d: NaN, e: null }), { a: "x", c: 3 });
  assert.equal(normalizeTaskDetails({ b: "" }), undefined);
  assert.equal(normalizeTaskDetails([]), undefined);
});

test("checklist items keep quantity and cost through the form", () => {
  const entry = subtaskDraftToEntry({ ...entryToSubtaskDraft({ id: "s1", task: "Milk" }), quantity: " 2 L ", cost: 1.5 });
  assert.equal(entry.quantity, "2 L");
  assert.equal(entry.cost, 1.5);
});

test("a stored category's chosen kind survives loading; junk doesn't", () => {
  const base = { plans: [], activities: {}, progressTrackers: [], metricEntries: [] };
  const s = migrate({ ...base, categories: [{ id: "c1", title: "Meals", icon: "chefhat", color: "amber", fieldKind: "travel" }, { id: "c2", title: "X", icon: "star", color: "amber", fieldKind: "bogus" }] });
  assert.equal(s.categories.find((c) => c.id === "c1").fieldKind, "travel");
  assert.equal(s.categories.find((c) => c.id === "c2").fieldKind, undefined);
});

// ── Finance logging ─────────────────────────────────────────────────────────

const NOW = new Date("2026-11-20T12:00:00");
const days = () => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
const done = (iso) => ({ id: `e-${iso}`, taskId: "rent", completedAt: `${iso}T09:00:00`, completionType: "task" });
function financeSchedule(history, over = {}) {
  const activities = days();
  activities.thursday = [{ id: "rent", title: "Rent", planId: "p1", categoryId: "fin", startTime: "9:00 AM", endTime: "9:15 AM", details: { amount: 1200, trackerId: "k1" }, completionHistory: history }];
  return {
    categories: [{ id: "fin", title: "Bills", icon: "coin", color: "emerald" }],
    progressTrackers: [{ id: "k1", planId: "p1", title: "Spending", type: "number", unit: "$" }],
    metricEntries: [],
    activities,
    ...over,
  };
}

test("completing a Finance task logs its amount once per day", () => {
  const s = reconcileFinanceEntries(financeSchedule([done("2026-11-19"), done("2026-11-19"), done("2026-11-12")]), NOW);
  assert.deepEqual(s.metricEntries.map((e) => [e.date, e.value, e.trackerId]).sort(), [["2026-11-12", 1200, "k1"], ["2026-11-19", 1200, "k1"]]);
});

test("un-completing removes that day's entry; nothing to change returns the same schedule", () => {
  const logged = reconcileFinanceEntries(financeSchedule([done("2026-11-19")]), NOW);
  const undone = reconcileFinanceEntries({ ...logged, activities: financeSchedule([]).activities }, NOW);
  assert.deepEqual(undone.metricEntries, []);
  assert.equal(reconcileFinanceEntries(logged, NOW), logged);
});

test("a changed amount doesn't rewrite what's logged", () => {
  const logged = reconcileFinanceEntries(financeSchedule([done("2026-11-19")]), NOW);
  const acts = days();
  acts.thursday = [{ ...logged.activities.thursday[0], details: { amount: 999, trackerId: "k1" } }];
  assert.equal(reconcileFinanceEntries({ ...logged, activities: acts }, NOW).metricEntries[0].value, 1200);
});

test("old entries and a deleted task's entries are kept", () => {
  const old = { id: "fin~rent~2026-05-01", planId: "p1", trackerId: "k1", value: 1200, date: "2026-05-01" };
  const gone = { id: "fin~deleted~2026-11-18", planId: "p1", trackerId: "k1", value: 50, date: "2026-11-18" };
  const s = reconcileFinanceEntries(financeSchedule([], { metricEntries: [old, gone] }), NOW);
  assert.deepEqual(s.metricEntries.map((e) => e.id).sort(), [gone.id, old.id].sort());
});

test("no tracker chosen, no logging", () => {
  const s = financeSchedule([done("2026-11-19")]);
  s.activities.thursday[0].details = { amount: 1200 };
  assert.deepEqual(reconcileFinanceEntries(s, NOW).metricEntries, []);
});
