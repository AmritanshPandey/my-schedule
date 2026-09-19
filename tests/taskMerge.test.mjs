/**
 * Merged tasks — two independent tasks sharing a time slot (lib/taskMerge.ts),
 * rendered as one calendar block instead of splitting into lanes. Each half
 * keeps its own category/completion/stats; merging only changes layout.
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

const {
  findMergePairs,
  tasksOverlapInTime,
  mergeCandidates,
  findMergePartner,
  mergeTasks,
  unmergeTask,
} = await import("../lib/taskMerge.ts");
const { DAYS } = await import("../lib/scheduleConstants.ts");

const task = (over = {}) => ({
  id: "t1", title: "Task", startTime: "6:00 PM", endTime: "7:00 PM", planId: "p1", ...over,
});

function scheduleWith(activitiesByDay) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, activitiesByDay[d] ?? []]));
  return { activities };
}

// ── findMergePairs ───────────────────────────────────────────────────────────

test("findMergePairs collapses two entries sharing a mergeGroupId", () => {
  const cardio = { task: task({ id: "cardio", mergeGroupId: "g1" }) };
  const workout = { task: task({ id: "workout", mergeGroupId: "g1" }) };
  const pairs = findMergePairs([cardio, workout]);
  assert.equal(pairs.size, 1);
  assert.deepEqual([...pairs.get("g1")], [cardio, workout]);
});

test("findMergePairs leaves an unmerged entry out entirely", () => {
  const solo = { task: task({ id: "solo" }) };
  const pairs = findMergePairs([solo]);
  assert.equal(pairs.size, 0);
});

test("findMergePairs ignores a dangling mergeGroupId whose partner isn't present", () => {
  // e.g. the partner was deleted, or isn't scheduled on this particular day.
  const orphan = { task: task({ id: "orphan", mergeGroupId: "g1" }) };
  const pairs = findMergePairs([orphan]);
  assert.equal(pairs.size, 0);
});

test("findMergePairs ignores a group with more than two members", () => {
  // v1 is strictly pairwise — this shouldn't occur, but must degrade safely
  // rather than guessing which two to combine.
  const a = { task: task({ id: "a", mergeGroupId: "g1" }) };
  const b = { task: task({ id: "b", mergeGroupId: "g1" }) };
  const c = { task: task({ id: "c", mergeGroupId: "g1" }) };
  const pairs = findMergePairs([a, b, c]);
  assert.equal(pairs.size, 0);
});

// ── tasksOverlapInTime ───────────────────────────────────────────────────────

test("tasksOverlapInTime is true for two tasks in the same window", () => {
  const a = task({ startTime: "6:00 PM", endTime: "7:00 PM" });
  const b = task({ startTime: "6:30 PM", endTime: "7:30 PM" });
  assert.equal(tasksOverlapInTime(a, b), true);
});

test("tasksOverlapInTime is false for two tasks that merely touch edges", () => {
  const a = task({ startTime: "6:00 PM", endTime: "7:00 PM" });
  const b = task({ startTime: "7:00 PM", endTime: "8:00 PM" });
  assert.equal(tasksOverlapInTime(a, b), false);
});

test("tasksOverlapInTime is false for two tasks nowhere near each other", () => {
  const a = task({ startTime: "6:00 AM", endTime: "7:00 AM" });
  const b = task({ startTime: "6:00 PM", endTime: "7:00 PM" });
  assert.equal(tasksOverlapInTime(a, b), false);
});

test("tasksOverlapInTime checks every slot of a multi-slot task", () => {
  const a = task({
    startTime: "6:00 AM", endTime: "6:30 AM",
    slots: [{ startTime: "6:00 AM", endTime: "6:30 AM" }, { startTime: "6:00 PM", endTime: "7:00 PM" }],
  });
  const b = task({ id: "b", startTime: "6:15 PM", endTime: "6:45 PM" });
  assert.equal(tasksOverlapInTime(a, b), true);
});

// ── mergeCandidates ──────────────────────────────────────────────────────────

test("mergeCandidates finds an overlapping, unmerged task and excludes itself", () => {
  const cardio = task({ id: "cardio", title: "Cardio", startTime: "6:00 PM", endTime: "7:00 PM" });
  const workout = task({ id: "workout", title: "Workout", startTime: "6:00 PM", endTime: "7:00 PM" });
  const unrelated = task({ id: "unrelated", title: "Lunch", startTime: "12:00 PM", endTime: "1:00 PM" });
  const candidates = mergeCandidates(cardio, [cardio, workout, unrelated]);
  assert.deepEqual(candidates.map((t) => t.id), ["workout"]);
});

test("mergeCandidates excludes a task that's already merged with someone else", () => {
  const cardio = task({ id: "cardio", startTime: "6:00 PM", endTime: "7:00 PM" });
  const takenWorkout = task({ id: "workout", startTime: "6:00 PM", endTime: "7:00 PM", mergeGroupId: "other-group" });
  const candidates = mergeCandidates(cardio, [cardio, takenWorkout]);
  assert.equal(candidates.length, 0);
});

// ── findMergePartner ─────────────────────────────────────────────────────────

test("findMergePartner finds the other task in the pair", () => {
  const cardio = task({ id: "cardio", mergeGroupId: "g1" });
  const workout = task({ id: "workout", mergeGroupId: "g1" });
  const activities = scheduleWith({ monday: [cardio, workout] }).activities;
  const partner = findMergePartner(cardio, activities);
  assert.equal(partner.id, "workout");
});

test("findMergePartner finds the partner even across different weekday buckets", () => {
  const cardio = task({ id: "cardio", mergeGroupId: "g1" });
  const workout = task({ id: "workout", mergeGroupId: "g1" });
  const activities = scheduleWith({ monday: [cardio], wednesday: [workout] }).activities;
  assert.equal(findMergePartner(cardio, activities).id, "workout");
});

test("findMergePartner is null for an unmerged task", () => {
  const solo = task({ id: "solo" });
  const activities = scheduleWith({ monday: [solo] }).activities;
  assert.equal(findMergePartner(solo, activities), null);
});

test("findMergePartner is null for a dangling mergeGroupId (partner deleted)", () => {
  const orphan = task({ id: "orphan", mergeGroupId: "g1" });
  const activities = scheduleWith({ monday: [orphan] }).activities;
  assert.equal(findMergePartner(orphan, activities), null);
});

// ── mergeTasks / unmergeTask ─────────────────────────────────────────────────

test("mergeTasks tags both tasks with the same fresh mergeGroupId", () => {
  const cardio = task({ id: "cardio" });
  const workout = task({ id: "workout" });
  const schedule = scheduleWith({ monday: [cardio, workout] });
  const next = mergeTasks("cardio", "workout")(schedule);
  const [nc, nw] = next.activities.monday;
  assert.ok(nc.mergeGroupId);
  assert.equal(nc.mergeGroupId, nw.mergeGroupId);
});

test("mergeTasks tags every weekday copy of a recurring pair", () => {
  const cardio = task({ id: "cardio" });
  const workout = task({ id: "workout" });
  const schedule = scheduleWith({
    monday: [{ ...cardio }, { ...workout }],
    wednesday: [{ ...cardio }, { ...workout }],
  });
  const next = mergeTasks("cardio", "workout")(schedule);
  const groupIds = new Set([
    ...next.activities.monday.map((t) => t.mergeGroupId),
    ...next.activities.wednesday.map((t) => t.mergeGroupId),
  ]);
  assert.equal(groupIds.size, 1);
  assert.ok([...groupIds][0]);
});

test("unmergeTask clears mergeGroupId on both sides of the pair", () => {
  const cardio = task({ id: "cardio", mergeGroupId: "g1" });
  const workout = task({ id: "workout", mergeGroupId: "g1" });
  const schedule = scheduleWith({ monday: [cardio, workout] });
  const next = unmergeTask("cardio")(schedule);
  assert.equal(next.activities.monday[0].mergeGroupId, undefined);
  assert.equal(next.activities.monday[1].mergeGroupId, undefined);
});

test("unmergeTask is a no-op for a task that isn't merged", () => {
  const solo = task({ id: "solo" });
  const schedule = scheduleWith({ monday: [solo] });
  const next = unmergeTask("solo")(schedule);
  assert.equal(next, schedule);
});
