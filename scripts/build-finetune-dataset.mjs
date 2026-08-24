#!/usr/bin/env node
/**
 * Builds training-data/finetune-dataset.jsonl — the input to an external
 * LoRA fine-tune of PlanR's Browser AI model. See docs/fine-tuning.md for
 * the full pipeline this feeds into.
 *
 * Two sources, merged:
 *  1. lib/ai/examples.json's full example bank (ALL entries, not just the
 *     index-0 shown live — this script IS the "future diversification
 *     pass" that file's own header comment anticipates), run through the
 *     real live prompt builders in lib/ai/providers/browserPrompts.ts so
 *     the dataset can never drift from what the app actually serves.
 *  2. Any captured-interaction .jsonl file(s) passed as CLI args (from
 *     Settings → AI → Training data → Download), already in the same
 *     {action, systemPrompt, messages, response} shape.
 *
 * Usage:
 *   node --experimental-strip-types scripts/build-finetune-dataset.mjs [captured.jsonl ...]
 *   npm run build-finetune-dataset -- captured.jsonl
 *
 * Zero args still succeeds, sourcing purely from examples.json.
 */
import { registerHooks } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Same @/-alias + .ts/.tsx-fallback resolver as tests/browserPrompts.test.mjs,
// with the .tsx fallback that resolver itself lacks — a gap that caused a
// real flaky-test failure when a transitive import resolved to a .tsx file.
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

const {
  buildTaskRequest,
  buildSubtaskRequest,
  buildMilestoneRequest,
  buildFocusedRequest,
  buildChatRequest,
} = await import("@/lib/ai/providers/browserPrompts.ts");
const { AI_EXAMPLES } = await import("@/lib/ai/examples.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "training-data", "finetune-dataset.jsonl");

function req(userContent) {
  // systemPrompt here is only ever used by detectActionType() when a
  // request has no actionHint — every call site below either calls a
  // specific build*Request function directly (bypassing detection) or
  // supplies an explicit action, so this is never read.
  return { messages: [{ role: "user", content: userContent }], systemPrompt: "" };
}

function toRecord(action, built, response) {
  return { action, systemPrompt: built.systemPrompt, messages: built.messages, response };
}

const records = [];

// ── Task batches ──────────────────────────────────────────────────────────
for (const ex of AI_EXAMPLES.taskBatch) {
  const built = buildTaskRequest(req(ex.context));
  records.push(toRecord("tasks", built, JSON.stringify(ex.tasks)));
}

// ── Subtask batches ───────────────────────────────────────────────────────
for (const ex of AI_EXAMPLES.subtaskBatch) {
  const built = buildSubtaskRequest(req(ex.context));
  records.push(toRecord("subtasks", built, JSON.stringify(ex.subtasks)));
}

// ── Milestone batches ─────────────────────────────────────────────────────
for (const ex of AI_EXAMPLES.milestoneBatch) {
  const built = buildMilestoneRequest(req(`${ex.planTitle} (${ex.dateRange})`));
  records.push(toRecord("milestones", built, JSON.stringify(ex.milestones)));
}

// ── Focused (known-intent) actions ───────────────────────────────────────
for (const [action, ex] of Object.entries(AI_EXAMPLES.actions)) {
  const built = buildFocusedRequest(req(ex.request), action);
  if (!built) continue; // FOCUSED_SCHEMAS has no entry for this key
  records.push(toRecord(action, built, JSON.stringify(ex.response)));
}

// ── AI Assistant chat — reuses the create_plan example, same as
//    formatChatExample() does for the live few-shot. ───────────────────────
if (AI_EXAMPLES.actions.create_plan) {
  const ex = AI_EXAMPLES.actions.create_plan;
  const built = buildChatRequest(req(ex.request));
  records.push(toRecord("chat", built, JSON.stringify(ex.response)));
}

const fromExamples = records.length;

// ── Merge captured interaction files from CLI args ──────────────────────
let fromCaptures = 0;
let skipped = 0;
for (const filePath of process.argv.slice(2)) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    console.error(`[build-finetune-dataset] could not read ${filePath}: ${err.message}`);
    continue;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed);
      if (!rec.action || !rec.response || !Array.isArray(rec.messages)) {
        skipped++;
        continue;
      }
      records.push(rec);
      fromCaptures++;
    } catch {
      skipped++;
    }
  }
}

// ── Write output ──────────────────────────────────────────────────────────
await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

const byCategory = records.reduce((acc, r) => {
  acc[r.action] = (acc[r.action] ?? 0) + 1;
  return acc;
}, {});

console.log(`[build-finetune-dataset] ${fromExamples} from examples.json, ${fromCaptures} from captures${skipped ? ` (${skipped} skipped — malformed)` : ""}`);
console.log(`[build-finetune-dataset] by category: ${Object.entries(byCategory).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`[build-finetune-dataset] wrote ${records.length} records to ${OUT_PATH}`);
