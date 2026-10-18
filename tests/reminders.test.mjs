/**
 * Coverage for lib/reminders.ts's scheduling decisions.
 *
 * These pin the three failures that presented to the user as "reminders
 * sometimes just don't arrive":
 *
 *  1. only today's reminders were ever collected, so an app left open past
 *     midnight fired nothing the next day;
 *  2. anything whose moment had passed was dropped silently, so a throttled
 *     tab woke up and lost the reminder entirely;
 *  3. a single long timeout was the only thing standing between the user and
 *     silence, in an environment that throttles and freezes timers.
 *
 * The fix is a wall-clock ticker plus a bounded catch-up window, so the tests
 * are about `collectReminders`/`dueNow` under a moving `now` — the part that
 * decides, rather than the interval that asks.
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

// lib/reminders.ts reads localStorage and Notification at module scope through
// helpers; a minimal DOM shim is enough to exercise the pure decisions.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = { dispatchEvent: () => {}, Notification: {} };
globalThis.Notification = { permission: "granted" };

const { collectReminders, dueNow, CATCH_UP_GRACE_MS, TICK_MS } =
  await import("@/lib/reminders.ts");

function enableReminders(patch = {}) {
  store.set(
    "planr-reminders",
    JSON.stringify({ enabled: true, tasks: true, rituals: true, streakNudge: false, nudgeTime: "19:00", ...patch }),
  );
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function task(overrides = {}) {
  return { id: "t1", title: "Long run", startTime: "7:00 AM", endTime: "8:00 AM", planId: "p1", completionHistory: [], ...overrides };
}

function schedule(overrides = {}) {
  return {
    goals: [],
    goalConnections: [],
    plans: [{ id: "p1", title: "Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [] }],
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

/** A daily 7am task, present in every weekday bucket. */
function dailySevenAm() {
  const activities = emptyActivities();
  for (const d of ALL_DAYS) activities[d].push(task());
  return schedule({ activities });
}

const at = (iso, clock) => new Date(`${iso}T${clock}`);

// ── Settings gate ────────────────────────────────────────────────────────────

test("nothing is collected while reminders are off", () => {
  store.set("planr-reminders", JSON.stringify({ enabled: false }));
  assert.deepEqual(collectReminders(dailySevenAm(), at("2026-09-21", "06:00:00")), []);
});

// ── 1. The day-rollover failure ──────────────────────────────────────────────

test("a new day's reminders are collected without anything re-arming", () => {
  enableReminders();
  const s = dailySevenAm();

  // Monday, after the reminder has gone by: nothing left today.
  assert.equal(collectReminders(s, at("2026-09-21", "09:00:00")).length, 0);

  // Tuesday morning, same schedule object, nothing re-armed in between.
  // The old chain had no timer pending at this point and fired nothing.
  const tuesday = collectReminders(s, at("2026-09-22", "06:00:00"));
  assert.equal(tuesday.length, 1);
  assert.match(tuesday[0].tag, /2026-09-22/, "tags are keyed to the day they fire");
});

test("tags are per-day, so a fired Monday tag can never suppress Tuesday", () => {
  enableReminders();
  const s = dailySevenAm();
  const mon = collectReminders(s, at("2026-09-21", "06:00:00"))[0];
  const tue = collectReminders(s, at("2026-09-22", "06:00:00"))[0];
  assert.notEqual(mon.tag, tue.tag);
});

// ── 2. The silently-dropped-late failure ─────────────────────────────────────

test("a reminder just missed is still returned inside the grace window", () => {
  enableReminders();
  const s = dailySevenAm();
  // 90 seconds late — the common case when a tick was throttled.
  const late = dueNow(s, at("2026-09-21", "07:01:30"));
  assert.equal(late.length, 1);
  assert.equal(late[0].title, "Long run");
});

test("a reminder long past stays silent — 'Starts now' hours late is worse than nothing", () => {
  enableReminders();
  const s = dailySevenAm();
  const stale = new Date(at("2026-09-21", "07:00:00").getTime() + CATCH_UP_GRACE_MS + 60_000);
  assert.deepEqual(dueNow(s, stale), []);
});

test("the grace window is bounded and shorter than a tick is long", () => {
  assert.ok(CATCH_UP_GRACE_MS > TICK_MS, "a single throttled tick must fit inside the window");
  assert.ok(CATCH_UP_GRACE_MS <= 15 * 60_000, "far enough past and the copy stops being true");
});

test("grace defaults to zero, so a plain collect still means 'strictly upcoming'", () => {
  enableReminders();
  const s = dailySevenAm();
  assert.equal(collectReminders(s, at("2026-09-21", "07:01:00")).length, 0);
  assert.equal(collectReminders(s, at("2026-09-21", "07:01:00"), CATCH_UP_GRACE_MS).length, 1);
});

// ── dueNow's own boundary ────────────────────────────────────────────────────

test("dueNow returns only what has actually come due, not everything upcoming", () => {
  enableReminders();
  const s = dailySevenAm();
  // An hour before: collected as upcoming, but not due.
  assert.equal(collectReminders(s, at("2026-09-21", "06:00:00"), CATCH_UP_GRACE_MS).length, 1);
  assert.deepEqual(dueNow(s, at("2026-09-21", "06:00:00")), []);
  // On the minute: due.
  assert.equal(dueNow(s, at("2026-09-21", "07:00:00")).length, 1);
});

// ── Resolution still cancels ─────────────────────────────────────────────────

