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
const { ritualDayProgress, summarizeRoutineDay, clampFollowed } =
  await import("../lib/consistency/ritualDayStatus.ts");
const { markRitualDone, unmarkRitualDone, appendRitualLog, toggleRitualStep, toggleRitualCompletion } =
  await import("../lib/ritualCompletions.ts");
const { calculateRitualStats } = await import("../lib/consistency/calculateRitualStreak.ts");
const { validateSchedule } = await import("../lib/scheduleSchema.ts");
const { ritualCompletionKey } = await import("../lib/stampSchedule.ts");

const DAY = "2026-01-09";
const ritual = (overrides = {}) => ({ id: "r1", title: "Protein intake", time: "08:00", ...overrides });

// ── Marking done ────────────────────────────────────────────────────────────

test("marking done at 100% writes the same bare row a legacy checkbox does", () => {
  const next = markRitualDone([], "r1", DAY);
  assert.deepEqual(next, [{ ritualId: "r1", date: DAY }]);
  assert.deepEqual(next, toggleRitualCompletion([], "r1", DAY));
});

test("marking done with a rating stores it on the day row", () => {
  const next = markRitualDone([], "r1", DAY, 75);
  assert.deepEqual(next, [{ ritualId: "r1", date: DAY, followed: 75 }]);
  const progress = ritualDayProgress(ritual(), next);
  assert.equal(progress.complete, true);
  assert.equal(progress.markedDone, true);
  assert.equal(progress.followed, 75);
});

test("re-rating replaces the mark in place — never a second row", () => {
  let c = markRitualDone([], "r1", DAY, 50);
  c = markRitualDone(c, "r1", DAY, 75);
  assert.equal(c.length, 1);
  assert.equal(c[0].followed, 75);
  c = markRitualDone(c, "r1", DAY, 100);
  assert.deepEqual(c, [{ ritualId: "r1", date: DAY }]);
});

test("re-rating keeps the row's sync identity", () => {
  const legacy = [{ ritualId: "r1", date: DAY }];
  const rated = markRitualDone(legacy, "r1", DAY, 50);
  assert.equal(ritualCompletionKey(rated[0]), ritualCompletionKey(legacy[0]));
});

test("ratings are clamped to 1–100 and rounded", () => {
  assert.equal(markRitualDone([], "r1", DAY, 0)[0].followed, 1);
  assert.deepEqual(markRitualDone([], "r1", DAY, 140), [{ ritualId: "r1", date: DAY }]);
  assert.equal(markRitualDone([], "r1", DAY, 66.6)[0].followed, 67);
  assert.equal(clampFollowed(undefined), 100);
  assert.equal(clampFollowed(-5), 1);
  assert.equal(clampFollowed(Number.NaN), 100);
});

test("two marks for one day (two devices, pre-sync) collapse to one on the next rating", () => {
  const twoMarks = [{ ritualId: "r1", date: DAY }, { ritualId: "r1", date: DAY, followed: 50 }];
  assert.equal(ritualDayProgress(ritual(), twoMarks).followed, 50);
  const c = markRitualDone(twoMarks, "r1", DAY, 25);
  assert.equal(c.length, 1);
  assert.equal(c[0].followed, 25);
});

test("marking done leaves logged amounts and ticked steps alone", () => {
  const r = ritual({ trackingType: "quantity", target: 120, unit: "g" });
  let c = appendRitualLog([], "r1", DAY, 60);
  c = markRitualDone(c, "r1", DAY, 50);
  assert.equal(c.filter((e) => e.value === 60).length, 1);
  const progress = ritualDayProgress(r, c);
  assert.equal(progress.value, 60);
  assert.equal(progress.complete, true);
  assert.equal(progress.followed, 50);
});

test("unmarking removes only the day mark", () => {
  const r = ritual({ trackingType: "quantity", target: 120, unit: "g" });
  let c = appendRitualLog([], "r1", DAY, 120);
  c = markRitualDone(c, "r1", DAY, 80);
  c = unmarkRitualDone(c, "r1", DAY);
  assert.equal(c.length, 1);
  const progress = ritualDayProgress(r, c);
  // Still done — it reached its target through logging.
  assert.equal(progress.complete, true);
  assert.equal(progress.markedDone, false);
  assert.equal(progress.followed, 100);
});

test("unmarking one routine never touches another", () => {
  let c = markRitualDone([], "r1", DAY);
  c = markRitualDone(c, "r2", DAY, 50);
  c = unmarkRitualDone(c, "r1", DAY);
  assert.deepEqual(c, [{ ritualId: "r2", date: DAY, followed: 50 }]);
});

// ── Derived follow-through without a mark ───────────────────────────────────

test("follow-through is derived from logged amounts against the target", () => {
  const r = ritual({ trackingType: "quantity", target: 2000, unit: "ml" });
  const c = appendRitualLog(appendRitualLog([], "r1", DAY, 1000), "r1", DAY, 500);
  const progress = ritualDayProgress(r, c);
  assert.equal(progress.complete, false);
  assert.equal(progress.followed, 75);
});

test("follow-through is derived from ticked steps", () => {
  const steps = [{ id: "a", label: "Breakfast" }, { id: "b", label: "Lunch" }, { id: "c", label: "Dinner" }];
  const r = ritual({ trackingType: "checklist", steps });
  const c = toggleRitualStep(toggleRitualStep([], "r1", DAY, "a"), "r1", DAY, "b");
  assert.equal(ritualDayProgress(r, c).followed, 67);
});

