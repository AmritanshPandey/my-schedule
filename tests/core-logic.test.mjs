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
const { slotInterval, crossesMidnight, headMinutes, tailMinutes, intervalMinutes } =
  await import("../lib/timeline/overnight.ts");
const { carriedOccurrences, viewKey, isCarriedOver } = await import("../lib/timeline/carryOver.ts");
const { buildDayBreakdown, taskScheduledMinutes, donutSegments } =
  await import("../lib/dayBreakdown.ts");
const { calculateExecutionStreak } = await import("../lib/consistency/calculateExecutionStreak.ts");
const { buildWeekHeatmap, planWeekRate } = await import("../lib/consistency/weekHeatmap.ts");
const { validateTaskTime } = await import("../lib/scheduleRules.ts");
const { localISODate, addDaysToISO, weekdayOfISO } = await import("../lib/dateUtils.ts");
const { seedCategoryIdFromIcon } = await import("../lib/scheduleNormalize.ts");
const { resolveCategory, normalizeCategories, seedCategories, countTasksInCategory } =
  await import("../lib/categories.ts");
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

test("snooze moves a long overnight task instead of silently doing nothing", () => {
  const parse = (v) => parseTimeToMinutes(v);
  const sleep = {
    id: "sleep", title: "Sleep", startTime: "11:00 PM", endTime: "7:00 AM",
    icon: "sleep", color: "blue", planId: "", taskType: "commitment", completionHistory: [],
  };

  // The bug: the end was clamped to 23:59, giving an 8-hour block a ceiling of
  // 15:59 — below its own 23:00 start — so the guard returned {} every time and
  // "Later today" appeared to do nothing at all.
  const moved = snoozeTaskLater(sleep, 30);
  assert.notDeepEqual(moved, {}, "an overnight task must actually move");
  assert.ok(parse(moved.startTime) > parse("11:00 PM"), "and move later, not earlier");

  // Duration survives the midnight wrap: 23:30 → 07:30 is still 8 hours.
  const start = parse(moved.startTime);
  let end = parse(moved.endTime);
  if (end < start) end += 1440;
  assert.equal(end - start, 480, "the 8-hour duration is preserved across midnight");
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
    icon: "book",
    color: "amber",
    planId: "plan-1",
    // every optional field, all set to something that must survive
    description: "a note",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    taskType: "session",
    categoryId: "cat-custom",
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

// ── Categories ──────────────────────────────────────────────────────────────

test("tasks without a category are auto-sorted by icon", () => {
  const mk = (icon) => ({
    id: `t-${icon}`, title: icon, startTime: "9:00 AM", endTime: "10:00 AM", icon, planId: "p",
  });

  const expected = {
    sleep: "cat-sleep",
    briefcase: "cat-work", car: "cat-work", code: "cat-work",
    brain: "cat-work", school: "cat-work", book: "cat-work",
    run: "cat-routine", barbell: "cat-routine", heart: "cat-routine", star: "cat-routine",
  };

  for (const [icon, categoryId] of Object.entries(expected)) {
    assert.equal(seedCategoryIdFromIcon(icon), categoryId, `${icon} seeds ${categoryId}`);
    const [out] = normalizeTasks([mk(icon)], "p");
    assert.equal(out.categoryId, categoryId, `normalizeTasks assigns ${categoryId} to ${icon}`);
  }
});

test("the icon auto-sort never overwrites a category the user picked", () => {
  const chosen = {
    id: "t1", title: "Gym paperwork", startTime: "9:00 AM", endTime: "10:00 AM",
    icon: "briefcase", planId: "p", categoryId: "cat-routine",
  };

  // Two passes: normalization runs on every load, so it has to be idempotent.
  const once = normalizeTasks([chosen], "p")[0];
  const twice = normalizeTasks([once], "p")[0];
  assert.equal(once.categoryId, "cat-routine", "a stored category wins over the icon guess");
  assert.deepEqual(twice, once, "a second pass changes nothing");

  // An empty string is not a real choice — it must fall through to the guess.
  const [blank] = normalizeTasks([{ ...chosen, categoryId: "" }], "p");
  assert.equal(blank.categoryId, "cat-work", "an empty categoryId falls back to the icon");
});

test("a task whose category was deleted still resolves to a real one", () => {
  const categories = seedCategories().filter((c) => c.id !== "cat-sleep");

  // The donut totals the day, so a dangling id must never drop the task — that
  // would quietly subtract minutes from a chart claiming to account for them.
  const orphan = resolveCategory(categories, "cat-sleep", "sleep");
  assert.ok(orphan, "always resolves to something");
  assert.ok(categories.some((c) => c.id === orphan.id), "and to a category that exists");

  assert.equal(resolveCategory(categories, "cat-work", "briefcase").id, "cat-work", "exact match wins");
  assert.equal(resolveCategory(categories, undefined, "briefcase").id, "cat-work", "falls back to the icon seed");
  assert.equal(resolveCategory([], "cat-work", "briefcase").id, "cat-routine", "survives an empty list");
});

test("normalizeCategories seeds the three defaults when none are stored", () => {
  assert.deepEqual(normalizeCategories(undefined), seedCategories(), "missing → seeded");
  assert.deepEqual(normalizeCategories([]), seedCategories(), "empty → seeded");
  assert.deepEqual(normalizeCategories("nonsense"), seedCategories(), "junk → seeded");

  const stored = [{ id: "cat-x", name: "Deep work", icon: "brain", color: "violet" }];
  assert.deepEqual(normalizeCategories(stored), stored, "a real list is preserved verbatim");

  // Shape filter: entries missing required fields are dropped, not crashed on.
  assert.deepEqual(
    normalizeCategories([...stored, { id: "bad" }, null]),
    stored,
    "malformed entries are dropped",
  );
});

test("a commitment's icon comes from its category, a task's from itself", () => {
  // The wallpaper is the only surface that draws a task's own icon, and the
  // task sheet hides the icon picker for commitments — so every commitment used
  // to fall through to a generic star. Its category supplies the real one.
  const categories = seedCategories();
  const wallpaperIcon = (task) =>
    isTrackedTask(task)
      ? task.icon || "star"
      : resolveCategory(categories, task.categoryId, task.icon).icon;

  assert.equal(
    wallpaperIcon({ icon: "brain", categoryId: "cat-work" }),
    "brain",
    "a tracked task keeps its own icon",
  );
  assert.equal(
    wallpaperIcon({ icon: "car", categoryId: "cat-work", taskType: "commitment" }),
    "briefcase",
    "a commitment wears its category's icon, not its ignored stored one",
  );
  assert.equal(
    wallpaperIcon({ icon: "star", categoryId: undefined, taskType: "commitment" }),
    "star",
    "an uncategorised commitment still resolves (Routine) rather than breaking",
  );
});

test("countTasksInCategory counts a task once, not once per weekday", () => {
  const categories = seedCategories();
  // One task with a shared id across three weekday buckets — the storage model.
  const task = { id: "shared", categoryId: "cat-work", icon: "briefcase" };
  const activities = { monday: [task], wednesday: [task], friday: [task], tuesday: [] };

  assert.equal(countTasksInCategory(activities, categories, "cat-work"), 1, "one task, three copies");
  assert.equal(countTasksInCategory(activities, categories, "cat-sleep"), 0);
});

// ── Overnight intervals ─────────────────────────────────────────────────────

test("slotInterval splits a block at midnight between the two days it touches", () => {
  // head = minutes on the day the block is authored on, tail = minutes that
  // spill into the next calendar day. Sleep is the case that motivated this.
  const cases = [
    { startTime: "11:00 PM", endTime: "7:00 AM",  start: 1380, end: 1860, head: 60,  tail: 420 },
    { startTime: "1:00 AM",  endTime: "2:00 AM",  start: 1500, end: 1560, head: 0,   tail: 60  },
    { startTime: "10:00 PM", endTime: "12:00 AM", start: 1320, end: 1440, head: 120, tail: 0   },
    { startTime: "12:00 AM", endTime: "1:00 AM",  start: 1440, end: 1500, head: 0,   tail: 60  },
    { startTime: "3:00 AM",  endTime: "5:00 AM",  start: 1620, end: 1740, head: 0,   tail: 120 },
    { startTime: "9:00 AM",  endTime: "10:30 AM", start: 540,  end: 630,  head: 90,  tail: 0   },
  ];

  for (const c of cases) {
    const iv = slotInterval(c);
    const label = `${c.startTime}–${c.endTime}`;
    assert.deepEqual(iv, { start: c.start, end: c.end }, label);
    assert.equal(headMinutes(iv), c.head, `${label} head`);
    assert.equal(tailMinutes(iv), c.tail, `${label} tail`);
    // The split must be lossless: nothing is double-counted or dropped.
    assert.equal(headMinutes(iv) + tailMinutes(iv), intervalMinutes(iv), `${label} is conserved`);
    assert.equal(crossesMidnight(iv), c.tail > 0, `${label} crossing`);
  }
});

test("slotInterval rejects zero-length and unparseable slots", () => {
  // The old `while (end <= start) end += 1440` read this as a 24-hour block
  // while formatDuration called the same slot "0m". Zero-length wins.
  assert.equal(slotInterval({ startTime: "9:00 AM", endTime: "9:00 AM" }), null, "zero-length");
  assert.equal(slotInterval({ startTime: "nonsense", endTime: "9:00 AM" }), null, "no start");

  // A missing end falls back to a default length rather than vanishing.
  assert.deepEqual(
    slotInterval({ startTime: "9:00 AM", endTime: "" }),
    { start: 540, end: 570 },
    "missing end gets a default span",
  );
});

// ── Overnight carry-over (yesterday's tail on today's timeline) ─────────────

test("carriedOccurrences emits one read-only block per midnight-crossing slot", () => {
  const monday = "2026-07-27";
  const sleep = {
    id: "sleep", title: "Sleep", icon: "sleep", color: "blue", planId: "",
    categoryId: "cat-sleep", startTime: "11:00 PM", endTime: "7:00 AM",
  };
  const morning = {
    id: "gym", title: "Gym", icon: "run", color: "rose", planId: "p",
    startTime: "7:00 AM", endTime: "8:00 AM",
  };

  const carried = carriedOccurrences([sleep, morning], monday, "monday");

  assert.equal(carried.length, 1, "only the overnight task carries over");
  assert.equal(carried[0].id, "sleep");
  assert.equal(carried[0].startTime, "12:00 AM", "the tail starts at midnight");
  assert.equal(carried[0].endTime, "7:00 AM", "and ends when the block really ends");
  assert.equal(carried[0].slots, undefined, "a carried entry is a single block");
  assert.deepEqual(carried[0].carriedFrom, { dateISO: monday, day: "monday", slotIndex: 0 });
  assert.ok(isCarriedOver(carried[0]));
  assert.ok(!isCarriedOver(sleep), "a real occurrence is not carried");
});

test("a multi-slot task carries over only the phases that cross midnight", () => {
  const shift = {
    id: "shift", title: "Shift", icon: "briefcase", color: "red", planId: "",
    startTime: "9:00 AM", endTime: "11:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "11:00 AM" },   // daytime — no carry
      { startTime: "10:00 PM", endTime: "2:00 AM" },   // crosses — carries
    ],
  };

  const carried = carriedOccurrences([shift], "2026-07-27", "monday");
  assert.equal(carried.length, 1);
  assert.equal(carried[0].endTime, "2:00 AM");
  assert.equal(carried[0].carriedFrom.slotIndex, 1, "the crossing phase, not the first");
});

test("carriedOccurrences respects recurrence — no tail on an off week", () => {
  // Every other week, anchored so 2026-07-27 is an ON week.
  const biweekly = {
    id: "bw", title: "Night shift", icon: "briefcase", color: "red", planId: "",
    startTime: "11:00 PM", endTime: "3:00 AM",
    recurrence: { type: "weekly", interval: 2, anchorISO: "2026-07-27" },
  };

  assert.equal(carriedOccurrences([biweekly], "2026-07-27", "monday").length, 1, "on week carries");
  assert.equal(carriedOccurrences([biweekly], "2026-08-03", "monday").length, 0, "off week does not");
});

test("viewKey separates a carried tail from the same task's own occurrence", () => {
  // The landmine: a daily Sleep block puts one task.id in a single day twice.
  // Keying by task.id would make React drop one of them.
  const sleep = {
    id: "sleep", title: "Sleep", icon: "sleep", color: "blue", planId: "",
    startTime: "11:00 PM", endTime: "7:00 AM",
  };
  const [tail] = carriedOccurrences([sleep], "2026-07-27", "monday");

  assert.notEqual(viewKey(tail), viewKey(sleep), "the two rows must key differently");
  assert.equal(viewKey(sleep), "sleep", "a real occurrence keys by its id");
  assert.equal(viewKey(sleep, 1), "sleep-1", "slot index is appended when given");
});

test("carry-over changes no statistic — the view-boundary rule holds", () => {
  // The acceptance gate for Phase 4. A schedule with one daily overnight
  // commitment must produce identical analytics whether or not carry-over
  // exists, because carried rows never enter the weekday buckets.
  const today = localISODate(new Date());
  const sleep = {
    id: "sleep", title: "Sleep", icon: "sleep", color: "blue", planId: "",
    categoryId: "cat-sleep", taskType: "commitment",
    startTime: "11:00 PM", endTime: "7:00 AM", completionHistory: [],
  };
  const real = {
    id: "work", title: "Deep work", icon: "brain", color: "violet", planId: "p",
    categoryId: "cat-work", startTime: "9:00 AM", endTime: "11:00 AM",
    completionHistory: [{ id: "e", taskId: "work", completionType: "task", completedAt: `${today}T10:00:00.000Z` }],
    completed: true,
  };

  const schedule = emptySchedule();
  const todayKey = DAYS[(new Date().getDay() + 6) % 7];
  schedule.activities[todayKey] = [sleep, real];

  const trendBefore = computeExecutionTrend(schedule, 1);
  const streakBefore = calculateExecutionStreak(schedule, today);
  assert.equal(trendBefore.weeks[trendBefore.weeks.length - 1].scheduled, 1,
    "the commitment was already outside the denominator");

  // Building the carried view must not mutate the schedule it reads from.
  const carried = carriedOccurrences(schedule.activities[todayKey], today, todayKey);
  assert.equal(carried.length, 1, "there is in fact a tail to carry");

  assert.deepEqual(computeExecutionTrend(schedule, 1), trendBefore, "trend untouched");
  assert.deepEqual(calculateExecutionStreak(schedule, today), streakBefore, "streak untouched");
  // And the source rows are unchanged — carriedOccurrences copies, never mutates.
  assert.equal(schedule.activities[todayKey].length, 2);
  assert.equal(schedule.activities[todayKey][0].startTime, "11:00 PM", "the origin keeps its time");
  assert.equal(schedule.activities[todayKey][0].carriedFrom, undefined, "and gains no display field");
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

// A task fixture. Defaults are irrelevant to the grouping — categoryId is.
const bdTask = (over) => ({
  id: over.id, title: over.id, icon: "book", color: "amber", planId: "",
  startTime: over.startTime, endTime: over.endTime, ...over,
});
const bdCats = () => seedCategories();

test("buildDayBreakdown groups by category, not by plan", () => {
  const today = localISODate(new Date());
  const tasks = [
    // Two different plans, one category: they must pool into a single slice.
    // Grouping by plan was the duplicate-wedge problem this design removes.
    bdTask({ id: "a", planId: "p-work", categoryId: "cat-work", startTime: "9:00 AM", endTime: "11:00 AM" }),  // 120
    bdTask({ id: "b", planId: "p-side", categoryId: "cat-work", startTime: "1:00 PM", endTime: "2:00 PM" }),   // 60
    bdTask({ id: "c", planId: "p-gym", categoryId: "cat-routine", startTime: "7:00 AM", endTime: "8:00 AM" }), // 60
    // A commitment now carries a real category instead of vanishing into grey.
    bdTask({ id: "d", taskType: "commitment", categoryId: "cat-routine", startTime: "8:00 AM", endTime: "9:00 AM" }), // 60
  ];

  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: today, tasks, previousTasks: [], categories: bdCats(),
  });

  assert.equal(totalMinutes, 300);
  assert.deepEqual(
    slices.map((s) => [s.id, s.minutes, s.pct]),
    [["cat-work", 180, 60], ["cat-routine", 120, 40]],
    "two plans in one category make one slice; largest first",
  );
  assert.equal(slices[0].label, "Work");
  assert.equal(slices[0].color, "red", "the slice wears the category's colour");
  assert.ok(!slices.some((s) => s.label === "Held time"), "held time no longer exists");
});

test("overlapping blocks count each minute once, not once per block", () => {
  const today = localISODate(new Date());
  // The realistic shape that broke this: a wide "office hours" commitment with
  // real work scheduled *inside* it. Summing durations reported 9h + 3h + 1h =
  // 13h of a day the user was only busy for 9.
  const tasks = [
    bdTask({ id: "office", taskType: "commitment", categoryId: "cat-work", startTime: "9:00 AM", endTime: "6:00 PM" }),
    bdTask({ id: "deep", categoryId: "cat-work", startTime: "9:00 AM", endTime: "12:00 PM" }),
    bdTask({ id: "mtg", categoryId: "cat-work", startTime: "2:00 PM", endTime: "3:00 PM" }),
  ];

  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: today, tasks, previousTasks: [], categories: bdCats(),
  });

  assert.equal(totalMinutes, 540, "9:00 AM–6:00 PM is nine hours of wall clock");
  assert.deepEqual(slices.map((s) => [s.id, s.minutes]), [["cat-work", 540]]);
});

