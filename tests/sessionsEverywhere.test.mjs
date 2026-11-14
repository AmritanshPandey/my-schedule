/**
 * The per-entity merge that lets two devices edit the same account without
 * either losing work.
 *
 * The properties matter more than the cases here: a merge is wrong in classes,
 * not instances. Anything that survives "no entity disappears unless a newer
 * tombstone covers it" and "both devices compute the same result" is very hard
 * to make lose data by accident.
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
const { migrate } = await import("@/lib/scheduleMigrate.ts");
const { selectNextUp, selectWeekStatus } = await import("@/lib/overview.ts");
const { buildDaySpread } = await import("@/lib/daySpread.ts");
const { buildActiveDates } = await import("@/lib/consistency/calculateExecutionStreak.ts");
const { collectRemindersFor, DEFAULT_REMINDER_SETTINGS } = await import("@/packages/core/lib/reminders.ts");

const NOW = "2026-11-18T08:00:00.000Z";
const TODAY = "2026-11-18"; // Wednesday
const plan = { id: "p1", title: "Run a 5K", emoji: "run", category: "fitness", color: "amber", items: [] };

function session(id, over = {}) {
  return {
    id, planId: "p1", routineKey: "easy", title: "Easy run", dateISO: TODAY, startTime: "18:00", estimatedMinutes: 35,
    tasks: [{ id: `${id}-t`, kind: "distance", title: "Easy", plan: { distanceM: 3000 } }],
    status: "planned", createdAt: NOW, updatedAt: NOW, ...over,
  };
}

function schedule(over = {}) {
  const s = migrate({});
  return { ...s, plans: [...s.plans, plan], ...over };
}

function withTask(s, startTime) {
  const task = { id: "t1", title: "Write report", startTime, endTime: "10:00 AM", planId: "p1" };
  return { ...s, activities: { ...s.activities, wednesday: [task] } };
}

test("next up picks an earlier session over a later task", () => {
  const s = withTask(schedule({ sessions: [session("s1", { startTime: "07:00" })] }), "09:00 AM");
  const next = selectNextUp(s, TODAY, "wednesday");
  assert.equal(next.kind, "session");
  assert.equal(next.session.id, "s1");
  assert.equal(next.timeLabel, "7:00 AM");
  assert.equal(next.total, 2);
  assert.equal(next.openCount, 2);
});

test("next up keeps an earlier task ahead of a later session", () => {
  const s = withTask(schedule({ sessions: [session("s1")] }), "09:00 AM");
  assert.equal(selectNextUp(s, TODAY, "wednesday").kind, "task");
});

test("a day with only a session is not empty, and a done session finishes the day", () => {
  assert.equal(selectNextUp(schedule({ sessions: [session("s1")] }), TODAY, "wednesday").kind, "session");
  const done = selectNextUp(schedule({ sessions: [session("s1", { status: "done" })] }), TODAY, "wednesday");
  assert.equal(done.kind, "day-done");
  assert.equal(done.done, 1);
});

test("week status counts done and missed sessions", () => {
  const s = schedule({
    sessions: [
      session("mon", { dateISO: "2026-11-16", status: "done" }),
      session("tue", { dateISO: "2026-11-17" }),
      session("skip", { dateISO: "2026-11-17", status: "skipped" }),
    ],
  });
  const week = selectWeekStatus(s, TODAY);
  assert.equal(week.days[0].done, 1);
  assert.equal(week.days[0].total, 1);
  assert.equal(week.days[1].missed, 1);
  assert.equal(week.days[1].total, 1);
  assert.equal(week.tasksDone, 1);
});

test("your day includes a timed session as a block for its plan", () => {
  const spread = buildDaySpread(schedule({ sessions: [session("s1")] }), "wednesday", TODAY);
  const group = spread.groups.find((g) => g.id === "plan:p1");
  assert.equal(group.minutes, 35);
  assert.ok(spread.blocks.some((b) => b.groupId === "plan:p1"));
});

test("a done session keeps the streak alive that day", () => {
  assert.ok(buildActiveDates(schedule({ sessions: [session("s1", { status: "done" })] })).has(TODAY));
  assert.ok(!buildActiveDates(schedule({ sessions: [session("s1")] })).has(TODAY));
});

test("a timed session gets a reminder", () => {
  const now = new Date(`${TODAY}T10:00:00`);
  const settings = { ...DEFAULT_REMINDER_SETTINGS, enabled: true, streakNudge: false };
  const out = collectRemindersFor(schedule({ sessions: [session("s1"), session("s2", { status: "done" })] }), settings, now);
  assert.equal(out.length, 1);
  assert.equal(out[0].tag, `planr-session-s1-${TODAY}`);
  assert.equal(out[0].title, "Easy run");
  assert.equal(out[0].body, "Starts now · 6:00 PM · 3 km easy");
  assert.equal(collectRemindersFor(schedule({ sessions: [session("s1")] }), { ...settings, tasks: false }, now).length, 0);
});
