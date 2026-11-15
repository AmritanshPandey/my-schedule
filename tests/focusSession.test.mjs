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
  startFocus, focusReducer, stepElapsedMs, totalElapsedMs, restRemainingSeconds, currentStepId, isLastStep,
  allStepsDone, isFocusResumable, formatClock,
} = await import("../lib/focusSession.ts");

const T = 1_800_000_000_000;
const S = 1000;
const start = (over = {}) => startFocus({ taskId: "t1", day: "monday", dateISO: "2026-11-09", stepIds: ["a", "b", "c"], now: T, ...over });

test("the clock is derived from timestamps, so a long background is just a jump in now", () => {
  const s = start();
  assert.equal(stepElapsedMs(s, T + 90 * S), 90 * S);
  assert.equal(totalElapsedMs(s, T + 3600 * S), 3600 * S, "an hour suspended in the background still counts");
});

test("pause freezes both clocks; resume continues from the banked time", () => {
  let s = focusReducer(start(), { type: "pause", now: T + 30 * S });
  assert.equal(stepElapsedMs(s, T + 500 * S), 30 * S, "time while paused never counts");
  s = focusReducer(s, { type: "resume", now: T + 500 * S });
  assert.equal(stepElapsedMs(s, T + 510 * S), 40 * S);
  assert.equal(focusReducer(s, { type: "resume", now: T + 600 * S }), s, "resuming a running clock is a no-op");
});

test("changing step resets the step clock but not the session clock", () => {
  const s = focusReducer(start(), { type: "goTo", index: 1, now: T + 60 * S });
  assert.equal(currentStepId(s), "b");
  assert.equal(stepElapsedMs(s, T + 70 * S), 10 * S);
  assert.equal(totalElapsedMs(s, T + 70 * S), 70 * S);
});

test("completing a step ticks it and moves to the next undone one, wrapping back to skipped steps", () => {
  let s = focusReducer(start(), { type: "goTo", index: 1, now: T });        // skip a
  s = focusReducer(s, { type: "completeStep", now: T + S });                 // b done → c
  assert.equal(currentStepId(s), "c");
  s = focusReducer(s, { type: "completeStep", now: T + 2 * S });             // c done → wraps to a
  assert.equal(currentStepId(s), "a");
  assert.equal(allStepsDone(s), false);
  s = focusReducer(s, { type: "completeStep", now: T + 3 * S });
  assert.equal(allStepsDone(s), true);
});

test("a session opens on the first step not already done today", () => {
  const s = start({ alreadyDone: ["a"] });
  assert.equal(currentStepId(s), "b");
  assert.deepEqual(s.doneStepIds, ["a"]);
});

test("rest counts down, survives a pause, and can be skipped", () => {
  let s = focusReducer(start(), { type: "startRest", seconds: 90, now: T + 10 * S });
  assert.equal(restRemainingSeconds(s, T + 40 * S), 60);
  s = focusReducer(s, { type: "pause", now: T + 40 * S });
  assert.equal(restRemainingSeconds(s, T + 400 * S), 60, "paused rest is frozen");
  s = focusReducer(s, { type: "resume", now: T + 400 * S });
  assert.equal(restRemainingSeconds(s, T + 430 * S), 30);
  assert.equal(restRemainingSeconds(s, T + 999 * S), 0, "never negative");
  assert.equal(focusReducer(s, { type: "skipRest" }).restEndsAt, null);
  assert.equal(focusReducer(s, { type: "goTo", index: 2, now: T + 431 * S }).restEndsAt, null, "moving on ends the rest");
});

test("draft sets are kept per step", () => {
  const sets = [{ weight: 60, reps: 10, done: true }];
  const s = focusReducer(start(), { type: "setSets", stepId: "a", sets });
  assert.deepEqual(s.draftSets.a, sets);
});

test("a task with no subtasks is one timer", () => {
  const s = start({ stepIds: [] });
  assert.equal(currentStepId(s), null);
  assert.equal(isLastStep(s), true);
  assert.equal(focusReducer(s, { type: "goTo", index: 1, now: T }), s);
});

test("only today's session resumes", () => {
  assert.equal(isFocusResumable(start(), "2026-11-09"), true);
  assert.equal(isFocusResumable(start(), "2026-11-10"), false);
  assert.equal(isFocusResumable(null, "2026-11-09"), false);
});

test("the display clock", () => {
  assert.equal(formatClock(65 * S), "1:05");
  assert.equal(formatClock(760 * S), "12:40");
  assert.equal(formatClock(3723 * S), "1:02:03");
  assert.equal(formatClock(-5), "0:00");
});
