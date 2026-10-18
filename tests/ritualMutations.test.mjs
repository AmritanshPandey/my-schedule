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

// ── The ordinary routine ────────────────────────────────────────────────────

test("moving a plain routine changes its time", () => {
  const out = setRitualTime("r1", "09:30")(sched([plain()]));
  assert.equal(out.rituals[0].time, "09:30");
});

test("a time is normalised to the stored 24-hour form", () => {
  // Callers hand this whatever the timeline produced; the model stores "HH:MM".
  assert.equal(setRitualTime("r1", "9:05 PM")(sched([plain()])).rituals[0].time, "21:05");
  assert.equal(setRitualTime("r1", "7:05")(sched([plain()])).rituals[0].time, "07:05");
  assert.equal(setRitualTime("r1", "12:00 AM")(sched([plain()])).rituals[0].time, "00:00");
});

test("an unparseable time is ignored rather than stored", () => {
  const before = sched([plain()]);
  assert.equal(setRitualTime("r1", "not a time")(before), before);
});

test("only the addressed routine moves", () => {
  const out = setRitualTime("r1", "10:00")(
    sched([plain(), plain({ id: "r2", time: "08:00" })]),
  );
  assert.equal(out.rituals[0].time, "10:00");
  assert.equal(out.rituals[1].time, "08:00");
});

test("a no-op move returns the same schedule reference", () => {
  // React and the sync stamper both bail out on reference equality, so a drag
  // that lands where it started must not look like an edit.
  const before = sched([plain({ time: "08:00" })]);
  assert.equal(setRitualTime("r1", "08:00")(before), before);
  assert.equal(setRitualTime("missing", "09:00")(before), before);
});

// ── Duplicating (Alt held with the drag modifier) ───────────────────────────

const { duplicateRitualAt } = await import("../lib/ritualMutations.ts");
let idN = 0;
const nextId = () => `new${++idN}`;

test("duplicating a plain routine adds a second one at the new time", () => {
  idN = 0;
  const out = duplicateRitualAt("r1", "17:00", nextId)(sched([plain()]));
  assert.equal(out.rituals.length, 2);
  assert.equal(out.rituals[0].time, "08:00", "the original must not move");
  assert.deepEqual(
    { id: out.rituals[1].id, title: out.rituals[1].title, time: out.rituals[1].time },
    { id: "new1", title: "Stretch", time: "17:00" },
  );
});



test("duplicating respects the routine ceiling", () => {
  idN = 0;
  const before = sched([plain(), plain({ id: "r2" })]);
  assert.equal(duplicateRitualAt("r1", "17:00", nextId, 2)(before), before);
});

test("duplicating an unknown routine, or to an invalid time, changes nothing", () => {
  idN = 0;
  const before = sched([plain()]);
  assert.equal(duplicateRitualAt("missing", "17:00", nextId)(before), before);
  assert.equal(duplicateRitualAt("r1", "nope", nextId)(before), before);
});