test("a nested block is attributed to the more specific category", () => {
  const today = localISODate(new Date());
  // A gym hour sitting inside a broad work block belongs to Routine — the
  // shorter span is the more specific claim on those minutes.
  const tasks = [
    bdTask({ id: "office", taskType: "commitment", categoryId: "cat-work", startTime: "9:00 AM", endTime: "5:00 PM" }),
    bdTask({ id: "gym", categoryId: "cat-routine", startTime: "12:00 PM", endTime: "1:00 PM" }),
  ];

  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: today, tasks, previousTasks: [], categories: bdCats(),
  });

  assert.equal(totalMinutes, 480, "still eight hours total, not nine");
  assert.deepEqual(
    slices.map((s) => [s.id, s.minutes]),
    [["cat-work", 420], ["cat-routine", 60]],
    "the gym hour is carved out of work, not added on top",
  );
});

test("a day's breakdown can never exceed 24 hours", () => {
  const today = localISODate(new Date());
  // Eight overlapping all-day blocks: the old sum would report 192 hours.
  const tasks = Array.from({ length: 8 }, (_, i) =>
    bdTask({ id: `t${i}`, categoryId: "cat-work", startTime: "12:00 AM", endTime: "11:59 PM" }),
  );

  const { totalMinutes } = buildDayBreakdown({
    dateISO: today, tasks, previousTasks: [], categories: bdCats(),
  });

  assert.ok(totalMinutes <= 24 * 60, `expected <= 1440, got ${totalMinutes}`);
});

