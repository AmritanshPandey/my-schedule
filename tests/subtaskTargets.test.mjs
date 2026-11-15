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
  parseDurationText, currentTargets, baseTargets, subtaskDetailLabel, subtaskDetailSegments, formatStrengthTargets,
} = await import("../lib/subtaskTargets.ts");
const { entryToSubtaskDraft, subtaskDraftToEntry } = await import("../lib/subtaskDraft.ts");
const { validateSchedule } = await import("../lib/scheduleSchema.ts");

// ── Parsing the free text people already typed ────────────────────────────

test("parses sets × reps in the shapes people type", () => {
  for (const text of ["3 × 10 reps", "3x10", "3 X 10", "3 sets of 10", "3*10 reps"]) {
    assert.deepEqual(parseDurationText(text).targets, { sets: 3, reps: 10 }, text);
    assert.equal(parseDurationText(text).rest, "", text);
  }
});

test("parses weight with its unit, alone or after sets × reps", () => {
  assert.deepEqual(parseDurationText("4 x 8 @ 60kg").targets, { weight: 60, weightUnit: "kg", sets: 4, reps: 8 });
  assert.deepEqual(parseDurationText("135 lbs").targets, { weight: 135, weightUnit: "lb" });
  assert.deepEqual(parseDurationText("22,5 kg").targets, { weight: 22.5, weightUnit: "kg" });
});

test("a lone reps or sets count is still a figure", () => {
  assert.deepEqual(parseDurationText("10 reps").targets, { reps: 10 });
  assert.deepEqual(parseDurationText("3 sets").targets, { sets: 3 });
});

test("a time on its own becomes minutes; unrecognised words are kept", () => {
  assert.equal(parseDurationText("5m").minutes, 5);
  assert.equal(parseDurationText("1h 30m").minutes, 90);
  const parsed = parseDurationText("3 × 10 slow tempo");
  assert.deepEqual(parsed.targets, { sets: 3, reps: 10 });
  assert.equal(parsed.rest, "slow tempo", "words the parser doesn't know are never thrown away");
  assert.deepEqual(parseDurationText("Read chapter 4").targets, {});
  assert.equal(parseDurationText("Read chapter 4").rest, "Read chapter 4");
});

// ── Labels ─────────────────────────────────────────────────────────────────

test("the label reads info, time, then strength figures", () => {
  const entry = { id: "s1", task: "Leg Press", timeMinutes: 5, targets: { sets: 3, reps: 10, weight: 60, weightUnit: "kg" } };
  assert.equal(subtaskDetailLabel(entry), "5m · 3 × 10 · 60 kg");
  assert.deepEqual(subtaskDetailSegments(entry)[0], { text: "5m", isTime: true }, "time keeps its Info Blue flag");
});

test("legacy free text still shows exactly as before", () => {
  assert.equal(subtaskDetailLabel({ id: "s1", task: "Leg Press", timeMinutes: 5, duration: "3 × 10 reps" }), "5m · 3 × 10 reps");
  assert.equal(subtaskDetailLabel({ id: "s1", task: "x" }), null);
});

test("formatStrengthTargets covers partial figures", () => {
  assert.equal(formatStrengthTargets({ reps: 12 }), "12 reps");
  assert.equal(formatStrengthTargets({ sets: 4 }), "4 sets");
  assert.equal(formatStrengthTargets({ weight: 62.5, weightUnit: "kg" }), "62.5 kg");
  assert.equal(formatStrengthTargets({}), "");
});

// ── Accepted steps apply on read ───────────────────────────────────────────

const legPress = { id: "s1", task: "Leg Press", timeMinutes: 5, targets: { sets: 3, reps: 10, weight: 60, weightUnit: "kg" }, targetsSetAt: "2026-10-01T09:00:00.000Z" };
const step = (over) => ({ id: "x", taskId: "t1", subtaskId: "s1", periodStartISO: "2026-10-05", decision: "accepted", to: { weight: 63 }, decidedAt: "2026-10-12T09:00:00.000Z", ...over });

test("the latest accepted step raises the figures it names", () => {
  const steps = [step(), step({ to: { weight: 66 }, decidedAt: "2026-10-19T09:00:00.000Z" })];
  assert.deepEqual(currentTargets(legPress, "t1", steps), { sets: 3, reps: 10, weight: 66, weightUnit: "kg", minutes: 5 });
});

