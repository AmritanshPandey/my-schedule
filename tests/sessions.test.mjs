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
const S = await import("@/lib/sessions.ts");

const NOW = "2026-11-18T12:00:00.000Z";
const dist = (id, title, distanceM, extra = {}) => ({ id, kind: "distance", title, plan: { distanceM, ...extra } });

function session(id, over = {}) {
  return {
    id, planId: "p1", routineKey: "easy", title: "Easy run", dateISO: "2026-11-18",
    tasks: [dist(`${id}-t`, "Easy", 3000)], status: "planned",
    createdAt: NOW, updatedAt: NOW, ...over,
  };
}

function base(over = {}) {
  return { ...migrate({}), plans: [{ id: "p1", title: "5K", emoji: "🏃", category: "fitness", color: "emerald", items: [] }], ...over };
}

test("sessionState: planned yesterday is missed, today is planned", () => {
  assert.equal(S.sessionState(session("a", { dateISO: "2026-11-17" }), "2026-11-18"), "missed");
  assert.equal(S.sessionState(session("a"), "2026-11-18"), "planned");
  assert.equal(S.sessionState(session("a", { status: "done", dateISO: "2026-11-01" }), "2026-11-18"), "done");
});

test("sessionsForDate orders timed sessions by time, then untimed", () => {
  const s = base({ sessions: [session("late", { startTime: "18:00" }), session("any"), session("early", { startTime: "07:00" }), session("other", { dateISO: "2026-11-19" })] });
  assert.deepEqual(S.sessionsForDate(s, "2026-11-18").map((x) => x.id), ["early", "late", "any"]);
});

test("actualFor prefers a manual or health log over a mark", () => {
  const sess = session("a", { status: "done" });
  const mark = { id: "m", sessionId: "a", source: "mark", loggedAt: "2026-11-18T10:00:00.000Z" };
  const manual = { id: "n", sessionId: "a", source: "manual", actual: { distanceM: 3100, durationSec: 1100 }, loggedAt: "2026-11-18T11:00:00.000Z" };
  const health = { id: "h", sessionId: "a", source: "health", actual: { distanceM: 3050, durationSec: 1090 }, healthWorkoutId: "w", loggedAt: "2026-11-18T09:00:00.000Z" };
  assert.equal(S.actualFor(base({ sessions: [sess], sessionLogs: [mark, manual] }), "a").id, "n");
  assert.equal(S.actualFor(base({ sessions: [sess], sessionLogs: [mark, health] }), "a").id, "h");
  assert.equal(S.actualFor(base({ sessions: [sess], sessionLogs: [mark] }), "a").id, "m");
});

test("paceSecPerKm", () => {
  assert.equal(S.paceSecPerKm({ distanceM: 5000, durationSec: 1650 }), 330);
});

test("validateRunLog refuses blank distance or time", () => {
  assert.equal(S.validateRunLog({ distanceKm: 0, minutes: 30, seconds: 0 }), "Enter how far you ran.");
  assert.equal(S.validateRunLog({ distanceKm: Number.NaN, minutes: 30, seconds: 0 }), "Enter how far you ran.");
  assert.equal(S.validateRunLog({ distanceKm: 5, minutes: 0, seconds: 0 }), "Enter how long it took.");
  assert.equal(S.validateRunLog({ distanceKm: 5, minutes: 27, seconds: 30 }), null);
});

test("markSessionDone logs a mark and leaves the plan untouched", () => {
  const s0 = base({ sessions: [session("a")] });
  const s1 = S.markSessionDone(s0, "a", NOW);
  assert.equal(s1.sessions[0].status, "done");
  assert.deepEqual(s1.sessions[0].tasks, s0.sessions[0].tasks);
  assert.equal(s1.sessionLogs.length, 1);
  assert.equal(s1.sessionLogs[0].source, "mark");
});

