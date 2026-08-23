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

const { calculateRitualStats, calculateBestStreak, ritualScheduledOn } =
  await import("../lib/consistency/calculateRitualStreak.ts");
const { isRitualDayComplete, ritualDayProgress } = await import("../lib/consistency/ritualDayStatus.ts");
const { ritualScheduledOnDate } = await import("../lib/ritualRecurrence.ts");
const { appendRitualLog, toggleRitualStep } = await import("../lib/ritualCompletions.ts");
const { todayISO, localISODate } = await import("../lib/dateUtils.ts");

function ritual(overrides = {}) {
  return { id: "r1", title: "Test", time: "08:00", ...overrides };
}

// Note: `calculateRitualStats`'s "unchecked today is in-progress, not a miss"
// grace is keyed to the REAL system date (`todayISO()`), not the `uptoISO`
// parameter — so a test simulating "today" at an arbitrary past date must
// make that date itself a *done* day (or unscheduled) to exercise the plain
// streak-walk; the grace behavior itself is covered separately below using
// the real today.

// ── Golden regression: legacy checkbox behavior is byte-identical ──────────

test("golden: an every-day checkbox ritual — 3-day streak ending exactly at uptoISO", () => {
  const r = ritual();
  const completions = [
    { ritualId: "r1", date: "2026-01-09" },
    { ritualId: "r1", date: "2026-01-08" },
    { ritualId: "r1", date: "2026-01-07" },
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-09");
  assert.equal(stats.streak, 3);
});

test("golden: an unchecked day at the REAL today doesn't break an in-progress streak", () => {
  const r = ritual();
  const today = todayISO();
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = localISODate(yesterday);
  const completions = [{ ritualId: "r1", date: yISO }]; // yesterday done, today untouched
  const stats = calculateRitualStats(r, completions, today);
  assert.equal(stats.streak, 1); // yesterday counts; today's open slot doesn't break it
});

test("golden: repeatDays subset — only scheduled days count toward streak/adherence", () => {
  const r = ritual({ repeatDays: ["monday", "wednesday", "friday"] });
  // 2026-01-10 is a Saturday (not scheduled); walk back to find scheduled days done.
  const completions = [
    { ritualId: "r1", date: "2026-01-09" }, // Friday - scheduled, done
    { ritualId: "r1", date: "2026-01-07" }, // Wednesday - scheduled, done
    { ritualId: "r1", date: "2026-01-05" }, // Monday - scheduled, done
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-10");
  assert.equal(stats.streak, 3);
});

test("golden: a gap breaks the streak", () => {
  const r = ritual();
  const completions = [
    { ritualId: "r1", date: "2026-01-09" }, // uptoISO itself — done
    // gap on 01-08
    { ritualId: "r1", date: "2026-01-07" },
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-09");
  assert.equal(stats.streak, 1);
});

test("golden: adherence % excludes today's still-open slot", () => {
  const r = ritual();
  const stats = calculateRitualStats(r, [], "2026-01-10");
  // Nothing done, today excluded from denominator too since it's "open" not missed.
  assert.equal(stats.adherencePct, 0);
});

test("golden: dots are 7 booleans, oldest to newest, matching completion presence", () => {
  const r = ritual();
  const completions = [{ ritualId: "r1", date: "2026-01-10" }]; // today only
  const stats = calculateRitualStats(r, completions, "2026-01-10");
  assert.equal(stats.dots.length, 7);
  assert.equal(stats.dots[6], true); // today, last element
  assert.equal(stats.dots[0], false);
});

// ── Sentinel rule ────────────────────────────────────────────────────────────

test("sentinel: a legacy {ritualId,date} row counts as complete regardless of trackingType", () => {
  const quantityRitual = ritual({ trackingType: "quantity", target: 2500, unit: "ml" });
  const legacyRow = [{ ritualId: "r1", date: "2026-01-01" }];
  assert.equal(isRitualDayComplete(quantityRitual, legacyRow), true);
});

test("sentinel: converting a checkbox ritual to quantity never erases its history", () => {
  const asCheckbox = ritual();
  const asQuantity = ritual({ trackingType: "quantity", target: 2500, unit: "ml" });
  const completions = [
    { ritualId: "r1", date: "2026-01-09" },
    { ritualId: "r1", date: "2026-01-08" },
  ];
  const before = calculateRitualStats(asCheckbox, completions, "2026-01-10");
  const after = calculateRitualStats(asQuantity, completions, "2026-01-10");
  assert.deepEqual(before, after);
});

// ── Quantity/duration/count day-completion ──────────────────────────────────

test("quantity: below target is not complete, at/above target is complete", () => {
  const r = ritual({ trackingType: "quantity", target: 2500, unit: "ml" });
  const partial = [{ ritualId: "r1", date: "2026-01-01", value: 1000 }];
  const full = [
    { ritualId: "r1", date: "2026-01-01", value: 1500 },
    { ritualId: "r1", date: "2026-01-01", value: 1000 },
  ];
  assert.equal(isRitualDayComplete(r, partial), false);
  assert.equal(isRitualDayComplete(r, full), true);
});

test("quantity with no target: any positive value counts as complete", () => {
  const r = ritual({ trackingType: "quantity", unit: "reps" });
  assert.equal(isRitualDayComplete(r, [{ ritualId: "r1", date: "2026-01-01", value: 1 }]), true);
  assert.equal(isRitualDayComplete(r, []), false);
});

test("quantity: a zero-value row alone is not complete", () => {
  const r = ritual({ trackingType: "quantity", unit: "reps" });
  assert.equal(isRitualDayComplete(r, [{ ritualId: "r1", date: "2026-01-01", value: 0 }]), false);
});

test("ritualDayProgress reports the summed value and target for a quantity ritual", () => {
  const r = ritual({ trackingType: "quantity", target: 2500, unit: "ml" });
  const entries = [
    { ritualId: "r1", date: "2026-01-01", value: 500 },
    { ritualId: "r1", date: "2026-01-01", value: 500 },
  ];
  const progress = ritualDayProgress(r, entries);
  assert.equal(progress.value, 1000);
  assert.equal(progress.target, 2500);
  assert.equal(progress.complete, false);
});

// ── Checklist day-completion ─────────────────────────────────────────────────

test("checklist: partial (3/4) is not complete, full (4/4) is", () => {
  const steps = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }, { id: "d", label: "D" }];
  const r = ritual({ trackingType: "checklist", steps });
  let completions = [];
  for (const s of steps.slice(0, 3)) completions = toggleRitualStep(completions, "r1", "2026-01-01", s.id);
  assert.equal(isRitualDayComplete(r, completions.filter((c) => c.date === "2026-01-01")), false);
  completions = toggleRitualStep(completions, "r1", "2026-01-01", "d");
  assert.equal(isRitualDayComplete(r, completions.filter((c) => c.date === "2026-01-01")), true);
});

test("checklist with no steps defined falls back to checkbox semantics", () => {
  const r = ritual({ trackingType: "checklist", steps: [] });
  assert.equal(isRitualDayComplete(r, [{ ritualId: "r1", date: "2026-01-01", id: "x", timestamp: "t", stepId: undefined }].map((e) => ({ ...e, value: undefined }))), true);
});

// ── Best streak ──────────────────────────────────────────────────────────────

test("calculateBestStreak finds a longer historical run than the current streak", () => {
  const r = ritual();
  const completions = [
    // Old 5-day run
    { ritualId: "r1", date: "2025-12-01" },
    { ritualId: "r1", date: "2025-12-02" },
    { ritualId: "r1", date: "2025-12-03" },
    { ritualId: "r1", date: "2025-12-04" },
    { ritualId: "r1", date: "2025-12-05" },
    // Current 2-day run
    { ritualId: "r1", date: "2026-01-09" },
    { ritualId: "r1", date: "2026-01-08" },
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-09");
  assert.equal(stats.streak, 2);
  assert.equal(stats.bestStreak, 5);
});

test("calculateBestStreak equals current streak on a monotonic run with no history before it", () => {
  const r = ritual();
  const completions = [
    { ritualId: "r1", date: "2026-01-09" },
    { ritualId: "r1", date: "2026-01-08" },
  ];
  const best = calculateBestStreak(r, completions, "2026-01-10");
  assert.equal(best, 2);
});

// ── Interval recurrence ──────────────────────────────────────────────────────

test("interval recurrence: due exactly every N days starting at the anchor", () => {
  const r = ritual({ recurrence: { kind: "interval", intervalDays: 3, anchorDate: "2026-01-01" } });
  assert.equal(ritualScheduledOnDate(r, "2026-01-01"), true);  // day 0
  assert.equal(ritualScheduledOnDate(r, "2026-01-02"), false); // day 1
  assert.equal(ritualScheduledOnDate(r, "2026-01-03"), false); // day 2
  assert.equal(ritualScheduledOnDate(r, "2026-01-04"), true);  // day 3
  assert.equal(ritualScheduledOnDate(r, "2025-12-31"), false); // before anchor
});

test("interval recurrence with no anchor/intervalDays falls back to ritualScheduledOn (every day)", () => {
  const r = ritual({ recurrence: { kind: "interval" } });
  assert.equal(ritualScheduledOnDate(r, "2026-01-01"), true);
});

test("non-interval recurrence delegates to the unchanged ritualScheduledOn", () => {
  const r = ritual({ repeatDays: ["monday"] });
  assert.equal(ritualScheduledOnDate(r, "2026-01-05"), ritualScheduledOn(r, "monday")); // Monday
});

// ── calculateRitualStats is interval-recurrence-aware ───────────────────────
// Regression: calculateRitualStats used to check schedule via the plain
// weekday-set `ritualScheduledOn`, so an "every 3 days" routine's in-between,
// not-actually-due days read as misses and permanently capped its streak at 1.

test("calculateRitualStats: an every-3-days routine's streak isn't broken by its own off days", () => {
  const r = ritual({ recurrence: { kind: "interval", intervalDays: 3, anchorDate: "2026-01-01" } });
  // Due days: 01-01, 01-04, 01-07 — all done. 01-02/03/05/06 are simply not
  // scheduled, not missed, and must not break the run.
  const completions = [
    { ritualId: "r1", date: "2026-01-01" },
    { ritualId: "r1", date: "2026-01-04" },
    { ritualId: "r1", date: "2026-01-07" },
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-07");
  assert.equal(stats.streak, 3);
  assert.equal(stats.bestStreak, 3);
});

test("calculateRitualStats: a genuinely missed due day on an interval routine still breaks the streak", () => {
  const r = ritual({ recurrence: { kind: "interval", intervalDays: 3, anchorDate: "2026-01-01" } });
  const completions = [
    { ritualId: "r1", date: "2026-01-01" },
    // 01-04 (due) skipped
    { ritualId: "r1", date: "2026-01-07" },
  ];
  const stats = calculateRitualStats(r, completions, "2026-01-07");
  assert.equal(stats.streak, 1);
});
