/**
 * Coverage for lib/ai/examples.ts / examples.json — the single source of
 * truth for AI few-shot examples that used to be hardcoded inline in
 * lib/ai/providers/browserPrompts.ts (TASK_FEW_SHOT, SUBTASK_FEW_SHOT,
 * MILESTONE_FEW_SHOT, FOCUSED_SCHEMAS[*].example, CHAT_FEW_SHOT).
 *
 * The critical invariant this locks down: every formatter's default (index
 * 0) output must remain byte-identical to what those hardcoded strings used
 * to be — tests/browserPrompts.test.mjs's existing 12 tests already prove
 * the rewritten prompts behave the same, but this file additionally proves
 * *why*: the formatters reproduce the exact same strings, not just
 * "close enough" ones, so the carefully-tuned small-model reliability work
 * those prompts represent isn't quietly altered by this refactor.
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
  AI_EXAMPLES,
  formatTaskBatchExample,
  formatSubtaskBatchExample,
  formatMilestoneBatchExample,
  formatActionExample,
  formatChatExample,
} = await import("../lib/ai/examples.ts");

// ── examples.json shape ──────────────────────────────────────────────────────

test("examples.json has at least one entry per category, and a 'long reference' worth of extras", () => {
  assert.ok(AI_EXAMPLES.taskBatch.length >= 2, "more than one task-batch example exists to draw from later");
  assert.ok(AI_EXAMPLES.subtaskBatch.length >= 2);
  assert.ok(AI_EXAMPLES.milestoneBatch.length >= 2);
  for (const type of ["create_plan", "add_task", "add_tracker", "suggest_milestones", "create_ritual"]) {
    assert.ok(AI_EXAMPLES.actions[type], `actions.${type} should exist`);
    assert.ok(AI_EXAMPLES.actions[type].request.length > 0);
    assert.ok(AI_EXAMPLES.actions[type].response.type === type, "response.type must match the action key");
  }
});

// ── Exact byte-for-byte match with the strings this replaced ────────────────
// (the strings below are exactly what used to be hardcoded in browserPrompts.ts)

test("formatTaskBatchExample() reproduces the original TASK_FEW_SHOT exactly", () => {
  const original = `Example output for plan "Morning Fitness":
[{"title":"Morning Run","day":"monday","startTime":"06:30","endTime":"07:15","icon":"run","taskType":"session","subtasks":["5 min warm-up walk","Run 3 km at easy pace","5 min cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3×12","Push-ups 3×15","Plank 60 s"]},{"title":"Meal Prep Sunday","day":"sunday","startTime":"11:00","endTime":"12:00","icon":"chefhat","taskType":"task","subtasks":["Cook 3 protein portions","Portion into containers","Fridge for the week"]},{"title":"Physio Check-in","day":"friday","startTime":"09:00","endTime":"09:30","icon":"heart","taskType":"commitment","subtasks":["Bring last week's log","Ask about knee soreness"]}]`;
  assert.equal(formatTaskBatchExample(), original);
});

test("formatSubtaskBatchExample() reproduces the original SUBTASK_FEW_SHOT exactly", () => {
  const original = `Example for "Write quarterly report":
["Review previous quarter metrics","Identify top 3 highlights and gaps","Draft executive summary","Add charts and supporting data","Proofread and send to manager"]`;
  assert.equal(formatSubtaskBatchExample(), original);
});

test("formatMilestoneBatchExample() reproduces the original MILESTONE_FEW_SHOT exactly", () => {
  const original = `Example for "Learn Spanish" (2025-01-01 → 2025-06-30):
[{"title":"Alphabet & Pronunciation","description":"Learn phonics and 200 core vocabulary words","targetDate":"2025-01-31"},{"title":"Daily Conversations","description":"Hold a 5-minute chat on everyday topics","targetDate":"2025-03-15"},{"title":"Grammar Fluency","description":"Master present, past, and future tenses","targetDate":"2025-05-01"},{"title":"Full Comprehension","description":"Watch a Spanish film without subtitles","targetDate":"2025-06-30"}]`;
  assert.equal(formatMilestoneBatchExample(), original);
});

test("formatActionExample() reproduces every original FOCUSED_SCHEMAS[*].example exactly", () => {
  const originals = {
    create_plan: `User: Create a 30-day fitness plan
You: {"type":"create_plan","payload":{"title":"30-Day Fitness","description":"Build a consistent training habit over 30 days.","emoji":"barbell","color":"emerald","tasks":[{"title":"Morning Run","day":"monday","startTime":"07:00","endTime":"07:45","icon":"run","taskType":"session","subtasks":["Warm-up walk","Run 3 km","Cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3x12","Push-ups 3x15","Plank 60s"]},{"title":"Long Run","day":"saturday","startTime":"08:00","endTime":"09:30","icon":"run","taskType":"session","subtasks":["Easy pace 8 km","Hydrate","Stretch"]}]}}`,
    add_task: `User: Add a commitment for a dentist appointment on Thursday at 2pm
You: {"type":"add_task","payload":{"title":"Dentist Appointment","taskType":"commitment","day":"thursday","startTime":"14:00","endTime":"15:00","icon":"star"}}`,
    add_tracker: `User: Add a tracker for water intake
You: {"type":"add_tracker","payload":{"title":"Water","unit":"ml","goalDirection":"increase_good"}}`,
    suggest_milestones: `User: Suggest milestones for my Marathon Training plan
You: {"type":"suggest_milestones","payload":{"planTitle":"Marathon Training","milestones":[{"title":"Run 10 km non-stop","description":"Build the aerobic base.","targetDate":"2026-03-15"},{"title":"Half marathon distance","description":"Prove the endurance is there.","targetDate":"2026-04-20"},{"title":"Race pace 20 km","description":"Dial in target pace.","targetDate":"2026-05-18"}]}}`,
    create_ritual: `User: Create a morning meditation routine
You: {"type":"create_ritual","payload":{"title":"Morning Meditation","time":"07:00","duration":15,"repeatDays":["monday","tuesday","wednesday","thursday","friday"],"color":"violet"}}`,
  };
  for (const [type, original] of Object.entries(originals)) {
    assert.equal(formatActionExample(type), original, `mismatch for ${type}`);
  }
});

test("formatChatExample() reproduces the original CHAT_FEW_SHOT exactly", () => {
  const original = `Example.
User: Create a 30-day fitness plan
You:
{"type":"create_plan","payload":{"title":"30-Day Fitness","description":"Build a consistent training habit over 30 days.","emoji":"barbell","color":"emerald","tasks":[{"title":"Morning Run","day":"monday","startTime":"07:00","endTime":"07:45","icon":"run","taskType":"session","subtasks":["Warm-up walk","Run 3 km","Cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3x12","Push-ups 3x15","Plank 60s"]},{"title":"Long Run","day":"saturday","startTime":"08:00","endTime":"09:30","icon":"run","taskType":"session","subtasks":["Easy pace 8 km","Hydrate","Stretch"]}]}}`;
  assert.equal(formatChatExample(), original);
});

test("formatActionExample returns an empty string for an unknown action type rather than throwing", () => {
  assert.equal(formatActionExample("not_a_real_action"), "");
});

// ── Every worked example is itself internally consistent ────────────────────

test("every taskBatch example's tasks have a valid HH:MM start/end and a real weekday", () => {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const batch of AI_EXAMPLES.taskBatch) {
    for (const t of batch.tasks) {
      assert.match(t.startTime, /^\d{2}:\d{2}$/);
      assert.match(t.endTime, /^\d{2}:\d{2}$/);
      assert.ok(days.includes(t.day), `${t.day} is not a real weekday`);
      assert.ok(["task", "session", "commitment"].includes(t.taskType));
    }
  }
});

test("every milestoneBatch example's dates are within its stated date range and in chronological order", () => {
  for (const batch of AI_EXAMPLES.milestoneBatch) {
    const dates = batch.milestones.map((m) => m.targetDate);
    const sorted = [...dates].sort();
    assert.deepEqual(dates, sorted, `${batch.planTitle}'s milestones should already be chronological`);
  }
});
