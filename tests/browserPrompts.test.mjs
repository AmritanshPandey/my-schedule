/**
 * The browser provider rewrites every prompt before inference because the
 * real prompts target 7B+ models. A prompt that no detector matches passes
 * through untouched — which is how the AI Assistant ended up handing ~1,850
 * tokens of GENERAL_PROMPT to a sub-1B model and getting a repetition loop.
 * These tests pin the routing so a new surface can't silently fall through.
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

const { rewriteForBrowserModel, FOCUSED_SCHEMAS } = await import("@/lib/ai/providers/browserPrompts.ts");
const { buildSystemPrompt } = await import("@/lib/ai.ts");

// The exact prompt the AI Assistant sends — built the same way the chat does,
// rather than a copy that could drift away from the real one.
const GENERAL_PROMPT_FOR_TEST = buildSystemPrompt("plans", [], []);

function req(systemPrompt, userContent = "Create a 30-day fitness plan") {
  return { systemPrompt, messages: [{ role: "user", content: userContent }] };
}

test("the AI Assistant chat prompt is rewritten, not passed through", () => {
  const out = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST));
  assert.notEqual(out.systemPrompt, GENERAL_PROMPT_FOR_TEST, "chat prompt fell through untouched");
});

test("the rewritten chat prompt is dramatically smaller than the original", () => {
  const out = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST));
  assert.ok(
    out.systemPrompt.length < GENERAL_PROMPT_FOR_TEST.length / 3,
    `expected a large reduction, got ${out.systemPrompt.length} vs ${GENERAL_PROMPT_FOR_TEST.length}`,
  );
});

test("the chat rewrite keeps the user's actual request", () => {
  const out = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST, "Add a tracker for water"));
  const joined = out.messages.map((m) => m.content).join("\n");
  assert.ok(joined.includes("Add a tracker for water"));
});

test("the chat rewrite collapses history to the latest user turn", () => {
  const out = rewriteForBrowserModel({
    systemPrompt: GENERAL_PROMPT_FOR_TEST,
    messages: [
      { role: "user", content: "first ask" },
      { role: "assistant", content: "some reply" },
      { role: "user", content: "second ask" },
    ],
  });
  assert.equal(out.messages.length, 1);
  const joined = out.messages.map((m) => m.content).join("\n");
  assert.ok(joined.includes("second ask"));
  assert.ok(!joined.includes("first ask"), "stale turns invite the model to replay them");
});

test("the chat rewrite decodes greedily for structured output", () => {
  const out = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST));
  assert.equal(out._temperature, 0);
});

test("an unrecognised prompt still passes through unchanged", () => {
  const custom = "You are some future generator we have not written a rewrite for.";
  const out = rewriteForBrowserModel(req(custom));
  assert.equal(out.systemPrompt, custom);
});

test("the specific action prompts still win over the general chat detector", () => {
  // These are matched before the chat detector; a regression in ordering would
  // send task generation down the chat path and produce the wrong schema.
  const cases = [
    ["You are a task breakdown assistant.", "subtasks"],
    ["You are a milestones planner.", "milestones"],
    ["You are a performance coach.", "insight"],
    ["You are a task planner.", "tasks"],
  ];
  for (const [prompt] of cases) {
    const out = rewriteForBrowserModel(req(prompt));
    assert.notEqual(out.systemPrompt, prompt, `${prompt} was not rewritten`);
  }
});

// ── Known-intent path ────────────────────────────────────────────────────────
// The starter chips know which action they mean. Passing that through removes
// the schema-selection step entirely, which is where a small model failed.

test("a known intent produces a single-schema prompt, not the four-schema chat one", () => {
  const chat = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST));
  const focused = rewriteForBrowserModel({ ...req(GENERAL_PROMPT_FOR_TEST), actionHint: "create_plan" });
  assert.ok(
    focused.systemPrompt.length < chat.systemPrompt.length,
    "focused prompt should be smaller than the generic chat prompt",
  );
  assert.ok(focused.systemPrompt.includes("create_plan"));
  // The other action types must not be offered at all.
  for (const other of ["add_tracker", "suggest_milestones", "create_ritual"]) {
    assert.ok(!focused.systemPrompt.includes(other), `focused prompt still mentions ${other}`);
  }
});

test("each starter intent has a focused schema", () => {
  for (const action of ["create_plan", "add_task", "add_tracker", "suggest_milestones", "create_ritual"]) {
    const out = rewriteForBrowserModel({ ...req(GENERAL_PROMPT_FOR_TEST), actionHint: action });
    assert.ok(out.systemPrompt.includes(action), `${action} did not get a focused prompt`);
    assert.equal(out._temperature, 0, `${action} should decode greedily`);
  }
});

// components/plan/AIPlanCreatorSheet.tsx relies on this schema NOT asking for
// milestones — that's exactly why it's smaller and more reliable than the
// generic chat path (see that file's runGenerate for the full rationale). If
// this schema ever grows a milestones field, the sheet's separate, follow-up
// streamGenerateMilestones() call would start duplicating work silently.
test("the create_plan focused schema has no milestones field — that's staged separately", () => {
  assert.ok(!FOCUSED_SCHEMAS.create_plan.schema.includes("milestones"), "focused create_plan schema should stay tasks-only");
  assert.ok(!FOCUSED_SCHEMAS.create_plan.example.includes("milestones"), "focused create_plan example should stay tasks-only");
});

test("the intent wins over prompt-sniffing", () => {
  // A task-planner prompt would normally route to the tasks rewrite; an
  // explicit intent must take precedence over the guess.
  const out = rewriteForBrowserModel({ ...req("You are a task planner."), actionHint: "add_tracker" });
  assert.ok(out.systemPrompt.includes("add_tracker"));
});

test("an unknown intent falls back rather than emitting an empty schema", () => {
  const out = rewriteForBrowserModel({ ...req(GENERAL_PROMPT_FOR_TEST), actionHint: "not_a_real_action" });
  // Falls through to the generic chat rewrite, which is still a valid prompt.
  assert.ok(out.systemPrompt.length > 0);
  assert.ok(!out.systemPrompt.includes("not_a_real_action"));
});

test("the focused rewrite keeps the user's request", () => {
  const out = rewriteForBrowserModel({
    ...req(GENERAL_PROMPT_FOR_TEST, "Add a tracker for daily steps"),
    actionHint: "add_tracker",
  });
  assert.ok(out.messages.map((m) => m.content).join("\n").includes("Add a tracker for daily steps"));
});

// ── recentRejections — has to survive the rewrite to reach the model that
// actually needs it (the browser model discards most of the original
// systemPrompt text, so this can't be smuggled in there; see
// lib/ai/rejectionContext.ts and AIGenerateOptions.recentRejections). ───────

test("the chat rewrite folds in recentRejections when present", () => {
  const out = rewriteForBrowserModel({
    ...req(GENERAL_PROMPT_FOR_TEST),
    recentRejections: ["Create task: Morning Run", "Create task: Evening Walk"],
  });
  assert.ok(out.systemPrompt.includes("Recently declined by the user"));
  assert.ok(out.systemPrompt.includes("Create task: Morning Run"));
  assert.ok(out.systemPrompt.includes("Create task: Evening Walk"));
});

test("the focused rewrite folds in recentRejections too", () => {
  const out = rewriteForBrowserModel({
    ...req(GENERAL_PROMPT_FOR_TEST),
    actionHint: "add_task",
    recentRejections: ["Create task: Morning Run"],
  });
  assert.ok(out.systemPrompt.includes("Recently declined by the user: Create task: Morning Run"));
});

test("no recentRejections means no mention of it at all — nothing smuggled in as empty noise", () => {
  const chat = rewriteForBrowserModel(req(GENERAL_PROMPT_FOR_TEST));
  assert.ok(!chat.systemPrompt.includes("Recently declined"));
  const focused = rewriteForBrowserModel({ ...req(GENERAL_PROMPT_FOR_TEST), actionHint: "add_task" });
  assert.ok(!focused.systemPrompt.includes("Recently declined"));
});
