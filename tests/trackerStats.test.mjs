import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Same shim as tests/availableSlots.test.mjs / tests/goal.test.mjs.
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
  buildTrackerStat,
  groupTrackerStatsByPlan,
  trackerRampTone,
  visibleEntries,
  TRACKER_SERIES_LENGTH,
} = await import("../lib/trackerStats.ts");

const TODAY = "2026-09-01";

const tracker = (over = {}) => ({
  id: "t1",
  planId: "p1",
  title: "Water",
  type: "number",
  unit: "ml",
  ...over,
});

let seq = 0;
const entry = (date, value, trackerId = "t1") => ({
  id: `e${seq++}`,
  planId: "p1",
  trackerId,
  value,
  date,
});

// ── Cumulative daily metrics ────────────────────────────────────────────────

test("several logs on one day sum into a single daily total", () => {
  const t = tracker({ dailyTarget: 2000 });
  const stat = buildTrackerStat(t, [entry(TODAY, 500), entry(TODAY, 500), entry(TODAY, 250)], TODAY);

  assert.equal(stat.isDaily, true);
  assert.equal(stat.todayTotal, 1250, "three logs, one total — this is the whole point of increments");
  assert.equal(stat.todayCount, 3);
  assert.equal(stat.percent, 62.5);
  assert.equal(stat.targetValue, 2000);
  assert.equal(stat.metToday, false);
  assert.equal(stat.series.length, 1, "one day logged is one point, however many entries");
});

test("percent clamps at 100 and the target is treated as met", () => {
  const t = tracker({ dailyTarget: 1000 });
  const stat = buildTrackerStat(t, [entry(TODAY, 900), entry(TODAY, 600)], TODAY);

  assert.equal(stat.todayTotal, 1500);
  assert.equal(stat.percent, 100, "the ring can never overfill");
  assert.equal(stat.metToday, true);
});

test("a day-over-day trend compares totals, not individual entries", () => {
  const t = tracker({ dailyTarget: 2000, goalDirection: "increase_good" });
  // Two logs yesterday totalling 1000, one today of 1500.
  const stat = buildTrackerStat(
    t,
    [entry("2026-08-31", 400), entry("2026-08-31", 600), entry(TODAY, 1500)],
    TODAY,
  );

  assert.equal(stat.trend.direction, "up");
  assert.equal(stat.trend.state, "positive");
  assert.equal(stat.trend.delta, 500, "1500 today vs 1000 yesterday — not 1500 vs 600");
});

// ── Point-in-time metrics ───────────────────────────────────────────────────

test("a tracker with no dailyTarget reports point-in-time shape, not a ring", () => {
  const t = tracker({ id: "w", title: "Weight", unit: "kg" });
  const stat = buildTrackerStat(t, [entry("2026-08-30", 80, "w"), entry(TODAY, 78, "w")], TODAY);

  assert.equal(stat.isDaily, false);
  assert.equal(stat.percent, null, "no target of either kind means no progress claim");
  assert.equal(stat.targetValue, null);
  assert.equal(stat.latestValue, 78);
  assert.equal(stat.latestDate, TODAY);
  assert.equal(stat.metToday, false);
});

test("a zero dailyTarget is not a daily metric", () => {
  // Guards the `> 0` in the isDaily check: dividing by it would yield Infinity.
  const stat = buildTrackerStat(tracker({ dailyTarget: 0 }), [entry(TODAY, 10)], TODAY);
  assert.equal(stat.isDaily, false);
  assert.equal(stat.percent, null);
});

test("goal progress measures distance travelled, both directions", () => {
  const up = buildTrackerStat(
    tracker({ id: "g", title: "Score", unit: "", startingValue: 500, goalValue: 700, goalDirection: "increase_good" }),
    [entry(TODAY, 600, "g")],
    TODAY,
  );
  assert.equal(up.percent, 50, "500 → 700, sitting at 600");

  const down = buildTrackerStat(
    tracker({ id: "d", title: "Weight", unit: "kg", startingValue: 90, goalValue: 70, goalDirection: "decrease_good" }),
    [entry(TODAY, 80, "d")],
    TODAY,
  );
  assert.equal(down.percent, 50, "90 → 70, sitting at 80");
});

test("an unset startingValue falls back to the earliest logged entry", () => {
  // Matches calculateMetricProgress in milestoneHealth, so the two never
  // disagree about the same tracker.
  const stat = buildTrackerStat(
    tracker({ id: "g", goalValue: 100, goalDirection: "increase_good" }),
    [entry("2026-08-20", 0, "g"), entry(TODAY, 40, "g")],
    TODAY,
  );
  assert.equal(stat.percent, 40);
});

test("a direction-less tracker gets a neutral trend, not an assumed one", () => {
  const stat = buildTrackerStat(
    tracker({ id: "n" }),
    [entry("2026-08-31", 10, "n"), entry(TODAY, 5, "n")],
    TODAY,
  );
  assert.equal(stat.trend.direction, "down", "the movement is still reported");
  assert.equal(stat.trend.state, "neutral", "but nothing calls it good or bad");
});

// ── Empty and edge cases ────────────────────────────────────────────────────

test("a tracker with no entries reports nothing rather than zero", () => {
  const stat = buildTrackerStat(tracker({ dailyTarget: 2000 }), [], TODAY);
  assert.equal(stat.latestValue, null, "null, not 0 — never logged is not the same as logged zero");
  assert.equal(stat.trend, null);
  assert.equal(stat.todayTotal, 0);
  assert.equal(stat.percent, 0, "a daily metric still has a target to be 0% of");
  assert.deepEqual(stat.series, []);
});