test("an overnight task splits its minutes across the two days it touches", () => {
  const monday = "2026-07-27";   // a Monday
  const tuesday = "2026-07-28";
  assert.equal(weekdayOfISO(monday), "monday", "fixture sanity");

  // Sleep authored on Monday, 11 PM → 7 AM.
  const sleep = bdTask({
    id: "sleep", categoryId: "cat-sleep", startTime: "11:00 PM", endTime: "7:00 AM",
  });

  const mon = buildDayBreakdown({
    dateISO: monday, tasks: [sleep], previousTasks: [], categories: bdCats(),
  });
  assert.equal(mon.totalMinutes, 60, "only the hour before midnight lands on Monday");

  const tue = buildDayBreakdown({
    dateISO: tuesday, tasks: [], previousTasks: [sleep], categories: bdCats(),
  });
  assert.equal(tue.totalMinutes, 420, "the other seven hours land on Tuesday");
  assert.equal(tue.slices[0].label, "Sleep");
});

test("a daily overnight task totals its full length on any middle day", () => {
  // Sleep repeats every day, so Tuesday gets Monday's 7-hour tail plus its own
  // 1-hour head — 8 hours, in ONE slice rather than two.
  const sleep = bdTask({
    id: "sleep", categoryId: "cat-sleep", startTime: "11:00 PM", endTime: "7:00 AM",
  });

  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: "2026-07-28", tasks: [sleep], previousTasks: [sleep], categories: bdCats(),
  });

  assert.equal(totalMinutes, 480, "the full 8 hours");
  assert.equal(slices.length, 1, "one slice, not two");
  assert.equal(slices[0].minutes, 480);
});

