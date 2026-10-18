/**
 * Coverage for lib/paceModel.ts — least-squares regression, and the gap
 * between the pace a target needs and the pace actually happening.
 *
 * The properties worth pinning are the ones that keep a projection honest:
 * the line must resist a single outlier (the whole reason this exists rather
 * than the two-point slope in milestoneHealth), direction must be normalised
 * so "toward the goal" is always positive whichever way the metric moves, and
 * a scattered series must produce silence rather than a confident number.
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

const {
  linearRegression,
  trackerPace,
  milestonePace,
  paceNarrative,
  MIN_REGRESSION_POINTS,
  MIN_TRUSTWORTHY_FIT,
  ON_PACE_RATIO,
} = await import("@/lib/paceModel.ts");

const NOW = new Date("2026-09-20T12:00:00");
const TODAY = "2026-09-20";

/** Dated points every 7 days ending today, oldest first. */
function weekly(values, endISO = TODAY) {
  return values.map((value, i) => {
    const d = new Date(`${endISO}T12:00:00`);
    d.setDate(d.getDate() - 7 * (values.length - 1 - i));
    return { dateISO: d.toISOString().slice(0, 10), value };
  });
}

function entries(points, trackerId = "tr1") {
  return points.map((p, i) => ({
    id: `e${i}`,
    planId: "p1",
    trackerId,
    value: p.value,
    date: p.dateISO,
  }));
}

const tracker = (over = {}) => ({
  id: "tr1",
  goalValue: 100,
  goalDirection: "increase_good",
  unit: "kg",
  ...over,
});

// ── Regression ───────────────────────────────────────────────────────────────

test("a perfect line is recovered exactly", () => {
  const r = linearRegression(weekly([10, 20, 30, 40]));
  assert.equal(Math.round(r.slopePerWeek), 10);
  assert.equal(r.r2, 1);
  assert.equal(r.n, 4);
  assert.equal(r.lastDateISO, TODAY);
});

test("too few points is null, not a guess", () => {
  assert.equal(linearRegression(weekly([10, 20]).slice(0, MIN_REGRESSION_POINTS - 1)), null);
});

test("readings all on one day have no slope to find", () => {
  const sameDay = [
    { dateISO: TODAY, value: 1 },
    { dateISO: TODAY, value: 2 },
    { dateISO: TODAY, value: 3 },
  ];
  assert.equal(linearRegression(sameDay), null, "a vertical line must not divide by zero");
});

test("one outlier bends the line instead of pivoting it — the reason this exists", () => {
  // A clean +10/week series, then one wild final reading.
  const clean = linearRegression(weekly([10, 20, 30, 40, 50]));
  const withOutlier = linearRegression(weekly([10, 20, 30, 40, 5]));

  // The two-point method would read (5 − 10) / 4 weeks = −1.25/week and
  // declare the whole thing reversed. Regression keeps it positive.
  assert.ok(clean.slopePerWeek > 0);
  assert.ok(withOutlier.slopePerWeek > 0, "one bad reading must not flip the trend");
  assert.ok(withOutlier.r2 < clean.r2, "but the fit should degrade, and be reportable");
});

test("a flat series is perfectly described by a flat line", () => {
  const r = linearRegression(weekly([50, 50, 50, 50]));
  assert.equal(r.slopePerWeek, 0);
  assert.equal(r.r2, 1, "no variation to explain is a perfect fit, not a division by zero");
});

test("points are sorted before fitting, so input order can't change the answer", () => {
  const ordered = weekly([10, 20, 30, 40]);
  const shuffled = [ordered[2], ordered[0], ordered[3], ordered[1]];
  assert.equal(linearRegression(shuffled).slopePerWeek, linearRegression(ordered).slopePerWeek);
});

// ── Tracker pace: direction ──────────────────────────────────────────────────

