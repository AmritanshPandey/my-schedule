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
const { mergeSchedules } = await import("@/lib/mergeSchedule.ts");
const { stampSchedule, entityMap } = await import("@/lib/stampSchedule.ts");
const { validateSchedule } = await import("@/lib/scheduleSchema.ts");
const { migrate } = await import("@/lib/scheduleMigrate.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");
const {
  setLogId, setLogFor, previousSetLog, startingSets, upsertSetLog, setLogSummary, trimSetLogsForSync,
} = await import("@/lib/setLogs.ts");

const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);
const MIN = 60_000;
const sec = (ms) => Math.floor(ms / 1000);
const emptyDays = () => Object.fromEntries(DAYS.map((d) => [d, []]));
const sched = (over = {}) => ({
  goals: [], plans: [], categories: [], activities: emptyDays(), progressTrackers: [], metricEntries: [],
  milestones: [], rituals: [], ritualCompletions: [], notes: [], events: [], preferences: {}, ...over,
});
const side = (schedule, lastUpdated = T0) => ({ schedule, lastUpdated });

const log = (dateISO, sets, over = {}) => ({
  id: setLogId("t1", "s1", dateISO), taskId: "t1", subtaskId: "s1", dateISO, weightUnit: "kg",
  sets, completedAt: `${dateISO}T10:00:00.000Z`, ...over,
});
const done = (weight, reps, over = {}) => ({ weight, reps, done: true, ...over });

// ── Helpers ────────────────────────────────────────────────────────────────

test("a day's session has one id, so saving twice overwrites", () => {
  const first = upsertSetLog(sched(), log("2026-10-20", [done(60, 10)]));
  const again = upsertSetLog(first, log("2026-10-20", [done(60, 10), done(60, 9)]));
  assert.equal(again.setLogs.length, 1);
  assert.equal(again.setLogs[0].sets.length, 2);
  assert.equal(setLogFor(again.setLogs, "t1", "s1", "2026-10-20").sets.length, 2);
  assert.equal(upsertSetLog(again, log("2026-10-20", [])).setLogs.length, 0, "an empty session removes the row");
});

test("Previous is the latest earlier session that logged something", () => {
  const logs = [
    log("2026-10-13", [done(57.5, 10)]),
    log("2026-10-16", [done(60, 10)]),
    log("2026-10-18", [{ weight: 62.5, reps: 10, done: false }]),
    log("2026-10-20", [done(62.5, 8)]),
  ];
  assert.equal(previousSetLog(logs, "t1", "s1", "2026-10-20").dateISO, "2026-10-16", "an opened-but-empty day is skipped");
  assert.equal(previousSetLog(logs, "t1", "s1", "2026-10-13"), null);
  assert.equal(previousSetLog(logs, "t1", "other", "2026-10-30"), null);
});

test("a new session starts from the targets, then from the last session's shape", () => {
  assert.deepEqual(startingSets({ sets: 3, reps: 10, weight: 60 }, null), [
    { weight: 60, reps: 10, done: false }, { weight: 60, reps: 10, done: false }, { weight: 60, reps: 10, done: false },
  ]);
  const prev = log("2026-10-16", [done(40, 12, { warmup: true }), done(55, 10), done(57.5, 8)]);
  assert.deepEqual(startingSets({}, prev), [{ weight: 55, reps: 10, done: false }, { weight: 57.5, reps: 8, done: false }],
    "no target set count: follow the last session's working sets");
  assert.deepEqual(startingSets({ minutes: 30 }, null), [{ minutes: 30, done: false }], "timed work logs minutes");
  assert.deepEqual(startingSets({}, null), [{ done: false }]);
});

test("the summary counts done working sets only", () => {
  const summary = setLogSummary(log("2026-10-20", [done(40, 12, { warmup: true }), done(60, 10), done(62.5, 8), { weight: 65, reps: 5, done: false }]));
  assert.deepEqual(summary, { sets: 2, reps: 18, topWeight: 62.5 });
});