test("nothing recorded means no follow-through, not zero-percent-done", () => {
  assert.equal(ritualDayProgress(ritual(), []).followed, null);
  assert.equal(ritualDayProgress(ritual({ trackingType: "quantity", target: 10 }), []).followed, null);
});

test("legacy marks read as fully followed", () => {
  const progress = ritualDayProgress(ritual({ trackingType: "quantity", target: 2000 }), [{ ritualId: "r1", date: DAY }]);
  assert.equal(progress.complete, true);
  assert.equal(progress.followed, 100);
});

// ── The day at a glance ─────────────────────────────────────────────────────

test("the day summary names what's done and averages follow-through over everything due", () => {
  const rituals = [
    ritual({ id: "p", title: "Protein intake" }),
    ritual({ id: "w", title: "Water intake" }),
    ritual({ id: "s", title: "Skin care" }),
  ];
  let c = markRitualDone([], "p", DAY, 50);
  c = markRitualDone(c, "w", DAY);
  const summary = summarizeRoutineDay(rituals, c, DAY);
  assert.equal(summary.total, 3);
  assert.equal(summary.done, 2);
  assert.deepEqual(summary.doneTitles, ["Protein intake", "Water intake"]);
  assert.deepEqual(summary.openTitles, ["Skin care"]);
  assert.equal(summary.followedPct, 50); // (50 + 100 + 0) / 3
});

test("an empty day has no follow-through figure", () => {
  assert.equal(summarizeRoutineDay([], [], DAY).followedPct, null);
});

// ── Stats over the window ───────────────────────────────────────────────────

test("timesDone counts done days and followedPct weighs each by its rating", () => {
  const r = ritual();
  // Four consecutive past days, well before the real today.
  const days = ["2025-03-01", "2025-03-02", "2025-03-03", "2025-03-04"];
  let c = [];
  c = markRitualDone(c, "r1", days[0], 50);
  c = markRitualDone(c, "r1", days[1]);
  c = markRitualDone(c, "r1", days[3], 50);
  const stats = calculateRitualStats(r, c, days[3], days[0]);
  assert.equal(stats.timesDone, 3);
  assert.equal(stats.adherencePct, 75);
  assert.equal(stats.followedPct, 50); // (50 + 100 + 0 + 50) / 4
});

test("a routine nobody rated reports the same follow-through as adherence", () => {
  const r = ritual();
  let c = [];
  for (const d of ["2025-03-01", "2025-03-02", "2025-03-04"]) c = toggleRitualCompletion(c, "r1", d);
  const stats = calculateRitualStats(r, c, "2025-03-04", "2025-03-01");
  assert.equal(stats.followedPct, stats.adherencePct);
});

// ── Storage ─────────────────────────────────────────────────────────────────

test("the schema accepts a rated mark, a timed item and a tracker cadence", async () => {
  const { buildDemoSchedule } = await import("../lib/demoData.ts");
  const base = buildDemoSchedule(new Date("2026-01-09T12:00:00"));
  const schedule = {
    ...base,
    rituals: [...base.rituals, { id: "diet", title: "Diet", time: "08:00", anyTime: true, steps: [{ id: "l", label: "Lunch: dal, rice, salad", time: "13:00" }] }],
    ritualCompletions: [...base.ritualCompletions, { ritualId: "diet", date: DAY, followed: 75 }],
    progressTrackers: base.progressTrackers.map((t, i) => (i === 0 ? { ...t, cadence: "monthly" } : t)),
  };
  const result = validateSchedule(schedule);
  assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues[0]));
});

// ── Detail shown on the row ─────────────────────────────────────────────────

const { routineDetailLine, routineWhenLabel, routineDetailItems } = await import("../lib/routineDetails.ts");

test("timed items read in time order, untimed ones after", () => {
  const r = ritual({
    steps: [
      { id: "c", label: "Notes" },
      { id: "b", label: "Lunch: dal, rice, salad", time: "13:00" },
      { id: "a", label: "Oats", time: "08:00" },
    ],
  });
  assert.deepEqual(routineDetailItems(r).map((i) => i.id), ["a", "b", "c"]);
  assert.equal(routineDetailLine(r), "Oats 8:00 AM · Lunch: dal, rice, salad 1:00 PM · Notes");
});

test("a measured routine leads with its goal", () => {
  const r = ritual({ trackingType: "quantity", target: 2500, unit: "ml", steps: [{ id: "a", label: "Bottle at desk" }] });
  assert.equal(routineDetailLine(r), "Goal 2,500 ml · Bottle at desk");
  assert.equal(routineDetailLine(ritual({ trackingType: "quantity", target: 120, unit: "g" })), "Goal 120 g");
});

test("when-labels: anytime, or a set time", () => {
  assert.equal(routineWhenLabel(ritual({ anyTime: true })), "Anytime");
  assert.equal(routineWhenLabel(ritual({ time: "13:00" })), "1:00 PM");
});

test("no detail at all reads as null, a description fills in otherwise", () => {
  assert.equal(routineDetailLine(ritual()), null);
  assert.equal(routineDetailLine(ritual({ description: "Before bed" })), "Before bed");
});
