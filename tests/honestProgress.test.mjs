/**
 * Honest progress: Checklist or Steps, partial credit, and carrying work
 * forward (lib/subtaskMode.ts, stepMarks.ts, taskProgress.ts, taskActions.ts).
 *
 * What these protect, in order of how badly a regression would hurt:
 *  1. Finished work stays finished — across days, edits, history trims,
 *     devices and older app versions.
 *  2. A day with some of it done is never scored as nothing.
 *  3. The trend, the week card and Needs attention tell one story.
 *  4. A checklist behaves exactly as it always did.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

function resolveWithTsFallback(url, context, nextResolve) {
  try { return nextResolve(url, context); } catch {
    try { return nextResolve(`${url}.ts`, context); } catch { return nextResolve(`${url}.tsx`, context); }
  }
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return resolveWithTsFallback(new URL(`../${specifier.slice(2)}`, import.meta.url).href, context, nextResolve);
    try { return nextResolve(specifier, context); } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return resolveWithTsFallback(new URL(specifier, context.parentURL).href, context, nextResolve);
      }
      throw error;
    }
  },
});

const core = (name) => import(`@/packages/core/lib/${name}.ts`);
const { subtaskModeOf, doneSubtaskIds, laterMark } = await core("subtaskMode");
const { toggleSubtaskOn, toggleTaskOn, markMissedOn, finishTaskAfter } = await core("taskActions");
const { occurrenceProgress, collectOccurrences } = await core("taskProgress");
const { completionForDate, getTaskSubtaskSummary, isTaskCompleted, resolveTaskState } = await core("taskCompletion");
const { resetStaleCompletions, normalizeTasks } = await core("scheduleNormalize");
const { applyAutoMissed } = await core("consistency/autoMiss");
const { computeExecutionTrend } = await core("executionAnalytics");
const { selectWeekStatus } = await core("overview");
const { selectNeedsAttention } = await core("needsAttention");
const { rescheduleMissedTaskOnce } = await core("missedRecovery");
const { updateTaskDays, duplicateDay } = await core("taskMutations");
const { mergeSchedules } = await core("mergeSchedule");
const { computeSlotReliability } = await core("slotReliability");
const { TaskSchema } = await core("scheduleSchema");
const { subtaskDraftToEntry, entryToSubtaskDraft } = await core("subtaskDraft");
const { localISODate, addDaysToISO } = await core("dateUtils");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TODAY = localISODate(new Date());
const weekday = (iso) => DAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];
const at = (iso, time = "09:30") => new Date(`${iso}T${time}:00`).toISOString();
// Tuesday of a fixed week, for anything that doesn't go through the live clock.
const TUE = "2026-11-24";
const WED = "2026-11-25";

const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, task: `Item ${i + 1}` }));
const task = (o = {}) => ({ id: "t", title: "T", planId: "p", startTime: "9:00 AM", endTime: "10:00 AM", subtasks: items(5), ...o });
const steps = (o = {}) => task({ subtaskMode: "steps", ...o });
const sub = (id, iso) => ({ id: `e-${id}-${iso}`, taskId: "t", completionType: "subtask", subtaskId: id, completedAt: at(iso) });
const missed = (iso, extra = {}) => ({ id: `m-${iso}`, taskId: "t", completionType: "missed", completedAt: at(iso, "12:00"), ...extra });
const mark = (iso, done = true) => ({ done, at: at(iso) });

function schedule(byDay = {}, o = {}) {
  return {
    goals: [], goalConnections: [], plans: [{ id: "p", title: "Plan", items: [], color: "emerald", category: "fitness", emoji: "" }],
    categories: [], progressTrackers: [], metricEntries: [], milestones: [], rituals: [], ritualCompletions: [], notes: [], events: [], sessions: [],
    preferences: {}, activities: { ...Object.fromEntries(DAYS.map((d) => [d, []])), ...byDay }, ...o,
  };
}
const todayDay = weekday(TODAY);
const otherDay = DAYS[(DAYS.indexOf(todayDay) + 2) % 7];
const onToday = (t) => schedule({ [todayDay]: [t] });
const todays = (s) => s.activities[todayDay].find((t) => t.id === "t");

// ── Modes ────────────────────────────────────────────────────────────────────

test("repeating tasks default to a checklist, one-offs to steps, and a choice wins", () => {
  const once = { type: "once", dateISO: TUE };
  assert.equal(subtaskModeOf(task()), "checklist");
  assert.equal(subtaskModeOf(task({ recurrence: once })), "steps");
  assert.equal(subtaskModeOf(task({ recurrence: once, subtaskMode: "checklist" })), "checklist");
  assert.equal(subtaskModeOf(steps()), "steps");
  assert.equal(subtaskModeOf(steps({ taskType: "session" })), "checklist");
  // Template items belong to the plan, not to this task.
  assert.equal(subtaskModeOf(steps({ subtasks: undefined })), "checklist");
});

// ── Steps stay done ──────────────────────────────────────────────────────────

test("a finished step survives the next day, on every weekday copy", () => {
  let s = schedule({ [todayDay]: [steps()], [otherDay]: [steps()] });
  s = toggleSubtaskOn(todayDay, "t", "s1")(s);
  for (const day of [todayDay, otherDay]) assert.deepEqual(doneSubtaskIds(s.activities[day][0]), ["s1"]);
  // Only the copy it was ticked on was worked today.
  assert.equal(todays(s).completed, true);
  assert.ok(!s.activities[otherDay][0].completed);

  const later = resetStaleCompletions(s, addDaysToISO(TODAY, 7));
  assert.deepEqual(todays(later).completedSubtaskIds, []);
  assert.equal(todays(later).completed, false, "the block is open again");
  assert.deepEqual(doneSubtaskIds(todays(later)), ["s1"], "the step is not");
});

test("a checklist still starts fresh", () => {
  let s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(task()));
  assert.deepEqual(doneSubtaskIds(todays(s)), ["s1"]);
  assert.equal(todays(s).subtasks[0].mark, undefined);
  s = resetStaleCompletions(s, addDaysToISO(TODAY, 7));
  assert.deepEqual(doneSubtaskIds(todays(s)), []);
});

test("a finished step survives losing its history to the 90-day trim", () => {
  const s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(steps()));
  assert.deepEqual(doneSubtaskIds({ ...todays(s), completionHistory: [] }), ["s1"]);
});

test("a finished step survives the form, load and validation", () => {
  const s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(steps()));
  const t = todays(s);
  const formed = t.subtasks.map((e) => subtaskDraftToEntry(entryToSubtaskDraft(e)));
  assert.deepEqual(formed[0].mark, t.subtasks[0].mark);
  const [loaded] = normalizeTasks(JSON.parse(JSON.stringify([{ ...t, continuesTaskId: "z" }])), "p");
  assert.equal(loaded.subtaskMode, "steps");
  assert.equal(loaded.continuesTaskId, "z");
  assert.deepEqual(doneSubtaskIds(loaded), ["s1"]);
  const parsed = TaskSchema.safeParse({ ...loaded, completionHistory: [...loaded.completionHistory, missed(TUE, { credit: { done: 4, total: 5 } })] });
  assert.ok(parsed.success, JSON.stringify(parsed.error));
  assert.equal(parsed.data.completionHistory[1].auto, true);
  assert.deepEqual(parsed.data.completionHistory[2].credit, { done: 4, total: 5 });
});

test("a subtask duplicated in the form starts unfinished", () => {
  const finished = { ...items(1)[0], mark: mark(TUE) };
  const copy = { ...entryToSubtaskDraft(finished), id: "copy" };
  assert.equal(subtaskDraftToEntry(copy).mark, undefined);
});

test("an edit opened before a tick doesn't undo it", () => {
  const before = schedule({ [todayDay]: [steps()], [otherDay]: [steps()] });
  const { id: _id, ...stale } = before.activities[todayDay][0];
  const ticked = toggleSubtaskOn(todayDay, "t", "s1")(before);
  const saved = updateTaskDays("t", { ...stale, title: "Renamed" }, [todayDay, otherDay], null)(ticked);
  for (const day of [todayDay, otherDay]) assert.deepEqual(doneSubtaskIds(saved.activities[day][0]), ["s1"]);
  assert.equal(todays(saved).completed, true, "editing the list doesn't reopen a worked block");
});

test("switching a checklist to steps keeps today's ticks as finished", () => {
  const ticked = toggleSubtaskOn(todayDay, "t", "s2")(onToday(task()));
  const { id: _id, ...draft } = todays(ticked);
  const saved = updateTaskDays("t", { ...draft, subtaskMode: "steps" }, [todayDay], null)(ticked);
  assert.deepEqual(doneSubtaskIds(todays(saved)), ["s2"]);
});

test("a duplicate is new work, with nothing finished", () => {
  const s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(steps()));
  const copied = duplicateDay(todayDay, [otherDay])(s);
  const copy = copied.activities[otherDay][0];
  assert.notEqual(copy.id, "t");
  assert.deepEqual(doneSubtaskIds(copy), []);
});

// ── What completes a Steps block ─────────────────────────────────────────────

test("any step finishes a repeating block, and unticking it takes that back", () => {
  let s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(steps()));
  assert.equal(isTaskCompleted(todays(s), 5), true);
  assert.equal(completionForDate(todays(s), TODAY).completed, true);
  s = toggleSubtaskOn(todayDay, "t", "s2")(s);
  s = toggleSubtaskOn(todayDay, "t", "s1")(s);
  assert.equal(isTaskCompleted(todays(s), 5), true, "one step is still done");
  s = toggleSubtaskOn(todayDay, "t", "s2")(s);
  assert.equal(isTaskCompleted(todays(s), 5), false);
  assert.deepEqual(todays(s).completionHistory, []);
  assert.deepEqual(doneSubtaskIds(todays(s)), []);
});

test("unticking never undoes a block marked done by hand", () => {
  let s = toggleTaskOn(todayDay, "t", items(5).map((i) => i.id))(onToday(steps()));
  assert.equal(todays(s).completed, true);
  assert.deepEqual(doneSubtaskIds(todays(s)), [], "marking the block done ticks no steps");
  s = toggleSubtaskOn(todayDay, "t", "s1")(s);
  s = toggleSubtaskOn(todayDay, "t", "s1")(s);
  assert.equal(todays(s).completed, true);
});

test("undoing a block takes back today's steps and leaves earlier ones", () => {
  const list = items(5);
  list[0].mark = mark(addDaysToISO(TODAY, -7));
  let s = toggleSubtaskOn(todayDay, "t", "s2")(onToday(steps({ subtasks: list })));
  s = toggleTaskOn(todayDay, "t", list.map((i) => i.id))(s);
  assert.equal(todays(s).completed, false);
  assert.deepEqual(doneSubtaskIds(todays(s)), ["s1"]);
});

test("missing a block keeps every finished step", () => {
  const list = items(5);
  list[0].mark = mark(addDaysToISO(TODAY, -7));
  const s = markMissedOn(todayDay, "t", list.map((i) => i.id))(onToday(steps({ subtasks: list })));
  assert.equal(todays(s).missed, true);
  assert.deepEqual(doneSubtaskIds(todays(s)), ["s1"]);
});

test("steps finished on other days don't make today partial", () => {
  const list = items(5);
  list[0].mark = mark(addDaysToISO(TODAY, -7));
  const t = steps({ subtasks: list });
  assert.equal(resolveTaskState(t, 5), "incomplete");
  assert.deepEqual(getTaskSubtaskSummary(t, null).completedCount, 1, "the pill counts overall");
});

test("a one-off needs every step, and reads as partial until then", () => {
  const once = steps({ subtasks: items(2), recurrence: { type: "once", dateISO: TODAY } });
  let s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(once));
  assert.equal(todays(s).completed, false);
  assert.equal(resolveTaskState(todays(s), 2), "partial");
  s = toggleSubtaskOn(todayDay, "t", "s2")(s);
  assert.equal(todays(s).completed, true);
});

test("a one-off from before marks keeps what its log says was finished", () => {
  const t = task({ recurrence: { type: "once", dateISO: TUE }, completionHistory: [sub("s1", TUE), sub("s2", TUE)] });
  assert.deepEqual(doneSubtaskIds(t), ["s1", "s2"]);
  // An explicit untick wins over the old log.
  const list = items(5);
  list[0].mark = mark(WED, false);
  assert.deepEqual(doneSubtaskIds({ ...t, subtasks: list }), ["s2"]);
});

// ── Partial credit ───────────────────────────────────────────────────────────

const rollover = (t, o = {}) => applyAutoMissed(schedule({ tuesday: [t] }, { preferences: { lastRolloverISO: TUE }, ...o }), new Date(`${WED}T12:00:00`));
const fourOfFive = () => task({ completionHistory: ["s1", "s2", "s3", "s4"].map((id) => sub(id, TUE)) });

test("4 of 5 is 80%, not a miss, everywhere", () => {
  const s = rollover(fourOfFive());
  const t = s.activities.tuesday[0];
  const p = occurrenceProgress(t, null, TUE);
  assert.deepEqual({ ...p }, { state: "partial", credit: 0.8, done: 4, total: 5 });

  const now = new Date(`${WED}T12:00:00`);
  const trend = computeExecutionTrend(s, 2, now);
  assert.deepEqual([trend.current.completed, trend.current.partial, trend.current.missed, trend.current.pct], [0, 1, 0, 80]);
  const week = selectWeekStatus(s, WED);
  assert.equal(week.verdict, "on-track");
  assert.equal(week.verdictPct, 80);
  assert.equal(week.days[1].pct, 80);
  assert.equal(week.days[1].missed, 0);
  assert.equal(week.partial, 1);
  assert.equal(selectNeedsAttention(s, WED, "wednesday").missedTasks.length, 0);
  const viewed = { ...t, ...completionForDate(t, TUE) };
  assert.equal(resolveTaskState(viewed, 5), "partial");
});

test("the share is kept as it was when the day closed", () => {
  const s = rollover(fourOfFive());
  const t = s.activities.tuesday[0];
  assert.deepEqual(t.completionHistory.at(-1).credit, { done: 4, total: 5 });
  const longer = { ...t, subtasks: [...t.subtasks, ...items(5).map((i) => ({ ...i, id: `x${i.id}` }))] };
  assert.equal(occurrenceProgress(longer, null, TUE).credit, 0.8);
});

test("nothing ticked is still a miss", () => {
  const s = rollover(task());
  assert.equal(occurrenceProgress(s.activities.tuesday[0], null, TUE).state, "missed");
  assert.equal(selectWeekStatus(s, WED).verdict, "behind");
  assert.equal(selectNeedsAttention(s, WED, "wednesday").missedTasks.length, 1);
});

test("the rollover doesn't miss the same day twice", () => {
  const once = rollover(fourOfFive());
  const twice = applyAutoMissed({ ...once, preferences: { lastRolloverISO: TUE } }, new Date(`${WED}T12:00:00`));
  assert.equal(twice.activities.tuesday[0].completionHistory.filter((e) => e.completionType === "missed").length, 1);
});

test("a miss recorded before this release heals when it has ticks", () => {
  const t = { ...fourOfFive(), completionHistory: [...fourOfFive().completionHistory, missed(TUE)] };
  assert.equal(occurrenceProgress(t, null, TUE).credit, 0.8);
  assert.equal(selectWeekStatus(schedule({ tuesday: [t] }), WED).verdictPct, 80);
});

test("marking missed by hand is a miss even after ticks", () => {
  let s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(task()));
  s = markMissedOn(todayDay, "t", items(5).map((i) => i.id))(s);
  assert.equal(occurrenceProgress(todays(s), null, TODAY).state, "missed");
});

test("template items count toward the share", () => {
  const plans = [{ id: "p", title: "Plan", items: items(4), color: "emerald" }];
  const s = rollover(task({ subtasks: undefined, completionHistory: [sub("s1", TUE)] }), { plans });
  assert.deepEqual(s.activities.tuesday[0].completionHistory.at(-1).credit, { done: 1, total: 4 });
  assert.equal(computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current.pct, 25);
});

test("a split day scores the share of its blocks", () => {
  const slots = [{ startTime: "9:00 AM", endTime: "10:00 AM" }, { startTime: "4:00 PM", endTime: "5:00 PM" }];
  const s = rollover(task({ subtasks: [], slots, completionHistory: [{ id: "sl", taskId: "t", completionType: "slot", slotIndex: 0, completedAt: at(TUE) }] }));
  assert.equal(computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current.pct, 50);
  assert.equal(computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current.missed, 0);
});

test("a partly done occurrence shared by weekday copies counts once", () => {
  const t = { ...fourOfFive(), completionHistory: [...fourOfFive().completionHistory, missed(TUE)] };
  const s = schedule({ tuesday: [t], thursday: [{ ...t }] });
  assert.equal(collectOccurrences(s).size, 1);
  const cur = computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current;
  assert.deepEqual([cur.scheduled, cur.partial, cur.missed, cur.pct], [2, 1, 0, 40]);
});

test("done, partial and missed never exceed what was scheduled", () => {
  const mk = (id, history) => ({ ...task({ id }), completionHistory: history.map((e) => ({ ...e, taskId: id })) });
  const s = schedule({ tuesday: [mk("a", [{ ...missed(TUE), id: "1" }]), mk("b", [sub("s1", TUE), { ...missed(TUE), id: "2" }]), mk("c", [{ id: "3", taskId: "c", completionType: "task", completedAt: at(TUE) }])] });
  const cur = computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current;
  assert.deepEqual([cur.completed, cur.partial, cur.missed, cur.scheduled, cur.pct], [1, 1, 1, 3, 40]);
});

test("nothing before the tracking start counts, partial included", () => {
  const s = rollover(fourOfFive());
  s.preferences = { startDate: WED };
  const cur = computeExecutionTrend(s, 2, new Date(`${WED}T12:00:00`)).current;
  assert.deepEqual([cur.partial, cur.missed, cur.pct], [0, 0, 0]);
});

test("today's open work isn't late or partly done yet", () => {
  const s = toggleSubtaskOn(todayDay, "t", "s1")(onToday(task()));
  const week = selectWeekStatus(s, TODAY);
  assert.equal(week.verdict, null);
  assert.equal(week.days.find((d) => d.isToday).partial, 0);
  assert.equal(week.days.find((d) => d.isToday).pct, 20, "its bar fills as you go");
});

test("a partly done slot isn't one to move away from", () => {
  const t = { ...fourOfFive(), completionHistory: [...fourOfFive().completionHistory, missed(TUE)] };
  const r = computeSlotReliability(schedule({ tuesday: [t] }), new Date(`${WED}T12:00:00`));
  assert.equal(r.sampleSize, 1);
  assert.equal(r.byWeekday.tuesday.completed, 1);
});

// ── Repeating steps over time ────────────────────────────────────────────────

test("a repeating block with no step finished is a miss; one step is done", () => {
  assert.equal(occurrenceProgress(rollover(steps()).activities.tuesday[0], null, TUE).state, "missed");
  const worked = steps({ completionHistory: [sub("s1", TUE)] });
  assert.equal(occurrenceProgress(rollover(worked).activities.tuesday[0], null, TUE).state, "done");
});

test("with every step finished there is nothing left to miss", () => {
  const list = items(2).map((i) => ({ ...i, mark: mark("2026-11-17") }));
  const s = rollover(steps({ subtasks: list }));
  assert.equal((s.activities.tuesday[0].completionHistory ?? []).length, 0);
});

test("finishing a task ends every copy on that date and keeps its steps", () => {
  const s = finishTaskAfter("t", TUE)(schedule({ tuesday: [steps()], thursday: [steps()] }));
  assert.equal(s.activities.tuesday[0].activeUntil, TUE);
  assert.equal(s.activities.thursday[0].activeUntil, TUE);
});

// ── Carrying on ──────────────────────────────────────────────────────────────

const oneOff = () => steps({ recurrence: { type: "once", dateISO: TUE }, subtasks: items(5).map((e, i) => (i < 3 ? { ...e, mark: mark(TUE) } : e)), completionHistory: ["s1", "s2", "s3"].map((id) => sub(id, TUE)) });

test("a partly done one-off is listed with what's left", () => {
  const s = rollover(oneOff());
  const [row] = selectNeedsAttention(s, WED, "wednesday").missedTasks;
  assert.equal(row.stepsLeft, 2);
  assert.equal(occurrenceProgress(s.activities.tuesday[0], null, TUE).credit, 0.6);
});

test("continuing keeps finished steps, and finishing one finishes it on both", () => {
  const s0 = rollover(oneOff());
  let s = rescheduleMissedTaskOnce(s0, { ...s0.activities.tuesday[0], subtasks: s0.activities.tuesday[0].subtasks }, TUE, TODAY, 9 * 60);
  const copy = s.activities[todayDay].find((t) => t.continuesTaskId === "t");
  assert.deepEqual(doneSubtaskIds(copy), ["s1", "s2", "s3"]);
  s = toggleSubtaskOn(todayDay, copy.id, "s4")(s);
  const original = s.activities.tuesday.find((t) => t.id === "t");
  assert.deepEqual(doneSubtaskIds(original), ["s1", "s2", "s3", "s4"]);
  // The day that's over keeps the score it earned.
  assert.equal(occurrenceProgress(original, null, TUE).credit, 0.6);
});

test("a copy earns nothing for work finished before its own day", () => {
  const copy = { ...oneOff(), id: "c", continuesTaskId: "t", recurrence: { type: "once", dateISO: WED }, completionHistory: [missed(WED)] };
  assert.equal(occurrenceProgress(copy, null, WED).state, "missed");
});

test("a moved gym session stays a checklist and starts clean", () => {
  const s0 = rollover(fourOfFive());
  const s = rescheduleMissedTaskOnce(s0, s0.activities.tuesday[0], TUE, WED, 9 * 60);
  const copy = s.activities.wednesday[0];
  assert.equal(subtaskModeOf(copy), "checklist");
  assert.deepEqual(doneSubtaskIds(copy), []);
  assert.equal(copy.continuesTaskId, undefined);
});

// ── Sync ─────────────────────────────────────────────────────────────────────

const withMarks = (m) => steps({ subtasks: items(5).map((e) => (m[e.id] ? { ...e, mark: m[e.id] } : e)) });
const mergeBoth = (a, b) => {
  const sideA = { schedule: schedule({ tuesday: [a] }), lastUpdated: 1000 };
  const sideB = { schedule: schedule({ tuesday: [b] }), lastUpdated: 2000 };
  const ab = mergeSchedules(sideA, sideB);
  const ba = mergeSchedules(sideB, sideA);
  const pick = (r) => (r.schedule ?? r).activities.tuesday[0];
  return [pick(ab), pick(ba)];
};

test("two devices ticking different steps offline both keep their tick", () => {
  for (const t of mergeBoth(withMarks({ s1: mark(TUE) }), withMarks({ s2: mark(WED) }))) {
    assert.deepEqual(doneSubtaskIds(t), ["s1", "s2"]);
  }
});

test("the later decision about one step wins, in either order", () => {
  for (const t of mergeBoth(withMarks({ s1: mark(WED, false) }), withMarks({ s1: mark(TUE, true) }))) {
    assert.deepEqual(doneSubtaskIds(t), []);
  }
  const x = { done: true, at: at(TUE) };
  const y = { done: false, at: at(TUE) };
  assert.deepEqual(laterMark(x, y), laterMark(y, x));
});

test("an older version that drops the new fields can't clear them", () => {
  const old = { ...withMarks({ s1: mark(TUE) }) };
  delete old.subtaskMode;
  for (const t of mergeBoth({ ...withMarks({ s1: mark(TUE) }), continuesTaskId: "z" }, { ...old, title: "Edited on an old phone" })) {
    assert.equal(t.subtaskMode, "steps");
    assert.equal(t.continuesTaskId, "z");
    assert.equal(t.title, "Edited on an old phone");
  }
});
