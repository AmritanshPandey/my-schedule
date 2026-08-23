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
  toggleRitualCompletion,
  appendRitualLog,
  removeRitualLog,
  undoLastRitualLog,
  toggleRitualStep,
  clearRitualDay,
  entriesForRitualDate,
  sumRitualDate,
  stepIdsDoneOn,
} = await import("../lib/ritualCompletions.ts");

// ── toggleRitualCompletion (unchanged) ──────────────────────────────────────

test("toggleRitualCompletion output is still exactly {ritualId, date} — no new keys", () => {
  const next = toggleRitualCompletion([], "r1", "2026-01-01");
  assert.deepEqual(next, [{ ritualId: "r1", date: "2026-01-01" }]);
});

test("toggleRitualCompletion removes on second call", () => {
  const once = toggleRitualCompletion([], "r1", "2026-01-01");
  const twice = toggleRitualCompletion(once, "r1", "2026-01-01");
  assert.deepEqual(twice, []);
});

// ── appendRitualLog ──────────────────────────────────────────────────────────

test("appendRitualLog appends a distinct row with an id, timestamp, and value", () => {
  const next = appendRitualLog([], "r1", "2026-01-01", 500);
  assert.equal(next.length, 1);
  assert.ok(next[0].id);
  assert.ok(next[0].timestamp);
  assert.equal(next[0].value, 500);
  assert.equal(next[0].ritualId, "r1");
  assert.equal(next[0].date, "2026-01-01");
});

test("appendRitualLog never merges — two calls produce two distinct rows", () => {
  let completions = appendRitualLog([], "r1", "2026-01-01", 250);
  completions = appendRitualLog(completions, "r1", "2026-01-01", 250);
  assert.equal(completions.length, 2);
  assert.notEqual(completions[0].id, completions[1].id);
  assert.equal(sumRitualDate(completions, "r1", "2026-01-01"), 500);
});

// ── removeRitualLog / undoLastRitualLog ─────────────────────────────────────

test("removeRitualLog removes only the matching id", () => {
  let completions = appendRitualLog([], "r1", "2026-01-01", 100);
  completions = appendRitualLog(completions, "r1", "2026-01-01", 200);
  const target = completions[0].id;
  const next = removeRitualLog(completions, target);
  assert.equal(next.length, 1);
  assert.notEqual(next[0].id, target);
});

test("undoLastRitualLog removes the most recently timestamped row for that ritual/day", () => {
  let completions = appendRitualLog([], "r1", "2026-01-01", 100, { timestamp: "2026-01-01T08:00:00.000Z" });
  completions = appendRitualLog(completions, "r1", "2026-01-01", 200, { timestamp: "2026-01-01T11:00:00.000Z" });
  const next = undoLastRitualLog(completions, "r1", "2026-01-01");
  assert.equal(next.length, 1);
  assert.equal(next[0].value, 100);
});

test("undoLastRitualLog is a no-op when there's nothing to undo", () => {
  const completions = [{ ritualId: "r1", date: "2026-01-01" }]; // sentinel checkbox row
  const next = undoLastRitualLog(completions, "r1", "2026-01-01");
  assert.deepEqual(next, completions);
});

// ── toggleRitualStep ─────────────────────────────────────────────────────────

test("toggleRitualStep adds then removes a step row idempotently", () => {
  let completions = toggleRitualStep([], "r1", "2026-01-01", "step-a");
  assert.equal(stepIdsDoneOn(completions, "r1", "2026-01-01").size, 1);
  completions = toggleRitualStep(completions, "r1", "2026-01-01", "step-a");
  assert.equal(stepIdsDoneOn(completions, "r1", "2026-01-01").size, 0);
});

test("toggleRitualStep tracks multiple steps independently", () => {
  let completions = toggleRitualStep([], "r1", "2026-01-01", "a");
  completions = toggleRitualStep(completions, "r1", "2026-01-01", "b");
  const done = stepIdsDoneOn(completions, "r1", "2026-01-01");
  assert.equal(done.size, 2);
  assert.ok(done.has("a") && done.has("b"));
});

// ── clearRitualDay / cascade-style deletes ──────────────────────────────────

test("clearRitualDay removes every row shape (sentinel, value, step) for one ritual/day", () => {
  let completions = [{ ritualId: "r1", date: "2026-01-01" }];
  completions = appendRitualLog(completions, "r1", "2026-01-01", 500);
  completions = toggleRitualStep(completions, "r1", "2026-01-01", "s1");
  completions = appendRitualLog(completions, "r2", "2026-01-01", 999); // different ritual, untouched
  const next = clearRitualDay(completions, "r1", "2026-01-01");
  assert.equal(next.length, 1);
  assert.equal(next[0].ritualId, "r2");
});

test("delete-cascade filter (ritualId !== id) removes value and stepId rows too", () => {
  let completions = appendRitualLog([], "r1", "2026-01-01", 500);
  completions = toggleRitualStep(completions, "r1", "2026-01-02", "s1");
  const next = completions.filter((c) => c.ritualId !== "r1");
  assert.equal(next.length, 0);
});

// ── read helpers ─────────────────────────────────────────────────────────────

test("entriesForRitualDate/sumRitualDate ignore other rituals and dates", () => {
  let completions = appendRitualLog([], "r1", "2026-01-01", 500);
  completions = appendRitualLog(completions, "r1", "2026-01-02", 999);
  completions = appendRitualLog(completions, "r2", "2026-01-01", 999);
  assert.equal(entriesForRitualDate(completions, "r1", "2026-01-01").length, 1);
  assert.equal(sumRitualDate(completions, "r1", "2026-01-01"), 500);
});
