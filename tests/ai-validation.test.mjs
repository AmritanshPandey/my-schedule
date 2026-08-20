/**
 * Coverage for the new AI validation layer added alongside the MLX provider:
 * lib/ai/validation/taskSchema.ts (Zod shape validation, additive on top of
 * lib/ai.ts's already-tested lenient parsing) and
 * lib/ai/validation/businessRules.ts (semantic checks that don't exist
 * anywhere else — time budget, duplicates, vague titles, deadline sanity).
 * All pure functions — no live model calls needed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try {
        return nextResolve(url, context);
      } catch {
        return nextResolve(`${url}.ts`, context);
      }
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

const { validateTaskShapes } = await import("@/lib/ai/validation/taskSchema.ts");
const {
  checkVagueTitle,
  checkDuplicates,
  checkTimeBudget,
  checkAvailableTimeBudget,
  checkDeadlineSanity,
  runBusinessRules,
  resolveDayWindowMinutes,
} = await import("@/lib/ai/validation/businessRules.ts");

function task(overrides = {}) {
  return {
    title: "Complete 20 Critical Reasoning questions",
    day: "monday",
    startTime: "07:00",
    endTime: "08:00",
    icon: "brain",
    subtasks: [],
    taskType: "task",
    ...overrides,
  };
}

// ── taskSchema.ts ────────────────────────────────────────────────────────────

test("validateTaskShapes passes a well-formed task through unchanged", () => {
  const { valid, issues } = validateTaskShapes([task()]);
  assert.equal(valid.length, 1);
  assert.equal(issues.length, 0);
  assert.equal(valid[0].title, "Complete 20 Critical Reasoning questions");
});

test("validateTaskShapes accepts an overnight task", () => {
  const { valid, issues } = validateTaskShapes([task({ startTime: "23:00", endTime: "01:00" })]);
  assert.equal(valid.length, 1);
  assert.equal(issues.length, 0);
});

test("validateTaskShapes rejects a no-duration or too-long task", () => {
  const { valid, issues } = validateTaskShapes([task({ startTime: "09:00", endTime: "09:00" })]);
  assert.equal(valid.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /duration/i);
});

test("validateTaskShapes rejects a near-empty title", () => {
  const { valid, issues } = validateTaskShapes([task({ title: "a" })]);
  assert.equal(valid.length, 0);
  assert.equal(issues.length, 1);
});

test("validateTaskShapes rejects a malformed time string that passed the lenient parser", () => {
  // "typeof === string" upstream would let "7am" through untouched — this is
  // exactly the gap Zod's regex closes.
  const { valid, issues } = validateTaskShapes([task({ startTime: "7am" })]);
  assert.equal(valid.length, 0);
  assert.equal(issues.length, 1);
});

test("validateTaskShapes keeps the valid tasks and reports only the invalid ones in a mixed batch", () => {
  const { valid, issues } = validateTaskShapes([
    task({ title: "Complete 20 Quant questions" }),
    task({ title: "x", startTime: "10:00", endTime: "09:00" }),
    task({ title: "Review flashcards for 30 minutes" }),
  ]);
  assert.equal(valid.length, 2);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].index, 1);
});

// ── businessRules.ts ─────────────────────────────────────────────────────────

test("checkVagueTitle flags single-word and denylisted titles, not specific ones", () => {
  assert.ok(checkVagueTitle("Work", 0));
  assert.ok(checkVagueTitle("Task 1", 0));
  assert.ok(checkVagueTitle("Misc", 0));
  assert.ok(checkVagueTitle("TBD", 0));
  assert.equal(checkVagueTitle("Complete 20 Critical Reasoning questions and review mistakes", 0), null);
});

test("checkDuplicates flags a same-day repeat within the new batch", () => {
  const issues = checkDuplicates(
    [task({ title: "Quant Drill" }), task({ title: "quant drill " })],
    {},
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].taskIndex, 1);
});

test("checkDuplicates flags a clash against an existing scheduled task on the same day", () => {
  const issues = checkDuplicates(
    [task({ title: "Morning Run", day: "tuesday" })],
    { tuesday: [{ title: "Morning Run", startTime: "06:00", endTime: "06:30" }] },
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /already have/i);
});

test("checkDuplicates finds nothing across different days or genuinely different titles", () => {
  const issues = checkDuplicates(
    [task({ title: "Quant Drill", day: "monday" }), task({ title: "Verbal Drill", day: "monday" })],
    {},
  );
  assert.equal(issues.length, 0);
});

test("checkTimeBudget errors when a day is physically overbooked", () => {
  const ctx = {
    existingTasksByDay: {},
    rituals: [],
    dayStartMinutes: 6 * 60,
    dayEndMinutes: 8 * 60, // a 2-hour window
    todayISO: "2026-01-01",
  };
  const issues = checkTimeBudget(
    [task({ startTime: "06:00", endTime: "09:00" })], // 3 hours into a 2-hour window
    ctx,
  );
  assert.ok(issues.some((i) => i.severity === "error"));
});

test("checkTimeBudget warns (not errors) when a day is nearly full but not impossible", () => {
  const ctx = {
    existingTasksByDay: {},
    rituals: [],
    dayStartMinutes: 6 * 60,
    dayEndMinutes: 16 * 60, // a 10-hour window
    todayISO: "2026-01-01",
  };
  const issues = checkTimeBudget([task({ startTime: "06:00", endTime: "15:00" })], ctx); // 9h of 10h
  assert.ok(issues.some((i) => i.severity === "warning"));
  assert.ok(!issues.some((i) => i.severity === "error"));
});

test("checkTimeBudget is quiet for a comfortably-scheduled day", () => {
  const ctx = {
    existingTasksByDay: {},
    rituals: [],
    dayStartMinutes: 6 * 60,
    dayEndMinutes: 22 * 60,
    todayISO: "2026-01-01",
  };
  const issues = checkTimeBudget([task({ startTime: "07:00", endTime: "08:00" })], ctx);
  assert.equal(issues.length, 0);
});

test("checkTimeBudget includes overnight task duration", () => {
  const issues = checkTimeBudget(
    [task({ startTime: "23:00", endTime: "01:00" })],
    {
      existingTasksByDay: {},
      rituals: [],
      dayStartMinutes: 0,
      dayEndMinutes: 60,
      todayISO: "2026-01-01",
    },
  );
  assert.ok(issues.some((i) => i.severity === "error"));
});

test("checkAvailableTimeBudget rejects generated work above the declared budget", () => {
  const issues = checkAvailableTimeBudget(
    [task({ startTime: "09:00", endTime: "10:00" }), task({ startTime: "10:00", endTime: "11:01" })],
    120,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
  assert.match(issues[0].message, /121 minutes requested, 120 minutes available/i);
});

test("checkAvailableTimeBudget is quiet when no budget is supplied", () => {
  assert.deepEqual(checkAvailableTimeBudget([task()], undefined), []);
});

test("checkDeadlineSanity errors on a milestone dated in the past", () => {
  const issues = checkDeadlineSanity(
    [],
    [{ title: "Diagnostic test", description: "", targetDate: "2020-01-01" }],
    { existingTasksByDay: {}, rituals: [], dayStartMinutes: 0, dayEndMinutes: 0, todayISO: "2026-01-01" },
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
});

test("checkDeadlineSanity warns on a milestone past the plan's end date", () => {
  const issues = checkDeadlineSanity(
    [],
    [{ title: "Final review", description: "", targetDate: "2026-06-01" }],
    { existingTasksByDay: {}, rituals: [], dayStartMinutes: 0, dayEndMinutes: 0, planEndDate: "2026-03-01", todayISO: "2026-01-01" },
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "warning");
});

test("checkDeadlineSanity is quiet for a sane in-range milestone", () => {
  const issues = checkDeadlineSanity(
    [],
    [{ title: "Midpoint check-in", description: "", targetDate: "2026-02-01" }],
    { existingTasksByDay: {}, rituals: [], dayStartMinutes: 0, dayEndMinutes: 0, planEndDate: "2026-03-01", todayISO: "2026-01-01" },
  );
  assert.equal(issues.length, 0);
});

test("runBusinessRules combines all four checks", () => {
  const issues = runBusinessRules(
    [task({ title: "Task 1", day: "monday", startTime: "06:00", endTime: "09:00" })],
    [{ title: "Overdue milestone", description: "", targetDate: "2020-01-01" }],
    {
      existingTasksByDay: {},
      rituals: [],
      dayStartMinutes: 6 * 60,
      dayEndMinutes: 8 * 60,
      todayISO: "2026-01-01",
    },
  );
  // vague title (warning) + overbooked day (error) + past milestone (error)
  assert.ok(issues.some((i) => /vague|Task 1/i.test(i.message)));
  assert.ok(issues.some((i) => i.severity === "error" && /overbooked/i.test(i.message)));
  assert.ok(issues.some((i) => i.severity === "error" && /past/i.test(i.message)));
});

test("resolveDayWindowMinutes falls back to sane defaults when preferences are empty", () => {
  const { dayStartMinutes, dayEndMinutes } = resolveDayWindowMinutes({});
  assert.ok(dayStartMinutes >= 0);
  assert.ok(dayEndMinutes > dayStartMinutes);
});

test("resolveDayWindowMinutes honors an explicit non-auto dayEndMinutes", () => {
  const { dayEndMinutes } = resolveDayWindowMinutes({ dayEndMinutes: 20 * 60, dayEndAuto: false });
  assert.equal(dayEndMinutes, 20 * 60);
});