test("a small-hours task counts on the day it is actually lived", () => {
  // 1–2 AM authored on Monday is really Tuesday 1 AM: the 4 AM day boundary
  // means it belongs to Monday's *bucket* but to Tuesday's calendar day.
  const lateNight = bdTask({
    id: "late", categoryId: "cat-work", startTime: "1:00 AM", endTime: "2:00 AM",
  });

  const mon = buildDayBreakdown({
    dateISO: "2026-07-27", tasks: [lateNight], previousTasks: [], categories: bdCats(),
  });
  assert.equal(mon.totalMinutes, 0, "nothing on the authoring day");

  const tue = buildDayBreakdown({
    dateISO: "2026-07-28", tasks: [], previousTasks: [lateNight], categories: bdCats(),
  });
  assert.equal(tue.totalMinutes, 60, "the whole hour on the next day");
});

test("a task whose category was deleted still contributes its minutes", () => {
  // The donut claims to total the day. Skipping the task — the way a dangling
  // planId used to be skipped — would quietly under-report it.
  const categories = seedCategories().filter((c) => c.id !== "cat-sleep");
  const orphan = bdTask({
    id: "o", categoryId: "cat-sleep", icon: "sleep", startTime: "9:00 AM", endTime: "10:00 AM",
  });

  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: localISODate(new Date()), tasks: [orphan], previousTasks: [], categories,
  });

  assert.equal(totalMinutes, 60, "the minutes are still counted");
  assert.equal(slices.length, 1);
  assert.ok(categories.some((c) => c.id === slices[0].id), "under a category that exists");
});

