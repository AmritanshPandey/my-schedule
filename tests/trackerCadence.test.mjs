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
  trackerCadence, periodStartISO, shiftPeriodISO, buildCheckIn, dueCheckIns,
  checkInStatusLabel, nextCheckInLabel, checkInRecordLabel,
} = await import("../lib/trackerCadence.ts");

// 2026-10-14 is a Wednesday.
const TODAY = "2026-10-14";
const tracker = (overrides = {}) => ({ id: "t1", planId: "p1", title: "Weight", type: "number", unit: "kg", ...overrides });
let n = 0;
const entry = (date, value = 80, trackerId = "t1") => ({ id: `e${n++}`, planId: "p1", trackerId, value, date });

// ── Defaults ────────────────────────────────────────────────────────────────

test("an unset cadence is weekly, or daily for a tracker with a daily target", () => {
  assert.equal(trackerCadence(tracker()), "weekly");
  assert.equal(trackerCadence(tracker({ dailyTarget: 2000 })), "daily");
  assert.equal(trackerCadence(tracker({ dailyTarget: 2000, cadence: "monthly" })), "monthly");
});

// ── Period math ─────────────────────────────────────────────────────────────

test("periods start on the day, the Monday, the 1st and Jan 1", () => {
  assert.equal(periodStartISO("daily", TODAY), TODAY);
  assert.equal(periodStartISO("weekly", TODAY), "2026-10-12");
  assert.equal(periodStartISO("weekly", "2026-10-12"), "2026-10-12");
  assert.equal(periodStartISO("weekly", "2026-10-18"), "2026-10-12"); // Sunday closes the week
  assert.equal(periodStartISO("monthly", TODAY), "2026-10-01");
  assert.equal(periodStartISO("yearly", TODAY), "2026-01-01");
});

test("shifting periods crosses month and year boundaries", () => {
  assert.equal(shiftPeriodISO("weekly", TODAY, 1), "2026-10-19");
  assert.equal(shiftPeriodISO("weekly", TODAY, -1), "2026-10-05");
  assert.equal(shiftPeriodISO("monthly", "2026-12-20", 1), "2027-01-01");
  assert.equal(shiftPeriodISO("monthly", "2026-01-20", -1), "2025-12-01");
  assert.equal(shiftPeriodISO("yearly", TODAY, -2), "2024-01-01");
  assert.equal(shiftPeriodISO("daily", "2026-02-28", 1), "2026-03-01");
});

// ── Due / overdue ───────────────────────────────────────────────────────────

test("a weekly tracker logged this week is not due, and says when the next one opens", () => {
  const state = buildCheckIn(tracker(), [entry("2026-10-12")], TODAY);
  assert.equal(state.due, false);
  assert.equal(state.loggedThisPeriod, true);
  assert.equal(state.nextPeriodStart, "2026-10-19");
  assert.equal(checkInStatusLabel(state), "Logged this week");
  assert.equal(nextCheckInLabel(state), "Mon, Oct 19");
});

test("a weekly tracker last logged last week is due, not overdue", () => {
  const state = buildCheckIn(tracker(), [entry("2026-10-08")], TODAY);
  assert.equal(state.due, true);
  assert.equal(state.overdue, false);
  assert.equal(checkInStatusLabel(state), "Due this week");
});

test("a whole missed week after the tracker was in use is overdue", () => {
  const state = buildCheckIn(tracker(), [entry("2026-09-30")], TODAY);
  assert.equal(state.due, true);
  assert.equal(state.overdue, true);
  assert.equal(checkInStatusLabel(state), "Missed last week");
});

test("a never-logged tracker is due but never overdue", () => {
  const state = buildCheckIn(tracker(), [], TODAY);
  assert.equal(state.due, true);
  assert.equal(state.overdue, false);
  assert.equal(state.lastLoggedDate, null);
  assert.equal(checkInRecordLabel(state), null);
  assert.ok(state.history.every((p) => p.logged === null));
});

