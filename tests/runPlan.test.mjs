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
const R = await import("@/lib/runPlan.ts");
const S = await import("@/lib/sessions.ts");
const { TEMPLATES } = await import("@/lib/templates.ts");

const NOW = "2026-11-14T09:00:00.000Z";
const TODAY = "2026-11-14";
const INPUTS = {
  currentDistanceKm: 3, easyPaceSecPerKm: 360, targetDistanceKm: 5, targetPaceSecPerKm: 330,
  weeks: 8, runDays: ["monday", "wednesday", "friday", "sunday"], startISO: "2026-11-16", startTime: "18:00",
};
const DOW = { 0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday", 6: "saturday" };
const dow = (iso) => DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const km = (s) => S.plannedDistanceM(s) / 1000;
const byWeek = (sessions) => {
  const weeks = new Map();
  for (const s of sessions) weeks.set(s.generated.weekIndex, [...(weeks.get(s.generated.weekIndex) ?? []), s]);
  return [...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
};
const total = (week) => week.reduce((n, s) => n + km(s), 0);
const quality = (week) => week.find((s) => s.routineKey === "intervals" || s.routineKey === "tempo");
const qualityPace = (s) => s.tasks.find((t) => t.kind === "distance" && t.plan.paceSecPerKm).plan.paceSecPerKm;

test("validateRunInputs refuses inputs that can't make a sound plan", () => {
  assert.equal(R.validateRunInputs({ ...INPUTS, weeks: 3 }, TODAY), "Choose 4 to 16 weeks.");
  assert.equal(R.validateRunInputs({ ...INPUTS, weeks: 17 }, TODAY), "Choose 4 to 16 weeks.");
  assert.equal(R.validateRunInputs({ ...INPUTS, runDays: ["monday", "friday"] }, TODAY), "Pick 3 to 5 run days.");
  assert.equal(R.validateRunInputs({ ...INPUTS, runDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] }, TODAY), "Pick 3 to 5 run days.");
  assert.equal(R.validateRunInputs({ ...INPUTS, targetDistanceKm: 2 }, TODAY), "Your target should be at least your current distance.");
  assert.equal(R.validateRunInputs({ ...INPUTS, startISO: "2026-11-13" }, TODAY), "Start today or later.");
  assert.equal(R.validateRunInputs({ ...INPUTS, currentDistanceKm: 0 }, TODAY), "Enter how far you can run now.");
  assert.equal(R.validateRunInputs({ ...INPUTS, easyPaceSecPerKm: 0 }, TODAY), "Enter your easy pace.");
  assert.equal(R.validateRunInputs(INPUTS, TODAY), null);
});

test("8 weeks of 4 runs: dates, volume caps, easier weeks, taper and race", () => {
  const sessions = R.generateRunPlan(INPUTS, [], "p1", NOW);
  assert.equal(sessions.length, 32);
  for (const s of sessions) {
    assert.ok(INPUTS.runDays.includes(dow(s.dateISO)), `${s.dateISO} is not a run day`);
    assert.ok(s.dateISO >= INPUTS.startISO);
    assert.equal(s.startTime, "18:00");
    assert.equal(s.status, "planned");
  }
  const weeks = byWeek(sessions);
  assert.equal(weeks.length, 8);
  const totals = weeks.map(total);
  let lastBuild = totals[0];
  for (let w = 1; w < 8; w++) {
    assert.ok(totals[w] <= lastBuild * 1.1 + 0.5, `week ${w + 1} ${totals[w]} km jumps over ${lastBuild} km`);
    if ((w + 1) % 4 !== 0 && w !== 7) lastBuild = totals[w];
  }
  assert.ok(totals[3] < totals[2], "week 4 is easier than week 3");
  assert.ok(totals[7] < totals[6], "week 8 tapers");
  const last = sessions[sessions.length - 1];
  assert.equal(last.routineKey, "race");
  assert.equal(km(last), 5);
  assert.equal(last.tasks[0].plan.paceSecPerKm, 330);
  assert.equal(dow(last.dateISO), "sunday");
  for (let w = 0; w < 4; w++) assert.equal(quality(weeks[w]).routineKey, "intervals");
  for (let w = 4; w < 7; w++) assert.equal(quality(weeks[w]).routineKey, "tempo");
  const paces = weeks.slice(0, 7).map((w) => qualityPace(quality(w)));
  for (let i = 1; i < paces.length; i++) assert.ok(paces[i] <= paces[i - 1], `quality pace got slower in week ${i + 1}`);
  for (let w = 0; w < 7; w++) assert.equal(weeks[w].filter((s) => s.routineKey === "long").length, 1);
  assert.ok(Math.max(...weeks[6].map(km)) >= 5, "the long run reaches the target distance before race week");
});

test("the generator is deterministic", () => {
  assert.deepEqual(R.generateRunPlan(INPUTS, [], "p1", NOW), R.generateRunPlan(INPUTS, [], "p1", NOW));
});

test("just finish: no target pace still builds a plan, race has no pace", () => {
  const { targetPaceSecPerKm: _drop, ...rest } = INPUTS;
  const sessions = R.generateRunPlan(rest, [], "p1", NOW);
  const last = sessions[sessions.length - 1];
  assert.equal(last.routineKey, "race");
  assert.equal(last.tasks[0].plan.paceSecPerKm, undefined);
  assert.equal(qualityPace(quality(byWeek(sessions)[0])), 345);
});

function created() {
  const { schedule, planId } = R.createRunPlan(migrate({}), INPUTS, { createGoal: true }, NOW);
  return { schedule, planId };
}

test("createRunPlan adds a plan with its generator, a goal and every session", () => {
  const { schedule, planId } = created();
  const plan = schedule.plans.find((p) => p.id === planId);
  assert.equal(plan.generator.templateId, R.RUN_5K_TEMPLATE_ID);
  assert.deepEqual(plan.generator.inputs, INPUTS);
  assert.equal(plan.category, "fitness");
  assert.equal(schedule.goals.length, 1);
  assert.equal(schedule.goals[0].title, "Run 5 km at 5:30/km");
  assert.equal(plan.goalId, schedule.goals[0].id);
  assert.equal(schedule.sessions.length, 32);
  assert.ok(schedule.sessions.every((s) => s.planId === planId));
});

test("summarizeRunPlan", () => {
  const sum = R.summarizeRunPlan(R.generateRunPlan(INPUTS, [], "p1", NOW));
  assert.equal(sum.weeks, 8);
  assert.equal(sum.runsPerWeek, 4);
  assert.ok(sum.longRunToKm > sum.longRunFromKm);
});

test("an accepted pace change rebuilds future sessions and leaves logged and edited ones alone", () => {
  let { schedule, planId } = created();
  const week3 = schedule.sessions.filter((s) => s.generated.weekIndex === 3);
  schedule = S.logSessionRun(schedule, week3[0].id, { distanceM: 3000, durationSec: 1000 }, undefined, NOW);
  schedule = S.moveSession(schedule, week3[1].id, week3[1].dateISO, "07:00", NOW);
  const keptLogged = schedule.sessions.find((s) => s.id === week3[0].id);
  const keptEdited = schedule.sessions.find((s) => s.id === week3[1].id);
  const beforeQ = qualityPace(quality(byWeek(schedule.sessions)[4]));
  schedule = { ...schedule, planAdjustments: [{ id: "a1", planId, weekIndex: 3, kind: "pace", detail: { paceDeltaSec: -10 }, reason: "", decision: "accepted", createdAt: NOW }] };
  schedule = R.rebuildRunPlan(schedule, planId, TODAY, NOW);
  assert.deepEqual(schedule.sessions.find((s) => s.id === keptLogged.id), keptLogged);
  assert.deepEqual(schedule.sessions.find((s) => s.id === keptEdited.id), keptEdited);
  assert.equal(qualityPace(quality(byWeek(schedule.sessions)[4])), beforeQ - 10);
  assert.equal(schedule.sessions.length, 32);
});

test("an accepted repeat-week adds a week and pushes the race back", () => {
  let { schedule, planId } = created();
  const lastBefore = schedule.sessions.map((s) => s.dateISO).sort().at(-1);
  schedule = { ...schedule, planAdjustments: [{ id: "a1", planId, weekIndex: 3, kind: "repeat-week", detail: {}, reason: "", decision: "accepted", createdAt: NOW }] };
  schedule = R.rebuildRunPlan(schedule, planId, TODAY, NOW);
  const lastAfter = schedule.sessions.map((s) => s.dateISO).sort().at(-1);
  assert.equal(schedule.sessions.length, 36);
  const d = (iso) => new Date(`${iso}T00:00:00Z`).getTime();
  assert.equal((d(lastAfter) - d(lastBefore)) / 86400000, 7);
});

test("updateRunInputs moves future untouched sessions to the new days", () => {
  let { schedule, planId } = created();
  const first = schedule.sessions.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO))[0];
  schedule = S.markSessionDone(schedule, first.id, NOW);
  schedule = R.updateRunInputs(schedule, planId, { runDays: ["tuesday", "thursday", "saturday", "sunday"] }, "2026-11-17", NOW);
  const future = schedule.sessions.filter((s) => s.dateISO >= "2026-11-17" && s.id !== first.id);
  assert.ok(future.every((s) => ["tuesday", "thursday", "saturday", "sunday"].includes(dow(s.dateISO))));
  assert.equal(schedule.sessions.find((s) => s.id === first.id).dateISO, first.dateISO);
  assert.equal(schedule.plans.find((p) => p.id === planId).generator.inputsVersion, 2);
});

