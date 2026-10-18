/**
 * One logical task, one id.
 *
 * Several writers called `uid()` once per weekday, so an AI-generated
 * "Cycling Mon–Sat" became six separate tasks with six ids. These cover the
 * repair: what counts as the same task, which id survives, and — the case that
 * matters most — what must NEVER be merged.
 *
 * The curriculum case is the reason this suite exists before the migration
 * ships. `lib/curriculumParser.ts` emits one task per dated session because
 * `TaskException` carries no `subtasks` field, so a weekly task cannot hold
 * week 1's checklist and week 12's. Those sessions share a title, a time and a
 * weekday bucket. Merging them would delete every week's checklist but one,
 * with nothing to restore from.
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

const { taskSiblingKey, canonicalTaskId, collapseTaskSiblings, remapTaskIds } =
  await import("@/lib/taskSiblings.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");

// ── Factories ────────────────────────────────────────────────────────────────

const task = (over = {}) => ({
  id: "t1",
  title: "Cycling",
  startTime: "07:00 AM",
  endTime: "08:00 AM",
  planId: "p1",
  ...over,
});

function sched(byDay, over = {}) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const [day, tasks] of Object.entries(byDay)) activities[day] = tasks;
  return { activities, milestones: [], notes: [], preferences: {}, ...over };
}

const idsOn = (s, day) => s.activities[day].map((t) => t.id);
const allIds = (s) => new Set(DAYS.flatMap((d) => s.activities[d].map((t) => t.id)));

// ── What counts as the same task ─────────────────────────────────────────────

test("title case and inner whitespace do not make a different task", () => {
  assert.equal(
    taskSiblingKey(task({ title: "Cycling" })),
    taskSiblingKey(task({ title: "  cycling  " })),
  );
  assert.equal(taskSiblingKey(task({ title: "Long  run" })), taskSiblingKey(task({ title: "Long run" })));
});

test("a different time is a different task", () => {
  assert.notEqual(taskSiblingKey(task()), taskSiblingKey(task({ startTime: "08:00 AM" })));
});

test("the key reads every slot, not just the first", () => {
  const two = task({ slots: [{ startTime: "07:00 AM", endTime: "08:00 AM" }, { startTime: "06:00 PM", endTime: "06:30 PM" }] });
  const one = task({ slots: [{ startTime: "07:00 AM", endTime: "08:00 AM" }] });
  assert.notEqual(taskSiblingKey(two), taskSiblingKey(one));
});

test("plan, category and task type separate otherwise-identical tasks", () => {
  assert.notEqual(taskSiblingKey(task()), taskSiblingKey(task({ planId: "p2" })));
  assert.notEqual(taskSiblingKey(task()), taskSiblingKey(task({ categoryId: "c1" })));
  assert.notEqual(taskSiblingKey(task()), taskSiblingKey(task({ taskType: "session" })));
});

// ── The one that must never merge ────────────────────────────────────────────

test("two dated curriculum sessions are never the same task", () => {
  // Same title, same time, same plan, same Thursday bucket — differing only by
  // the date they are pinned to. Each carries its own week's checklist.
  const wk1 = task({ id: "a", recurrence: { type: "once", dateISO: "2026-01-08" }, subtasks: [{ id: "s1", task: "Week 1 reading" }] });
  const wk12 = task({ id: "b", recurrence: { type: "once", dateISO: "2026-03-26" }, subtasks: [{ id: "s2", task: "Week 12 reading" }] });
  assert.notEqual(taskSiblingKey(wk1), taskSiblingKey(wk12));

  const out = collapseTaskSiblings(sched({ thursday: [wk1, wk12] }));
  assert.equal(out.activities.thursday.length, 2, "a curriculum must not be collapsed into one session");
  assert.deepEqual(out.activities.thursday.map((t) => t.subtasks[0].task), ["Week 1 reading", "Week 12 reading"]);
});

test("an every-2-weeks task is not merged into a weekly one, and anchors matter", () => {
  const weekly = task({ id: "a" });
  const biweekly = task({ id: "b", recurrence: { type: "weekly", interval: 2, anchorISO: "2026-01-05" } });
  const otherAnchor = task({ id: "c", recurrence: { type: "weekly", interval: 2, anchorISO: "2026-01-12" } });
  assert.notEqual(taskSiblingKey(weekly), taskSiblingKey(biweekly));
  assert.notEqual(taskSiblingKey(biweekly), taskSiblingKey(otherAnchor));
});

// ── Which id survives ────────────────────────────────────────────────────────

test("the surviving id is the smallest, whatever order the group arrives in", () => {
  // Two devices seeing the same group in different orders must agree, or a
  // sync merge resurrects whichever loser the other one dropped.
  assert.equal(canonicalTaskId(["m", "a", "z"]), "a");
  assert.equal(canonicalTaskId(["z", "m", "a"]), "a");
  assert.equal(canonicalTaskId(["a"]), "a");
});

// ── The reported bug ─────────────────────────────────────────────────────────

test("six AI fragments of one recurring task collapse to one id across six days", () => {
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const before = sched(Object.fromEntries(days.map((d, i) => [d, [task({ id: `id${i}` })]])));

  const after = collapseTaskSiblings(before);

  assert.equal(allIds(after).size, 1, "six fragments should be one task");
  assert.equal([...allIds(after)][0], "id0", "and it should be the oldest id");
  for (const d of days) assert.equal(after.activities[d].length, 1, `${d} keeps exactly one record`);
});

test("collapsing across buckets leaves each day's own history alone", () => {
  // One copy per weekday, each accumulating its own history, is the model
  // working. Only the ids are wrong, so only the ids should change.
  const ev = (id, at) => ({ id, taskId: "x", completedAt: at, completionType: "task" });
  const before = sched({
    monday: [task({ id: "b", completionHistory: [ev("e1", "2026-01-05T09:00:00.000Z")] })],
    tuesday: [task({ id: "a", completionHistory: [ev("e2", "2026-01-06T09:00:00.000Z")] })],
  });

  const after = collapseTaskSiblings(before);

  assert.deepEqual(idsOn(after, "monday"), ["a"]);
  assert.deepEqual(idsOn(after, "tuesday"), ["a"]);
  assert.equal(after.activities.monday[0].completionHistory.length, 1);
  assert.equal(after.activities.tuesday[0].completionHistory.length, 1);
  assert.equal(after.activities.monday[0].completionHistory[0].id, "e1");
});

test("two records of one task in ONE day fold together, unioning history", () => {
  // The aftermath of updateTaskDays appending beside a sibling.
  const ev = (id) => ({ id, taskId: "x", completedAt: "2026-01-05T09:00:00.000Z", completionType: "task" });
  const before = sched({
    monday: [
      task({ id: "a", completionHistory: [ev("e1")], completed: true }),
      task({ id: "b", completionHistory: [ev("e2")] }),
    ],
  });

  const after = collapseTaskSiblings(before);

  assert.equal(after.activities.monday.length, 1, "the duplicate row must be gone");
  const [kept] = after.activities.monday;
  assert.equal(kept.id, "a");
  assert.deepEqual(kept.completionHistory.map((e) => e.id).sort(), ["e1", "e2"]);
  assert.equal(kept.completed, true);
});

// ── Safety properties ────────────────────────────────────────────────────────

test("collapsing is idempotent, and a clean schedule comes back by reference", () => {
  const clean = sched({ monday: [task({ id: "a" })], tuesday: [task({ id: "a" })] });
  assert.equal(collapseTaskSiblings(clean), clean, "no groups to fix means no new object");

  const once = collapseTaskSiblings(sched({ monday: [task({ id: "b" })], tuesday: [task({ id: "a" })] }));
  assert.equal(collapseTaskSiblings(once), once, "a second pass must change nothing");
});

test("every holder of a task id follows the survivor, and links are deduped", () => {
  const before = sched(
    {
      monday: [task({ id: "b", completionHistory: [{ id: "e1", taskId: "b", completedAt: "2026-01-05T09:00:00.000Z", completionType: "task" }] })],
      tuesday: [task({ id: "a" })],
    },
    {
      // A milestone that linked BOTH fragments must end with one link, not two.
      milestones: [{ id: "m1", linkedActivities: ["a", "b"], linkedTrackers: [] }],
      notes: [{ id: "n1", linkedTaskIds: ["b"] }],
      preferences: {
        acknowledgedMisses: ["b|2026-01-05"],
        acknowledgedAttention: ["slot-risk|b|2026-01-05", "ritual|r1|2026-01-05"],
      },
    },
  );

  const after = collapseTaskSiblings(before);

  assert.deepEqual(after.milestones[0].linkedActivities, ["a"], "six links to one task is one link");
  assert.deepEqual(after.notes[0].linkedTaskIds, ["a"]);
  assert.deepEqual(after.preferences.acknowledgedMisses, ["a|2026-01-05"]);
  assert.equal(after.activities.monday[0].completionHistory[0].taskId, "a", "history events re-point too");
  assert.ok(
    after.preferences.acknowledgedAttention.includes("ritual|r1|2026-01-05"),
    "rows keyed by other entities must be left alone",
  );
  assert.ok(after.preferences.acknowledgedAttention.includes("slot-risk|a|2026-01-05"));
});

test("remapTaskIds is a no-op for an empty remap", () => {
  const s = sched({ monday: [task()] });
  assert.equal(remapTaskIds(s, new Map()), s);
});
