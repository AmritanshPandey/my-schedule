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

const { ROUTINE_TEMPLATES } = await import("../lib/routineTemplates.ts");
const { RitualSchema } = await import("../lib/scheduleSchema.ts");

test("every template's defaults validate against RitualSchema once given an id/title/time", () => {
  for (const tpl of ROUTINE_TEMPLATES) {
    const payload = {
      id: "test-id",
      title: tpl.defaults.title ?? tpl.label,
      time: tpl.defaults.time ?? "08:00",
      ...tpl.defaults,
    };
    const result = RitualSchema.safeParse(payload);
    assert.ok(result.success, `${tpl.key} failed: ${result.success ? "" : JSON.stringify(result.error.issues)}`);
  }
});

test("every non-checkbox, non-custom template has a unit or non-empty steps", () => {
  for (const tpl of ROUTINE_TEMPLATES) {
    if (tpl.key === "custom") continue;
    const type = tpl.defaults.trackingType;
    if (type === "quantity" || type === "duration" || type === "count") {
      assert.ok(tpl.defaults.unit, `${tpl.key} (${type}) has no unit`);
    } else if (type === "checklist") {
      assert.ok(tpl.defaults.steps && tpl.defaults.steps.length > 0, `${tpl.key} has no steps`);
    }
  }
});

test("the custom template has no preset trackingType — it's the blank slate", () => {
  const custom = ROUTINE_TEMPLATES.find((t) => t.key === "custom");
  assert.ok(custom);
  assert.equal(custom.defaults.trackingType, undefined);
});

test("template keys are unique", () => {
  const keys = ROUTINE_TEMPLATES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});
