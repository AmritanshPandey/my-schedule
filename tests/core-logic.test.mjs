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

const {
  completionForDate,
  toggleSubtaskComplete,
  toggleTaskComplete,
  snoozeTaskLater,
} = await import("../lib/taskCompletion.ts");
const {
  applyTaskDelete,
  createTaskDeleteSnapshot,
  restoreTaskDelete,
  updateTaskDays,
  setTaskException,
  clearTaskException,
} = await import("../lib/taskMutations.ts");
const { isTaskScheduledOn, resolveOccurrence } = await import("../lib/taskOccurrence.ts");
const { computeExecutionTrend } = await import("../lib/executionAnalytics.ts");
const { calculateExecutionStreak } = await import("../lib/consistency/calculateExecutionStreak.ts");
const { localISODate, addDaysToISO } = await import("../lib/dateUtils.ts");
const { parseTimeToMinutes, toScheduleDayMinutes } = await import("../lib/timeUtils.ts");
const { DAYS } = await import("../lib/scheduleConstants.ts");
const { pointerToScrollableMinutes } = await import("../lib/timeline/dragTimeUtils.ts");
const {
  checklistStatsFromBody,
  mergeNoteTags,
  serializeRichNoteBody,
} = await import("../lib/notes/richText.ts");

function event(taskId, completionType, completedAt, subtaskId) {
  return { id: `${completionType}-${subtaskId ?? "task"}`, taskId, completionType, completedAt, subtaskId };
}

function emptySchedule() {
  return {
    plans: [],
    activities: Object.fromEntries(DAYS.map((day) => [day, []])),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    strategies: [],
    ritualCompletions: [],
    notes: [],
  };
}

function baseTask(id = "delete-me") {
  return {
    id,
    title: "Delete me",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    sortOrder: 2,
    completionHistory: [event(id, "task", new Date().toISOString())],
    subtasks: [{ id: "sub-1", task: "Subtask" }],
  };
}

test("whole-task undo removes today's completion history", () => {
  const now = new Date().toISOString();
  const yesterday = new Date(`${addDaysToISO(localISODate(new Date()), -1)}T12:00:00`).toISOString();
  const task = {
    id: "task-1",
    title: "Task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    completed: true,
    completedAt: now,
    completedSubtaskIds: ["a", "b"],
    completionHistory: [
      event("task-1", "task", yesterday),
      event("task-1", "task", now),
      event("task-1", "subtask", now, "a"),
    ],
  };

  const patch = toggleTaskComplete(task, ["a", "b"]);
  assert.equal(patch.completed, false);
  assert.deepEqual(patch.completedSubtaskIds, []);
  assert.equal(patch.completionHistory.length, 1);
  assert.equal(patch.completionHistory[0].completedAt, yesterday);
});

test("undoing one implied subtask preserves the remaining partial history", () => {
  const now = new Date().toISOString();
  const today = localISODate(new Date());
  const task = {
    id: "task-2",
    title: "Task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    completed: true,
    completedAt: now,
    completedSubtaskIds: ["a", "b"],
    subtasks: [{ id: "a", task: "A" }, { id: "b", task: "B" }],
    completionHistory: [event("task-2", "task", now)],
  };

  const patch = toggleSubtaskComplete(task, "a", 2);
  const updated = { ...task, ...patch };
  assert.equal(updated.completed, false);
  assert.deepEqual(updated.completedSubtaskIds, ["b"]);
  assert.deepEqual(completionForDate(updated, today).completedSubtaskIds, ["b"]);
  assert.equal(updated.completionHistory.some((item) => item.completionType === "task"), false);
});

test("editing subtasks invalidates stale completion ids and task events", () => {
  const now = new Date().toISOString();
  const schedule = emptySchedule();
  schedule.activities.monday = [{
    id: "task-3",
    title: "Task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    taskType: "task",
    completed: true,
    completedAt: now,
    completedSubtaskIds: ["a", "b"],
    subtasks: [{ id: "a", task: "A" }, { id: "b", task: "B" }],
    completionHistory: [event("task-3", "task", now)],
  }];

  const update = {
    title: "Task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    taskType: "task",
    subtasks: [{ id: "a", task: "A" }, { id: "c", task: "C" }],
  };
  const result = updateTaskDays("task-3", update, ["monday"], null)(schedule);
  const task = result.activities.monday[0];
  assert.equal(task.completed, false);
  assert.deepEqual(task.completedSubtaskIds, ["a"]);
  assert.equal(task.completionHistory.some((item) => item.completionType === "task"), false);
});