test("buildDayBreakdown respects per-date overrides", () => {
  // Rescheduling one occurrence to 11 PM moves its minutes to the next day.
  const moved = bdTask({
    id: "m", categoryId: "cat-work", startTime: "9:00 AM", endTime: "10:00 AM",
    exceptions: { "2026-07-27": { startTime: "11:00 PM", endTime: "11:30 PM" } },
  });

  const { totalMinutes } = buildDayBreakdown({
    dateISO: "2026-07-27", tasks: [moved], previousTasks: [], categories: bdCats(),
  });
  assert.equal(totalMinutes, 30, "the override's 30 minutes, not the template's 60");
});

test("buildDayBreakdown is empty when nothing is scheduled", () => {
  const { slices, totalMinutes } = buildDayBreakdown({
    dateISO: localISODate(new Date()), tasks: [], previousTasks: [], categories: bdCats(),
  });
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

// ── Week heatmap ─────────────────────────────────────────────────────────────
// The grid answers "of the time you blocked in this hour, how much got done".
// Completion is credited to the *scheduled* hour, never to the event timestamp:
// back-dated ticks are stamped at noon and a live tick records when the box was
// checked, not when the work happened.

const MON = "2026-07-27";   // a Monday
const TUE = "2026-07-28";
const WED = "2026-07-29";
const THU = "2026-07-30";

const emptyWeek = () => Object.fromEntries(DAYS.map((d) => [d, []]));
const whTask = (over) => ({
  id: "t1", title: "Task", icon: "book", color: "amber", planId: "p1",
  startTime: "9:00 AM", endTime: "10:00 AM", ...over,
});
const doneOn = (dateISO) => [{
  id: "e1", taskId: "t1", completedAt: new Date(`${dateISO}T12:00:00`).toISOString(),
  completionType: "task",
}];
const cellAt = (week, dayKey, hour) => week.cells.find((c) => c.dayKey === dayKey && c.hour === hour);

test("a completed past hour reads as done, and drives avgRate", () => {
  const activities = emptyWeek();
  activities.tuesday = [whTask({ completionHistory: doneOn(TUE) })];

  const week = buildWeekHeatmap({ activities, todayISO: WED, nowMinutes: 12 * 60 });

  assert.deepEqual(week.hours, [9], "only hours with something scheduled become rows");
  assert.equal(week.cells.length, 1);
  assert.deepEqual(
    (({ dayKey, hour, scheduledMinutes, completedMinutes, state }) =>
      ({ dayKey, hour, scheduledMinutes, completedMinutes, state }))(week.cells[0]),
    { dayKey: "tuesday", hour: 9, scheduledMinutes: 60, completedMinutes: 60, state: "done" },
  );
  assert.equal(week.avgRate, 100);
  assert.equal(week.totalScheduledMinutes, 60);
});

test("the same hour left undone reads as missed", () => {
  const activities = emptyWeek();
  activities.tuesday = [whTask({})];

  const week = buildWeekHeatmap({ activities, todayISO: WED, nowMinutes: 12 * 60 });

  assert.equal(cellAt(week, "tuesday", 9).state, "missed");
  assert.equal(week.avgRate, 0);
});

test("an hour that hasn't happened yet is upcoming, not missed", () => {
  const activities = emptyWeek();
  activities.thursday = [whTask({})];

  const week = buildWeekHeatmap({ activities, todayISO: WED, nowMinutes: 12 * 60 });
  const cell = cellAt(week, "thursday", 9);

  assert.equal(cell.state, "upcoming");
  assert.equal(cell.completedMinutes, 0);
  assert.equal(week.totalScheduledMinutes, 60, "still counts toward the week's commitment");
  assert.equal(week.scheduledMinutes, 0, "but not toward the score");
  assert.equal(week.avgRate, 0);
});

test("today splits at the current hour: elapsed is scored, ahead is upcoming", () => {
  const activities = emptyWeek();
  activities.tuesday = [
    whTask({ id: "early", startTime: "8:00 AM", endTime: "9:00 AM" }),
    whTask({ id: "later", startTime: "11:00 AM", endTime: "12:00 PM" }),
  ];

  // 10:30 — the 8am hour is over, the 11am hour hasn't started.
  const week = buildWeekHeatmap({ activities, todayISO: TUE, nowMinutes: 10 * 60 + 30 });

  assert.equal(cellAt(week, "tuesday", 8).state, "missed");
  assert.equal(cellAt(week, "tuesday", 11).state, "upcoming");
});

test("an hour still in progress is never reported as missed", () => {
  const activities = emptyWeek();
  activities.tuesday = [whTask({ startTime: "9:00 AM", endTime: "10:00 AM" })];

  // 9:30 — halfway through the block. Scoring it now would call work-in-progress
  // a failure, so the hour stays upcoming until it has fully passed.
  const week = buildWeekHeatmap({ activities, todayISO: TUE, nowMinutes: 9 * 60 + 30 });

  assert.equal(cellAt(week, "tuesday", 9).state, "upcoming");
});

test("a 1 AM block lands on hour row 1 of the next day, not row 25", () => {
  const activities = emptyWeek();
  // Authored on Monday, but 1 AM is past midnight — the app's 4 AM day boundary
  // means slotInterval returns [1500, 1560). Bucketing that naively would put it
  // in hour 25 and off the end of a 24-row grid.
  activities.monday = [whTask({ startTime: "1:00 AM", endTime: "2:00 AM" })];

  const week = buildWeekHeatmap({ activities, todayISO: THU, nowMinutes: 23 * 60 });

  assert.deepEqual(week.hours, [1]);
  assert.equal(cellAt(week, "monday", 1), undefined, "not on the authoring day");
  assert.equal(cellAt(week, "tuesday", 1).scheduledMinutes, 60, "on the calendar day it runs");
});

test("an overnight block splits across both days it touches", () => {
  const activities = emptyWeek();
  activities.monday = [whTask({ startTime: "11:00 PM", endTime: "7:00 AM" })];

  const week = buildWeekHeatmap({ activities, todayISO: THU, nowMinutes: 23 * 60 });

  assert.equal(cellAt(week, "monday", 23).scheduledMinutes, 60, "the hour before midnight");
  for (let h = 0; h < 7; h++) {
    assert.equal(cellAt(week, "tuesday", h).scheduledMinutes, 60, `tuesday hour ${h}`);
  }
  assert.equal(cellAt(week, "tuesday", 7), undefined, "ends at 7am");
  assert.equal(week.totalScheduledMinutes, 8 * 60, "eight hours, counted once");
});

test("commitments never enter the grid", () => {
  const activities = emptyWeek();
  activities.tuesday = [whTask({ taskType: "commitment" })];

  const week = buildWeekHeatmap({ activities, todayISO: WED, nowMinutes: 12 * 60 });

  assert.equal(week.cells.length, 0);
  assert.equal(week.totalScheduledMinutes, 0, "held time is not something you can fail");
});

test("a half-done multi-slot task credits only the finished slot", () => {
  const activities = emptyWeek();
  activities.tuesday = [whTask({
    startTime: "9:00 AM", endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "2:00 PM", endTime: "3:00 PM" },
    ],
    completedSlotIndices: [0],
  })];

  const week = buildWeekHeatmap({ activities, todayISO: TUE, nowMinutes: 23 * 60 });

  assert.equal(cellAt(week, "tuesday", 9).state, "done");
  assert.equal(cellAt(week, "tuesday", 14).state, "missed");
  assert.equal(week.avgRate, 50, "one of two scheduled hours");
});

