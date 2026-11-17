/**
 * Coverage for core/lib/widgetSnapshot.ts — what the iOS widget draws. It must
 * agree with the Overview's Next up, carry tomorrow for the midnight turn, and
 * stay plain JSON for Swift to decode.
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
        return resolveWithTsFallback(url, context, nextResolve);
      }
      throw error;
    }
  },
});

const { selectWidgetSnapshot, selectWidgetDay, WIDGET_MAX_ITEMS } = await import("../packages/core/lib/widgetSnapshot.ts");
const { selectNextUp } = await import("@/lib/overview.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
// A Saturday; the next day is Sunday 2026-09-20.
const SATURDAY = "2026-09-19";
const SUNDAY = "2026-09-20";

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function task(id, overrides = {}) {
  return { id, title: id, startTime: "7:00 AM", endTime: "8:00 AM", planId: "p1", ...overrides };
}

function schedule(overrides = {}) {
  return {
    goals: [],
    goalConnections: [],
    plans: [{ id: "p1", title: "Get lean", category: "fitness", emoji: "🏃", color: "emerald", items: [] }],
    categories: [],
    activities: emptyActivities(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
    ...overrides,
  };
}

// ── Days ─────────────────────────────────────────────────────────────────────

test("an empty day says so, with nothing to list", () => {
  assert.deepEqual(selectWidgetDay(schedule(), SATURDAY), { dateISO: SATURDAY, state: "empty", done: 0, total: 0, items: [] });
});

test("a finished day is day-done, counting a missed task as resolved", () => {
  const activities = emptyActivities();
  activities.saturday = [task("a", { completed: true }), task("b", { startTime: "9:00 AM", endTime: "10:00 AM", missed: true })];
  const day = selectWidgetDay(schedule({ activities }), SATURDAY);
  assert.equal(day.state, "day-done");
  assert.equal(day.done, 1);
  assert.equal(day.total, 2);
  assert.deepEqual(day.items, []);
});

test("the first item is the Overview's Next up, and the counts are its counts", () => {
  const activities = emptyActivities();
  activities.saturday = [
    task("late", { startTime: "6:00 PM", endTime: "7:00 PM" }),
    task("done", { completed: true }),
    task("missed", { startTime: "9:00 AM", endTime: "10:00 AM", missed: true }),
    task("noon", { startTime: "12:00 PM", endTime: "12:30 PM" }),
  ];
  const s = schedule({ activities });
  const day = selectWidgetDay(s, SATURDAY);
  const next = selectNextUp(s, SATURDAY, "saturday");
  assert.equal(day.state, "task");
  assert.equal(day.items[0].id, next.task.id);
  assert.equal(day.done, next.done);
  assert.equal(day.total, next.total);
  assert.deepEqual(day.items.map((i) => i.id), ["noon", "late"]);
  assert.deepEqual(
    { start: day.items[0].startMinutes, end: day.items[0].endMinutes, plan: day.items[0].planTitle, date: day.items[0].dateISO },
    { start: 720, end: 750, plan: "Get lean", date: SATURDAY },
  );
});

test("a multi-slot task shows its first open slot", () => {
  const activities = emptyActivities();
  activities.saturday = [
    task("split", {
      startTime: "7:00 AM",
      endTime: "8:00 AM",
      slots: [
        { startTime: "7:00 AM", endTime: "8:00 AM" },
        { startTime: "6:00 PM", endTime: "6:30 PM" },
      ],
      completedSlotIndices: [0],
    }),
  ];
  const [item] = selectWidgetDay(schedule({ activities }), SATURDAY).items;
  assert.equal(item.startMinutes, 18 * 60);
  assert.equal(item.endMinutes, 18 * 60 + 30);
});

test("the list stops at what a medium widget can show", () => {
  const activities = emptyActivities();
  activities.saturday = Array.from({ length: 7 }, (_, i) => task(`t${i}`, { startTime: `${i + 1}:00 PM`, endTime: `${i + 1}:30 PM` }));
  const day = selectWidgetDay(schedule({ activities }), SATURDAY);
  assert.equal(day.items.length, WIDGET_MAX_ITEMS);
  assert.equal(day.total, 7);
});

test("a task's category colour comes along for the accent", () => {
  const activities = emptyActivities();
  activities.saturday = [task("a", { categoryId: "c1" })];
  const s = schedule({ activities, categories: [{ id: "c1", title: "Cardio", icon: "run", color: "orange" }] });
  assert.equal(selectWidgetDay(s, SATURDAY).items[0].accent, "orange");
});

// ── Snapshot ─────────────────────────────────────────────────────────────────

test("the snapshot carries today and tomorrow, so the widget turns the day itself", () => {
  const activities = emptyActivities();
  activities.saturday = [task("sat")];
  activities.sunday = [task("sun", { startTime: "8:00 AM", endTime: "9:00 AM" })];
  const now = new Date("2026-09-19T21:00:00");
  const snap = selectWidgetSnapshot(schedule({ activities }), SATURDAY, now);
  assert.equal(snap.version, 1);
  assert.equal(snap.generatedAt, now.toISOString());
  assert.deepEqual(snap.days.map((d) => d.dateISO), [SATURDAY, SUNDAY]);
  assert.equal(snap.days[1].items[0].id, "sun");
  assert.equal(snap.days[1].items[0].dateISO, SUNDAY);
  assert.equal(typeof snap.streak, "number");
  // Plain JSON: the widget decodes it with Codable.
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});