test("an increasing goal treats rising values as progress", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([70, 75, 80, 85])),
    deadlineISO: "2026-10-18", // 4 weeks out
    now: NOW,
  });
  assert.ok(gap.actualPerWeek > 0);
  assert.equal(gap.remaining, 15);
  assert.equal(gap.requiredPerWeek, 3.75); // 15 over 4 weeks
});

test("a decreasing goal treats falling values as progress", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 75, goalDirection: "decrease_good" }),
    entries: entries(weekly([90, 88, 86, 84])),
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.ok(gap.actualPerWeek > 0, "losing weight is positive progress");
  assert.equal(gap.remaining, 9);
});

test("moving the wrong way is called that, not reported as a negative pace", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 75, goalDirection: "decrease_good" }),
    entries: entries(weekly([80, 83, 86, 89])), // gaining, goal is to lose
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.equal(gap.level, "wrong_way");
  assert.equal(gap.projectedDateISO, null, "no honest projection exists");
  assert.match(paceNarrative(gap), /moving away from the target/i);
});

// ── Tracker pace: the gap ────────────────────────────────────────────────────

test("behind pace quotes both rates", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100, unit: "kg" }),
    entries: entries(weekly([70, 71, 72, 73])), // 1/week
    deadlineISO: "2026-10-18", // needs 27 over 4 weeks ≈ 6.75/week
    now: NOW,
  });
  assert.equal(gap.level, "behind");
  const text = paceNarrative(gap);
  assert.match(text, /6\.8 kg\/week|6\.75 kg\/week/);
  assert.match(text, /1 kg\/week/);
});

test("ahead of pace reads as ahead", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([80, 85, 90, 95])), // 5/week
    deadlineISO: "2026-11-15", // 5 → needs 1/week
    now: NOW,
  });
  assert.equal(gap.level, "ahead");
  assert.match(paceNarrative(gap), /ahead of/i);
});

test("the on-pace band is where it claims to be", () => {
  // Required ≈ 5/week; actual 5/week → ratio 1.
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([65, 70, 75, 80])),
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.equal(gap.level, "on_pace");
  assert.ok(gap.ratio >= ON_PACE_RATIO);
});

test("a target already met is reported as reached, not as infinitely ahead", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([95, 98, 101, 104])),
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.equal(gap.remaining, 0);
  assert.equal(gap.requiredPerWeek, 0);
  assert.equal(gap.ratio, null);
  assert.equal(paceNarrative(gap), "Target reached.");
});

test("a deadline already past is behind, and says so in plain words", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100, unit: "kg" }),
    entries: entries(weekly([70, 72, 74, 76])),
    deadlineISO: "2026-09-13", // last week
    now: NOW,
  });
  assert.equal(gap.requiredPerWeek, Infinity, "no finite rate can meet a past deadline");
  assert.equal(gap.ratio, null);
  // Never "on pace": no rate meets a deadline that has already gone.
  assert.equal(gap.level, "behind");
  // And never the nonsense this produced when the generic template was reused:
  // "about the more than is possible this needs".
  const text = paceNarrative(gap);
  assert.match(text, /target date has passed/i);
  assert.match(text, /24 kg still to go/);
  assert.ok(!/more than is possible/.test(text));
});

test("a past deadline with the target already met is still 'reached', not 'behind'", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([95, 98, 101, 104])),
    deadlineISO: "2026-09-13",
    now: NOW,
  });
  assert.equal(gap.remaining, 0);
  assert.equal(gap.level, "on_pace");
  assert.equal(paceNarrative(gap), "Target reached.");
});

test("the projection follows the fitted rate", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([80, 85, 90, 95])), // 5/week, 5 remaining
    deadlineISO: "2026-11-15",
    now: NOW,
  });
  assert.equal(gap.projectedDateISO, "2026-09-27", "one more week at 5/week");
  assert.ok(gap.daysAheadBehind > 0, "comfortably before the deadline");
});

