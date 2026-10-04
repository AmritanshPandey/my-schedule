/**
 * Coverage for the pattern engine (lib/intelligence/patterns.ts, taskStats.ts)
 * and its suggestion lifecycle (suggestions.ts).
 *
 * What these protect, in order of how badly a regression would hurt:
 *
 *  1. Suggestions never destroy history. Retiming keeps every weekday copy and
 *     its completion log; a stale suggestion (task edited since) changes nothing.
 *  2. The engine doesn't nag. Too little evidence, an old problem that has
 *     since recovered, a "Not now", or a change the user already accepted all
 *     keep an insight off the card.
 *  3. The diagnosis matches the evidence: misses concentrated on certain
 *     weekdays → review those days; a weak time slot with a free strong one →
 *     move there (without double-booking); a long session → make it smaller.
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

const { analyzeExecution, findRetimeTarget } = await import("@/lib/intelligence/patterns.ts");
const { computeTaskStats } = await import("@/lib/intelligence/taskStats.ts");
const { applySuggestion, undoSuggestion, dismissInsight, appliedSince } = await import("@/lib/intelligence/suggestions.ts");
const { parseTimeToMinutes } = await import("@/lib/timeUtils.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-19T18:00:00"); // a Saturday
const TODAY = "2026-09-19";

function weekdayOf(iso) {
  return ALL_DAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];
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

function event(taskId, dateISO, type) {
  return { id: `${taskId}-${dateISO}-${type}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: type };
}

/** One task, outcome decided per date by `outcomeFor(dateISO)` → "task" | "missed" | null. */
function task(id, startTime, endTime, outcomeFor, { days = ALL_DAYS, planId = "p1", lookback = 28 } = {}) {
  const events = recentDates(lookback)
    .filter((d) => days.includes(weekdayOf(d)))
    .map((d) => [d, outcomeFor(d)])
    .filter(([, type]) => type)
    .map(([d, type]) => event(id, d, type));
  return { id, title: id, startTime, endTime, planId, completionHistory: events, _days: days };
}

function schedule(tasks, overrides = {}) {
  const activities = Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
  for (const t of tasks) {
    const { _days, ...clean } = t;
    for (const d of _days) activities[d].push({ ...clean });
  }
  return {
    goals: [],
    goalConnections: [],
    plans: [
      { id: "p1", title: "Fitness", category: "fitness", emoji: "run", color: "emerald", items: [] },
      { id: "p2", title: "Spanish", category: "learning", emoji: "language", color: "blue", items: [] },
    ],
    categories: [],
    activities,
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: { dayStartTime: "5:00 AM" },
    ...overrides,
  };
}

const always = () => "task";
const never = () => "missed";
/** Done only on the oldest days, missed recently — rate ≤ 40%, still slipping. */
const mostlyMissed = (d) => (d < "2026-08-28" ? "task" : "missed");

function insightOf(report, kind) {
  return report.insights.find((i) => i.kind === kind);
}

// ── Evidence rules ───────────────────────────────────────────────────────────

test("task stats count only resolved past occurrences, never today", () => {
  const t = task("read", "8:00 PM", "8:30 PM", (d) => (d === "2026-09-18" ? "task" : null));
  t.completionHistory.push(event("read", TODAY, "missed"));
  const [stats] = computeTaskStats(schedule([t]), NOW);
  assert.equal(stats.resolved, 1, "unmarked days and today are not evidence");
  assert.equal(stats.rate, null, "one outcome is not a rate");
});

test("too little evidence produces no insight", () => {
  const t = task("read", "9:00 PM", "9:30 PM", never, { lookback: 3 });
  const report = analyzeExecution(schedule([t]), NOW);
  assert.equal(report.insights.length, 0);
});

test("an old problem that has recovered is not flagged", () => {
  // Missed for weeks, then done the last three times.
  const recent = new Set(recentDates(3));
  const t = task("read", "9:00 PM", "9:30 PM", (d) => (recent.has(d) ? "task" : "missed"));
  const report = analyzeExecution(schedule([t]), NOW);
  assert.equal(insightOf(report, "chronic_miss"), undefined);
});