test("single-day task delete removes only that occurrence", () => {
  const schedule = emptySchedule();
  const task = baseTask();
  schedule.activities.monday = [{ ...task }];
  schedule.activities.tuesday = [{ ...baseTask("keep-me"), title: "Keep me" }];
  schedule.milestones = [{
    id: "milestone-1",
    planId: "plan-1",
    title: "Milestone",
    startDate: "2026-06-01",
    plannedDurationDays: 7,
    plannedEndDate: "2026-06-08",
    status: "active",
    linkedActivities: ["delete-me", "keep-me"],
    linkedTrackers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
  }];

  const snapshot = createTaskDeleteSnapshot(schedule, "delete-me", "monday", "day");
  const result = applyTaskDelete(snapshot)(schedule);

  assert.equal(result.activities.monday.some((item) => item.id === "delete-me"), false);
  assert.equal(result.activities.tuesday.some((item) => item.id === "keep-me"), true);
  assert.deepEqual(result.milestones[0].linkedActivities, ["keep-me"]);
});

test("day-scoped repeated task delete preserves other days and milestone links", () => {
  const schedule = emptySchedule();
  const task = baseTask("repeat-me");
  schedule.activities.monday = [{ ...task, title: "Monday copy" }];
  schedule.activities.wednesday = [{ ...task, title: "Wednesday copy" }];
  schedule.milestones = [{
    id: "milestone-1",
    planId: "plan-1",
    title: "Milestone",
    startDate: "2026-06-01",
    plannedDurationDays: 7,
    plannedEndDate: "2026-06-08",
    status: "active",
    linkedActivities: ["repeat-me"],
    linkedTrackers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
  }];

  const snapshot = createTaskDeleteSnapshot(schedule, "repeat-me", "monday", "day");
  const result = applyTaskDelete(snapshot)(schedule);

  assert.equal(result.activities.monday.some((item) => item.id === "repeat-me"), false);
  assert.equal(result.activities.wednesday.some((item) => item.id === "repeat-me"), true);
  assert.deepEqual(result.milestones[0].linkedActivities, ["repeat-me"]);
});

test("all-occurrences repeated task delete removes every day and milestone links", () => {
  const schedule = emptySchedule();
  const task = baseTask("repeat-me");
  schedule.activities.monday = [{ ...task }];
  schedule.activities.wednesday = [{ ...task }];
  schedule.milestones = [{
    id: "milestone-1",
    planId: "plan-1",
    title: "Milestone",
    startDate: "2026-06-01",
    plannedDurationDays: 7,
    plannedEndDate: "2026-06-08",
    status: "active",
    linkedActivities: ["repeat-me", "other-task"],
    linkedTrackers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
  }];

  const snapshot = createTaskDeleteSnapshot(schedule, "repeat-me", "monday", "all");
  const result = applyTaskDelete(snapshot)(schedule);

  assert.equal(result.activities.monday.some((item) => item.id === "repeat-me"), false);
  assert.equal(result.activities.wednesday.some((item) => item.id === "repeat-me"), false);
  assert.deepEqual(result.milestones[0].linkedActivities, ["other-task"]);
});