test("entries for other trackers, the future, and pre-tracking are excluded", () => {
  const mine = entries(weekly([70, 75, 80, 85]));
  const theirs = entries(weekly([1, 2, 3, 4]), "other");
  const future = [{ id: "f", planId: "p1", trackerId: "tr1", value: 999, date: "2026-12-01" }];

  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: [...mine, ...theirs, ...future],
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.equal(gap.remaining, 15, "the 999 must not be treated as current");

  const scoped = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: mine,
    deadlineISO: "2026-10-18",
    now: NOW,
    trackingStart: "2026-09-01",
  });
  assert.ok(scoped !== null);
});

test("no goal value means no required pace to compare against", () => {
  const gap = trackerPace({
    tracker: tracker({ goalValue: undefined }),
    entries: entries(weekly([70, 75, 80, 85])),
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.equal(gap, null);
});

// ── Trust ────────────────────────────────────────────────────────────────────

test("a scattered series says nothing rather than quoting a meaningless slope", () => {
  // Deliberately noisy: no trend a line can describe.
  const gap = trackerPace({
    tracker: tracker({ goalValue: 100 }),
    entries: entries(weekly([70, 95, 66, 99, 68, 97])),
    deadlineISO: "2026-10-18",
    now: NOW,
  });
  assert.ok(gap.fit < MIN_TRUSTWORTHY_FIT, `expected a weak fit, got ${gap.fit}`);
  assert.equal(paceNarrative(gap), null, "a confident sentence here would be the least supported thing on screen");
});

test("paceNarrative tolerates a null gap", () => {
  assert.equal(paceNarrative(null), null);
});

// ── Milestone pace ───────────────────────────────────────────────────────────

const milestone = (over = {}) => ({
  startDate: "2026-09-06",   // two weeks before today
  plannedEndDate: "2026-10-04", // two weeks after
  ...over,
});

test("milestone pace is measured in sessions per week", () => {
  const gap = milestonePace({
    milestone: milestone(),
    expectedTotal: 20,
    completedSoFar: 6,
    now: NOW,
  });
  assert.equal(gap.unit, "sessions");
  assert.equal(gap.remaining, 14);
  assert.equal(gap.actualPerWeek, 3, "6 over two elapsed weeks");
  assert.equal(gap.requiredPerWeek, 7, "14 over two remaining weeks");
  assert.equal(gap.level, "behind");
  assert.match(paceNarrative(gap), /7 sessions\/week/);
});

test("a milestone with nothing expected has no pace", () => {
  assert.equal(milestonePace({ milestone: milestone(), expectedTotal: 0, completedSoFar: 0, now: NOW }), null);
});

test("a milestone that hasn't started yet has no pace", () => {
  const future = milestone({ startDate: "2026-12-01", plannedEndDate: "2026-12-31" });
  assert.equal(milestonePace({ milestone: future, expectedTotal: 10, completedSoFar: 0, now: NOW }), null);
});

test("all sessions done reads as reached", () => {
  const gap = milestonePace({ milestone: milestone(), expectedTotal: 10, completedSoFar: 10, now: NOW });
  assert.equal(gap.remaining, 0);
  assert.equal(paceNarrative(gap), "Target reached.");
});

test("no sessions done at all is wrong_way, and says what's needed", () => {
  const gap = milestonePace({ milestone: milestone(), expectedTotal: 10, completedSoFar: 0, now: NOW });
  assert.equal(gap.level, "wrong_way");
  assert.match(paceNarrative(gap), /No movement yet/i);
  assert.match(paceNarrative(gap), /5 sessions\/week/);
});

test("occurrence counts are exact, so milestone pace is always trusted", () => {
  const gap = milestonePace({ milestone: milestone(), expectedTotal: 20, completedSoFar: 6, now: NOW });
  assert.equal(gap.fit, 1, "there is no scatter to explain in a count");
  assert.ok(paceNarrative(gap) !== null);
});