test("paused plans are left alone entirely", () => {
  const s = schedule([task("drill", "9:00 PM", "9:30 PM", never, { planId: "p2" })]);
  s.plans[1].status = "paused";
  assert.equal(analyzeExecution(s, NOW).insights.length, 0);
});

// ── Diagnosis ────────────────────────────────────────────────────────────────

test("misses concentrated on certain weekdays → review those days, not a blanket move", () => {
  const t = task(
    "gym",
    "6:00 PM",
    "7:00 PM",
    (d) => (weekdayOf(d) === "monday" ? "task" : "missed"),
    { days: ["monday", "wednesday", "friday"] },
  );
  const insight = insightOf(analyzeExecution(schedule([t]), NOW), "chronic_miss");
  assert.ok(insight, "a 1-in-3 task is slipping");
  assert.equal(insight.suggestion.kind, "review_task");
  assert.match(insight.detail, /Wednesdays and Fridays run at 0%/);
  assert.match(insight.detail, /other days at 100%/);
});

test("a weak time slot with a free strong one → move there without double-booking", () => {
  const run = task("run", "7:00 AM", "7:45 AM", always);
  const review = task("review", "9:30 PM", "10:00 PM", mostlyMissed);
  const s = schedule([run, review]);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");

  assert.ok(insight);
  assert.equal(insight.subjectId, "review");
  assert.equal(insight.suggestion.kind, "retime");
  assert.match(insight.detail, /late at night/);

  const start = parseTimeToMinutes(insight.suggestion.to.startTime);
  const end = parseTimeToMinutes(insight.suggestion.to.endTime);
  assert.equal(end - start, 30, "duration is preserved");
  assert.ok(start >= 5 * 60 && start < 9 * 60, "lands in the early-morning band, after day start");
  const runStart = 7 * 60, runEnd = 7 * 60 + 45;
  assert.ok(end <= runStart || start >= runEnd, `must not overlap the run (${insight.suggestion.to.startTime})`);
});

test("no retime is offered when the strong band has no room", () => {
  // The early band is wall-to-wall.
  const blocks = [
    task("a", "5:00 AM", "7:00 AM", always),
    task("b", "7:00 AM", "9:00 AM", always),
  ];
  const review = task("review", "9:30 PM", "10:30 PM", mostlyMissed);
  const s = schedule([...blocks, review]);
  const [stats] = computeTaskStats(s, NOW).filter((x) => x.taskId === "review");
  assert.equal(findRetimeTarget(s, stats, "early", computeTaskStats(s, NOW), TODAY), null);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  assert.notEqual(insight.suggestion.kind, "retime");
});

test("a long session with nowhere better to go → offer a smaller one", () => {
  const t = task("deep work", "2:00 PM", "3:30 PM", mostlyMissed);
  const insight = insightOf(analyzeExecution(schedule([t]), NOW), "chronic_miss");
  assert.equal(insight.suggestion.kind, "shorten");
  assert.equal(parseTimeToMinutes(insight.suggestion.to.startTime), 14 * 60, "start stays put");
  assert.equal(parseTimeToMinutes(insight.suggestion.to.endTime), 14 * 60 + 45, "90 min → 45 min");
  assert.equal(insight.suggestion.label, "Shorten to 45 min");
  assert.match(insight.suggestion.changes[0], /2:00 PM – 2:45 PM/, "copy uses unpadded display times");
});

test("tasks with custom per-day times are never adjusted automatically", () => {
  const t = task("deep work", "2:00 PM", "3:30 PM", mostlyMissed);
  const s = schedule([t]);
  s.activities.tuesday = s.activities.tuesday.map((x) => ({ ...x, startTime: "4:00 PM", endTime: "5:30 PM" }));
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  assert.equal(insight.suggestion.kind, "review_task");
});

test("a plan gone quiet while others move → pause it, and its tasks aren't double-reported", () => {
  const s = schedule([
    task("run", "7:00 AM", "7:30 AM", always),
    task("drill", "8:00 PM", "8:30 PM", never, { planId: "p2" }),
  ]);
  const report = analyzeExecution(s, NOW);
  const stalled = insightOf(report, "stalled_plan");
  assert.ok(stalled);
  assert.equal(stalled.suggestion.kind, "pause_plan");
  assert.equal(stalled.subjectId, "p2");
  assert.equal(report.insights.filter((i) => i.kind === "chronic_miss" && i.subjectId === "drill").length, 0);
});

