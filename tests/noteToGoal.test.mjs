/**
 * Coverage for lib/notes/noteToGoal.ts — turns a note's own title+body into
 * the "goal" string components/plan/AIPlanCreatorSheet.tsx expects when a
 * note is turned into a plan (AI). See that file's header comment.
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

const { buildPlanGoalFromNote } = await import("../lib/notes/noteToGoal.ts");

test("combines title and body when both are present", () => {
  const goal = buildPlanGoalFromNote({ title: "Learn Spanish", body: "30 min/day, focus on speaking." });
  assert.equal(goal, "Learn Spanish\n\n30 min/day, focus on speaking.");
});

test("falls back to title only when body is empty", () => {
  assert.equal(buildPlanGoalFromNote({ title: "Learn Spanish", body: "" }), "Learn Spanish");
  assert.equal(buildPlanGoalFromNote({ title: "Learn Spanish", body: "   " }), "Learn Spanish");
});

test("falls back to body only when title is empty", () => {
  assert.equal(buildPlanGoalFromNote({ title: "", body: "Run a 5K in 8 weeks" }), "Run a 5K in 8 weeks");
});

test("trims whitespace on both sides before combining", () => {
  assert.equal(
    buildPlanGoalFromNote({ title: "  Learn Spanish  ", body: "  Daily practice  " }),
    "Learn Spanish\n\nDaily practice",
  );
});

test("an empty note produces an empty string, not a placeholder", () => {
  assert.equal(buildPlanGoalFromNote({ title: "", body: "" }), "");
  assert.equal(buildPlanGoalFromNote({ title: "   ", body: "   " }), "");
});

test("strips rich-text-editor markup instead of passing raw HTML to the AI", () => {
  // What the editor actually persists (lib/notes/richText.ts) — regression
  // coverage for a real bug caught in manual verification, where the raw
  // "<!--rich-note-body-->" sentinel + HTML tags were being sent as the goal.
  const richBody = "<!--rich-note-body--><p>30 min/day, focus on speaking.</p><p>Evenings free after 7pm.</p>";
  const goal = buildPlanGoalFromNote({ title: "Learn Spanish", body: richBody });
  assert.ok(!goal.includes("<!--rich-note-body-->"), "sentinel comment must not leak into the goal");
  assert.ok(!goal.includes("<p>"), "HTML tags must not leak into the goal");
  assert.equal(goal, "Learn Spanish\n\n30 min/day, focus on speaking.\nEvenings free after 7pm.");
});