test("the fixed Run Training template is gone", () => {
  assert.equal(TEMPLATES.find((t) => t.id === "run-training"), undefined);
});

const { validateSchedule } = await import("@/lib/scheduleSchema.ts");

test("validateRunInputs refuses distances and paces the plan can't be built from", () => {
  assert.equal(R.validateRunInputs({ ...INPUTS, currentDistanceKm: 0.2 }, TODAY), "Start from at least 0.5 km.");
  assert.equal(R.validateRunInputs({ ...INPUTS, easyPaceSecPerKm: 15 }, TODAY), "Enter an easy pace between 3:00 and 15:00 per km.");
  assert.equal(R.validateRunInputs({ ...INPUTS, easyPaceSecPerKm: 1000 }, TODAY), "Enter an easy pace between 3:00 and 15:00 per km.");
  assert.equal(R.validateRunInputs({ ...INPUTS, targetPaceSecPerKm: 60 }, TODAY), "Enter a target pace between 2:30 and 15:00 per km.");
  assert.equal(R.validateRunInputs({ ...INPUTS, targetPaceSecPerKm: Number.NaN }, TODAY), "Enter a target pace between 2:30 and 15:00 per km.");
});

test("validateRunInputs refuses a target too far for the weeks given", () => {
  assert.equal(
    R.validateRunInputs({ ...INPUTS, currentDistanceKm: 3, targetDistanceKm: 21, weeks: 4 }, TODAY),
    "That's a big jump for 4 weeks. Add weeks or lower the target.",
  );
  assert.equal(R.validateRunInputs({ ...INPUTS, currentDistanceKm: 3, targetDistanceKm: 5, weeks: 8 }, TODAY), null);
});

