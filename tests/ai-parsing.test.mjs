/**
 * Coverage for the AI chat's JSON-action parser (lib/ai.ts's parseAIAction)
 * and the separate one-shot task generator's parser (lib/aiActions.ts's
 * parseGeneratedTasks). Neither had any test coverage before this file —
 * both parse untrusted, lenient, model-generated JSON, so their defaulting/
 * rejection behavior is exactly the kind of thing that should be locked
 * down rather than re-derived from a live model each time it's touched.
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

const { parseAIAction } = await import("@/lib/ai.ts");
const { parseGeneratedTasks } = await import("@/lib/aiActions.ts");

function fenced(obj) {
  return "Sure, here you go:\n```json\n" + JSON.stringify(obj) + "\n```";
}

// MLX (Qwen3) doesn't reliably wrap its JSON in a ```json fence the way
// Gemini did — confirmed live: a real "add_task" response came back as bare
// JSON with no fence at all. extractJSONCandidate's fenceless fallback used
// to be a lazy /\{[\s\S]*?\}/ match, which stops at the FIRST "}" it finds —
// for a nested payload like add_task's, that's the payload's closing brace,
// dropping the outer object's closing brace and producing invalid JSON. This
// locks in the fix (a greedy match spanning the whole nested structure).
test("parseAIAction handles unfenced JSON with a nested payload object (no markdown fence at all)", () => {
  const raw = 'Sure, adding that.\n' + JSON.stringify({
    type: "add_task",
    payload: { title: "Dentist Appointment", taskType: "commitment", day: "thursday", startTime: "14:00", endTime: "15:00", icon: "star" },
  });
  const action = parseAIAction(raw);
  assert.equal(action.type, "add_task");
  assert.equal(action.payload.title, "Dentist Appointment");
  assert.equal(action.payload.taskType, "commitment");
});

test("add_task defaults an invalid/missing taskType to \"task\"", () => {
  const withInvalid = parseAIAction(fenced({
    type: "add_task",
    payload: { title: "Dentist", taskType: "not-a-real-type", day: "thursday", startTime: "14:00", endTime: "15:00", icon: "star" },
  }));
  assert.equal(withInvalid.type, "add_task");
  assert.equal(withInvalid.payload.taskType, "task");

  const withMissing = parseAIAction(fenced({
    type: "add_task",
    payload: { title: "Dentist", day: "thursday", startTime: "14:00", endTime: "15:00", icon: "star" },
  }));
  assert.equal(withMissing.payload.taskType, "task");
});

test("add_task round-trips a valid taskType, planTitle, and multi-day \"days\"", () => {
  const action = parseAIAction(fenced({
    type: "add_task",
    payload: {
      title: "Commute", taskType: "commitment", day: "monday", days: ["monday", "wednesday", "friday"],
      startTime: "08:00", endTime: "08:45", icon: "car", planTitle: "Work",
    },
  }));
  assert.equal(action.type, "add_task");
  assert.equal(action.payload.taskType, "commitment");
  assert.equal(action.payload.planTitle, "Work");
  assert.deepEqual(action.payload.days, ["monday", "wednesday", "friday"]);
});

test("add_task rejects a payload with no title", () => {
  const action = parseAIAction(fenced({ type: "add_task", payload: { day: "monday" } }));
  assert.equal(action, null);
});

test("add_tracker defaults an invalid goalDirection to \"increase_good\"", () => {
  const action = parseAIAction(fenced({
    type: "add_tracker",
    payload: { title: "Water intake", planTitle: "Health", goalDirection: "sideways", unit: "glasses", goalValue: 8 },
  }));
  assert.equal(action.type, "add_tracker");
  assert.equal(action.payload.goalDirection, "increase_good");
  assert.equal(action.payload.unit, "glasses");
  assert.equal(action.payload.goalValue, 8);
});

test("add_tracker rejects a payload with no title", () => {
  const action = parseAIAction(fenced({ type: "add_tracker", payload: { goalDirection: "decrease_good" } }));
  assert.equal(action, null);
});

test("add_subtasks returns null when subtasks is empty or all-invalid", () => {
  assert.equal(parseAIAction(fenced({ type: "add_subtasks", payload: { taskTitle: "Leg day", subtasks: [] } })), null);
  assert.equal(parseAIAction(fenced({ type: "add_subtasks", payload: { taskTitle: "Leg day", subtasks: [42, null, "   "] } })), null);
  assert.equal(parseAIAction(fenced({ type: "add_subtasks", payload: { subtasks: ["Warm up"] } })), null);
});

test("add_subtasks parses a well-formed payload, dropping non-string entries", () => {
  const action = parseAIAction(fenced({
    type: "add_subtasks",
    payload: { taskTitle: "Leg day", subtasks: ["Warm up", 42, "Squats 3x10"] },
  }));
  assert.equal(action.type, "add_subtasks");
  assert.equal(action.payload.taskTitle, "Leg day");
  assert.deepEqual(action.payload.subtasks, ["Warm up", "Squats 3x10"]);
});

test("suggest_milestones round-trips planTitle when present, and tolerates its absence", () => {
  const withTitle = parseAIAction(fenced({
    type: "suggest_milestones",
    payload: { planTitle: "GMAT Prep", milestones: [{ title: "Diagnostic test", description: "Baseline score", targetDate: "2026-09-01" }] },
  }));
  assert.equal(withTitle.type, "suggest_milestones");
  assert.equal(withTitle.payload.planTitle, "GMAT Prep");
  assert.equal(withTitle.payload.milestones.length, 1);

  const withoutTitle = parseAIAction(fenced({
    type: "suggest_milestones",
    payload: { milestones: [{ title: "Diagnostic test", description: "Baseline score" }] },
  }));
  assert.equal(withoutTitle.payload.planTitle, undefined);
});

test("create_plan's per-task taskType round-trips and defaults missing/invalid ones to \"task\"", () => {
  const action = parseAIAction(fenced({
    type: "create_plan",
    payload: {
      title: "Marathon Training",
      description: "16-week build",
      emoji: "run",
      color: "emerald",
      tasks: [
        { title: "Easy run", day: "monday", startTime: "06:00", endTime: "07:00", icon: "run", taskType: "session" },
        { title: "Rest day walk", day: "sunday", startTime: "08:00", endTime: "08:30", icon: "leaf" },
        { title: "Race day", day: "saturday", startTime: "07:00", endTime: "11:00", icon: "flame", taskType: "bogus" },
      ],
    },
  }));
  assert.equal(action.type, "create_plan");
  const [session, defaulted, invalid] = action.payload.tasks;
  assert.equal(session.taskType, "session");
  assert.equal(defaulted.taskType, "task");
  assert.equal(invalid.taskType, "task");
});

test("create_ritual is unaffected by the unified-prompt refactor", () => {
  const ritual = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Morning pages", time: "06:30", duration: 20, repeatDays: ["monday", "tuesday"], color: "sky" },
  }));
  assert.equal(ritual.type, "create_ritual");
  assert.equal(ritual.payload.title, "Morning pages");
});

test("create_ritual accepts a quantity routine with target and unit", () => {
  const action = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Water", time: "09:00", duration: 5, repeatDays: ["monday"], color: "cyan", trackingType: "quantity", target: 3000, unit: "ml" },
  }));
  assert.equal(action.payload.trackingType, "quantity");
  assert.equal(action.payload.target, 3000);
  assert.equal(action.payload.unit, "ml");
});

test("create_ritual accepts a checklist routine with steps", () => {
  const action = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Skincare", time: "22:00", duration: 10, repeatDays: ["monday"], color: "rose", trackingType: "checklist", steps: ["Cleanser", "Moisturiser"] },
  }));
  assert.equal(action.payload.trackingType, "checklist");
  assert.deepEqual(action.payload.steps, ["Cleanser", "Moisturiser"]);
});

test("create_ritual with no trackingType stays a plain checkbox routine", () => {
  const action = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Journal", time: "07:00", duration: 15, repeatDays: ["monday"], color: "amber" },
  }));
  assert.equal(action.payload.trackingType, undefined);
});

test("create_ritual rejects an unknown trackingType rather than storing it", () => {
  const action = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Odd", time: "07:00", duration: 15, repeatDays: ["monday"], color: "amber", trackingType: "vibes", target: 5 },
  }));
  assert.equal(action.payload.trackingType, undefined);
  assert.equal(action.payload.target, undefined);
});

test("create_ritual downgrades a stepless checklist to a checkbox — never uncompletable", () => {
  const action = parseAIAction(fenced({
    type: "create_ritual",
    payload: { title: "Empty", time: "07:00", duration: 15, repeatDays: ["monday"], color: "amber", trackingType: "checklist", steps: [] },
  }));
  assert.equal(action.payload.trackingType, undefined);
  assert.equal(action.payload.steps, undefined);
});

test("create_strategy is no longer a valid action — the Strategy feature was removed", () => {
  // It used to parse and write a StrategyAsset that no screen could ever
  // display. Rejecting it outright is what stops the assistant claiming it
  // saved something the user cannot open.
  assert.equal(
    parseAIAction(fenced({
      type: "create_strategy",
      payload: { title: "Deep Work Program", description: "A guide", htmlContent: "<!DOCTYPE html><html><body>Hi</body></html>" },
    })),
    null,
  );
});

test("parseAIAction returns null for text with no JSON block", () => {
  assert.equal(parseAIAction("Sure! What would you like to build today?"), null);
});

// ── lib/aiActions.ts's parseGeneratedTasks (separate one-shot generator) ──────

test("parseGeneratedTasks defaults an invalid/missing taskType to \"task\" and round-trips a valid one", () => {
  const raw = JSON.stringify([
    { title: "Deadlift day", day: "tuesday", startTime: "18:00", endTime: "19:00", icon: "barbell", taskType: "session", subtasks: ["Warm up"] },
    { title: "Commute", day: "monday", startTime: "08:00", endTime: "08:45", icon: "car", taskType: "commitment" },
    { title: "Read", day: "sunday", startTime: "20:00", endTime: "20:30", icon: "book" },
    { title: "Bogus", day: "friday", startTime: "09:00", endTime: "10:00", icon: "star", taskType: "not-real" },
  ]);
  const tasks = parseGeneratedTasks(raw);
  assert.equal(tasks.length, 4);
  assert.equal(tasks[0].taskType, "session");
  assert.equal(tasks[1].taskType, "commitment");
  assert.equal(tasks[2].taskType, "task");
  assert.equal(tasks[3].taskType, "task");
});
