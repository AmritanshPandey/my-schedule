/**
 * Coverage for lib/attentionDismissal.ts and the filters it drives in
 * lib/needsAttention.ts.
 *
 * "Clear all" is only safe because dismissal is per *instance*, never per
 * entity. These pin the cases where getting that wrong would silence something
 * the user needed: tomorrow's streak warning, a milestone that slips again
 * against a new target, and a milestone that goes from "off pace" to actually
 * overdue.
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
  dismissAllAttention,
  dismissAttentionKey,
  dismissibleCount,
  ritualAttentionKey,
  milestoneRiskKey,
  milestoneOverdueKey,
  MAX_DISMISSALS,
  DISMISSAL_RETENTION_DAYS,
} = await import("@/lib/attentionDismissal.ts");
const { selectNeedsAttention } = await import("@/lib/needsAttention.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TODAY = "2026-09-19";

function emptyActivities() {
  return Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
}

function plan(overrides = {}) {
  return { id: "p1", title: "Plan", category: "fitness", emoji: "🏃", color: "emerald", items: [], ...overrides };
}

function milestone(overrides = {}) {
  return {
    id: "m1",
    planId: "p1",
    title: "Run 10k",
    startDate: "2026-08-01",
    plannedDurationDays: 20,
    plannedEndDate: "2026-08-20",
    status: "active",
    linkedActivities: [],
    linkedTrackers: [],
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    sortOrder: 0,
    ...overrides,
  };
}

function missedEvent(taskId, dateISO) {
  return {
    id: `${taskId}-${dateISO}`,
    taskId,
    completedAt: new Date(`${dateISO}T12:00:00`).toISOString(),
    completionType: "missed",
  };
}

function task(overrides = {}) {
  return { id: "t1", title: "Long run", startTime: "7:00 AM", endTime: "8:00 AM", planId: "p1", completionHistory: [], ...overrides };
}

function ritual(overrides = {}) {
  return { id: "r1", title: "Morning pages", time: "07:00", ...overrides };
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

/** A schedule with one of each dismissible row type live. */
function busySchedule() {
  return schedule({
    milestones: [
      milestone({ id: "late", plannedEndDate: "2026-08-20" }),
    ],
    rituals: [ritual()],
    ritualCompletions: [
      // A 3-day run up to yesterday, so the streak is worth warning about.
      { ritualId: "r1", date: "2026-09-16" },
      { ritualId: "r1", date: "2026-09-17" },
      { ritualId: "r1", date: "2026-09-18" },
    ],
    activities: {
      ...emptyActivities(),
      thursday: [task({ completionHistory: [missedEvent("t1", "2026-09-17")] })],
    },
  });
}

// ── Key scoping ──────────────────────────────────────────────────────────────

test("every key ends in the date that scopes it", () => {
  for (const key of [
    ritualAttentionKey("r1", TODAY),
    milestoneRiskKey("m1", "2026-08-20"),
    milestoneOverdueKey("m1", "2026-08-20"),
  ]) {
    assert.match(key, /\|\d{4}-\d{2}-\d{2}$/, key);
  }
});

test("off-pace and overdue are different keys for the same milestone", () => {
  assert.notEqual(milestoneRiskKey("m1", "2026-08-20"), milestoneOverdueKey("m1", "2026-08-20"));
});

// ── The bulk mutation ────────────────────────────────────────────────────────

test("clearing nothing returns the same schedule", () => {
  const before = schedule();
  const data = selectNeedsAttention(before, TODAY);
  assert.equal(dismissibleCount(data), 0);
  assert.equal(dismissAllAttention(before, data, TODAY), before);
});

test("clear all empties the card, and every row type is counted", () => {
  const before = busySchedule();
  const data = selectNeedsAttention(before, TODAY);
  assert.ok(data.total >= 3, `expected several rows, got ${data.total}`);
  assert.equal(dismissibleCount(data), data.total);

  const after = dismissAllAttention(before, data, TODAY);
  assert.equal(selectNeedsAttention(after, TODAY).total, 0);
});

test("clearing deletes nothing — the underlying data is untouched", () => {
  const before = busySchedule();
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);

  assert.deepEqual(after.milestones, before.milestones);
  assert.deepEqual(after.rituals, before.rituals);
  assert.deepEqual(after.activities, before.activities);
  // The missed history event in particular must survive, or analytics lie.
  assert.deepEqual(
    after.activities.thursday[0].completionHistory,
    before.activities.thursday[0].completionHistory,
  );
});

test("missed occurrences go to acknowledgedMisses, so per-item dismiss agrees", () => {
  const before = busySchedule();
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  assert.ok(after.preferences.acknowledgedMisses.includes("t1|2026-09-17"));
});

test("restoring the previous preferences undoes the clear", () => {
  const before = busySchedule();
  const data = selectNeedsAttention(before, TODAY);
  const after = dismissAllAttention(before, data, TODAY);
  const undone = { ...after, preferences: before.preferences };
  assert.equal(selectNeedsAttention(undone, TODAY).total, data.total);
});