test("logSessionRun replaces an earlier typed log for the same session", () => {
  let s = base({ sessions: [session("a")] });
  s = S.logSessionRun(s, "a", { distanceM: 3000, durationSec: 1080 }, undefined, NOW);
  s = S.logSessionRun(s, "a", { distanceM: 3200, durationSec: 1100, effort: "hard" }, "windy", "2026-11-18T13:00:00.000Z");
  const manual = s.sessionLogs.filter((l) => l.source === "manual");
  assert.equal(manual.length, 1);
  assert.equal(manual[0].actual.distanceM, 3200);
  assert.equal(manual[0].note, "windy");
  assert.equal(s.sessions[0].status, "done");
});

test("undoSessionDone returns to planned and hides the actual", () => {
  let s = base({ sessions: [session("a")] });
  s = S.logSessionRun(S.markSessionDone(s, "a", NOW), "a", { distanceM: 3000, durationSec: 1080 }, undefined, NOW);
  s = S.undoSessionDone(s, "a", NOW);
  assert.equal(s.sessions[0].status, "planned");
  assert.equal(S.actualFor(s, "a"), undefined);
});

test("skipSession and moveSession", () => {
  let s = base({ sessions: [session("a"), session("b")] });
  s = S.skipSession(s, "a", NOW);
  s = S.moveSession(s, "b", "2026-11-19", "07:30", NOW);
  assert.equal(s.sessions[0].status, "skipped");
  assert.equal(s.sessions[1].dateISO, "2026-11-19");
  assert.equal(s.sessions[1].startTime, "07:30");
  assert.equal(s.sessions[1].editedAt, NOW);
});

test("deletePlanSessions keeps done history and drops the rest", () => {
  let s = base({
    sessions: [session("done1", { dateISO: "2026-11-16" }), session("future", { dateISO: "2026-11-20" }), session("other", { planId: "p2" })],
    planAdjustments: [{ id: "a1", planId: "p1", weekIndex: 2, kind: "pace", detail: {}, reason: "", decision: "pending", createdAt: NOW }],
  });
  s = S.markSessionDone(s, "done1", NOW);
  s = { ...S.deletePlanSessions(s, "p1"), plans: [] };
  assert.deepEqual(s.sessions.map((x) => x.id), ["done1", "other"]);
  assert.equal(s.sessionLogs.length, 1);
  assert.deepEqual(s.planAdjustments, []);
  assert.deepEqual(S.sessionsForDate(s, "2026-11-16").map((x) => x.id), ["done1"]);
  assert.equal(S.sessionState(s.sessions[0], "2026-11-18"), "done");
  assert.deepEqual(S.sessionsForDate(s, "2026-11-18").map((x) => x.id), []);
});

test("headline describes the planned run", () => {
  const sess = session("a", {
    tasks: [dist("t1", "Easy", 1000), dist("t2", "Intervals", 400, { repeats: 4, paceSecPerKm: 340 }), dist("t3", "Easy", 1000)],
  });
  assert.equal(S.headline(sess), "1 km easy · 4 × 400 m @ 5:40/km · 1 km easy");
  assert.equal(S.headline(session("b", { tasks: [dist("t", "Tempo", 2500, { paceSecPerKm: 330 })] })), "2.5 km @ 5:30/km");
  assert.equal(S.headline(session("c", { tasks: [{ id: "s", kind: "simple", title: "Stretch" }] })), "Stretch");
});

test("validateRunLog refuses values that round to nothing or go negative", () => {
  assert.equal(S.validateRunLog({ distanceKm: 0.0004, minutes: 10, seconds: 0 }), "Enter how far you ran.");
  assert.equal(S.validateRunLog({ distanceKm: 3, minutes: Number.NaN, seconds: 0.4 }), "Enter how long it took.");
  assert.equal(S.validateRunLog({ distanceKm: 3, minutes: -5, seconds: 400 }), "Enter how long it took.");
  assert.equal(S.validateRunLog({ distanceKm: 3, minutes: 10, seconds: -1 }), "Enter how long it took.");
});
