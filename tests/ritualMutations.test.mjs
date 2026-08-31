/**
 * Moving a routine to a new time of day.
 *
 * A routine has no per-date position, so this is a time change that applies to
 * every day it recurs on. The fiddly part is the "times" kind (water at
 * 8am/1pm/6pm): each occurrence is a `RitualStep` whose `label` holds a raw
 * "HH:MM", the list is contracted to stay sorted, and `ritual.time` mirrors the
 * earliest one for every reader that treats a routine as happening once.
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

const { setRitualTime } = await import("../lib/ritualMutations.ts");

const sched = (rituals) => ({ rituals });
const plain = (over = {}) => ({ id: "r1", title: "Stretch", time: "08:00", ...over });
const times = (labels) => ({
  id: "r1",
  title: "Water",
  time: labels[0],
  trackingType: "times",
  steps: labels.map((label, i) => ({ id: `s${i}`, label })),
});
const labelsOf = (r) => r.steps.map((s) => s.label);

// ── The ordinary routine ────────────────────────────────────────────────────

test("moving a plain routine changes its time", () => {
  const out = setRitualTime("r1", undefined, "09:30")(sched([plain()]));
  assert.equal(out.rituals[0].time, "09:30");
});

test("a time is normalised to the stored 24-hour form", () => {
  // Callers hand this whatever the timeline produced; the model stores "HH:MM".
  assert.equal(setRitualTime("r1", undefined, "9:05 PM")(sched([plain()])).rituals[0].time, "21:05");
  assert.equal(setRitualTime("r1", undefined, "7:05")(sched([plain()])).rituals[0].time, "07:05");
  assert.equal(setRitualTime("r1", undefined, "12:00 AM")(sched([plain()])).rituals[0].time, "00:00");
});

test("an unparseable time is ignored rather than stored", () => {
  const before = sched([plain()]);
  assert.equal(setRitualTime("r1", undefined, "not a time")(before), before);
});

test("only the addressed routine moves", () => {
  const out = setRitualTime("r1", undefined, "10:00")(
    sched([plain(), plain({ id: "r2", time: "08:00" })]),
  );
  assert.equal(out.rituals[0].time, "10:00");
  assert.equal(out.rituals[1].time, "08:00");
});

test("a no-op move returns the same schedule reference", () => {
  // React and the sync stamper both bail out on reference equality, so a drag
  // that lands where it started must not look like an edit.
  const before = sched([plain({ time: "08:00" })]);
  assert.equal(setRitualTime("r1", undefined, "08:00")(before), before);
  assert.equal(setRitualTime("missing", undefined, "09:00")(before), before);
});

// ── The "times" routine ─────────────────────────────────────────────────────

test("moving one occurrence leaves the others alone", () => {
  const out = setRitualTime("r1", "s1", "14:00")(sched([times(["08:00", "13:00", "18:00"])]));
  assert.deepEqual(labelsOf(out.rituals[0]), ["08:00", "14:00", "18:00"]);
});

test("occurrences stay sorted after a move past a sibling", () => {
  // Dragging the 6pm occurrence to 7am must not leave the list out of order —
  // RitualStep's contract says these are kept ascending.
  const out = setRitualTime("r1", "s2", "07:00")(sched([times(["08:00", "13:00", "18:00"])]));
  assert.deepEqual(labelsOf(out.rituals[0]), ["07:00", "08:00", "13:00"]);
});

test("ritual.time follows the earliest occurrence", () => {
  // Readers that treat a routine as happening once read ritual.time; leaving it
  // stale would draw the routine in two places at once.
  const out = setRitualTime("r1", "s2", "07:00")(sched([times(["08:00", "13:00", "18:00"])]));
  assert.equal(out.rituals[0].time, "07:00");
});

test("moving a later occurrence does not disturb ritual.time", () => {
  const out = setRitualTime("r1", "s2", "19:00")(sched([times(["08:00", "13:00", "18:00"])]));
  assert.equal(out.rituals[0].time, "08:00");
  assert.deepEqual(labelsOf(out.rituals[0]), ["08:00", "13:00", "19:00"]);
});

test("an unknown step id changes nothing", () => {
  const before = sched([times(["08:00", "13:00"])]);
  assert.equal(setRitualTime("r1", "nope", "09:00")(before), before);
});

test("a stepId on a non-times routine falls back to the routine's own time", () => {
  // Checklist steps are names, not times — writing one would corrupt the list.
  const out = setRitualTime("r1", "s0", "09:30")(
    sched([plain({ trackingType: "checklist", steps: [{ id: "s0", label: "Rinse" }] })]),
  );
  assert.equal(out.rituals[0].time, "09:30");
  assert.deepEqual(out.rituals[0].steps, [{ id: "s0", label: "Rinse" }]);
});

test("a times routine addressed without a step moves as a whole", () => {
  const out = setRitualTime("r1", undefined, "09:00")(sched([times(["08:00", "13:00"])]));
  assert.equal(out.rituals[0].time, "09:00");
  assert.deepEqual(labelsOf(out.rituals[0]), ["08:00", "13:00"]);
});

test("a no-op occurrence move returns the same reference", () => {
  const before = sched([times(["08:00", "13:00"])]);
  assert.equal(setRitualTime("r1", "s0", "08:00")(before), before);
});
