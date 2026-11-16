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
const H = await import("@/packages/core/lib/healthMatch.ts");

const NOW = "2026-11-18T22:00:00.000Z";
const plan = { id: "p1", title: "Run a 5K", emoji: "run", category: "fitness", color: "amber", items: [] };
const localMs = (iso, hh, mm) => new Date(`${iso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`).getTime();

function session(id, km, over = {}) {
  return {
    id, planId: "p1", routineKey: "easy", title: "Easy run", dateISO: "2026-11-18",
    tasks: [{ id: `${id}-t`, kind: "distance", title: "Easy", plan: { distanceM: km * 1000 } }],
    status: "planned", createdAt: NOW, updatedAt: NOW, ...over,
  };
}
const schedule = (sessions) => ({ ...migrate({}), plans: [plan], sessions });
const run = (id, ms, km, sec) => ({ id, startMs: ms, distanceM: km * 1000, durationSec: sec });

test("localDateOf uses the device's local date", () => {
  assert.equal(H.localDateOf(localMs("2026-11-18", 23, 40)), "2026-11-18");
  assert.equal(H.localDateOf(localMs("2026-11-19", 0, 10)), "2026-11-19");
});

test("a run finished late at night fills that day's session", () => {
  const { schedule: s, matched } = H.applyHealthRuns(schedule([session("a", 3)]), [run("w1", localMs("2026-11-18", 23, 10), 3.1, 1100)], NOW);
  assert.equal(matched, 1);
  assert.equal(s.sessions[0].status, "done");
  const log = s.sessionLogs[0];
  assert.equal(log.source, "health");
  assert.equal(log.healthWorkoutId, "w1");
  assert.deepEqual(log.actual, { distanceM: 3100, durationSec: 1100 });
});

test("with two sessions in a day, the run fills the closest distance", () => {
  const { schedule: s } = H.applyHealthRuns(schedule([session("easy", 3), session("long", 5, { routineKey: "long" })]), [run("w1", localMs("2026-11-18", 8, 0), 5.1, 1800)], NOW);
  assert.equal(s.sessions.find((x) => x.id === "long").status, "done");
  assert.equal(s.sessions.find((x) => x.id === "easy").status, "planned");
});

test("the same workout is only ever logged once", () => {
  const runs = [run("w1", localMs("2026-11-18", 8, 0), 3, 1080)];
  const first = H.applyHealthRuns(schedule([session("a", 3)]), runs, NOW);
  const second = H.applyHealthRuns(first.schedule, runs, NOW);
  assert.equal(second.matched, 0);
  assert.equal(second.schedule.sessionLogs.length, 1);
});

test("a workout undone back to planned is not imported again", () => {
  const runs = [run("w1", localMs("2026-11-18", 8, 0), 3, 1080)];
  let s = H.applyHealthRuns(schedule([session("a", 3)]), runs, NOW).schedule;
  s = S.undoSessionDone(s, "a", NOW);
  const again = H.applyHealthRuns(s, runs, NOW);
  assert.equal(again.matched, 0);
  assert.equal(again.schedule.sessions[0].status, "planned");
});

test("a marked-done session gains Health's numbers", () => {
  let s = S.markSessionDone(schedule([session("a", 3)]), "a", NOW);
  s = H.applyHealthRuns(s, [run("w1", localMs("2026-11-18", 8, 0), 3, 1080)], NOW).schedule;
  assert.deepEqual(s.sessionLogs.map((l) => l.source).sort(), ["health", "mark"]);
  assert.equal(S.actualFor(s, "a").source, "health");
});

test("a run on a day with no session changes nothing", () => {
  const s0 = schedule([session("a", 3)]);
  const out = H.applyHealthRuns(s0, [run("w1", localMs("2026-11-20", 8, 0), 3, 1080)], NOW);
  assert.equal(out.matched, 0);
  assert.equal(out.schedule, s0);
});
