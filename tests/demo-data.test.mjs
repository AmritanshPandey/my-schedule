/**
 * Guards for the demo dataset.
 *
 * The builder's whole risk surface is that every way it can be wrong fails
 * *silently*: a fixture with the wrong `activities` shape loads as default
 * plans, one with stale timestamps loads as un-completed, one whose history
 * lands on the wrong weekday loads as nothing at all. None of that throws.
 *
 * So these tests run the real readers over the real fixture and assert the
 * numbers the UI would actually show, rather than checking the object literal
 * against itself.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try {
        return nextResolve(url, context);
      } catch {
        return nextResolve(`${url}.ts`, context);
      }
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

const { buildDemoSchedule } = await import("@/lib/demoData.ts");
const { resetStaleCompletions } = await import("@/lib/scheduleNormalize.ts");
const { localISODate } = await import("@/lib/dateUtils.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");
const { isTaskScheduledOn } = await import("@/lib/taskOccurrence.ts");
const { isTrackedTask } = await import("@/lib/taskCompletion.ts");
const { resolveMilestoneStatus } = await import("@/lib/roadmapDates.ts");
const { selectNeedsAttention } = await import("@/lib/needsAttention.ts");
const { calculateExecutionStreak } = await import("@/lib/consistency/calculateExecutionStreak.ts");
const { computeExecutionTrend } = await import("@/lib/executionAnalytics.ts");
const { completedOnDate } = await import("@/lib/consistency/calculateDailyStats.ts");

/** A fixed instant so weekday-dependent assertions are reproducible. Midweek
 *  (a Wednesday) so both the weekday-only and everyday tasks are in play. */
const NOW = new Date("2026-08-12T09:30:00");
const TODAY = localISODate(NOW);

function dayKeyOf(date) {
  return DAYS[(date.getDay() + 6) % 7];
}