test("every plan the inputs allow passes the schedule schema", () => {
  for (const currentDistanceKm of [0.5, 1, 3, 8]) {
    for (const easyPaceSecPerKm of [180, 360, 900]) {
      for (const weeks of [4, 8, 16]) {
        for (const runDays of [["monday", "wednesday", "friday"], ["monday", "tuesday", "thursday", "saturday", "sunday"]]) {
          for (const targetPaceSecPerKm of [undefined, 150, 900]) {
            const inputs = { currentDistanceKm, easyPaceSecPerKm, targetDistanceKm: currentDistanceKm + 2, weeks, runDays, startISO: "2026-11-16", ...(targetPaceSecPerKm ? { targetPaceSecPerKm } : {}) };
            if (R.validateRunInputs(inputs, TODAY)) continue;
            const { schedule } = R.createRunPlan(migrate({}), inputs, { createGoal: true }, NOW);
            const result = validateSchedule(schedule);
            assert.ok(result.success, `${JSON.stringify(inputs)} → ${result.success ? "" : result.error.issues[0].path.join(".") + " " + result.error.issues[0].message}`);
          }
        }
      }
    }
  }
});

test("the long run is never shorter than the week's easy runs", () => {
  const sessions = R.generateRunPlan({ ...INPUTS, currentDistanceKm: 1, runDays: ["monday", "wednesday", "friday"] }, [], "p1", NOW);
  for (const week of byWeek(sessions).slice(0, -1)) {
    const long = week.find((s) => s.routineKey === "long");
    for (const s of week.filter((x) => x.routineKey === "easy")) assert.ok(km(long) >= km(s), `long ${km(long)} < easy ${km(s)}`);
  }
});