test("when nothing at all is getting done, no single plan is blamed", () => {
  const s = schedule([task("drill", "8:00 PM", "8:30 PM", never, { planId: "p2" })]);
  assert.equal(insightOf(analyzeExecution(s, NOW), "stalled_plan"), undefined);
});

test("a real run is reported as a win", () => {
  const report = analyzeExecution(schedule([task("run", "7:00 AM", "7:30 AM", always)]), NOW);
  const run = report.wins.find((w) => w.id.startsWith("momentum:run:"));
  assert.ok(run);
  assert.match(run.title, /28 in a row/);
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

test("accepting a retime moves every copy, keeps every copy's history, and starts a fresh experiment", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  const next = applySuggestion(s, insight, TODAY);

  for (const day of ALL_DAYS) {
    const before = s.activities[day].find((t) => t.id === "review");
    const after = next.activities[day].find((t) => t.id === "review");
    assert.equal(after.startTime, insight.suggestion.to.startTime);
    assert.deepEqual(after.completionHistory, before.completionHistory, `${day}'s history is untouched`);
  }
  assert.equal(appliedSince(next).get("review"), TODAY);
  assert.equal(
    analyzeExecution(next, NOW).insights.some((i) => i.subjectId === "review"),
    false,
    "the fixed task isn't flagged again on the strength of misses from before the fix",
  );
});

test("a suggestion goes stale if the task was edited since it was built", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  const edited = {
    ...s,
    activities: Object.fromEntries(
      ALL_DAYS.map((d) => [d, s.activities[d].map((t) => (t.id === "review" ? { ...t, startTime: "8:00 PM", endTime: "8:30 PM" } : t))]),
    ),
  };
  assert.equal(applySuggestion(edited, insight, TODAY), edited);
});

test("accepting a pause pauses the plan and nothing else", () => {
  const s = schedule([task("run", "7:00 AM", "7:30 AM", always), task("drill", "8:00 PM", "8:30 PM", never, { planId: "p2" })]);
  const stalled = insightOf(analyzeExecution(s, NOW), "stalled_plan");
  const next = applySuggestion(s, stalled, TODAY);
  assert.equal(next.plans.find((p) => p.id === "p2").status, "paused");
  assert.deepEqual(next.activities, s.activities);
});

test("'Not now' hides an insight for this week only", () => {
  const s = schedule([task("deep work", "2:00 PM", "3:30 PM", mostlyMissed)]);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  const dismissed = dismissInsight(s, insight, TODAY);
  assert.equal(insightOf(analyzeExecution(dismissed, NOW), "chronic_miss"), undefined);

  // Same data, a week later: the problem is still real, so it returns.
  const nextWeek = new Date("2026-09-21T18:00:00");
  const shifted = schedule([task("deep work", "2:00 PM", "3:30 PM", never)], { preferences: dismissed.preferences });
  assert.ok(insightOf(analyzeExecution(shifted, nextWeek), "chronic_miss"));
});

test("undo reverses exactly what was applied and lets the insight return", () => {
  const s = schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);
  const insight = insightOf(analyzeExecution(s, NOW), "chronic_miss");
  const undone = undoSuggestion(applySuggestion(s, insight, TODAY), insight, TODAY);
  for (const day of ALL_DAYS) {
    const t = undone.activities[day].find((x) => x.id === "review");
    assert.equal(t.startTime, "9:30 PM");
    assert.equal(t.endTime, "10:00 PM");
  }
  assert.deepEqual(undone.preferences.acknowledgedAttention ?? [], []);
  assert.ok(insightOf(analyzeExecution(undone, NOW), "chronic_miss"));

  const quiet = schedule([task("run", "7:00 AM", "7:30 AM", always), task("drill", "8:00 PM", "8:30 PM", never, { planId: "p2" })]);
  const stalled = insightOf(analyzeExecution(quiet, NOW), "stalled_plan");
  const resumed = undoSuggestion(applySuggestion(quiet, stalled, TODAY), stalled, TODAY);
  assert.equal(resumed.plans.find((p) => p.id === "p2").status ?? "active", "active");
});