test("a completed task stops reminding", () => {
  enableReminders();
  const activities = emptyActivities();
  for (const d of ALL_DAYS) activities[d].push(task({ completed: true }));
  assert.deepEqual(dueNow(schedule({ activities }), at("2026-09-21", "07:00:00")), []);
});

test("a missed task stops reminding too", () => {
  enableReminders();
  const activities = emptyActivities();
  for (const d of ALL_DAYS) activities[d].push(task({ missed: true }));
  assert.deepEqual(dueNow(schedule({ activities }), at("2026-09-21", "07:00:00")), []);
});

test("task reminders can be switched off independently", () => {
  enableReminders({ tasks: false });
  assert.deepEqual(dueNow(dailySevenAm(), at("2026-09-21", "07:00:00")), []);
});

// ── Ordering ─────────────────────────────────────────────────────────────────

test("reminders come back in time order", () => {
  enableReminders();
  const activities = emptyActivities();
  for (const d of ALL_DAYS) {
    activities[d].push(task({ id: "late", title: "Evening", startTime: "8:00 PM", endTime: "9:00 PM" }));
    activities[d].push(task({ id: "early", title: "Morning", startTime: "7:00 AM", endTime: "8:00 AM" }));
  }
  const out = collectReminders(schedule({ activities }), at("2026-09-21", "05:00:00"));
  assert.deepEqual(out.map((r) => r.title), ["Morning", "Evening"]);
});

// ── Arm → tick → show, end to end ────────────────────────────────────────────
//
// The decision tests above cover WHICH reminders are due. This covers the part
// that actually reaches the user: arming runs an immediate catch-up pass, so a
// tab returning from the background does not sit silent for a whole tick, and
// what it hands the platform is an alert rather than a toast.

/** Captures registration.showNotification calls. */
function installNotificationCapture() {
  const shown = [];
  const reg = {
    showNotification: async (title, options) => { shown.push({ title, options }); },
  };
  Object.defineProperty(globalThis, "navigator", {
    value: { serviceWorker: { getRegistration: async () => reg } },
    configurable: true,
    writable: true,
  });
  return shown;
}

/**
 * A task scheduled for right now, so arming's catch-up pass finds it due.
 *
 * Each caller passes its own id: the module remembers fired tags so a reminder
 * never repeats, which is correct in production and would otherwise make every
 * test after the first see nothing.
 */
function taskDueNow(id) {
  const now = new Date();
  const h24 = now.getHours();
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const clock = `${hour12}:${String(now.getMinutes()).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
  const activities = emptyActivities();
  for (const d of ALL_DAYS) activities[d].push(task({ id, startTime: clock, endTime: clock }));
  return schedule({ activities });
}

test("arming fires what is already due immediately, not a tick later", async () => {
  enableReminders();
  const shown = installNotificationCapture();
  const { armReminders } = await import("@/lib/reminders.ts");

  const cancel = armReminders(taskDueNow("arm-immediate"));
  await new Promise((r) => setTimeout(r, 50)); // show() is async
  cancel();

  assert.equal(shown.length, 1, "a reminder due at arm time must not wait for the next tick");
  assert.equal(shown[0].title, "Long run");
});

test("what reaches the platform is an alert, not a toast", async () => {
  enableReminders();
  const shown = installNotificationCapture();
  const { armReminders } = await import("@/lib/reminders.ts");

  const cancel = armReminders(taskDueNow("alert-options"));
  await new Promise((r) => setTimeout(r, 50));
  cancel();

  const { options } = shown[0];
  // Without this a desktop notification auto-dismisses in a few seconds, and a
  // reminder missed while looking elsewhere is indistinguishable from one that
  // never fired — the complaint this whole change exists to fix.
  assert.equal(options.requireInteraction, true);
  // Re-alerts rather than silently replacing an existing notification on the tag.
  assert.equal(options.renotify, true);
  assert.ok(Array.isArray(options.vibrate), "mobile gets a haptic too");
  assert.equal(options.data.url, "/", "clicking focuses the app");
  assert.match(options.tag, /^planr-task-/, "tag is shared with the push path so the two collapse");
});

test("cancelling stops the ticker", async () => {
  enableReminders();
  const shown = installNotificationCapture();
  const { armReminders } = await import("@/lib/reminders.ts");

  const cancel = armReminders(taskDueNow("cancel-stops"));
  await new Promise((r) => setTimeout(r, 50));
  const afterArm = shown.length;
  cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(shown.length, afterArm, "no further notifications after cancel");
});

test("nothing fires without permission", async () => {
  enableReminders();
  const shown = installNotificationCapture();
  const previous = globalThis.Notification.permission;
  globalThis.Notification = { permission: "denied" };
  const { armReminders } = await import("@/lib/reminders.ts");

  const cancel = armReminders(taskDueNow("no-permission"));
  await new Promise((r) => setTimeout(r, 50));
  cancel();
  globalThis.Notification = { permission: previous };

  assert.equal(shown.length, 0);
});

test("the same reminder never fires twice", async () => {
  enableReminders();
  const shown = installNotificationCapture();
  const { armReminders } = await import("@/lib/reminders.ts");

  const sched = taskDueNow("dedupe");
  const first = armReminders(sched);
  await new Promise((r) => setTimeout(r, 50));
  first();
  assert.equal(shown.length, 1);

  // Re-arming — as every schedule change and visibility flip does — must not
  // replay what the user has already been shown.
  const second = armReminders(sched);
  await new Promise((r) => setTimeout(r, 50));
  second();
  assert.equal(shown.length, 1, "a re-arm must not repeat an already-shown reminder");
});
