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

test("a 'times' ritual with 3 steps produces 3 occurrences, each with its own stepId and time", () => {
  const steps = [{ id: "a", label: "08:00" }, { id: "b", label: "13:00" }, { id: "c", label: "18:00" }];
  const r = ritual({ trackingType: "times", steps, time: "08:00" });
  const groups = group([r]);
  const all = groups.flatMap((g) => g.occurrences);
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((o) => o.time), ["08:00", "13:00", "18:00"], "bucketed and ordered by each occurrence's own time");
  assert.deepEqual(all.map((o) => o.stepId), ["a", "b", "c"]);
  assert.ok(all.every((o) => o.ritual.id === "r1"));
});

test("an occurrence outside the visible window is excluded even when another occurrence of the same ritual is inside it", () => {
  // A window that only covers the middle occurrence.
  const steps = [{ id: "a", label: "02:00" }, { id: "b", label: "10:00" }, { id: "c", label: "23:00" }];
  const r = ritual({ trackingType: "times", steps, time: "02:00" });
  const groups = groupRitualsByTime([r], D, 8 * 60, 12 * 60, 0, 60);
  const all = groups.flatMap((g) => g.occurrences);
  assert.equal(all.length, 1, "only the 10:00 occurrence falls inside [8:00, 12:00]");
  assert.equal(all[0].stepId, "b");
});

test("trackingStart still excludes a ritual — all of its occurrences — before the cutoff", () => {
  const steps = [{ id: "a", label: "08:00" }, { id: "b", label: "13:00" }];
  const r = ritual({ trackingType: "times", steps, time: "08:00" });
  const gated = groupRitualsByTime([r], D, WINDOW_START, WINDOW_END, 0, 60, "2026-01-06"); // cutoff after D
  const ungated = groupRitualsByTime([r], D, WINDOW_START, WINDOW_END, 0, 60, "2026-01-01"); // cutoff before D
  assert.equal(gated.flatMap((g) => g.occurrences).length, 0, "D is before the cutoff -> no occurrences at all");
  assert.equal(ungated.flatMap((g) => g.occurrences).length, 2, "D is on/after the cutoff -> unaffected");
});