// ── The per-row mutation ─────────────────────────────────────────────────────

test("dismissing one row's key removes only that row", () => {
  const before = busySchedule();
  const data = selectNeedsAttention(before, TODAY);
  assert.equal(data.atRiskRituals.length, 1);
  assert.equal(data.overdueMilestones.length, 1);

  const ritualKey = ritualAttentionKey(data.atRiskRituals[0].ritual.id, TODAY);
  const after = dismissAttentionKey(before, ritualKey, TODAY);
  const remaining = selectNeedsAttention(after, TODAY);

  assert.equal(remaining.atRiskRituals.length, 0, "the dismissed ritual is gone");
  assert.equal(remaining.overdueMilestones.length, 1, "the untouched milestone stays");
  assert.equal(remaining.missedTasks.length, 1, "the untouched missed task stays");
});

test("dismissing one row deletes nothing underneath it", () => {
  const before = busySchedule();
  const key = milestoneOverdueKey("late", "2026-08-20");
  const after = dismissAttentionKey(before, key, TODAY);
  assert.deepEqual(after.milestones, before.milestones);
  assert.deepEqual(after.rituals, before.rituals);
});

test("a schedule with nothing dismissed yet still accepts a single dismissal", () => {
  const before = schedule(); // preferences: {} — no acknowledgedAttention array at all
  const after = dismissAttentionKey(before, milestoneOverdueKey("m1", "2026-08-20"), TODAY);
  assert.deepEqual(after.preferences.acknowledgedAttention, [milestoneOverdueKey("m1", "2026-08-20")]);
});

// ── What must come back ──────────────────────────────────────────────────────

test("a dismissed routine warning returns the next day", () => {
  const before = busySchedule();
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  // Same routine, still unfinished, but a new day: the key no longer matches.
  const tomorrow = selectNeedsAttention(
    { ...after, ritualCompletions: [...after.ritualCompletions, { ritualId: "r1", date: TODAY }] },
    "2026-09-20",
  );
  assert.equal(tomorrow.atRiskRituals.length, 1);
});

test("a dismissed overdue milestone returns once its target moves and it slips again", () => {
  const before = busySchedule();
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  assert.equal(selectNeedsAttention(after, TODAY).overdueMilestones.length, 0);

  // The user extended the target; it then passed again. That is a new fact.
  const moved = {
    ...after,
    milestones: after.milestones.map((m) =>
      m.id === "late" ? { ...m, plannedEndDate: "2026-09-10" } : m,
    ),
  };
  assert.equal(selectNeedsAttention(moved, TODAY).overdueMilestones.length, 1);
});

test("dismissing 'off pace' does not hide the milestone actually going overdue", () => {
  // Pre-seed only the at-risk key; the overdue filter must ignore it.
  const s = schedule({
    milestones: [milestone({ plannedEndDate: "2026-08-20" })],
    preferences: { acknowledgedAttention: [milestoneRiskKey("m1", "2026-08-20")] },
  });
  assert.equal(selectNeedsAttention(s, TODAY).overdueMilestones.length, 1);
});

// ── Housekeeping ─────────────────────────────────────────────────────────────

test("keys older than the retention window are pruned on write", () => {
  const stale = milestoneOverdueKey("old", "2020-01-01");
  const before = schedule({
    milestones: [milestone({ id: "late", plannedEndDate: "2026-08-20" })],
    preferences: { acknowledgedAttention: [stale] },
  });
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  assert.ok(!after.preferences.acknowledgedAttention.includes(stale));
});

test("a key with no parseable date is dropped rather than kept forever", () => {
  const before = schedule({
    milestones: [milestone({ id: "late", plannedEndDate: "2026-08-20" })],
    preferences: { acknowledgedAttention: ["garbage-no-date"] },
  });
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  assert.ok(!after.preferences.acknowledgedAttention.includes("garbage-no-date"));
});

test("the dismissal set is capped", () => {
  const many = Array.from({ length: MAX_DISMISSALS + 50 }, (_, i) => `ms-late|m${i}|${TODAY}`);
  const before = schedule({
    milestones: [milestone({ id: "late", plannedEndDate: "2026-08-20" })],
    preferences: { acknowledgedAttention: many },
  });
  const after = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  assert.ok(after.preferences.acknowledgedAttention.length <= MAX_DISMISSALS);
});

test("clearing twice does not duplicate keys", () => {
  const before = busySchedule();
  const once = dismissAllAttention(before, selectNeedsAttention(before, TODAY), TODAY);
  const keys = once.preferences.acknowledgedAttention;
  assert.equal(new Set(keys).size, keys.length);
});

test("retention window is a sane, stated number of days", () => {
  assert.ok(DISMISSAL_RETENTION_DAYS >= 7 && DISMISSAL_RETENTION_DAYS <= 365);
});