test("overlapping blocks in one hour are counted once", () => {
  const activities = emptyWeek();
  activities.tuesday = [
    whTask({ id: "wide", startTime: "9:00 AM", endTime: "11:00 AM" }),
    whTask({ id: "inner", startTime: "9:00 AM", endTime: "10:00 AM" }),
  ];

  const week = buildWeekHeatmap({ activities, todayISO: WED, nowMinutes: 12 * 60 });

  assert.equal(cellAt(week, "tuesday", 9).scheduledMinutes, 60, "an hour holds 60 minutes, not 120");
  assert.equal(week.totalScheduledMinutes, 120);
});

test("planWeekRate scores one plan and reports the whole week's hours", () => {
  const activities = emptyWeek();
  activities.tuesday = [
    whTask({ id: "a", planId: "p1", startTime: "9:00 AM", endTime: "10:00 AM", completionHistory: doneOn(TUE) }),
    whTask({ id: "b", planId: "p2", startTime: "1:00 PM", endTime: "2:00 PM" }),
  ];
  activities.thursday = [whTask({ id: "c", planId: "p1", startTime: "9:00 AM", endTime: "10:00 AM" })];

  const p1 = planWeekRate(activities, "p1", WED, 12 * 60);
  const p2 = planWeekRate(activities, "p2", WED, 12 * 60);

  assert.equal(p1.scheduledMinutes, 120, "Tuesday plus the still-upcoming Thursday");
  assert.equal(p1.rate, 100, "scored on the elapsed hour only");
  assert.equal(p2.rate, 0, "a different plan's miss doesn't touch p1");
});