test("the cloud trim keeps 90 days, plus each subtask's latest session", () => {
  const logs = [
    log("2026-01-05", [done(40, 10)]),
    log("2026-03-01", [done(45, 10)]),
    log("2026-03-01", [done(20, 10)], { id: "t1~s2~2026-03-01", subtaskId: "s2" }),
    log("2026-03-01", [done(30, 10)], { id: "t1~s3~2026-03-01", subtaskId: "s3" }),
    log("2026-10-01", [done(60, 10)], { id: "t1~s3~2026-10-01", subtaskId: "s3" }),
  ];
  const kept = trimSetLogsForSync(logs, "2026-08-01").map((l) => l.id);
  assert.deepEqual(kept, ["t1~s1~2026-03-01", "t1~s2~2026-03-01", "t1~s3~2026-10-01"]);
  assert.equal(trimSetLogsForSync(undefined, "2026-08-01"), undefined);
});

// ── Sync: both new collections ─────────────────────────────────────────────

const step = (over = {}) => ({
  id: "t1~s1~2026-10-12", taskId: "t1", subtaskId: "s1", periodStartISO: "2026-10-12", decision: "accepted",
  to: { weight: 63 }, decidedAt: "2026-10-19T09:00:00.000Z", ...over,
});

test("set logs and progression steps get sync identities", () => {
  const keys = [...entityMap(sched({ setLogs: [log("2026-10-20", [done(60, 10)])], progressionSteps: [step()] })).keys()];
  assert.ok(keys.includes(`s|${setLogId("t1", "s1", "2026-10-20")}`));
  assert.ok(keys.includes("ps|t1~s1~2026-10-12"));
});

test("a merge keeps both devices' sessions and decisions", () => {
  const a = sched({ setLogs: [log("2026-10-20", [done(60, 10)])], progressionSteps: [step()] });
  const b = sched({ setLogs: [log("2026-10-21", [done(62.5, 10)], { id: setLogId("t1", "s1", "2026-10-21") })] });
  const merged = mergeSchedules(side(a, T0), side(b, T0 + MIN));
  assert.equal(merged.setLogs.length, 2);
  assert.equal(merged.progressionSteps.length, 1);
  assert.equal(validateSchedule(merged).success, true);
});

test("an undone accept stays undone across a merge — its tombstone wins", () => {
  const accepted = sched({ progressionSteps: [step()] });
  const undone = stampSchedule(accepted, sched({ progressionSteps: [] }), T0 + MIN);
  assert.ok(undone.syncMeta.deleted["ps|t1~s1~2026-10-12"], "removing a step stamps a tombstone");
  const merged = mergeSchedules(side(accepted, T0), side(undone, T0 + MIN));
  assert.deepEqual(merged.progressionSteps, []);
});

test("accept then hold of the same period is one record, latest decision wins", () => {
  const acc = stampSchedule(sched(), sched({ progressionSteps: [step()] }), T0);
  const held = stampSchedule(acc, sched({ progressionSteps: [step({ decision: "held", decidedAt: "2026-10-19T09:05:00.000Z" })] }), T0 + 5 * MIN);
  const merged = mergeSchedules(side(acc, T0), side(held, T0 + 5 * MIN));
  assert.equal(merged.progressionSteps.length, 1);
  assert.equal(merged.progressionSteps[0].decision, "held");
});

test("migrate keeps both collections and drops rows it can't identify", () => {
  const raw = sched({
    setLogs: [log("2026-10-20", [done(60, 10), { reps: 3 }]), { id: "bad", taskId: "t1" }],
    progressionSteps: [step(), { ...step(), decision: "maybe" }],
  });
  const migrated = migrate(raw);
  assert.equal(migrated.setLogs.length, 1);
  assert.equal(migrated.setLogs[0].sets.length, 1, "a set without a done flag is dropped");
  assert.equal(migrated.progressionSteps.length, 1);
  assert.equal(validateSchedule(migrated).success, true);
  assert.deepEqual(migrate(sched()).setLogs, [], "older schedules get empty collections");
});