function shiftISO(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

function allTasks(schedule) {
  const seen = new Map();
  for (const day of DAYS) for (const t of schedule.activities[day] ?? []) seen.set(t.id, t);
  return [...seen.values()];
}

// ── The shape `migrate()` sniffs for ─────────────────────────────────────────
// `migrate` decides between the current and the legacy branch on
// `isPerDay(activities) && Array.isArray(plans)`. Failing that check does not
// error — it silently replaces the plans with defaults and drops every
// milestone, ritual and tracker. This asserts the precondition directly.

test("activities is a per-day map and plans is an array", () => {
  const s = buildDemoSchedule(NOW);

  for (const day of DAYS) {
    assert.ok(Array.isArray(s.activities[day]), `activities.${day} must be an array`);
  }
  assert.ok(
    Object.prototype.hasOwnProperty.call(s.activities, "monday"),
    "isPerDay() looks for a literal `monday` key",
  );
  assert.ok(Array.isArray(s.plans) && s.plans.length > 0, "plans must be a non-empty array");

  // Every top-level key the Schedule contract requires.
  for (const key of [
    "plans", "categories", "activities", "progressTrackers", "metricEntries",
    "milestones", "rituals", "ritualCompletions", "notes", "preferences",
  ]) {
    assert.ok(key in s, `Schedule.${key} is missing`);
  }
});

test("survives a JSON round-trip, which is how it reaches restoreData", () => {
  const s = buildDemoSchedule(NOW);
  const back = JSON.parse(JSON.stringify(s));
  assert.equal(back.plans.length, s.plans.length);
  assert.equal(back.milestones.length, s.milestones.length);
  assert.equal(allTasks(back).length, allTasks(s).length);
});

// ── The completion-reset trap ────────────────────────────────────────────────

test("today's completions survive resetStaleCompletions", () => {
  const s = buildDemoSchedule(NOW);
  const before = allTasks(s).filter((t) => t.completed).map((t) => t.id);
  assert.ok(before.length > 0, "the fixture should mark something complete today");

  const after = resetStaleCompletions(s, TODAY);
  const kept = allTasks(after).filter((t) => t.completed).map((t) => t.id);
  assert.deepEqual(kept.sort(), before.sort(), "live completion state was stripped on load");
});

test("live subtask progress also survives", () => {
  const s = buildDemoSchedule(NOW);
  const withSubs = allTasks(s).filter((t) => (t.completedSubtaskIds?.length ?? 0) > 0);
  assert.ok(withSubs.length > 0, "expected a partially-checked task today");

  const after = resetStaleCompletions(s, TODAY);
  for (const t of withSubs) {
    const reloaded = allTasks(after).find((x) => x.id === t.id);
    assert.ok(
      (reloaded.completedSubtaskIds?.length ?? 0) > 0,
      `${t.id} lost its subtask progress`,
    );
  }
});

test("no live completion state on a task that is not scheduled today", () => {
  const s = buildDemoSchedule(NOW);
  const todayKey = dayKeyOf(NOW);
  for (const task of allTasks(s)) {
    const scheduledToday = (s.activities[todayKey] ?? []).some((t) => t.id === task.id);
    if (scheduledToday) continue;
    assert.ok(!task.completed, `${task.id} is complete but not scheduled today`);
    assert.ok(!task.missed, `${task.id} is missed but not scheduled today`);
  }
});

// ── History integrity ────────────────────────────────────────────────────────

test("no history event is dated in the future, and none is older than 90 days", () => {
  const s = buildDemoSchedule(NOW);
  const floor = shiftISO(TODAY, -90);

  for (const task of allTasks(s)) {
    for (const ev of task.completionHistory ?? []) {
      const d = localISODate(new Date(ev.completedAt));
      assert.ok(d <= TODAY, `${task.id} has a future event on ${d}`);
      assert.ok(d > floor, `${task.id} has an event older than the 90-day floor (${d})`);
    }
  }
  for (const c of s.ritualCompletions) {
    assert.ok(c.date <= TODAY, `ritual completion in the future: ${c.date}`);
    assert.ok(c.date > floor, `ritual completion past the 90-day floor: ${c.date}`);
  }
});

test("every history event lands on a date the task is actually scheduled", () => {
  // The readers cross-check an event's date against the weekday bucket its task
  // sits in. An event on the wrong weekday is invisible to every surface — it
  // would inflate nothing and simply never appear.
  const s = buildDemoSchedule(NOW);

  for (const day of DAYS) {
    for (const task of s.activities[day] ?? []) {
      for (const ev of task.completionHistory ?? []) {
        const dateISO = localISODate(new Date(ev.completedAt));
        const key = dayKeyOf(new Date(`${dateISO}T12:00:00`));
        const inThatBucket = (s.activities[key] ?? []).some((t) => t.id === task.id);
        assert.ok(
          inThatBucket && isTaskScheduledOn(task, dateISO, true),
          `${task.id} has an event on ${dateISO} (${key}), a day it is not scheduled`,
        );
      }
    }
  }
});

test("commitments carry no completion history", () => {
  const s = buildDemoSchedule(NOW);
  for (const task of allTasks(s)) {
    if (isTrackedTask(task)) continue;
    assert.equal((task.completionHistory ?? []).length, 0, `${task.id} is held time and must not be tracked`);
    assert.ok(!task.completed, `${task.id} is held time and must never be completed`);
  }
});

// ── Referential integrity ────────────────────────────────────────────────────

test("every id reference resolves", () => {
  const s = buildDemoSchedule(NOW);
  const categoryIds = new Set(s.categories.map((c) => c.id));
  const planIds = new Set(s.plans.map((p) => p.id));
  const trackerIds = new Set(s.progressTrackers.map((t) => t.id));
  const taskIds = new Set(allTasks(s).map((t) => t.id));

  for (const task of allTasks(s)) {
    if (task.categoryId) {
      assert.ok(categoryIds.has(task.categoryId), `${task.id} → unknown category ${task.categoryId}`);
    }
    // A commitment deliberately has no plan; everything tracked must have one.
    if (isTrackedTask(task)) {
      assert.ok(planIds.has(task.planId), `${task.id} → unknown plan ${task.planId}`);
    }
  }
  // A milestone whose planId matches no plan is dropped by normalizeMilestoneTimelines.
  for (const m of s.milestones) {
    assert.ok(planIds.has(m.planId), `milestone ${m.id} → unknown plan ${m.planId}`);
  }
  for (const e of s.metricEntries) {
    assert.ok(trackerIds.has(e.trackerId), `metric ${e.id} → unknown tracker`);
    assert.ok(planIds.has(e.planId), `metric ${e.id} → unknown plan`);
  }
  for (const t of s.progressTrackers) {
    assert.ok(planIds.has(t.planId), `tracker ${t.id} → unknown plan`);
  }
  for (const n of s.notes) {
    for (const id of n.linkedTaskIds ?? []) {
      assert.ok(taskIds.has(id), `note ${n.id} → unknown task ${id}`);
    }
  }
  // Every plan should own at least one task, or its detail page is empty.
  for (const plan of s.plans) {
    assert.ok(
      allTasks(s).some((t) => t.planId === plan.id),
      `plan ${plan.id} has no tasks`,
    );
  }
});

// ── The surfaces this dataset exists to populate ─────────────────────────────

test("the roadmap covers every milestone state, including exactly one overdue", () => {
  const s = buildDemoSchedule(NOW);
  const statuses = s.milestones.map((m) => resolveMilestoneStatus(m, TODAY));

  // plannedEndDate is recomputed on load from startDate + duration, so assert
  // against the same arithmetic the app will apply rather than the stored value.
  for (const m of s.milestones) {
    const expected = shiftISO(m.startDate, m.plannedDurationDays - 1);
    assert.equal(m.plannedEndDate, expected, `${m.id} plannedEndDate disagrees with its duration`);
  }

  assert.ok(statuses.includes("completed"), "no completed milestone");
  assert.ok(statuses.includes("active"), "no active milestone");
  assert.ok(statuses.includes("upcoming"), "no upcoming milestone");
  assert.equal(
    statuses.filter((x) => x === "delayed").length,
    1,
    "expected exactly one overdue milestone for Needs attention",
  );

  // A completed milestone must actually carry its completion date, or
  // normalizeMilestone and resolveMilestoneStatus disagree about it.
  for (const m of s.milestones) {
    if (m.status === "completed") assert.ok(m.actualCompletedDate, `${m.id} completed with no date`);
    if (m.actualCompletedDate) assert.equal(m.status, "completed", `${m.id} has a date but is not completed`);
  }
});

test("the execution streak is live and reads the intended length", () => {
  const s = buildDemoSchedule(NOW);
  const streak = calculateExecutionStreak(s, TODAY);
  assert.equal(streak.doneToday, true, "something must be completed today or the streak reads at-risk");
  assert.equal(streak.streak, 12, "the streak length the fixture is built to show");
  assert.equal(streak.milestone, null, "should not land on a milestone and fire the celebration");
});

test("Needs attention has something in all three sections", () => {
  const s = buildDemoSchedule(NOW);
  const attention = selectNeedsAttention(s, TODAY, dayKeyOf(NOW));

  assert.ok(attention.overdueMilestones.length >= 1, "no overdue milestone");
  assert.ok(attention.missedTasks.length >= 1, "no recently missed task");
  assert.ok(attention.atRiskRituals.length >= 1, "no at-risk ritual streak");
  assert.ok(
    attention.missedTasks.every((m) => m.daysAgo >= 1 && m.daysAgo <= 7),
    "missed tasks must fall inside the 7-day lookback",
  );
});

test("the execution trend is populated across its whole window", () => {
  const s = buildDemoSchedule(NOW);
  const trend = computeExecutionTrend(s, 8);
  assert.equal(trend.weeks.length, 8, "every week should survive the tracking-start filter");
  for (const week of trend.weeks) {
    assert.ok(week.scheduled > 0, `week of ${week.monStr} has nothing scheduled`);
  }
  // Past weeks must show real, partial execution — an all-or-nothing dataset
  // would make the trend chart meaningless.
  const past = trend.weeks.slice(0, -1);
  assert.ok(past.every((w) => w.completed > 0), "a past week with no completions at all");
  assert.ok(past.some((w) => w.missed > 0), "no misses at all — the gaps are the point");
  assert.ok(past.some((w) => w.pct < 100), "a perfect week every week is not the brief");
  assert.ok(trend.averagePct > 40 && trend.averagePct < 95, `average ${trend.averagePct}% is not believable`);
});

test("today always has something done and something still to do", () => {
  // Checked on every weekday, not just one: a demo that lands on a fully-ticked
  // day has no pending row and no live checkbox to press, and which day that
  // happens on depends entirely on when the user hits the button.
  for (let i = 0; i < 7; i++) {
    const now = new Date(NOW);
    now.setDate(now.getDate() + i);
    const todayISO = localISODate(now);
    const s = buildDemoSchedule(now);
    const tracked = (s.activities[dayKeyOf(now)] ?? []).filter(isTrackedTask);

    assert.ok(tracked.length >= 2, `${todayISO} has fewer than two tracked tasks`);
    const done = completedOnDate(tracked, todayISO, true);
    assert.ok(done > 0, `nothing completed on ${todayISO}`);
    assert.ok(done < tracked.length, `everything already done on ${todayISO}`);
  }
});

test("every day of the week is worth looking at", () => {
  // Weekends were originally one 45-minute block against eight hours of sleep,
  // which made the donut read as ~90% sleep and the day card as "2 of 2 done".
  const s = buildDemoSchedule(NOW);
  for (const day of DAYS) {
    const blocks = s.activities[day] ?? [];
    assert.ok(blocks.length >= 3, `${day} has only ${blocks.length} blocks`);
    assert.ok(
      blocks.filter(isTrackedTask).length >= 2,
      `${day} has fewer than two tracked tasks`,
    );
    // At least two distinct categories besides sleep, or the donut is one wedge.
    const cats = new Set(blocks.map((t) => t.categoryId).filter((c) => c && c !== "demo-cat-sleep"));
    assert.ok(cats.size >= 2, `${day} only has ${cats.size} non-sleep categories`);
  }
});

test("the day has an overnight block that runs past the end of the schedule day", () => {
  const s = buildDemoSchedule(NOW);
  const sleep = allTasks(s).find((t) => t.title === "Sleep");
  assert.ok(sleep, "no overnight task");
  assert.equal(sleep.taskType, "commitment", "sleep is held time, not a tracked task");
  assert.ok(sleep.categoryId, "the overnight block should be categorised so it shows in the donut");
  for (const day of DAYS) {
    assert.ok((s.activities[day] ?? []).some((t) => t.id === sleep.id), `sleep missing from ${day}`);
  }
});

test("there is a multi-slot task and an uncategorised commitment", () => {
  const s = buildDemoSchedule(NOW);
  const tasks = allTasks(s);

  const multi = tasks.find((t) => (t.slots?.length ?? 0) > 1);
  assert.ok(multi, "no multi-slot task");
  assert.equal(multi.startTime, multi.slots[0].startTime, "startTime must mirror the first slot");

  assert.ok(
    tasks.some((t) => !isTrackedTask(t) && !t.categoryId),
    "no uncategorised commitment — the neutral held-time case is unexercised",
  );
});

// ── Determinism ──────────────────────────────────────────────────────────────

test("the same instant always builds the same schedule", () => {
  assert.deepEqual(buildDemoSchedule(NOW), buildDemoSchedule(NOW));
});

test("it holds up on every weekday, not just the one it was written on", () => {
  // The fixture is anchored to "now", so a bug that only bites at a weekend
  // (an empty bucket, a missing anchor) would otherwise surface as a support
  // question rather than a test failure.
  for (let i = 0; i < 7; i++) {
    const now = new Date(NOW);
    now.setDate(now.getDate() + i);
    const todayISO = localISODate(now);
    const s = buildDemoSchedule(now);

    const streak = calculateExecutionStreak(s, todayISO);
    assert.equal(streak.doneToday, true, `nothing done today on ${todayISO}`);
    assert.equal(streak.streak, 12, `streak broke on ${todayISO}`);

    const attention = selectNeedsAttention(s, todayISO, dayKeyOf(now));
    assert.ok(attention.total > 0, `Needs attention is empty on ${todayISO}`);

    assert.equal(
      resetStaleCompletions(s, todayISO).activities,
      s.activities,
      `resetStaleCompletions stripped state on ${todayISO}`,
    );
  }
});
