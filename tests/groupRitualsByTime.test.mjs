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

const { groupRitualsByTime } = await import("../lib/timeline/groupRitualsByTime.ts");

const WINDOW_START = 4 * 60;   // 4:00 AM
const WINDOW_END = 28 * 60;    // 4:00 AM next day
const D = "2026-01-05"; // a Monday

function ritual(overrides = {}) {
  return { id: "r1", title: "Test", time: "08:00", ...overrides };
}

function group(rituals, dateISO = D) {
  return groupRitualsByTime(rituals, dateISO, WINDOW_START, WINDOW_END, 0, 60);
}

test("a non-'times' ritual still produces exactly one occurrence, at ritual.time", () => {
  const r = ritual({ time: "09:30" });
  const groups = group([r]);
  const all = groups.flatMap((g) => g.occurrences);
  assert.equal(all.length, 1);
  assert.equal(all[0].ritual.id, "r1");
  assert.equal(all[0].time, "09:30");
  assert.equal(all[0].stepId, undefined, "no stepId for a non-'times' occurrence");
});



