/**
 * Coverage for lib/slotReliability.ts — completion rate by scheduled time band
 * and weekday.
 *
 * The central property, and the one most likely to be broken by a future
 * "simplification": the band is taken from the slot the work was SCHEDULED
 * into, never from `completedAt`. Someone who ticks their whole day off at
 * bedtime must not make 11pm look like their most productive hour.
 *
 * The rest guard against the model quietly becoming a measure of app usage
 * instead of execution — unresolved occurrences, today, commitments and paused
 * plans all have to stay out.
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
  computeSlotReliability,
  bandForMinutes,
  bandLabel,
  bandRangeLabel,
  strongestBand,
  weakestBand,
  suggestBetterBand,
  reliabilityNarrative,
  MIN_BAND_SAMPLES,
  WEAK_BAND_RATE,
  STRONG_BAND_RATE,
} = await import("@/lib/slotReliability.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-19T18:00:00"); // a Saturday
const TODAY = "2026-09-19";

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

/** The N dates immediately before today, most recent first. */
function recentDates(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${TODAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function event(taskId, dateISO, type, atClock = "12:00:00") {
  return {
    id: `${taskId}-${dateISO}-${type}`,
    taskId,
    completedAt: new Date(`${dateISO}T${atClock}`).toISOString(),
    completionType: type,
  };
}

function task(id, startTime, endTime, events, overrides = {}) {
  return { id, title: id, startTime, endTime, planId: "p1", completionHistory: events, ...overrides };
}

function activitiesWith(tasks, days = ALL_DAYS) {
  const activities = emptyActivities();
  for (const t of tasks) for (const d of days) activities[d].push(t);
  return activities;
}

function schedule(overrides = {}) {
  return {
    goals: [],
    goalConnections: [],
    plans: [plan()],
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

// ── Banding ──────────────────────────────────────────────────────────────────

test("bands cover the day and put pre-dawn work with the late band", () => {
  assert.equal(bandForMinutes(7 * 60), "early");
  assert.equal(bandForMinutes(10 * 60), "morning");
  assert.equal(bandForMinutes(14 * 60), "afternoon");
  assert.equal(bandForMinutes(19 * 60), "evening");
  assert.equal(bandForMinutes(22 * 60), "night");
  // 1am is the tail of the previous evening in the schedule-day model.
  assert.equal(bandForMinutes(1 * 60), "night");
});

test("band boundaries are half-open, so no minute belongs to two bands", () => {
  assert.equal(bandForMinutes(9 * 60 - 1), "early");
  assert.equal(bandForMinutes(9 * 60), "morning");
  assert.equal(bandForMinutes(17 * 60 - 1), "afternoon");
  assert.equal(bandForMinutes(17 * 60), "evening");
});

test("band range renders clock times, not durations", () => {
  const label = bandRangeLabel("early");
  assert.match(label, /AM|PM/, `expected a clock time, got "${label}"`);
  assert.ok(!/^\d+h/.test(label), "must not read as a duration");
});

// ── The central property ─────────────────────────────────────────────────────

test("the band comes from the SCHEDULED slot, never from completedAt", () => {
  // Scheduled 7am (early); every completion ticked at 11pm.
  const dates = recentDates(6);
  const t = task("t1", "7:00 AM", "8:00 AM", dates.map((d) => event("t1", d, "task", "23:00:00")));
  const model = computeSlotReliability(schedule({ activities: activitiesWith([t]) }), NOW);

  assert.equal(model.byBand.early.resolved, 6, "credited to the scheduled band");
  assert.equal(model.byBand.early.completed, 6);
  assert.equal(model.byBand.night.resolved, 0, "the tick time must not create a late-night record");
});

test("a per-date retiming is credited to the band it actually moved to", () => {
  const [d1] = recentDates(1);
  const t = task("t1", "7:00 AM", "8:00 AM", [event("t1", d1, "task")], {
    exceptions: { [d1]: { startTime: "7:00 PM", endTime: "8:00 PM" } },
  });
  const model = computeSlotReliability(schedule({ activities: activitiesWith([t]) }), NOW);
  assert.equal(model.byBand.evening.resolved, 1);
  assert.equal(model.byBand.early.resolved, 0);
});

// ── What counts as an experiment ─────────────────────────────────────────────

test("unresolved occurrences are not counted as failures", () => {
  // Scheduled daily for weeks, but nothing ever marked either way.
  const t = task("t1", "7:00 AM", "8:00 AM", []);
  const model = computeSlotReliability(schedule({ activities: activitiesWith([t]) }), NOW);
  assert.equal(model.sampleSize, 0);
  assert.equal(model.hasEnoughData, false);
  assert.equal(model.byBand.early.rate, null);
});

test("misses count as resolved-and-failed", () => {
  const dates = recentDates(4);
  const t = task("t1", "7:00 AM", "8:00 AM", [
    event("t1", dates[0], "task"),
    ...dates.slice(1).map((d) => event("t1", d, "missed")),
  ]);
  const model = computeSlotReliability(schedule({ activities: activitiesWith([t]) }), NOW);
  assert.equal(model.byBand.early.resolved, 4);
  assert.equal(model.byBand.early.completed, 1);
  assert.equal(model.byBand.early.rate, 0.25);
});

test("today is excluded — a task still ahead of you is not a failure", () => {
  const t = task("t1", "7:00 AM", "8:00 AM", [event("t1", TODAY, "task")]);
  const model = computeSlotReliability(schedule({ activities: activitiesWith([t]) }), NOW);
  assert.equal(model.sampleSize, 0);
});

test("commitments and paused plans stay out of the sample", () => {
  const dates = recentDates(5);
  const events = dates.map((d) => event("t1", d, "task"));

  const commitment = computeSlotReliability(
    schedule({ activities: activitiesWith([task("t1", "7:00 AM", "8:00 AM", events, { taskType: "commitment" })]) }),
    NOW,
  );
  assert.equal(commitment.sampleSize, 0);

  const paused = computeSlotReliability(
    schedule({
      plans: [plan({ status: "paused" })],
      activities: activitiesWith([task("t1", "7:00 AM", "8:00 AM", events)]),
    }),
    NOW,
  );
  assert.equal(paused.sampleSize, 0);
});

test("a thin band reports no rate rather than a misleading one", () => {
  const dates = recentDates(MIN_BAND_SAMPLES - 1);
  const t = task("t1", "7:00 AM", "8:00 AM", dates.map((d) => event("t1", d, "task")), {});
  const model = computeSlotReliability(
    schedule({ activities: activitiesWith([t], ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) }),
    NOW,
    MIN_BAND_SAMPLES - 1,
  );
  assert.ok(model.byBand.early.resolved < MIN_BAND_SAMPLES);
  assert.equal(model.byBand.early.rate, null);
});

// ── Readings ─────────────────────────────────────────────────────────────────

/** A model with two bands at chosen rates, bypassing the walk. */
function modelWith(bands) {
  const empty = { resolved: 0, completed: 0, rate: null };
  const byBand = { early: empty, morning: empty, afternoon: empty, evening: empty, night: empty };
  let total = 0;
  for (const [id, rate] of Object.entries(bands)) {
    const resolved = 10;
    byBand[id] = { resolved, completed: Math.round(rate * resolved), rate };
    total += resolved;
  }
  return {
    byBand,
    byWeekday: Object.fromEntries(ALL_DAYS.map((d) => [d, empty])),
    sampleSize: total,
    hasEnoughData: true,
  };
}

test("strongestBand only names a band that is actually strong", () => {
  assert.equal(strongestBand(modelWith({ early: STRONG_BAND_RATE })).band, "early");
  assert.equal(strongestBand(modelWith({ early: STRONG_BAND_RATE - 0.01 })), null);
});

test("weakestBand stays quiet unless there is a better band to move to", () => {
  // Everything weak: a workload problem, not a scheduling one. Capacity is the
  // honest thing to say there, so this must not offer a reshuffle.
  assert.equal(weakestBand(modelWith({ early: 0.3, night: 0.2 })), null);

  const withAlternative = weakestBand(modelWith({ early: 0.9, night: 0.2 }));
  assert.equal(withAlternative.band, "night");
});

test("suggestBetterBand requires both a weak current slot and a strong alternative", () => {
  const model = modelWith({ early: 0.9, night: 0.2 });

  const moved = suggestBetterBand(model, { startTime: "10:00 PM", endTime: "11:00 PM" });
  assert.equal(moved.from.band, "night");
  assert.equal(moved.to.band, "early");

  // Already in the strong band — nothing to suggest.
  assert.equal(suggestBetterBand(model, { startTime: "7:00 AM", endTime: "8:00 AM" }), null);

  // No strong alternative anywhere.
  assert.equal(
    suggestBetterBand(modelWith({ early: 0.4, night: 0.3 }), { startTime: "10:00 PM", endTime: "11:00 PM" }),
    null,
  );
});

test("suggestBetterBand is silent without enough data", () => {
  const thin = { ...modelWith({ early: 0.9, night: 0.2 }), hasEnoughData: false };
  assert.equal(suggestBetterBand(thin, { startTime: "10:00 PM", endTime: "11:00 PM" }), null);
});

test("the narrative is an observation, quoting real rates", () => {
  const both = reliabilityNarrative(modelWith({ early: 0.9, night: 0.2 }));
  assert.match(both, /90%/);
  assert.match(both, /20%/);
  assert.match(both, /early morning/i);

  const onlyStrong = reliabilityNarrative(modelWith({ early: 0.9 }));
  assert.match(onlyStrong, /most reliable/i);

  assert.equal(reliabilityNarrative(modelWith({ early: 0.4 })), null);
});

test("band labels are human", () => {
  assert.equal(bandLabel("early"), "Early morning");
  assert.equal(bandLabel("night"), "Late");
});

test("WEAK and STRONG thresholds leave a deliberate gap", () => {
  // A band between them is "fine, unremarkable" — neither worth recommending
  // nor worth warning about. Collapsing the gap would make the model chatty.
  assert.ok(WEAK_BAND_RATE < STRONG_BAND_RATE);
});
