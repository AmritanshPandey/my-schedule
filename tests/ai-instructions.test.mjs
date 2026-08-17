/**
 * Coverage for lib/ai/instructions.ts's withInstructions — the pure function
 * that appends a user's custom per-category instructions to a built-in
 * prompt. get/setAIInstructions themselves are localStorage-backed (via
 * lib/safeStorage.ts, which no-ops outside a browser) so aren't exercised
 * here; this locks down the part that's actually pure logic.
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

const { withInstructions } = await import("@/lib/ai/instructions.ts");

test("withInstructions returns the prompt unchanged when there's nothing to add", () => {
  const prompt = "You are a task planner.";
  assert.equal(withInstructions(prompt, "Tasks", undefined), prompt);
  assert.equal(withInstructions(prompt, "Tasks", ""), prompt);
  assert.equal(withInstructions(prompt, "Tasks", "   "), prompt);
});

test("withInstructions appends a labeled block when instructions are present", () => {
  const prompt = "You are a task planner.";
  const result = withInstructions(prompt, "Tasks", "Titles under 5 words.");
  assert.ok(result.startsWith(prompt), "keeps the original prompt intact");
  assert.ok(result.includes("Tasks"), "labels which category the instructions are for");
  assert.ok(result.includes("Titles under 5 words."), "includes the user's actual text");
});

test("withInstructions trims surrounding whitespace from the user's text", () => {
  const result = withInstructions("Base prompt.", "Milestones", "  keep titles short  ");
  assert.ok(result.endsWith("keep titles short"), "no leftover whitespace at the end");
  assert.ok(!result.includes("  keep"), "no leftover leading whitespace before the text");
});
