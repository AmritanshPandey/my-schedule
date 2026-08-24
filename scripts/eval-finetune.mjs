#!/usr/bin/env node
/**
 * Grades a candidate fine-tuned model's outputs through PlanR's own,
 * already-tested validation pipeline — no reimplementation. See
 * docs/fine-tuning.md for where this fits in the external pipeline.
 *
 * Input: a JSONL file of {action, response} records — the same shape
 * training-data/finetune-dataset.jsonl uses, or hand-written fixtures. Run
 * the candidate model over your held-out prompts yourself (however your
 * external tooling does inference) and write its outputs in this shape.
 *
 * Usage:
 *   node --experimental-strip-types scripts/eval-finetune.mjs <candidate-outputs.jsonl>
 *   npm run eval-finetune -- candidate-outputs.jsonl
 *
 * Classification per record:
 *   fail    — parsing returned nothing (same signal the live app treats as
 *             "not valid JSON", e.g. a truncated or malformed reply)
 *   warning — parsed, but validateTaskShapes/runBusinessRules flagged an
 *             issue (bad HH:MM, duplicate, overbooked day, stale deadline...)
 *   pass    — parsed cleanly with no issues
 *
 * Exit code 1 only if a whole category's pass rate is 0% (nothing else is
 * ever generated for that category) — a real regression signal, not just
 * "some outputs need work".
 */
import { registerHooks } from "node:module";
import { readFile } from "node:fs/promises";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
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
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        try {
          return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
        } catch {
          return nextResolve(`${new URL(specifier, context.parentURL).href}.tsx`, context);
        }
      }
      throw error;
    }
  },
});

const { parseGeneratedTasks, parseGeneratedSubtasks, parseGeneratedMilestones } = await import("@/lib/aiActions.ts");
const { parseAIAction } = await import("@/lib/ai.ts");
const { validateTaskShapes } = await import("@/lib/ai/validation/taskSchema.ts");
const { runBusinessRules, resolveDayWindowMinutes } = await import("@/lib/ai/validation/businessRules.ts");

const filePath = process.argv[2];
if (!filePath) {
  console.error("[eval-finetune] usage: node --experimental-strip-types scripts/eval-finetune.mjs <candidate-outputs.jsonl>");
  process.exit(1);
}

// Minimal, empty-schedule context — this is a standalone eval of the model's
// own output quality, not a real user's calendar. checkTimeBudget/
// checkDuplicates degrade gracefully (nothing to clash against); the shape
// and deadline-sanity checks, the ones actually useful here, don't depend on
// this at all.
const { dayStartMinutes, dayEndMinutes } = resolveDayWindowMinutes({});
const EMPTY_CTX = {
  existingTasksByDay: {},
  rituals: [],
  dayStartMinutes,
  dayEndMinutes,
  todayISO: new Date().toISOString().slice(0, 10),
};

const FOCUSED_ACTIONS = new Set(["create_plan", "add_task", "add_tracker", "suggest_milestones", "create_ritual", "chat"]);

function gradeTasks(response) {
  const tasks = parseGeneratedTasks(response);
  if (tasks.length === 0) return { verdict: "fail", detail: "no parseable task array" };
  const { valid, issues } = validateTaskShapes(tasks);
  if (valid.length === 0) return { verdict: "fail", detail: `all ${tasks.length} tasks failed shape validation` };
  const ruleIssues = runBusinessRules(valid, [], EMPTY_CTX);
  const allIssues = [...issues.map((i) => i.message), ...ruleIssues.map((i) => i.message)];
  if (allIssues.length > 0) return { verdict: "warning", detail: allIssues[0] };
  return { verdict: "pass" };
}

function gradeSubtasks(response) {
  const subtasks = parseGeneratedSubtasks(response);
  if (subtasks.length === 0) return { verdict: "fail", detail: "no parseable subtask array" };
  return { verdict: "pass" };
}

function gradeMilestones(response) {
  const milestones = parseGeneratedMilestones(response);
  if (milestones.length === 0) return { verdict: "fail", detail: "no parseable milestone array" };
  const issues = runBusinessRules([], milestones, EMPTY_CTX);
  if (issues.length > 0) return { verdict: "warning", detail: issues[0].message };
  return { verdict: "pass" };
}

function gradeFocused(response, action) {
  const result = parseAIAction(response);
  if (!result) return { verdict: "fail", detail: "no parseable action JSON" };
  if (result.type !== action) return { verdict: "warning", detail: `expected type "${action}", got "${result.type}"` };
  return { verdict: "pass" };
}

function grade(record) {
  const { action, response } = record;
  if (typeof response !== "string" || !response.trim()) return { verdict: "fail", detail: "empty response" };
  if (action === "tasks" || action === "milestone_tasks") return gradeTasks(response);
  if (action === "subtasks") return gradeSubtasks(response);
  if (action === "milestones") return gradeMilestones(response);
  if (action === "insight") return response.trim().length > 0 ? { verdict: "pass" } : { verdict: "fail", detail: "empty" };
  if (FOCUSED_ACTIONS.has(action)) return gradeFocused(response, action);
  return { verdict: "warning", detail: `unrecognized action "${action}" — graded as parse-only` };
}

const raw = await readFile(filePath, "utf8");
const byCategory = new Map(); // action -> {pass, warning, fail}

let total = 0;
let malformed = 0;
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    malformed++;
    continue;
  }
  const { action } = record;
  const { verdict, detail } = grade(record);
  total++;
  const bucket = byCategory.get(action) ?? { pass: 0, warning: 0, fail: 0, examples: [] };
  bucket[verdict]++;
  if (verdict !== "pass" && bucket.examples.length < 3) bucket.examples.push(`${verdict}: ${detail}`);
  byCategory.set(action, bucket);
}

console.log(`[eval-finetune] graded ${total} records${malformed ? ` (${malformed} malformed lines skipped)` : ""} from ${filePath}\n`);

let anyCategoryAllFail = false;
const rows = [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [action, bucket] of rows) {
  const n = bucket.pass + bucket.warning + bucket.fail;
  const passRate = n > 0 ? Math.round((bucket.pass / n) * 100) : 0;
  console.log(`  ${action.padEnd(20)} pass=${bucket.pass} warning=${bucket.warning} fail=${bucket.fail}  (${passRate}% pass)`);
  for (const ex of bucket.examples) console.log(`    ${ex}`);
  if (n > 0 && bucket.pass === 0) anyCategoryAllFail = true;
}

if (rows.length === 0) {
  console.log("  (nothing to grade)");
}

if (anyCategoryAllFail) {
  console.log("\n[eval-finetune] FAIL — at least one category has a 0% pass rate");
  process.exit(1);
}
console.log("\n[eval-finetune] done");