test("task delete undo restores removed occurrences and milestone links", () => {
  const schedule = emptySchedule();
  const first = { ...baseTask("repeat-me"), title: "First" };
  const second = { ...baseTask("repeat-me"), title: "Second" };
  schedule.activities.monday = [{ ...baseTask("before"), title: "Before" }, first, { ...baseTask("after"), title: "After" }];
  schedule.activities.wednesday = [second];
  schedule.milestones = [{
    id: "milestone-1",
    planId: "plan-1",
    title: "Milestone",
    startDate: "2026-06-01",
    plannedDurationDays: 7,
    plannedEndDate: "2026-06-08",
    status: "active",
    linkedActivities: ["repeat-me", "other-task"],
    linkedTrackers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
  }];

  const snapshot = createTaskDeleteSnapshot(schedule, "repeat-me", "monday", "all");
  const deleted = applyTaskDelete(snapshot)(schedule);
  const restored = restoreTaskDelete(snapshot)(deleted);

  assert.deepEqual(restored.activities.monday.map((task) => task.title), ["Before", "First", "After"]);
  assert.deepEqual(restored.activities.wednesday, [second]);
  assert.deepEqual(restored.milestones[0].linkedActivities, ["repeat-me", "other-task"]);
});

test("rich note helpers keep legacy checklist stats and tag merging stable", () => {
  assert.deepEqual(checklistStatsFromBody("- [x] Done\n- [ ] Todo"), { done: 1, total: 2 });
  assert.deepEqual(mergeNoteTags(["Diet", "health"], ["health", "sleep"]), ["Diet", "health", "sleep"]);
  assert.equal(serializeRichNoteBody("<p>Hello</p>").startsWith("<!--rich-note-body-->"), true);
});

test("weekly analytics count each recurring weekday occurrence", () => {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  const tuesday = new Date(monday);
  tuesday.setDate(monday.getDate() + 1);
  const mondayAtNoon = new Date(`${localISODate(monday)}T12:00:00`).toISOString();
  const tuesdayAtNoon = new Date(`${localISODate(tuesday)}T12:00:00`).toISOString();
  const schedule = emptySchedule();
  const base = {
    id: "recurring",
    title: "Recurring",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
  };
  schedule.activities.monday = [{
    ...base,
    completionHistory: [event("recurring", "task", mondayAtNoon)],
  }];
  schedule.activities.tuesday = [{
    ...base,
    completionHistory: [event("recurring", "task", tuesdayAtNoon)],
  }];

  const trend = computeExecutionTrend(schedule, 2);
  assert.equal(trend.current.scheduled, 2);
  assert.equal(trend.current.completed, 2);
  assert.equal(trend.current.pct, 100);
});

test("per-date exceptions: scheduling, resolution, and mutations", () => {
  const D = "2026-06-22"; // a Monday
  const base = () => ({
    id: "rt", title: "Run", startTime: "8:00 AM", endTime: "9:00 AM",
    icon: "star", color: "amber", planId: "p", completionHistory: [],
  });

  // isTaskScheduledOn
  assert.equal(isTaskScheduledOn(base(), D, true), true, "template hit is scheduled");
  assert.equal(isTaskScheduledOn(base(), D, false), false, "not in weekday bucket -> not scheduled");
  const skipped = { ...base(), exceptions: { [D]: { skipped: true } } };
  assert.equal(isTaskScheduledOn(skipped, D, true), false, "skipped date is not scheduled");
  assert.equal(isTaskScheduledOn(skipped, "2026-06-29", true), true, "other dates unaffected");

  // resolveOccurrence applies overrides but preserves identity/history
  const edited = { ...base(), exceptions: { [D]: { title: "Long run", startTime: "7:00 AM" } } };
  const occ = resolveOccurrence(edited, D);
  assert.equal(occ.title, "Long run");
  assert.equal(occ.startTime, "7:00 AM");
  assert.equal(occ.id, "rt");
  assert.equal(occ.endTime, "9:00 AM", "unset fields fall through to template");
  const noEx = base();
  assert.equal(resolveOccurrence(noEx, D), noEx, "no exception returns the same reference");

  // setTaskException / clearTaskException across weekday buckets
  const sched = emptySchedule();
  sched.activities.monday = [base()];
  sched.activities.wednesday = [base()];

  const afterSkip = setTaskException("rt", D, { skipped: true })(sched);
  assert.equal(afterSkip.activities.monday[0].exceptions[D].skipped, true);
  assert.equal(afterSkip.activities.wednesday[0].exceptions[D].skipped, true, "written to all buckets");

  // Un-skip via { skipped: false } prunes the key (false/empty dropped)
  const afterUnskip = setTaskException("rt", D, { skipped: false })(afterSkip);
  assert.equal(afterUnskip.activities.monday[0].exceptions, undefined, "empty exceptions removed");

  // Field override then clear
  const afterEdit = setTaskException("rt", D, { title: "X" })(sched);
  assert.equal(afterEdit.activities.monday[0].exceptions[D].title, "X");
  const afterClear = clearTaskException("rt", D)(afterEdit);
  assert.equal(afterClear.activities.monday[0].exceptions, undefined);
});

