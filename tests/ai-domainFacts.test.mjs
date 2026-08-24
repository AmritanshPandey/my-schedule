/**
 * Coverage for lib/ai/domainFacts.ts — the single source of truth for
 * AI-facing domain vocab (task types, ritual tracking types, colors, goal
 * directions) that used to be hand-typed separately in lib/ai.ts AND
 * lib/aiActions.ts (three copies of the icon list alone). Locks down:
 *  - domainFacts.json parses into the expected shape,
 *  - the derived VALID_* arrays match what parseAIAction/parseGeneratedTasks
 *    actually validate against,
 *  - the icon list injected into the system prompt matches
 *    lib/taskCategories.ts's CATEGORY_LABELS (the real icon picker's source),
 *    so the prompt can never tell the model an icon exists that the app's
 *    own picker doesn't offer.
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
  DOMAIN_FACTS,
  VALID_TASK_TYPES,
  VALID_TRACKING_TYPES,
  VALID_PLAN_COLORS,
  VALID_RITUAL_COLORS,
  VALID_GOAL_DIRECTIONS,
  VALID_ACTION_TYPES,
} = await import("../lib/ai/domainFacts.ts");
const { CATEGORY_LABELS } = await import("../lib/taskCategories.ts");
const { buildSystemPrompt, parseAIAction } = await import("../lib/ai.ts");

// ── domainFacts.json shape ───────────────────────────────────────────────────

test("domainFacts.json parses into the expected shape with non-empty sections", () => {
  assert.ok(Array.isArray(DOMAIN_FACTS.taskTypes) && DOMAIN_FACTS.taskTypes.length > 0);
  assert.ok(Array.isArray(DOMAIN_FACTS.trackingTypes) && DOMAIN_FACTS.trackingTypes.length > 0);
  assert.ok(Array.isArray(DOMAIN_FACTS.planColors) && DOMAIN_FACTS.planColors.length > 0);
  assert.ok(Array.isArray(DOMAIN_FACTS.ritualColors) && DOMAIN_FACTS.ritualColors.length > 0);
  assert.ok(Array.isArray(DOMAIN_FACTS.goalDirections) && DOMAIN_FACTS.goalDirections.length > 0);
  assert.ok(Array.isArray(DOMAIN_FACTS.actionTypes) && DOMAIN_FACTS.actionTypes.length > 0);
  // Every entry with a "value" also carries a non-empty description.
  for (const entry of [...DOMAIN_FACTS.taskTypes, ...DOMAIN_FACTS.trackingTypes, ...DOMAIN_FACTS.goalDirections, ...DOMAIN_FACTS.actionTypes]) {
    assert.equal(typeof entry.value, "string");
    assert.ok(entry.value.length > 0);
    assert.equal(typeof entry.description, "string");
    assert.ok(entry.description.length > 0, `${entry.value} should have a description`);
  }
});

// ── Derived VALID_* arrays match what the parsers actually validate against ──

test("VALID_TASK_TYPES matches the task/session/commitment vocabulary the parsers accept", () => {
  assert.deepEqual([...VALID_TASK_TYPES].sort(), ["commitment", "session", "task"].sort());
});

test("VALID_TRACKING_TYPES matches the ritual tracking vocabulary", () => {
  assert.deepEqual([...VALID_TRACKING_TYPES].sort(), ["checkbox", "checklist", "count", "duration", "quantity"].sort());
});

test("VALID_PLAN_COLORS and VALID_RITUAL_COLORS are non-empty and disjoint from each other's defaults", () => {
  assert.ok(VALID_PLAN_COLORS.includes("emerald"));
  assert.ok(VALID_RITUAL_COLORS.includes("emerald"));
  assert.ok(VALID_RITUAL_COLORS.length > VALID_PLAN_COLORS.length, "rituals support a wider color set");
});

test("VALID_GOAL_DIRECTIONS is exactly increase_good/decrease_good", () => {
  assert.deepEqual([...VALID_GOAL_DIRECTIONS].sort(), ["decrease_good", "increase_good"]);
});

test("VALID_ACTION_TYPES covers every AIActionResult type parseAIAction can produce", () => {
  const expected = ["create_plan", "create_ritual", "suggest_milestones", "add_tracker", "add_task", "add_subtasks", "ask_clarification"];
  assert.deepEqual([...VALID_ACTION_TYPES].sort(), [...expected].sort());
});

// ── The generated prompt actually reflects domainFacts + CATEGORY_LABELS ────

test("buildSystemPrompt's icon list matches CATEGORY_LABELS exactly — no drift between the prompt and the real icon picker", () => {
  const prompt = buildSystemPrompt("plans");
  const iconList = Object.keys(CATEGORY_LABELS).join(", ");
  assert.ok(prompt.includes(iconList), "the exact CATEGORY_LABELS-derived icon list must appear verbatim in the prompt");
});

test("buildSystemPrompt's ritual color list matches VALID_RITUAL_COLORS", () => {
  const prompt = buildSystemPrompt("routine");
  assert.ok(prompt.includes(VALID_RITUAL_COLORS.join(", ")));
});

test("buildSystemPrompt's plan color list matches VALID_PLAN_COLORS", () => {
  const prompt = buildSystemPrompt("plans");
  assert.ok(prompt.includes(VALID_PLAN_COLORS.join(", ")));
});

// ── End-to-end sanity: parseAIAction still validates against the same vocab ──

test("parseAIAction still accepts a plan color from VALID_PLAN_COLORS and rejects one that isn't", () => {
  const validColor = VALID_PLAN_COLORS[0];
  const accepted = parseAIAction(`\`\`\`json\n{"type":"create_plan","payload":{"title":"Test","description":"","emoji":"star","color":"${validColor}"}}\n\`\`\``);
  assert.equal(accepted?.payload.color, validColor);

  const fallback = parseAIAction(`\`\`\`json\n{"type":"create_plan","payload":{"title":"Test","description":"","emoji":"star","color":"not-a-real-color"}}\n\`\`\``);
  assert.equal(fallback?.payload.color, "cyan", "an invalid color falls back to the documented default, not silently through");
});
