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
const { validateSchedule } = await import("@/lib/scheduleSchema.ts");
const { mergeSchedules } = await import("@/lib/mergeSchedule.ts");
const { stampSchedule, entityMap } = await import("@/lib/stampSchedule.ts");

const T0 = Date.UTC(2026, 10, 14, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

function session(id, over = {}) {
  return {
    id,
    planId: "p1",
    routineKey: "intervals",
    title: "Intervals",
    dateISO: "2026-11-18",
    startTime: "18:00",
    estimatedMinutes: 35,
    tasks: [
      { id: `${id}-t1`, kind: "distance", title: "Intervals", plan: { distanceM: 400, paceSecPerKm: 340, repeats: 4, restSec: 90 } },
      { id: `${id}-t2`, kind: "simple", title: "Stretch" },
    ],
    status: "planned",
    createdAt: iso(T0),
    updatedAt: iso(T0),
    ...over,
  };
}

function log(id, sessionId, over = {}) {
  return { id, sessionId, source: "manual", actual: { distanceM: 4000, durationSec: 1500, effort: "ok" }, loggedAt: iso(T0), ...over };
}

function adjustment(id, over = {}) {
  return { id, planId: "p1", weekIndex: 3, kind: "pace", detail: { paceDeltaSec: -10 }, reason: "Faster", decision: "pending", createdAt: iso(T0), ...over };
}

test("migrate fills empty session collections", () => {
  const s = migrate({});
  assert.deepEqual(s.sessions, []);
  assert.deepEqual(s.sessionLogs, []);
  assert.deepEqual(s.planAdjustments, []);
});

test("migrate drops malformed rows", () => {
  const bad = session("bad");
  delete bad.dateISO;
  const s = migrate({
    sessions: [session("s1"), bad],
    sessionLogs: [log("l1", "s1"), { id: "l2", source: "manual", loggedAt: iso(T0) }],
    planAdjustments: [adjustment("a1"), { id: "a2" }],
  });
  assert.deepEqual(s.sessions.map((x) => x.id), ["s1"]);
  assert.deepEqual(s.sessionLogs.map((x) => x.id), ["l1"]);
  assert.deepEqual(s.planAdjustments.map((x) => x.id), ["a1"]);
});

test("validateSchedule accepts sessions", () => {
  const s = { ...migrate({}), sessions: [session("s1")], sessionLogs: [log("l1", "s1")], planAdjustments: [adjustment("a1")] };
  const result = validateSchedule(s);
  assert.ok(result.success, result.success ? "" : result.error.issues[0].message);
});

test("entityMap keys sessions", () => {
  const s = { ...migrate({}), sessions: [session("s1")], sessionLogs: [log("l1", "s1")], planAdjustments: [adjustment("a1")] };
  const keys = [...entityMap(s).keys()];
  assert.ok(keys.includes("ss|s1"));
  assert.ok(keys.includes("sl|l1"));
  assert.ok(keys.includes("pa|a1"));
});

test("merge keeps both devices' logs", () => {
  const base = stampSchedule(migrate({}), { ...migrate({}), sessions: [session("x"), session("y")] }, T0);
  const a = stampSchedule(base, {
    ...base,
    sessions: base.sessions.map((s) => (s.id === "x" ? { ...s, status: "done", updatedAt: iso(T0 + 60_000) } : s)),
    sessionLogs: [log("lx", "x")],
  }, T0 + 60_000);
  const b = stampSchedule(base, {
    ...base,
    sessions: base.sessions.map((s) => (s.id === "x" ? { ...s, title: "Edited later", updatedAt: iso(T0 + 120_000) } : s)),
    sessionLogs: [log("ly", "y")],
  }, T0 + 120_000);
  const merged = mergeSchedules({ schedule: a, lastUpdated: T0 + 60_000 }, { schedule: b, lastUpdated: T0 + 120_000 });
  assert.deepEqual(merged.sessionLogs.map((l) => l.id).sort(), ["lx", "ly"]);
  assert.equal(merged.sessions.find((s) => s.id === "x").title, "Edited later");
});

test("migrate keeps a plan's generator and drops a malformed one", () => {
  const generator = {
    templateId: "run-5k",
    inputs: { currentDistanceKm: 3, easyPaceSecPerKm: 360, targetDistanceKm: 5, targetPaceSecPerKm: 330, weeks: 8, runDays: ["monday", "wednesday", "friday", "sunday"], startISO: "2026-11-16" },
    inputsVersion: 1,
  };
  const plan = (id, gen) => ({ id, title: id, emoji: "🏃", category: "fitness", color: "emerald", items: [], generator: gen });
  const days = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  const s = migrate({ activities: days, plans: [plan("good", generator), plan("bad", { templateId: "run-5k" })] });
  assert.deepEqual(s.plans.find((p) => p.id === "good").generator, generator);
  assert.equal(s.plans.find((p) => p.id === "bad").generator, undefined);
});

test("clearing history resets sessions to planned and drops logs and suggestions", async () => {
  const { clearSessionProgress } = await import("@/lib/sessions.ts");
  const s = { ...migrate({}), sessions: [session("s1", { status: "done" }), session("s2", { status: "skipped" })], sessionLogs: [log("l1", "s1")], planAdjustments: [adjustment("a1")] };
  const out = clearSessionProgress(s);
  assert.deepEqual(out.sessions.map((x) => x.status), ["planned", "planned"]);
  assert.deepEqual(out.sessionLogs, []);
  assert.deepEqual(out.planAdjustments, []);
  assert.deepEqual(out.sessions[0].tasks, s.sessions[0].tasks);
});
