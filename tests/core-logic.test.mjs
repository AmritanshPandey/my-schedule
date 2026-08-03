import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  toggleSlotComplete,
  snoozeTaskLater,
  getTaskCheckableItems,
  isTrackedTask,
  isTaskCompleted,
  resolveTaskState,
  getTaskSubtaskSummary,
  markTaskMissed,
  taskStatusLabel,
  toggleTaskFromCheckbox,
} = await import("../lib/taskCompletion.ts");
const {
  applyTaskDelete,
  createTaskDeleteSnapshot,
  restoreTaskDelete,
  updateTaskDays,
  updateTaskPerDay,
  setTaskException,
  clearTaskException,
  getSlots,
  withSlots,
  retimeSlot,
} = await import("../lib/taskMutations.ts");
const {
  normalizeTasks,
  resetStaleCompletions,
  NORMALIZED_OPTIONAL_TASK_FIELDS,
} = await import("../lib/scheduleNormalize.ts");
const { isTaskScheduledOn, resolveOccurrence, diffException, weeksBetween } = await import("../lib/taskOccurrence.ts");
const { normalizeMilestoneTimeline, cascadeMilestoneDates } = await import("../lib/roadmapDates.ts");
const { resolveLinkedTasks } = await import("../lib/notes/linkedTasks.ts");
const { computeExecutionTrend, trendNarrative } = await import("../lib/executionAnalytics.ts");
const { getNowOnTimeline, mapMinutesToTimeline } = await import("../lib/timeline/displayWindow.ts");
const { buildDayBreakdown, taskScheduledMinutes, donutSegments, HELD_TIME_ID } =
  await import("../lib/dayBreakdown.ts");
const { selectTodayTasks } = await import("../lib/todayTasks.ts");
const { CategoryRegistry } = await import("../lib/taskCategories.ts");
const { taskIdentity, categoriesById } = await import("../lib/taskIdentity.ts");
const { calculateExecutionStreak } = await import("../lib/consistency/calculateExecutionStreak.ts");
const { localISODate, addDaysToISO } = await import("../lib/dateUtils.ts");
const { parseTimeToMinutes, toScheduleDayMinutes } = await import("../lib/timeUtils.ts");
const { DAYS } = await import("../lib/scheduleConstants.ts");
const { pointerToScrollableMinutes } = await import("../lib/timeline/dragTimeUtils.ts");
const { toggleRitualCompletion } = await import("../lib/ritualCompletions.ts");
const {
  checklistStatsFromBody,
  mergeNoteTags,
  serializeRichNoteBody,
} = await import("../lib/notes/richText.ts");
const {
  appendQuickCaptureToBody,
  createDailyNoteInput,
  createInboxNoteInput,
  deriveTaskTitleFromNoteText,
  findDailyNote,
} = await import("../lib/notes/dailyCapture.ts");
const { describeSyncStatus, relativeTime } = await import("../lib/syncStatus.ts");
const { isPhoneViewportDimensions } = await import("../lib/iosSafeMode.ts");

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

test("a checkbox tap on a missed task clears the mark instead of completing it", () => {
  // Regression: the desktop shell had this branch inline and the iOS shell did
  // not, so the same tap on the same shared card did opposite things.
  const task = { id: "t1", title: "T", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [] };
  const missed = { ...task, ...markTaskMissed(task, []) };
  assert.equal(missed.missed, true);

  const patch = toggleTaskFromCheckbox(missed, []);
  assert.equal(patch.missed, false);
  assert.equal(patch.missedAt, undefined);
  assert.notEqual(patch.completed, true, "un-missing must not complete the task");
});

test("a checkbox tap on a non-missed task is plain completion toggling", () => {
  const task = { id: "t2", title: "T", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [] };
  const viaCheckbox = toggleTaskFromCheckbox(task, []);
  const viaToggle = toggleTaskComplete(task, []);
  assert.equal(viaCheckbox.completed, viaToggle.completed);
  assert.equal(viaCheckbox.completed, true);
});

test("task status labels carry state in the accessible name", () => {
  assert.equal(taskStatusLabel("incomplete", false), "Not completed, Mark done");
  assert.equal(taskStatusLabel("partial", false), "Partially completed, Mark done");
  assert.equal(taskStatusLabel("completed", false), "Completed, Mark not done");
  assert.equal(taskStatusLabel("missed", false), "Missed, Clear missed mark");

  // Read-only days invite nothing, so the verb is dropped.
  assert.equal(taskStatusLabel("incomplete", true), "Not completed");
  assert.equal(taskStatusLabel("partial", true), "Partially completed");
  assert.equal(taskStatusLabel("completed", true), "Completed");
  assert.equal(taskStatusLabel("missed", true), "Missed");

  // Callers that own their wording override only the verb, never the state.
  assert.equal(taskStatusLabel("missed", false, "Mark subtask done"), "Missed, Mark subtask done");
});

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