test("execution streak unifies tasks and rituals", () => {
  const today = localISODate(new Date());
  const d = (n) => addDaysToISO(today, n);
  const sched = emptySchedule();

  // Three consecutive days of ritual activity ending today.
  sched.ritualCompletions = [
    { ritualId: "r", date: d(0) },
    { ritualId: "r", date: d(-1) },
    { ritualId: "r", date: d(-2) },
  ];
  const s1 = calculateExecutionStreak(sched, today);
  assert.equal(s1.streak, 3);
  assert.equal(s1.doneToday, true);
  assert.equal(s1.atRisk, false);

  // A task completion 3 days ago extends the run to 4.
  sched.activities.monday = [{
    id: "t", title: "T", startTime: "9:00 AM", endTime: "10:00 AM", icon: "star", color: "amber", planId: "p",
    completionHistory: [event("t", "task", new Date(`${d(-3)}T12:00:00`).toISOString())],
  }];
  assert.equal(calculateExecutionStreak(sched, today).streak, 4);

  // Removing today's activity → at risk, streak anchored at yesterday.
  sched.ritualCompletions = sched.ritualCompletions.filter((c) => c.date !== d(0));
  const s3 = calculateExecutionStreak(sched, today);
  assert.equal(s3.doneToday, false);
  assert.equal(s3.atRisk, true);
  assert.equal(s3.streak, 3);

  // Missed marks do not count as showing up.
  const missedOnly = emptySchedule();
  missedOnly.activities.monday = [{
    id: "m", title: "M", startTime: "9:00 AM", endTime: "10:00 AM", icon: "star", color: "amber", planId: "p",
    completionHistory: [event("m", "missed", new Date(`${today}T12:00:00`).toISOString())],
  }];
  assert.equal(calculateExecutionStreak(missedOnly, today).streak, 0);
});

test("snooze never moves a task earlier than its scheduled time", () => {
  const mk = (startTime, endTime) => ({
    id: "s", title: "S", startTime, endTime, icon: "star", color: "amber",
    planId: "p", completionHistory: [],
  });
  const parse = (v) => parseTimeToMinutes(v);

  // Normal morning task: moves later, preserves duration.
  const morning = snoozeTaskLater(mk("8:00 AM", "9:00 AM"), 60);
  assert.ok(parse(morning.startTime) > parse("8:00 AM"), "morning task should move later");
  assert.equal(parse(morning.endTime) - parse(morning.startTime), 60, "duration preserved");

  // Overnight task (end < start): must not be shoved backward — either a valid
  // forward move or a no-op (no room left today), never earlier than 11:00 PM.
  const overnight = snoozeTaskLater(mk("11:00 PM", "1:00 AM"), 60);
  if (overnight.startTime !== undefined) {
    assert.ok(parse(overnight.startTime) > parse("11:00 PM"), "overnight task must not move earlier");
  }

  // Untimed task is a no-op.
  assert.deepEqual(snoozeTaskLater({ id: "x", completionHistory: [] }, 60), {});
});

test("time parsing and schedule-day conversion reject invalid clocks", () => {
  assert.equal(parseTimeToMinutes("24:00"), null);
  assert.equal(parseTimeToMinutes("9:99 AM"), null);
  assert.equal(toScheduleDayMinutes(parseTimeToMinutes("1:30 AM")), 1530);
  assert.equal(toScheduleDayMinutes(parseTimeToMinutes("4:00 AM")), 240);
});

test("pointerToScrollableMinutes accounts for vertical scroll position", () => {
  assert.equal(pointerToScrollableMinutes(180, 100, 40, 2, 240), 300);
});
