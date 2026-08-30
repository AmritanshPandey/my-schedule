/**
 * Coverage for lib/ai/checklist.ts's describeAction/canConfirm — the
 * required-vs-optional field computation AIReviewSheet.tsx gates every AI
 * write on. Locks down two things this session's work depends on:
 *  - a field marked _unspecified by lib/ai.ts's parser reports as missing
 *    (null) here, not as the placeholder value the parser backfilled
 *  - the right `kind` is attached to each field, since that's what tells
 *    AIReviewSheet.tsx which inline editor to render for a missing one
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

const { describeAction, canConfirm } = await import("@/lib/ai/checklist.ts");

function emptySchedule() {
  return {
    goals: [], plans: [], categories: [], activities: {},
    progressTrackers: [], metricEntries: [], milestones: [], rituals: [],
    ritualCompletions: [], notes: [], events: [],
    preferences: {},
  };
}

test("add_task: an _unspecified field reports null and blocks confirm", () => {
  const action = {
    type: "add_task",
    payload: {
      title: "Dentist", taskType: "task", day: "monday", startTime: "09:00", endTime: "10:00",
      icon: "star", _unspecified: ["day", "startTime", "endTime"],
    },
  };
  const review = describeAction(action, emptySchedule());
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.day.value, null);
  assert.equal(byKey.startTime.value, null);
  assert.equal(byKey.endTime.value, null);
  assert.ok(review.blockers.some((b) => b.includes("Day")));
  assert.ok(review.blockers.some((b) => b.includes("Start time")));
  assert.ok(review.blockers.some((b) => b.includes("End time")));
  assert.equal(canConfirm(review, false), false);
});

test("add_task: fields report their kind so AIReviewSheet knows which editor to render", () => {
  const action = {
    type: "add_task",
    payload: { title: "Dentist", taskType: "task", day: "monday", startTime: "09:00", endTime: "10:00", icon: "star" },
  };
  const review = describeAction(action, emptySchedule());
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.title.kind, "text");
  assert.equal(byKey.day.kind, "day");
  assert.equal(byKey.startTime.kind, "time");
  assert.equal(byKey.endTime.kind, "time");
  assert.equal(byKey.taskType.kind, "enum");
  assert.ok(byKey.taskType.enumOptions.includes("commitment"));
});

test("add_task: a real day/time (no _unspecified) is not reported as missing, and confirm is ready", () => {
  const action = {
    type: "add_task",
    payload: { title: "Dentist", taskType: "task", day: "thursday", startTime: "14:00", endTime: "15:00", icon: "star" },
  };
  const review = describeAction(action, emptySchedule());
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.day.value, "thursday");
  assert.equal(byKey.startTime.value, "14:00");
  assert.equal(review.blockers.length, 0);
  assert.equal(canConfirm(review, false), true);
});

test("create_ritual: _unspecified time/repeatDays reports null and blocks confirm", () => {
  const action = {
    type: "create_ritual",
    payload: {
      title: "Stretch", time: "08:00", duration: 30, repeatDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      color: "emerald", _unspecified: ["time", "repeatDays"],
    },
  };
  const review = describeAction(action, emptySchedule());
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.time.value, null);
  assert.equal(byKey.time.kind, "time");
  assert.equal(byKey.repeatDays.value, null);
  assert.equal(byKey.repeatDays.kind, "days");
  assert.equal(canConfirm(review, false), false);
});

test("add_tracker: goalDirection reports as an enum field with the real option list", () => {
  const action = {
    type: "add_tracker",
    payload: { title: "Water", goalDirection: "increase_good", planTitle: "Health" },
  };
  const schedule = { ...emptySchedule(), plans: [{ id: "p1", title: "Health", category: "health", items: [] }] };
  const review = describeAction(action, schedule);
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.goalDirection.kind, "enum");
  assert.deepEqual(byKey.goalDirection.enumOptions, ["increase_good", "decrease_good"]);
});

test("create_plan: startDate/endDate report as date fields, optional (no blocker when absent)", () => {
  const action = { type: "create_plan", payload: { title: "Marathon Training", description: "", emoji: "run", color: "emerald" } };
  const review = describeAction(action, emptySchedule());
  const byKey = Object.fromEntries(review.fields.map((f) => [f.key, f]));
  assert.equal(byKey.startDate.kind, "date");
  assert.equal(byKey.startDate.value, null);
  assert.equal(byKey.startDate.required, false);
  assert.equal(review.blockers.length, 0);
});

test("an array field the model should have generated (tasks/milestones/subtasks) has no kind — no inline editor", () => {
  const suggestMilestones = describeAction({ type: "suggest_milestones", payload: { milestones: [] } }, emptySchedule());
  const milestonesField = suggestMilestones.fields.find((f) => f.key === "milestones");
  assert.equal(milestonesField.kind, undefined);
  assert.equal(milestonesField.required, true);
  assert.equal(milestonesField.value, null);
});