test("held steps, other tasks and other subtasks never apply", () => {
  const steps = [step({ decision: "held" }), step({ taskId: "t2" }), step({ subtaskId: "s2" })];
  assert.deepEqual(currentTargets(legPress, "t1", steps), baseTargets(legPress));
});

test("editing the targets by hand is a new base: earlier steps stop applying", () => {
  const edited = { ...legPress, targets: { ...legPress.targets, weight: 70 }, targetsSetAt: "2026-10-15T09:00:00.000Z" };
  assert.equal(currentTargets(edited, "t1", [step()]).weight, 70, "a step decided before the edit is ignored");
  assert.equal(currentTargets(edited, "t1", [step({ decidedAt: "2026-10-20T09:00:00.000Z", to: { weight: 73.5 } })]).weight, 73.5);
});

// ── Draft round trip ───────────────────────────────────────────────────────

test("a save keeps every field the form doesn't edit", () => {
  const stored = {
    id: "s1", task: "Leg Press", note: "seat 4", meta: [{ label: "m", value: "v" }], time: "6:00", date: "2026-10-01",
    notes: "long notes", timeMinutes: 5, targets: { sets: 3, reps: 10 }, targetsSetAt: "2026-10-01T09:00:00.000Z", futureField: 1,
  };
  const saved = subtaskDraftToEntry(entryToSubtaskDraft(stored), "2026-11-01T00:00:00.000Z");
  assert.deepEqual(saved, stored, "an untouched round trip changes nothing — not even targetsSetAt");
});

test("legacy free text moves into structured figures, leaving only the words", () => {
  const draft = entryToSubtaskDraft({ id: "s1", task: "Leg Press", duration: "3 × 10 reps slow" });
  assert.deepEqual(draft.targets, { sets: 3, reps: 10 });
  assert.equal(draft.duration, "slow");
  const saved = subtaskDraftToEntry(draft, "2026-11-01T00:00:00.000Z");
  assert.equal(saved.duration, "slow");
  assert.equal(subtaskDetailLabel(saved), "3 × 10 · slow");
});

test("changing a figure stamps targetsSetAt; other edits don't", () => {
  const stored = { id: "s1", task: "Leg Press", targets: { sets: 3, reps: 10, weight: 60, weightUnit: "kg" } };
  const renamed = subtaskDraftToEntry({ ...entryToSubtaskDraft(stored), title: "Leg press (sled)" }, "2026-11-01T00:00:00.000Z");
  assert.equal(renamed.targetsSetAt, undefined);
  const draft = entryToSubtaskDraft(stored);
  const heavier = subtaskDraftToEntry({ ...draft, targets: { ...draft.targets, weight: 65 } }, "2026-11-01T00:00:00.000Z");
  assert.equal(heavier.targetsSetAt, "2026-11-01T00:00:00.000Z");
  assert.equal(heavier.targets.weight, 65);
});

test("empty and nonsense figures are dropped, counts are whole numbers", () => {
  const saved = subtaskDraftToEntry({ id: "s1", title: " Rows ", targets: { sets: 0, reps: 9.6, weight: NaN }, restSeconds: 0 }, "2026-11-01T00:00:00.000Z");
  assert.deepEqual(saved.targets, { reps: 10 });
  assert.equal(saved.restSeconds, undefined);
  assert.equal(saved.task, "Rows");
});

// ── Schema ─────────────────────────────────────────────────────────────────

test("the schema accepts the new subtask fields and rejects bad ones", () => {
  const schedule = (entry) => ({
    goals: [], plans: [], categories: [], progressTrackers: [], metricEntries: [], milestones: [], rituals: [],
    ritualCompletions: [], notes: [], events: [], preferences: {},
    activities: { monday: [{ id: "t1", title: "Legs", startTime: "10:00 AM", endTime: "11:00 AM", planId: "", subtasks: [entry] }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  });
  const good = { ...legPress, restSeconds: 90, progression: { percent: 5, cadence: "weekly", figure: "weight", threshold: 80, startISO: "2026-10-01" } };
  assert.equal(validateSchedule(schedule(good)).success, true);
  assert.equal(validateSchedule(schedule({ ...good, progression: { ...good.progression, threshold: 0 } })).success, false);
  assert.equal(validateSchedule(schedule({ ...good, targets: { weightUnit: "stone" } })).success, false);
});