test("the sparkline series is capped and oldest-first", () => {
  const entries = Array.from({ length: 12 }, (_, i) =>
    entry(`2026-08-${String(i + 1).padStart(2, "0")}`, i + 1),
  );
  const stat = buildTrackerStat(tracker(), entries, TODAY);

  assert.equal(stat.series.length, TRACKER_SERIES_LENGTH);
  assert.deepEqual(stat.series, [5, 6, 7, 8, 9, 10, 11, 12], "the most recent 8, in time order");
});

test("another tracker's entries are never counted", () => {
  const stat = buildTrackerStat(tracker(), [entry(TODAY, 500), entry(TODAY, 900, "other")], TODAY);
  assert.equal(stat.todayTotal, 500);
});

// ── trackingStart ───────────────────────────────────────────────────────────

test("entries before trackingStart are excluded", () => {
  // The setting promises trends ignore everything before this date; metric
  // entries were the one thing that never actually honoured it.
  const entries = [entry("2026-07-01", 999), entry("2026-08-31", 10), entry(TODAY, 20)];

  const unfiltered = buildTrackerStat(tracker(), entries, TODAY);
  assert.equal(unfiltered.series.length, 3);

  const filtered = buildTrackerStat(tracker(), entries, TODAY, "2026-08-01");
  assert.equal(filtered.series.length, 2, "the July entry is out of the window");
  assert.equal(filtered.series[0], 10);

  assert.equal(visibleEntries(entries, "t1", "2026-08-01").length, 2);
  assert.equal(visibleEntries(entries, "t1").length, 3, "no start date means all history");
});

test("trackingStart is inclusive of its own day", () => {
  const stat = buildTrackerStat(tracker(), [entry("2026-08-01", 5)], TODAY, "2026-08-01");
  assert.equal(stat.series.length, 1, "the start date itself counts");
});

// ── Chart inputs ────────────────────────────────────────────────────────────

test("points are daily totals with their dates, oldest first", () => {
  const stat = buildTrackerStat(
    tracker({ dailyTarget: 2000 }),
    [entry("2026-08-31", 400), entry("2026-08-31", 600), entry(TODAY, 250)],
    TODAY,
  );
  assert.deepEqual(stat.points, [
    { date: "2026-08-31", value: 1000 },
    { date: TODAY, value: 250 },
  ], "two logs on one day are one point, not a spike");
});

test("startingValue falls back to the first entry, and is null with neither", () => {
  const explicit = buildTrackerStat(tracker({ startingValue: 110 }), [entry(TODAY, 107)], TODAY);
  assert.equal(explicit.startingValue, 110, "the configured value wins");

  const inferred = buildTrackerStat(tracker(), [entry("2026-08-20", 99), entry(TODAY, 90)], TODAY);
  assert.equal(inferred.startingValue, 99, "otherwise the earliest log");

  const neither = buildTrackerStat(tracker(), [], TODAY);
  assert.equal(neither.startingValue, null, "nothing to anchor a reference line to");
});

test("todayEntries honours trackingStart, like every other stat", () => {
  // The regression: the card used to filter the raw list itself, so it showed
  // "TODAY 107 kg" directly beneath "Nothing logged yet" whenever the tracking
  // start date excluded that very entry.
  const entries = [entry(TODAY, 107)];

  const visible = buildTrackerStat(tracker(), entries, TODAY, "2026-08-01");
  assert.equal(visible.todayEntries.length, 1);
  assert.equal(visible.latestValue, 107);

  const excluded = buildTrackerStat(tracker(), entries, TODAY, "2026-09-15");
  assert.equal(excluded.latestValue, null, "the stat says nothing is logged…");
  assert.deepEqual(excluded.todayEntries, [], "…so the today list must agree");
});

test("todayEntries excludes other days and other trackers", () => {
  const stat = buildTrackerStat(
    tracker(),
    [entry(TODAY, 1), entry("2026-08-30", 2), entry(TODAY, 3, "other")],
    TODAY,
  );
  assert.deepEqual(stat.todayEntries.map((e) => e.value), [1]);
});

// ── Grouping and the status ramp ────────────────────────────────────────────

test("trackers group under their plan, in first-seen order", () => {
  const stats = [
    buildTrackerStat(tracker({ id: "a", planId: "p1" }), [], TODAY),
    buildTrackerStat(tracker({ id: "b", planId: "p2" }), [], TODAY),
    buildTrackerStat(tracker({ id: "c", planId: "p1" }), [], TODAY),
  ];
  const plans = new Map([["p1", { id: "p1", title: "Fitness" }]]);
  const groups = groupTrackerStatsByPlan(stats, plans);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].plan.title, "Fitness");
  assert.deepEqual(groups[0].stats.map((s) => s.tracker.id), ["a", "c"]);
  assert.equal(groups[1].plan, null, "a tracker whose plan is gone still renders, ungrouped");
});

test("the ramp bands match the DESIGN.md instruments", () => {
  assert.equal(trackerRampTone(null), "none");
  assert.equal(trackerRampTone(0), "behind");
  assert.equal(trackerRampTone(39.9), "behind");
  assert.equal(trackerRampTone(40), "at-risk");
  assert.equal(trackerRampTone(69.9), "at-risk");
  assert.equal(trackerRampTone(70), "on-track");
  assert.equal(trackerRampTone(100), "on-track");
});