test("monthly and yearly cadences read their own periods", () => {
  const monthly = buildCheckIn(tracker({ cadence: "monthly" }), [entry("2026-10-01")], TODAY);
  assert.equal(monthly.due, false);
  assert.equal(checkInStatusLabel(monthly), "Logged this month");
  assert.equal(nextCheckInLabel(monthly), "Nov 1");

  const yearly = buildCheckIn(tracker({ cadence: "yearly" }), [entry("2025-06-01")], TODAY);
  assert.equal(yearly.due, true);
  assert.equal(yearly.overdue, false);
  assert.equal(checkInStatusLabel(yearly), "Due this year");
  assert.equal(nextCheckInLabel(yearly), "Jan 1, 2027");
});

test("daily copy talks about today and yesterday", () => {
  const t = tracker({ cadence: "daily" });
  assert.equal(checkInStatusLabel(buildCheckIn(t, [entry(TODAY)], TODAY)), "Logged today");
  assert.equal(checkInStatusLabel(buildCheckIn(t, [entry("2026-10-13")], TODAY)), "Due today");
  assert.equal(checkInStatusLabel(buildCheckIn(t, [entry("2026-10-10")], TODAY)), "Missed yesterday");
});

test("entries before tracking start, in the future, or on other trackers are ignored", () => {
  const entries = [entry("2026-10-13", 80, "other"), entry("2026-10-20"), entry("2026-10-12")];
  assert.equal(buildCheckIn(tracker(), entries, TODAY).loggedThisPeriod, true);
  assert.equal(buildCheckIn(tracker(), entries, TODAY, "2026-10-13").loggedThisPeriod, false);
  assert.equal(buildCheckIn(tracker(), [entry("2026-10-13", 80, "other")], TODAY).due, true);
});

// ── Record ──────────────────────────────────────────────────────────────────

test("the streak counts consecutive logged periods; an open current period doesn't break it", () => {
  const entries = [entry("2026-09-21"), entry("2026-09-28"), entry("2026-10-05")];
  const open = buildCheckIn(tracker(), entries, TODAY);
  assert.equal(open.streak, 3);
  const logged = buildCheckIn(tracker(), [...entries, entry(TODAY)], TODAY);
  assert.equal(logged.streak, 4);
  const gap = buildCheckIn(tracker(), [entry("2026-09-21"), entry("2026-10-05")], TODAY);
  assert.equal(gap.streak, 1);
});

test("several entries in one period count once", () => {
  const state = buildCheckIn(tracker(), [entry("2026-10-12"), entry("2026-10-13"), entry(TODAY)], TODAY);
  assert.equal(state.entriesThisPeriod, 3);
  assert.equal(state.streak, 1);
});

test("history is judged from the first period the tracker was used in", () => {
  // First used three weeks ago, missed two weeks ago, logged last week; this week open.
  const state = buildCheckIn(tracker(), [entry("2026-09-22"), entry("2026-10-06")], TODAY);
  assert.equal(state.history.length, 8);
  assert.deepEqual(state.history.map((p) => p.logged), [null, null, null, null, true, false, true, false]);
  assert.equal(state.history.at(-1).start, "2026-10-12");
  assert.equal(state.countedInHistory, 3);
  assert.equal(state.loggedInHistory, 2);
  assert.equal(checkInRecordLabel(state), "2 of last 3 weeks");
});

// ── The due list ────────────────────────────────────────────────────────────

test("dueCheckIns lists only waiting trackers, overdue first", () => {
  const trackers = [
    tracker({ id: "a", title: "Waist" }),
    tracker({ id: "b", title: "Weight" }),
    tracker({ id: "c", title: "Steps" }),
    tracker({ id: "d", title: "Savings", cadence: "monthly" }),
  ];
  const entries = [
    entry("2026-10-08", 80, "a"), // due
    entry("2026-09-20", 80, "b"), // overdue
    entry("2026-10-13", 80, "c"), // logged this week
    entry("2026-10-02", 80, "d"), // logged this month
  ];
  const due = dueCheckIns(trackers, entries, TODAY);
  assert.deepEqual(due.map((d) => d.tracker.id), ["b", "a"]);
  assert.equal(due[0].state.overdue, true);
});
