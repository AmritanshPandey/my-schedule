/**
 * Retiring "times".
 *
 * The point of these is not that the conversion happens — that part is three
 * lines. It is that a routine someone has been logging for months comes
 * through it with its history and its streak intact. A migration that quietly
 * resets a 200-day streak is worse than the clock times it removes.
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

const { retireTimesRituals } = await import("@/lib/ritualMigrations.ts");
const { ritualDayProgress } = await import("@/lib/consistency/ritualDayStatus.ts");

// "Drink Water" as it actually exists: ten clock times, anyTime forced off.
const water = (over = {}) => ({
  id: "r1",
  title: "Drink Water",
  time: "05:15",
  trackingType: "times",
  anyTime: false,
  steps: ["05:15", "06:45", "09:00", "09:45", "12:30", "14:30", "16:30", "18:30", "21:00", "21:30"].map(
    (label, i) => ({ id: `s${i}`, label }),
  ),
  ...over,
});

const logged = (stepId) => ({ id: `c-${stepId}`, ritualId: "r1", date: "2026-10-18", stepId });

// ── The conversion ───────────────────────────────────────────────────────────

test("a times routine becomes a plain daily tick", () => {
  const [out] = retireTimesRituals([water()]);
  assert.equal(out.trackingType, "checkbox");
  assert.equal(out.anyTime, true, "times was the only type that forced anyTime off");
  assert.equal(out.steps, undefined, "ten bare clock times are exactly the noise being removed");
  assert.equal(out.title, "Drink Water");
});

test("time is kept, because the field is required — anyTime is what silences it", () => {
  const [out] = retireTimesRituals([water()]);
  assert.equal(out.time, "05:15");
});

// ── The part that matters: history survives ──────────────────────────────────

test("a day logged against a step still counts as done after the conversion", () => {
  // This is the whole risk. The rows were written with stepIds; the steps are
  // gone. Checkbox completes on entries.length > 0, so the day still reads done.
  const before = water();
  const entries = [logged("s0"), logged("s3")];
  const [after] = retireTimesRituals([before]);
  assert.equal(
    ritualDayProgress(after, entries).complete,
    true,
    "after the conversion a day with any logged tick is a done day",
  );
});

test("a fully-logged day stays complete, so an existing streak is not broken", () => {
  const before = water();
  const all = before.steps.map((s) => logged(s.id));
  const [after] = retireTimesRituals([before]);
  assert.equal(ritualDayProgress(after, all).complete, true);
});

test("a day with nothing logged stays incomplete", () => {
  const [after] = retireTimesRituals([water()]);
  assert.equal(ritualDayProgress(after, []).complete, false, "the migration must not invent completions");
});

test("a pre-trackingType sentinel row still counts", () => {
  // The backward-compat guarantee ritualDayStatus documents: a row with
  // neither value nor stepId is "day marked done" whatever the type is now.
  const [after] = retireTimesRituals([water()]);
  const sentinel = [{ id: "c1", ritualId: "r1", date: "2026-10-18" }];
  assert.equal(ritualDayProgress(after, sentinel).complete, true);
});

// ── Safety ───────────────────────────────────────────────────────────────────

test("every other tracking type is left exactly as it was", () => {
  const others = [
    { id: "a", title: "Skincare", time: "21:45", trackingType: "checklist", steps: [{ id: "s1", label: "Cleanser" }] },
    { id: "b", title: "Water", time: "09:00", trackingType: "count", target: 8 },
    { id: "c", title: "Read", time: "22:00", trackingType: "duration", target: 30 },
    { id: "d", title: "Stretch", time: "07:00" },
  ];
  const out = retireTimesRituals(others);
  assert.equal(out, others, "nothing to convert means the same array back");
  assert.equal(out[0].steps.length, 1, "a checklist keeps its named steps");
});

test("converting is idempotent and returns the same array on a second pass", () => {
  const once = retireTimesRituals([water()]);
  assert.equal(retireTimesRituals(once), once);
});

test("only the times routines in a mixed list are touched", () => {
  const list = [
    { id: "keep", title: "Skincare", time: "21:45", trackingType: "checklist", steps: [{ id: "s1", label: "Cleanser" }] },
    water({ id: "convert" }),
  ];
  const out = retireTimesRituals(list);
  assert.equal(out[0], list[0], "an untouched routine keeps its identity");
  assert.equal(out[1].trackingType, "checkbox");
});