// ── Overnight tasks are valid data ───────────────────────────────────────────
// The 4 AM timeline ceiling is a *drawing* limit, not a scheduling one. Enforcing
// it in validation rejected Sleep 10 PM–5:45 AM while allowing the same block if
// it ended at 3:59 AM, and contradicted the carry-over rendering and the donut's
// midnight split, both of which handle these blocks.

const vTask = (startTime, endTime) => ({ title: "Sleep", day: "monday", startTime, endTime });

test("an overnight task may end after 4 AM", () => {
  assert.equal(validateTaskTime(vTask("10:00 PM", "5:45 AM")), null, "the reported case");
  assert.equal(validateTaskTime(vTask("11:00 PM", "7:00 AM")), null, "the Sleep block the app already renders");
  assert.equal(validateTaskTime(vTask("11:00 PM", "3:00 AM")), null, "and the case that always passed");
});

test("duration, not the clock, is what bounds a block", () => {
  // 16h is the cap: 6 AM → 10 PM is exactly at it, one more hour is over.
  assert.equal(validateTaskTime(vTask("6:00 AM", "10:00 PM")), null);

  const tooLong = validateTaskTime(vTask("5:00 AM", "10:00 PM"));
  assert.equal(tooLong?.code, "too-long");

  const tooShort = validateTaskTime(vTask("9:00 AM", "9:03 AM"));
  assert.equal(tooShort?.code, "too-short");
});
