/**
 * A task split into multiple time blocks is worked through one phase at a time.
 * These pin the rule every surface now shares: a tap on a whole-task control
 * advances ONE phase, never all of them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try { return nextResolve(url, context); } catch { return nextResolve(`${url}.ts`, context); }
    }
    try { return nextResolve(specifier, context); }
    catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

const { phaseProgress, resolveSlotState } = await import("@/lib/taskCompletion.ts");

function task(overrides = {}) {
  return {
    id: "t1", title: "Study", planId: "p1",
    startTime: "09:00", endTime: "11:00",
    slots: [{ startTime: "09:00", endTime: "11:00" }, { startTime: "16:00", endTime: "18:00" }],
    ...overrides,
  };
}

test("a single-block task is not multi-phase", () => {
  const t = task({ slots: undefined });
  const p = phaseProgress(t);
  assert.equal(p.isMultiPhase, false);
  assert.equal(p.total, 1);
});

test("nothing done: a tap targets the first phase", () => {
  const p = phaseProgress(task());
  assert.equal(p.done, 0);
  assert.equal(p.nextIndex, 0);
  assert.equal(p.allDone, false);
});

test("first phase done: a tap targets the second, not the whole task", () => {
  const p = phaseProgress(task({ completedSlotIndices: [0] }));
  assert.equal(p.done, 1);
  assert.equal(p.nextIndex, 1);
  assert.equal(p.allDone, false);
});

test("completing the morning block leaves the afternoon block incomplete", () => {
  const t = task({ completedSlotIndices: [0] });
  assert.equal(resolveSlotState(t, 0), "completed");
  assert.equal(resolveSlotState(t, 1), "incomplete");
});

test("out-of-order completion still targets the earliest unfinished phase", () => {
  const p = phaseProgress(task({ completedSlotIndices: [1] }));
  assert.equal(p.done, 1);
  assert.equal(p.nextIndex, 0);
});

test("all phases done: the control stays reversible on the last phase", () => {
  const p = phaseProgress(task({ completedSlotIndices: [0, 1] }));
  assert.equal(p.allDone, true);
  assert.equal(p.nextIndex, 1, "tapping again should undo the most recent phase");
});

test("a stale index from a task edited down to fewer phases doesn't inflate progress", () => {
  // Was 3 phases, edited to 2 — index 2 no longer exists.
  const p = phaseProgress(task({ completedSlotIndices: [0, 2] }));
  assert.equal(p.total, 2);
  assert.equal(p.done, 1, "the vanished phase must not count");
  assert.equal(p.allDone, false, "and must not make the task look finished");
  assert.equal(p.nextIndex, 1);
});