test("plan-template fallback subtasks can complete a task item by item", () => {
  const task = {
    id: "task-template",
    title: "Template task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-template",
    taskType: "task",
    completedSubtaskIds: ["a"],
  };
  const plan = {
    id: "plan-template",
    title: "Plan",
    category: "Study",
    emoji: "star",
    color: "amber",
    description: "",
    items: [{ id: "a", task: "A" }, { id: "b", task: "B" }],
  };

  const total = getTaskSubtaskSummary(task, plan).totalCount;
  const patch = toggleSubtaskComplete(task, "b", total);

  assert.equal(total, 2);
  assert.deepEqual(getTaskCheckableItems(task, plan).map((item) => item.id), ["a", "b"]);
  assert.equal(patch.completed, true);
  assert.deepEqual(patch.completedSubtaskIds, ["a", "b"]);
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

test("explicit empty subtasks override plan template fallback", () => {
  const schedule = emptySchedule();
  schedule.plans = [
    {
      id: "plan-1",
      title: "Plan",
      emoji: "star",
      color: "amber",
      items: [{ id: "plan-a", task: "Plan step" }],
    },
  ];
  schedule.activities.monday = [
    {
      id: "task-4",
      title: "Task",
      startTime: "9:00 AM",
      endTime: "10:00 AM",
      icon: "star",
      color: "amber",
      planId: "plan-1",
      taskType: "task",
      subtasks: [{ id: "a", task: "A" }],
      completedSubtaskIds: ["a"],
    },
  ];

  const update = {
    title: "Task",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    icon: "star",
    color: "amber",
    planId: "plan-1",
    taskType: "task",
    subtasks: [],
  };

  const result = updateTaskDays("task-4", update, ["monday"], null)(schedule);
  const task = result.activities.monday[0];
  assert.deepEqual(task.subtasks, []);
  assert.deepEqual(getTaskCheckableItems(task, schedule.plans[0]), []);
  assert.deepEqual(getTaskSubtaskSummary(task, schedule.plans[0]), {
    isSession: false,
    hasItems: false,
    completedCount: 0,
    totalCount: 0,
  });
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

test("daily note helper matches one note per ISO date", () => {
  const input = createDailyNoteInput("2026-06-24");
  const note = {
    id: "daily-note",
    title: input.title,
    body: input.body,
    tags: input.tags,
    createdAt: "2026-06-24T08:00:00.000Z",
    updatedAt: "2026-06-24T08:00:00.000Z",
  };

  assert.equal(findDailyNote([note], "2026-06-24")?.id, "daily-note");
  assert.equal(findDailyNote([note], "2026-06-25"), null);
  assert.deepEqual(input.tags, ["daily"]);
});

test("quick capture appends under captures and inbox notes preserve the inbox tag", () => {
  const body = "### Priorities\n- [ ] Ship\n\n### Captures\n- Existing\n\n### Decisions\n- Later";
  const updated = appendQuickCaptureToBody(body, "Call Alex", new Date("2026-06-24T09:05:00"));

  assert.match(updated, /### Captures\n- Existing\n- 9:05 AM Call Alex\n\n### Decisions/);
  assert.deepEqual(createInboxNoteInput("Call Alex").tags, ["inbox"]);
});

test("note text can be cleaned into a task title", () => {
  assert.equal(deriveTaskTitleFromNoteText("- [ ] **Call Alex** about budget"), "Call Alex about budget");
  assert.equal(deriveTaskTitleFromNoteText("### Follow-ups"), "Follow-ups");
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

test("recurrence: weekly intervals and one-off scheduling", () => {
  const base = (recurrence) => ({
    id: "r", title: "R", startTime: "8:00 AM", endTime: "9:00 AM",
    icon: "star", color: "amber", planId: "p", completionHistory: [], recurrence,
  });

  // weeksBetween (normalizes to Monday-of-week)
  assert.equal(weeksBetween("2026-06-10", "2026-06-10"), 0);
  assert.equal(weeksBetween("2026-06-10", "2026-06-17"), 1);
  assert.equal(weeksBetween("2026-06-10", "2026-06-24"), 2);

  // every 2 weeks from 2026-06-10: due weeks 0,2,4… not odd weeks
  const biweekly = base({ type: "weekly", interval: 2, anchorISO: "2026-06-10" });
  assert.equal(isTaskScheduledOn(biweekly, "2026-06-10", true), true);
  assert.equal(isTaskScheduledOn(biweekly, "2026-06-17", true), false);
  assert.equal(isTaskScheduledOn(biweekly, "2026-06-24", true), true);
  assert.equal(isTaskScheduledOn(biweekly, "2026-06-10", false), false, "not in weekday bucket");

  // one-off: only its exact date
  const once = base({ type: "once", dateISO: "2026-06-25" });
  assert.equal(isTaskScheduledOn(once, "2026-06-25", true), true);
  assert.equal(isTaskScheduledOn(once, "2026-06-26", true), false);

  // no recurrence (or interval 1) = every matching weekday
  assert.equal(isTaskScheduledOn(base(undefined), "2026-06-17", true), true);
  assert.equal(isTaskScheduledOn(base({ type: "weekly", interval: 1, anchorISO: "2026-06-10" }), "2026-06-17", true), true);
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

  // diffException returns only changed fields
  const orig = base();
  assert.deepEqual(diffException(orig, { title: "Run", startTime: "8:00 AM", endTime: "9:00 AM" }), {}, "no change -> empty");
  assert.deepEqual(diffException(orig, { startTime: "7:00 AM" }), { startTime: "7:00 AM" }, "only changed field");
  assert.deepEqual(
    diffException(orig, { title: "Long run", startTime: "7:00 AM", endTime: "9:00 AM" }),
    { title: "Long run", startTime: "7:00 AM" },
    "mix of changed and unchanged"
  );
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

test("routine completion toggles only the selected date", () => {
  const monday = "2026-06-22";
  const tuesday = "2026-06-23";
  let completions = toggleRitualCompletion([], "r1", monday);
  completions = toggleRitualCompletion(completions, "r1", tuesday);

  assert.deepEqual(completions, [
    { ritualId: "r1", date: monday },
    { ritualId: "r1", date: tuesday },
  ]);

  completions = toggleRitualCompletion(completions, "r1", monday);
  assert.deepEqual(completions, [{ ritualId: "r1", date: tuesday }]);
});

test("phone-sized viewports use the lightweight shell dimensions", () => {
  assert.equal(isPhoneViewportDimensions(390, 844), true);
  assert.equal(isPhoneViewportDimensions(844, 390), true);
  assert.equal(isPhoneViewportDimensions(430, 932), true);
  assert.equal(isPhoneViewportDimensions(932, 430), true);
  assert.equal(isPhoneViewportDimensions(768, 1024), false);
  assert.equal(isPhoneViewportDimensions(1280, 800), false);
});

test("iOS startup shell keeps heavy desktop modules out of first-load files", () => {
  const root = new URL("..", import.meta.url).pathname;
  const files = [
    "components/ios/IOSScheduleApp.tsx",
    "components/ios/IOSLightTaskCard.tsx",
    "components/ios/IOSBottomNav.tsx",
    "components/ScheduleAppClient.tsx",
  ];
  const forbidden = [
    "@/components/desktop",
    "@dnd-kit",
    "@/components/OverviewDashboard",
    "@/components/ai/AIAssistant",
    "@/components/strategy/StrategyViewer",
    "@/components/strategy/StrategyPdfReader",
    "@/components/activity/ListTaskCard",
    "@/components/timeline/Current",
    "@/components/timeline/TimelineDraftCard",
    "@/components/timeline/RitualOverlayLayer",
  ];

  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const needle of forbidden) {
      assert.equal(source.includes(needle), false, `${file} imports ${needle}`);
    }
  }
});

test("resolveLinkedTasks drops missing ids and dedupes", () => {
  const tasksById = new Map([
    ["a", { id: "a", title: "A" }],
    ["b", { id: "b", title: "B" }],
  ]);
  assert.deepEqual(resolveLinkedTasks(["a", "b"], tasksById).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(resolveLinkedTasks(["a", "gone", "b"], tasksById).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(resolveLinkedTasks(["a", "a"], tasksById).map((t) => t.id), ["a"]);
  assert.deepEqual(resolveLinkedTasks(undefined, tasksById), []);
  assert.deepEqual(resolveLinkedTasks([], tasksById), []);
});

test("getTaskSubtaskSummary resolves items + count", () => {
  const base = { id: "t", title: "T", startTime: "8:00 AM", endTime: "9:00 AM", icon: "star", color: "amber", planId: "p" };
  const plan = { id: "p", items: [{ id: "a", task: "A" }, { id: "b", task: "B" }] };

  // Task with its own subtasks, one done
  const withSubs = { ...base, subtasks: [{ id: "x", task: "X" }, { id: "y", task: "Y" }, { id: "z", task: "Z" }], completedSubtaskIds: ["x"] };
  assert.deepEqual(getTaskSubtaskSummary(withSubs, null), { isSession: false, hasItems: true, completedCount: 1, totalCount: 3 });

  // No own subtasks → falls back to plan template
  assert.deepEqual(getTaskSubtaskSummary({ ...base }, plan), { isSession: false, hasItems: true, completedCount: 0, totalCount: 2 });

  // Session uses its own steps, never the template
  const session = { ...base, taskType: "session", subtasks: [{ id: "s1", task: "S1" }, { id: "s2", task: "S2" }], completedSubtaskIds: ["s1", "s2"] };
  assert.deepEqual(getTaskSubtaskSummary(session, plan), { isSession: true, hasItems: true, completedCount: 2, totalCount: 2 });

  // Whole-task completion implies all items done
  assert.deepEqual(getTaskSubtaskSummary({ ...withSubs, completed: true }, null).completedCount, 3);

  // Plain task with no items and no template
  assert.deepEqual(getTaskSubtaskSummary({ ...base }, null), { isSession: false, hasItems: false, completedCount: 0, totalCount: 0 });
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

test("milestone date edits cascade to the remaining and persist", () => {
  const mk = (id, start, dur, sortOrder) => ({
    id, planId: "p", title: id, startDate: start, plannedDurationDays: dur,
    plannedEndDate: "", status: "upcoming", linkedActivities: [], linkedTrackers: [],
    createdAt: "", updatedAt: "2020-01-01T00:00:00Z", sortOrder,
  });
  const ms = [mk("m0", "2026-06-01", 7, 0), mk("m1", "2026-06-08", 7, 1), mk("m2", "2026-06-15", 7, 2)];

  // Normalize preserves stored starts (so edits survive load) and recomputes ends.
  const norm = normalizeMilestoneTimeline(ms, "2026-06-01");
  assert.equal(norm[0].startDate, "2026-06-01");
  assert.equal(norm[0].plannedEndDate, "2026-06-07");
  assert.equal(norm[1].startDate, "2026-06-08");
  assert.equal(norm[2].startDate, "2026-06-15");

  // Move m1 later → m0 untouched, m1 at new start, m2 pushed after it.
  const later = cascadeMilestoneDates(ms, "m1", { startDate: "2026-06-20" });
  assert.equal(later[0].startDate, "2026-06-01");
  assert.equal(later[1].startDate, "2026-06-20");
  assert.equal(later[1].plannedEndDate, "2026-06-26");
  assert.equal(later[2].startDate, "2026-06-27");
  assert.equal(later[2].plannedEndDate, "2026-07-03");

  // Pull m1 earlier → the remaining follow earlier too.
  const earlier = cascadeMilestoneDates(ms, "m1", { startDate: "2026-06-05" });
  assert.equal(earlier[0].startDate, "2026-06-01");
  assert.equal(earlier[1].startDate, "2026-06-05");
  assert.equal(earlier[2].startDate, "2026-06-12");
});

test("trendNarrative picks an honest momentum line (or null)", () => {
  const mkWeek = (pct) => ({ monStr: "", sunStr: "", label: "", completed: 0, scheduled: 5, pct, isCurrentWeek: false });
  const mkTrend = (pcts, extra = {}) => {
    const weeks = pcts.map(mkWeek);
    const current = weeks[weeks.length - 1];
    const previous = weeks[weeks.length - 2] ?? current;
    const averagePct = Math.round(weeks.reduce((s, w) => s + w.pct, 0) / weeks.length);
    const bestPct = weeks.reduce((m, w) => Math.max(m, w.pct), 0);
    return { weeks, current, previous, deltaPct: current.pct - previous.pct, averagePct, bestPct, totalCompleted: 10, scheduled: 5, ...extra };
  };

  assert.equal(trendNarrative(mkTrend([20, 30, 40, 50, 90])), "Best week in 5 weeks.");
  assert.equal(trendNarrative(mkTrend([70, 40, 50, 60, 65])), "Up 3 of the last 4 weeks.");
  assert.equal(trendNarrative(mkTrend([90, 85, 82, 88, 84])), "On a strong run.");
  assert.equal(trendNarrative(mkTrend([60, 70, 80, 50, 30])), "In a dip — you've bounced back before.");
  assert.equal(trendNarrative(mkTrend([50, 52, 48, 51, 50])), "Steady rhythm.");
  // No signal → null (hidden)
  assert.equal(trendNarrative(mkTrend([10, 20, 30, 40, 50], { totalCompleted: 0 })), null);
  assert.equal(trendNarrative(mkTrend([10, 20, 30, 40, 50], { scheduled: 0 })), null);
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

test("sync status: label + tone mapping and relative time buckets", () => {
  const now = Date.now();
  // Transient states ignore lastAt.
  assert.deepEqual(describeSyncStatus("syncing", now), { label: "Syncing…", tone: "syncing" });
  assert.deepEqual(describeSyncStatus("offline", now), { label: "Offline", tone: "warn" });
  assert.deepEqual(describeSyncStatus("error", now), { label: "Sync failed", tone: "error" });
  // Idle = caught up; lastAt drives the label.
  assert.deepEqual(describeSyncStatus("idle", 0), { label: "Not synced yet", tone: "neutral" });
  const ok = describeSyncStatus("idle", now);
  assert.equal(ok.tone, "ok");
  assert.match(ok.label, /^Synced /);

  // relativeTime buckets.
  assert.equal(relativeTime(0), "Never");
  assert.equal(relativeTime(now), "Just now");
  assert.equal(relativeTime(now - 30_000), "30s ago");
  assert.equal(relativeTime(now - 5 * 60_000), "5m ago");
  assert.equal(relativeTime(now - 3 * 60 * 60_000), "3h ago");
});

test("tracking start date floors streak and trend analytics", () => {
  const today = localISODate(new Date());
  const d = (n) => addDaysToISO(today, n);

  // Five consecutive ritual days ending today.
  const sched = emptySchedule();
  sched.ritualCompletions = [0, -1, -2, -3, -4].map((n) => ({ ritualId: "r", date: d(n) }));

  // Unset → the full run counts.
  assert.equal(calculateExecutionStreak(sched, today).streak, 5, "no floor -> full streak");

  // Floor two days back → the walk stops there instead of reaching further.
  sched.preferences = { startDate: d(-2) };
  assert.equal(calculateExecutionStreak(sched, today).streak, 3, "floor clamps the walk-back");

  // A floor in the future must not produce a negative/NaN streak.
  sched.preferences = { startDate: d(3) };
  assert.equal(calculateExecutionStreak(sched, today).streak, 0, "future floor -> no streak");

  // The trend always keeps the current week, even with a future floor, so the
  // card never renders from an empty array.
  const trend = computeExecutionTrend(sched, 8);
  assert.ok(trend.weeks.length >= 1, "current week always survives");
  assert.ok(Number.isFinite(trend.averagePct), "average stays a real number");
  assert.equal(trend.current, trend.weeks[trend.weeks.length - 1]);

  // A floor a few weeks back drops the older weeks from the window.
  const sched2 = emptySchedule();
  sched2.preferences = { startDate: d(-10) };
  const trend2 = computeExecutionTrend(sched2, 8);
  assert.ok(trend2.weeks.length < 8, "weeks fully before the floor are dropped");
});

test("getSlots/withSlots keep the slot invariant (sorted, mirrored, minimal)", () => {
  // No slots field — falls back to the single startTime/endTime block.
  const single = { startTime: "9:00 AM", endTime: "10:00 AM" };
  assert.deepEqual(getSlots(single), [{ startTime: "9:00 AM", endTime: "10:00 AM" }]);

  // withSlots sorts out-of-order slots and mirrors the earliest onto startTime/endTime.
  const draft = {
    startTime: "3:00 PM",
    endTime: "4:00 PM",
    slots: [
      { startTime: "3:00 PM", endTime: "4:00 PM" },
      { startTime: "9:00 AM", endTime: "10:00 AM" },
    ],
  };
  const normalized = withSlots(draft);
  assert.equal(normalized.startTime, "9:00 AM");
  assert.equal(normalized.endTime, "10:00 AM");
  assert.deepEqual(normalized.slots.map((s) => s.startTime), ["9:00 AM", "3:00 PM"]);

  // A single-slot list collapses back to no `slots` field at all (back-compat minimal storage).
  const collapsed = withSlots({ startTime: "1:00 PM", endTime: "2:00 PM", slots: [{ startTime: "1:00 PM", endTime: "2:00 PM" }] });
  assert.equal("slots" in collapsed, false);
});

test("updateTaskPerDay gives each weekday its own slots under one shared id", () => {
  const schedule = emptySchedule();
  const updater = updateTaskPerDay(
    "shared-id",
    { title: "Study", startTime: "9:00 AM", endTime: "10:00 AM", icon: "book", color: "amber", planId: "plan-1" },
    { monday: [{ startTime: "9:00 AM", endTime: "10:00 AM" }], wednesday: [{ startTime: "2:00 PM", endTime: "3:00 PM" }] },
    ["monday", "wednesday"],
    null
  );
  const next = updater(schedule);
  const monday = next.activities.monday.find((t) => t.id === "shared-id");
  const wednesday = next.activities.wednesday.find((t) => t.id === "shared-id");
  assert.equal(monday.startTime, "9:00 AM");
  assert.equal(wednesday.startTime, "2:00 PM");
  // Same id everywhere — still one recurring task, not a duplicated series.
  assert.equal(monday.id, wednesday.id);
});

test("toggleSlotComplete gives each phase of a multi-slot task an independent checkbox", () => {
  const task = {
    id: "multi-2",
    title: "Study",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    icon: "book",
    color: "amber",
    planId: "plan-1",
  };

  // Completing the first slot does not complete the second, nor the whole task.
  const afterFirst = { ...task, ...toggleSlotComplete(task, 0, 0) };
  assert.deepEqual(afterFirst.completedSlotIndices, [0]);
  assert.equal(afterFirst.completed, false);

  // Completing the second slot too now completes the whole task.
  const afterSecond = { ...afterFirst, ...toggleSlotComplete(afterFirst, 1, 0) };
  assert.deepEqual(afterSecond.completedSlotIndices.sort(), [0, 1]);
  assert.equal(afterSecond.completed, true);

  // Un-completing one phase drops the whole-task completion but keeps the other phase done.
  const afterUndo = { ...afterSecond, ...toggleSlotComplete(afterSecond, 0, 0) };
  assert.deepEqual(afterUndo.completedSlotIndices, [1]);
  assert.equal(afterUndo.completed, false);
});

test("completionForDate derives per-slot completion from history for a past date", () => {
  const today = localISODate(new Date());
  const task = {
    id: "multi-3",
    title: "Study",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    icon: "book",
    color: "amber",
    planId: "plan-1",
    completionHistory: [
      { id: "e1", taskId: "multi-3", completionType: "slot", slotIndex: 0, completedAt: new Date(`${today}T12:00:00`).toISOString() },
    ],
  };
  const derived = completionForDate(task, today);
  assert.deepEqual(derived.completedSlotIndices, [0]);
  assert.equal(derived.completed, false);
});

// ── normalizeTasks field-loss guard ──────────────────────────────────────────
// normalizeTasks() rebuilds each Task from an explicit allowlist, so any field
// missing from that list is silently dropped on every reload / cloud merge.
// That already happened once: `slots` was added to Task but not to the
// allowlist, so multi-slot tasks lost every phase but the first. These two
// tests make that failure mode loud instead of silent.

test("every optional Task field is covered by the normalize allowlist", () => {
  const root = new URL("..", import.meta.url).pathname;
  const source = readFileSync(join(root, "lib/useScheduleDB.ts"), "utf8");

  const start = source.indexOf("export interface Task {");
  assert.notEqual(start, -1, "could not locate the Task interface");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);

  // Optional members look like `  foo?: Type;` at the start of a line.
  const optionalKeys = Array.from(body.matchAll(/^\s{2}(\w+)\?:/gm), (m) => m[1]);
  assert.ok(optionalKeys.length > 5, "Task interface parse looks wrong");

  const covered = new Set(NORMALIZED_OPTIONAL_TASK_FIELDS);
  const missing = optionalKeys.filter((key) => !covered.has(key));
  assert.deepEqual(
    missing,
    [],
    `Task field(s) ${missing.join(", ")} are not in OPTIONAL_TASK_FIELDS in lib/scheduleNormalize.ts — ` +
      `they will be silently dropped on every reload. Add them there.`
  );

  // And nothing stale in the other direction.
  const known = new Set(optionalKeys);
  const orphaned = NORMALIZED_OPTIONAL_TASK_FIELDS.filter((key) => !known.has(key));
  assert.deepEqual(orphaned, [], `allowlist references field(s) no longer on Task: ${orphaned.join(", ")}`);
});

test("normalizeTasks round-trips a fully-populated task without losing a field", () => {
  const populated = {
    id: "full-1",
    title: "Everything",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    planId: "plan-1",
    // every optional field, all set to something that must survive
    categoryId: "cat-book",
    description: "a note",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    taskType: "session",
    completed: true,
    completedAt: "2026-07-26T09:30:00.000Z",
    completedSubtaskIds: ["sub-a"],
    completedSlotIndices: [0, 1],
    missed: false,
    missedAt: "2026-07-25T20:00:00.000Z",
    completionHistory: [
      { id: "e1", taskId: "full-1", completionType: "task", completedAt: "2026-07-26T09:30:00.000Z" },
    ],
    streakEnabled: true,
    sortOrder: 3,
    subtasks: [{ id: "sub-a", task: "Sub A" }],
    exceptions: { "2026-08-01": { skipped: true } },
    recurrence: { type: "weekly", interval: 2, anchorISO: "2026-07-26" },
  };

  const [out] = normalizeTasks([populated], "fallback-plan");

  for (const key of NORMALIZED_OPTIONAL_TASK_FIELDS) {
    assert.deepEqual(out[key], populated[key], `normalizeTasks dropped or altered "${key}"`);
  }
  // Required fields survive too.
  assert.equal(out.id, "full-1");
  assert.equal(out.planId, "plan-1");
  assert.equal(out.startTime, "9:00 AM");
});

test("marking a whole multi-slot task done also marks every phase", () => {
  const task = {
    id: "multi-6",
    title: "Study",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    icon: "book",
    color: "amber",
    planId: "plan-1",
  };

  // "Done" from a summary surface must not leave phases looking unchecked
  // on the timeline/list.
  const done = { ...task, ...toggleTaskComplete(task, []) };
  assert.equal(done.completed, true);
  assert.deepEqual([...done.completedSlotIndices].sort(), [0, 1]);

  // And un-completing clears them again, along with today's slot events.
  const undone = { ...done, ...toggleTaskComplete(done, []) };
  assert.equal(undone.completed, false);
  assert.deepEqual(undone.completedSlotIndices, []);
  const today = localISODate(new Date());
  const leftoverToday = undone.completionHistory.filter(
    (e) => localISODate(new Date(e.completedAt)) === today
  );
  assert.deepEqual(leftoverToday, [], "no stale slot/task events survive an uncheck");
});

test("retimeSlot moves one phase without disturbing its siblings", () => {
  const task = {
    id: "multi-5",
    title: "Study",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    icon: "book",
    color: "amber",
    planId: "plan-1",
  };

  // Drag the afternoon phase to the evening — the morning one stays put.
  const moved = retimeSlot(task, 1, "6:00 PM", "7:00 PM");
  assert.deepEqual(moved.slots, [
    { startTime: "9:00 AM", endTime: "10:00 AM" },
    { startTime: "6:00 PM", endTime: "7:00 PM" },
  ]);
  assert.equal(moved.startTime, "9:00 AM", "mirror still points at the earliest slot");

  // Dragging the later phase before the earlier one re-sorts and re-mirrors.
  const reordered = retimeSlot(task, 1, "7:00 AM", "8:00 AM");
  assert.deepEqual(reordered.slots.map((s) => s.startTime), ["7:00 AM", "9:00 AM"]);
  assert.equal(reordered.startTime, "7:00 AM");

  // A single-slot task just moves, and stays free of a `slots` field.
  const single = retimeSlot(
    { id: "s1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", icon: "run", color: "cyan", planId: "p" },
    0,
    "11:00 AM",
    "12:00 PM"
  );
  assert.equal(single.startTime, "11:00 AM");
  assert.equal(single.endTime, "12:00 PM");
  assert.equal("slots" in single, false);
});

test("resetStaleCompletions clears yesterday's slot completions but keeps history", () => {
  const today = localISODate(new Date());
  const yesterday = addDaysToISO(today, -1);
  const sched = emptySchedule();
  sched.activities.monday = [
    {
      id: "multi-4",
      title: "Study",
      startTime: "9:00 AM",
      endTime: "10:00 AM",
      slots: [
        { startTime: "9:00 AM", endTime: "10:00 AM" },
        { startTime: "3:00 PM", endTime: "4:00 PM" },
      ],
      icon: "book",
      color: "amber",
      planId: "plan-1",
      completedSlotIndices: [0],
      completionHistory: [
        {
          id: "e1",
          taskId: "multi-4",
          completionType: "slot",
          slotIndex: 0,
          completedAt: new Date(`${yesterday}T12:00:00`).toISOString(),
        },
      ],
    },
  ];

  const task = resetStaleCompletions(sched, today).activities.monday[0];
  assert.deepEqual(task.completedSlotIndices, [], "stale slot completions are cleared for the new day");
  assert.equal(task.completionHistory.length, 1, "history is preserved for analytics");
});

// ── Commitments: held time that blocks the calendar but isn't tracked ────────

function commitment(overrides = {}) {
  return {
    id: "commute",
    title: "Commute",
    startTime: "8:00 AM",
    endTime: "9:00 AM",
    icon: "car",
    color: "cyan",
    planId: "plan-1",
    taskType: "commitment",
    ...overrides,
  };
}

test("normalizeTasks round-trips the commitment task type", () => {
  // taskType is a whitelist that falls through to undefined, so a new value
  // that isn't added there is silently downgraded to a plain task on reload.
  const [out] = normalizeTasks([commitment()], "fallback-plan");
  assert.equal(out.taskType, "commitment");

  // The legacy coercions must still work, and junk must still be dropped.
  const [legacy] = normalizeTasks([commitment({ taskType: "routine" })], "p");
  assert.equal(legacy.taskType, "session");
  const [junk] = normalizeTasks([commitment({ taskType: "nonsense" })], "p");
  assert.equal(junk.taskType, undefined);
});

test("isTrackedTask is false only for commitments", () => {
  assert.equal(isTrackedTask(commitment()), false);
  assert.equal(isTrackedTask(commitment({ taskType: "task" })), true);
  assert.equal(isTrackedTask(commitment({ taskType: "session" })), true);
  assert.equal(isTrackedTask(commitment({ taskType: undefined })), true, "undefined means plain task");
});

test("a commitment never reports completion state", () => {
  // Covers converting an already-completed task into a commitment: the stale
  // `completed: true` must not survive as a green, ticked card.
  const stale = commitment({ completed: true, completedAt: new Date().toISOString() });
  assert.equal(isTaskCompleted(stale, 0), false);
  assert.equal(resolveTaskState(stale, 0), "incomplete");
  assert.equal(resolveTaskState(commitment({ missed: true }), 0), "incomplete");
});

test("a commitment never inherits its plan's template subtasks", () => {
  const plan = {
    id: "plan-1", title: "Work", category: "work", emoji: "briefcase", color: "cyan",
    description: "", items: [{ id: "a", task: "A" }, { id: "b", task: "B" }],
  };
  assert.deepEqual(getTaskCheckableItems(commitment(), plan), [], "no phantom progress bar");
  // A normal task in the same plan still inherits them.
  assert.equal(getTaskCheckableItems(commitment({ taskType: "task" }), plan).length, 2);
});

test("commitments are excluded from the execution trend denominator", () => {
  const today = localISODate(new Date());
  const sched = emptySchedule();
  const dayKey = DAYS[(new Date().getDay() + 6) % 7];
  sched.activities[dayKey] = [
    {
      id: "real", title: "Deep work", startTime: "9:00 AM", endTime: "10:00 AM",
      icon: "book", color: "amber", planId: "plan-1",
      completionHistory: [
        { id: "e1", taskId: "real", completionType: "task", completedAt: new Date(`${today}T12:00:00`).toISOString() },
      ],
    },
    commitment(),
  ];

  const trend = computeExecutionTrend(sched, 1);
  const current = trend.weeks[trend.weeks.length - 1];
  assert.equal(current.scheduled, 1, "the commitment is not part of the denominator");
  assert.equal(current.completed, 1);
  assert.equal(current.pct, 100, "one real task done = 100%, not 50%");
});

test("adding a commitment does not disturb the execution streak", () => {
  const today = localISODate(new Date());
  const dayKey = DAYS[(new Date().getDay() + 6) % 7];
  const withReal = emptySchedule();
  withReal.activities[dayKey] = [
    {
      id: "real", title: "Deep work", startTime: "9:00 AM", endTime: "10:00 AM",
      icon: "book", color: "amber", planId: "plan-1",
      completionHistory: [
        { id: "e1", taskId: "real", completionType: "task", completedAt: new Date(`${today}T12:00:00`).toISOString() },
      ],
    },
  ];
  const before = calculateExecutionStreak(withReal, today);

  const withCommitment = emptySchedule();
  withCommitment.activities[dayKey] = [...withReal.activities[dayKey], commitment()];
  const after = calculateExecutionStreak(withCommitment, today);

  assert.deepEqual(after, before, "a commitment emits no events, so the streak is untouched");
});


// ── Now-line window ─────────────────────────────────────────────────────────

test("the now marker hides when the clock is outside the day's window", () => {
  const start = 3 * 60;      // 3 AM day start
  const end = 28 * 60;       // window runs to 4 AM next day

  // The bug: mapMinutesToTimeline wraps 1 AM forward into the overnight tail,
  // and 1500 then passes a naive `<= end` bounds check — so the red line was
  // drawn near the bottom of the day.
  assert.equal(mapMinutesToTimeline(60, start, end), 1500, "wrap still applies to tasks");
  assert.equal(getNowOnTimeline(60, start, end), null, "but never to the clock");

  assert.equal(getNowOnTimeline(2 * 60 + 59, start, end), null, "just before the window opens");
  assert.equal(getNowOnTimeline(start, start, end), start, "exactly at the day start");
  assert.equal(getNowOnTimeline(13 * 60, start, end), 13 * 60, "midday shows");
  assert.equal(getNowOnTimeline(23 * 60 + 59, start, end), 23 * 60 + 59, "last minute of the day");

  // A midnight start means every clock time is inside the window.
  assert.equal(getNowOnTimeline(60, 0, end), 60);
});

// ── Day breakdown (the "where the day goes" donut) ──────────────────────────

test("taskScheduledMinutes sums every slot, including past midnight", () => {
  const base = { id: "t", title: "T", icon: "book", color: "amber", planId: "p" };
  assert.equal(taskScheduledMinutes({ ...base, startTime: "9:00 AM", endTime: "10:30 AM" }), 90);
  assert.equal(
    taskScheduledMinutes({
      ...base, startTime: "9:00 AM", endTime: "10:00 AM",
      slots: [
        { startTime: "9:00 AM", endTime: "10:00 AM" },
        { startTime: "3:00 PM", endTime: "4:30 PM" },
      ],
    }),
    150,
    "both phases counted",
  );
  assert.equal(
    taskScheduledMinutes({ ...base, startTime: "11:00 PM", endTime: "12:30 AM" }),
    90,
    "runs past midnight",
  );
});

test("buildDayBreakdown groups by category and pools commitments into held time", () => {
  const today = localISODate(new Date());
  const categories = [
    { id: "cat-code", title: "Coding", icon: "code", color: "indigo" },
    { id: "cat-barbell", title: "Workout", icon: "barbell", color: "orange" },
  ];
  const t = (over) => ({ id: over.id, title: over.id, planId: "p", startTime: over.startTime, endTime: over.endTime, ...over });

  const tasks = [
    t({ id: "a", categoryId: "cat-code", startTime: "9:00 AM", endTime: "11:00 AM" }),   // 120
    t({ id: "b", categoryId: "cat-code", startTime: "1:00 PM", endTime: "2:00 PM" }),    // 60  -> Coding 180
    t({ id: "c", categoryId: "cat-barbell", startTime: "7:00 AM", endTime: "8:00 AM" }), // 60
    t({ id: "d", categoryId: undefined, planId: "", taskType: "commitment", startTime: "8:00 AM", endTime: "9:00 AM" }), // 60 held
    t({ id: "e", categoryId: "cat-ghost", startTime: "5:00 PM", endTime: "6:00 PM" }),   // deleted category -> skipped
    t({ id: "f", startTime: "7:00 PM", endTime: "8:00 PM" }),                            // no category -> skipped
  ];

  const { slices, totalMinutes } = buildDayBreakdown(tasks, categories, today);
  assert.equal(totalMinutes, 300, "dangling and uncategorised tasks are excluded");
  assert.deepEqual(
    slices.map((s) => [s.id, s.minutes, s.pct]),
    [["cat-code", 180, 60], [HELD_TIME_ID, 60, 20], ["cat-barbell", 60, 20]],
    "largest first; equal slices break the tie on label (Held time < Workout)",
  );
  assert.equal(slices[0].label, "Coding");
  assert.equal(slices[0].color, "indigo", "wedge colour is the category's, so it matches the timeline");
  assert.equal(slices.find((s) => s.id === HELD_TIME_ID).label, "Held time");
  assert.equal(slices.find((s) => s.id === HELD_TIME_ID).color, null, "held time has no accent");
});

test("buildDayBreakdown is empty when nothing is scheduled", () => {
  const { slices, totalMinutes } = buildDayBreakdown([], [], localISODate(new Date()));
  assert.deepEqual(slices, []);
  assert.equal(totalMinutes, 0);
});

test("donutSegments tile the full circle without gaps or overflow", () => {
  const slices = [
    { id: "a", label: "A", color: "amber", minutes: 100, pct: 33 },
    { id: "b", label: "B", color: "rose", minutes: 100, pct: 33 },
    { id: "c", label: "C", color: "cyan", minutes: 100, pct: 33 },
  ];
  const C = 360;
  const segs = donutSegments(slices, 300, C);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].offset, 0);
  // Each arc starts exactly where the previous ended, and together they close
  // the circle even though the rounded percentages only sum to 99.
  assert.equal(segs[1].offset, segs[0].dash);
  assert.equal(segs[2].offset, segs[0].dash + segs[1].dash);
  const total = segs.reduce((sum, s) => sum + s.dash, 0);
  assert.ok(Math.abs(total - C) < 1e-9, "arcs sum to the full circumference");

  assert.deepEqual(donutSegments(slices, 0, C), [], "no division by zero");
});

test("a commitment keeps its empty planId through normalization", () => {
  // `planId: task.planId || fallbackPlanId` used to adopt every plan-less
  // commitment into the first plan on reload, so a commute reappeared wearing
  // a "Work" eyebrow.
  const held = {
    id: "commute", title: "Commute", startTime: "8:00 AM", endTime: "9:00 AM",
    icon: "car", color: "cyan", planId: "", taskType: "commitment",
  };
  const [out] = normalizeTasks([held], "plan-work");
  assert.equal(out.planId, "", "no plan is adopted");
  assert.equal(out.taskType, "commitment");

  // A genuinely orphaned normal task still gets rescued by the fallback.
  const orphan = { ...held, taskType: "task" };
  const [rescued] = normalizeTasks([orphan], "plan-work");
  assert.equal(rescued.planId, "plan-work");
});

// ── selectTodayTasks (the shared Overview "Today's Task" selector) ──────────

/** A schedule with every task in the given weekday bucket. */
function scheduleWith(dayKey, tasks, plans = []) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  activities[dayKey] = tasks;
  return { plans, activities, progressTrackers: [], metricEntries: [], milestones: [], rituals: [], strategies: [], ritualCompletions: [], notes: [], preferences: {} };
}

const todayKeyFor = (iso) => DAYS[(new Date(`${iso}T00:00:00`).getDay() + 6) % 7];

test("selectTodayTasks applies per-date occurrence overrides", () => {
  // Desktop never called resolveOccurrence, so a task retimed for a single date
  // kept showing its template time on the dashboard.
  const iso = localISODate(new Date());
  const task = {
    id: "t1", title: "Template title", startTime: "9:00 AM", endTime: "10:00 AM",
    icon: "book", color: "amber", planId: "p",
    exceptions: { [iso]: { startTime: "2:00 PM", endTime: "3:00 PM", title: "Override title" } },
  };
  const { tasks } = selectTodayTasks(scheduleWith(todayKeyFor(iso), [task]), iso, todayKeyFor(iso));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].startTime, "2:00 PM", "override time wins");
  assert.equal(tasks[0].title, "Override title", "override title wins");
  assert.equal(tasks[0].id, "t1", "identity is preserved for completion callbacks");
});

test("selectTodayTasks excludes commitments so the list and the badge agree", () => {
  // iOS rendered commitments but left them out of the count, so a 4-row list
  // could show "0/3".
  const iso = localISODate(new Date());
  const base = { icon: "book", color: "amber", planId: "p", startTime: "9:00 AM", endTime: "10:00 AM" };
  const tasksIn = [
    { ...base, id: "work", title: "Work" },
    { ...base, id: "commute", title: "Commute", planId: "", taskType: "commitment" },
  ];
  const { tasks, total } = selectTodayTasks(scheduleWith(todayKeyFor(iso), tasksIn), iso, todayKeyFor(iso));
  assert.deepEqual(tasks.map((t) => t.id), ["work"], "commitment is not listed");
  assert.equal(total, tasks.length, "badge denominator equals the row count");
});

test("selectTodayTasks sorts by the schedule day and honours sortOrder", () => {
  const iso = localISODate(new Date());
  const base = { icon: "book", color: "amber", planId: "p" };
  const tasksIn = [
    { ...base, id: "late", title: "Late", startTime: "11:00 PM", endTime: "11:30 PM" },
    { ...base, id: "small-hours", title: "Small hours", startTime: "1:00 AM", endTime: "2:00 AM" },
    { ...base, id: "morning", title: "Morning", startTime: "9:00 AM", endTime: "10:00 AM" },
  ];
  const { tasks } = selectTodayTasks(scheduleWith(todayKeyFor(iso), tasksIn), iso, todayKeyFor(iso));
  assert.deepEqual(
    tasks.map((t) => t.id),
    ["morning", "late", "small-hours"],
    "1 AM belongs to the end of the schedule day, not the start",
  );

  // Explicit ordering wins over the clock — desktop's old comparator ignored it.
  const ordered = tasksIn.map((t, i) => ({ ...t, sortOrder: [2, 0, 1][i] }));
  const { tasks: byOrder } = selectTodayTasks(scheduleWith(todayKeyFor(iso), ordered), iso, todayKeyFor(iso));
  assert.deepEqual(byOrder.map((t) => t.id), ["small-hours", "morning", "late"]);
});

test("selectTodayTasks skips a skipped occurrence and counts completions", () => {
  const iso = localISODate(new Date());
  const base = { icon: "book", color: "amber", planId: "p", startTime: "9:00 AM", endTime: "10:00 AM" };
  const tasksIn = [
    { ...base, id: "done", title: "Done", completed: true },
    { ...base, id: "open", title: "Open" },
    { ...base, id: "skipped", title: "Skipped", exceptions: { [iso]: { skipped: true } } },
  ];
  const { tasks, done, total } = selectTodayTasks(scheduleWith(todayKeyFor(iso), tasksIn), iso, todayKeyFor(iso));
  assert.deepEqual(tasks.map((t) => t.id), ["done", "open"], "skipped occurrence drops out");
  assert.equal(done, 1);
  assert.equal(total, 2);
});

// ── Category back-fill (the pre-categories upgrade path) ───────────────────

test("normalizeTasks adopts a legacy icon+colour into a category", () => {
  const registry = new CategoryRegistry();
  const legacy = [
    { id: "w1", title: "Lift", startTime: "6:00 AM", endTime: "7:00 AM", icon: "barbell", color: "orange", planId: "p" },
    { id: "w2", title: "Lift again", startTime: "6:00 PM", endTime: "7:00 PM", icon: "barbell", color: "orange", planId: "p" },
    // Minority colour on the same icon — the category takes the common one.
    { id: "w3", title: "Odd one", startTime: "8:00 PM", endTime: "9:00 PM", icon: "barbell", color: "red", planId: "p" },
    { id: "c1", title: "Study", startTime: "9:00 AM", endTime: "10:00 AM", icon: "school", color: "pink", planId: "p" },
    // Commitments never adopt an identity — held time renders neutral.
    { id: "h1", title: "Commute", startTime: "8:00 AM", endTime: "8:30 AM", icon: "car", color: "cyan", planId: "", taskType: "commitment" },
  ];

  const out = normalizeTasks(legacy, "fallback", undefined, undefined, registry);
  assert.equal(out.find((t) => t.id === "w1").categoryId, "cat-barbell");
  assert.equal(out.find((t) => t.id === "w3").categoryId, "cat-barbell", "same icon, same category");
  assert.equal(out.find((t) => t.id === "c1").categoryId, "cat-school");
  assert.equal(out.find((t) => t.id === "h1").categoryId, undefined, "commitments stay identity-free");
  assert.equal(out.every((t) => t.icon === undefined && t.color === undefined), true, "per-task identity is gone");

  const categories = registry.all();
  assert.deepEqual(categories.map((c) => c.id).sort(), ["cat-barbell", "cat-school"]);
  const barbell = categories.find((c) => c.id === "cat-barbell");
  assert.equal(barbell.title, "Workout", "title comes from the icon's label");
  assert.equal(barbell.icon, "barbell");
  assert.equal(barbell.color, "orange", "the majority colour wins, not the first or last seen");
});

test("the category back-fill is idempotent across reloads", () => {
  const legacy = [
    { id: "w1", title: "Lift", startTime: "6:00 AM", endTime: "7:00 AM", icon: "barbell", color: "orange", planId: "p" },
  ];

  // First load: adopt.
  const first = new CategoryRegistry();
  const pass1 = normalizeTasks(legacy, "fallback", undefined, undefined, first);
  const cats1 = first.all();
  assert.equal(cats1.length, 1);

  // Second load: the stored categories come back in, tasks already carry ids.
  const second = new CategoryRegistry(cats1);
  const pass2 = normalizeTasks(pass1, "fallback", undefined, undefined, second);
  assert.deepEqual(second.all(), cats1, "no duplicate categories on reload");
  assert.equal(pass2[0].categoryId, "cat-barbell");

  // And a third, to be sure nothing accumulates.
  const third = new CategoryRegistry(second.all());
  normalizeTasks(pass2, "fallback", undefined, undefined, third);
  assert.equal(third.all().length, 1);
});

test("a renamed category survives the back-fill untouched", () => {
  // The user renamed "Workout" to "Gym" and recoloured it; a reload must not
  // reset either just because the derived id still matches the icon.
  const stored = [{ id: "cat-barbell", title: "Gym", icon: "barbell", color: "violet" }];
  const tasks = [
    { id: "w1", title: "Lift", startTime: "6:00 AM", endTime: "7:00 AM", categoryId: "cat-barbell", planId: "p" },
  ];
  const registry = new CategoryRegistry(stored);
  const out = normalizeTasks(tasks, "fallback", undefined, undefined, registry);
  assert.equal(out[0].categoryId, "cat-barbell");
  assert.deepEqual(registry.all(), stored, "the user's title and colour are preserved");
});

test("taskIdentity resolves colour from the category, neutral otherwise", () => {
  const categories = [{ id: "cat-code", title: "Coding", icon: "code", color: "indigo" }];
  const byId = categoriesById(categories);
  const base = { id: "t", title: "T", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p" };

  assert.deepEqual(
    taskIdentity({ ...base, categoryId: "cat-code" }, byId),
    { icon: "code", color: "indigo", category: categories[0] },
  );
  assert.equal(taskIdentity({ ...base }, byId).color, null, "no category -> neutral");
  assert.equal(taskIdentity({ ...base, categoryId: "cat-gone" }, byId).color, null, "dangling -> neutral");
  assert.equal(
    taskIdentity({ ...base, categoryId: "cat-code", taskType: "commitment" }, byId).color,
    null,
    "held time is neutral even with a category",
  );
});
