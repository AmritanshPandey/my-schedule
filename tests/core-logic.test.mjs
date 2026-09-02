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
  markSlotMissed,
  resolveSlotState,
  taskStatusLabel,
  toggleTaskFromCheckbox,
} = await import("../lib/taskCompletion.ts");
const {
  applyTaskDelete,
  clearDay,
  summarizeDayClear,
  createTaskDeleteSnapshot,
  updateTaskDays,
  updateTaskPerDay,
  setTaskException,
  clearTaskException,
  getSlots,
  withSlots,
  retimeSlot,
  removeTaskSlot,
  moveTaskSlot,
  duplicateTaskSlot,
} = await import("../lib/taskMutations.ts");
const {
  normalizeTasks,
  resetStaleCompletions,
  NORMALIZED_OPTIONAL_TASK_FIELDS,
} = await import("../lib/scheduleNormalize.ts");
const { isTaskScheduledOn, resolveOccurrence, diffException, weeksBetween } = await import("../lib/taskOccurrence.ts");
const { constrainTaskToPlanWindow } = await import("../lib/planTaskWindow.ts");
const { normalizeMilestoneTimeline, cascadeMilestoneDates, moveMilestone } = await import("../lib/roadmapDates.ts");
const { computeRoadmapStats } = await import("../lib/roadmapEngine.ts");
const { calculateLinkedTaskProgress, calculateMilestoneProgress, calculatePlanProgress } = await import("../lib/planProgress.ts");
const { resolveLinkedTasks } = await import("../lib/notes/linkedTasks.ts");
const { computeExecutionTrend, trendNarrative } = await import("../lib/executionAnalytics.ts");
const { getNowOnTimeline, mapMinutesToTimeline } = await import("../lib/timeline/displayWindow.ts");
const {
  buildDayBreakdown,
  taskScheduledMinutes,
  taskDayMinutes,
  buildActiveHours,
  donutSegments,
  HELD_TIME_ID,
  UNSCHEDULED_ID,
  SCHEDULE_DAY_MINUTES,
  DEFAULT_WAKING_START_MINUTES,
} = await import("../lib/dayBreakdown.ts");
const { getWakingWindowMinutes, DEFAULT_SLEEP_HOURS, MIN_SLEEP_HOURS, MAX_SLEEP_HOURS } =
  await import("../lib/timeline/sleepWindow.ts");
const { continuationInterval, SCHEDULE_DAY_HANDOVER_MINUTES } =
  await import("../lib/timeline/overnight.ts");
const { buildWeeklyHeatmap, levelForMinutes, BAND_COUNT } =
  await import("../lib/analytics/weeklyHeatmap.ts");
const { applyAutoMissed } = await import("../lib/consistency/autoMiss.ts");
const { selectTodayTasks } = await import("../lib/todayTasks.ts");
const { selectNeedsAttention, MISSED_LOOKBACK_DAYS, MIN_STREAK_TO_WARN } = await import("../lib/needsAttention.ts");
const { acknowledgeMiss, rescheduleMissedTaskOnce, missKey } = await import("../lib/missedRecovery.ts");
const { CategoryRegistry, categoryUsageCounts, canDeleteCategory } = await import("../lib/taskCategories.ts");
const { taskIdentity, categoriesById } = await import("../lib/taskIdentity.ts");
const { calculateExecutionStreak } = await import("../lib/consistency/calculateExecutionStreak.ts");
const { localISODate, addDaysToISO } = await import("../lib/dateUtils.ts");
const { parseTimeToMinutes, toScheduleDayMinutes, displayToInputTime, inputToDisplayTime, formatDisplayTime, punctuateTimeDigits } = await import("../lib/timeUtils.ts");
const { DAYS } = await import("../lib/scheduleConstants.ts");
const { toggleRitualCompletion } = await import("../lib/ritualCompletions.ts");
const { pushHistory, popHistory, HISTORY_LIMIT } = await import("../lib/scheduleHistory.ts");
const { isEditableTarget } = await import("../lib/keyboardEvents.ts");
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
const { normalizeCustomDays, resolveCustomVisibleDates } = await import("../lib/customView.ts");
const { ScheduleSchema, validateSchedule, schedulePayloadBytes } = await import("../lib/scheduleSchema.ts");
const { parseBackup } = await import("../lib/backup.ts");

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

function validSchedule() {
  return {
    goals: [],
    plans: [{
      id: "plan-1",
      title: "Plan",
      category: "work",
      emoji: "briefcase",
      color: "blue",
      items: [],
    }],
    categories: [],
    activities: Object.fromEntries(DAYS.map((day) => [day, []])),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
  };
}

test("time formatting keeps storage compatible while presenting one 12-hour format", () => {
  assert.equal(parseTimeToMinutes("14:30"), parseTimeToMinutes("02:30 PM"));
  assert.equal(displayToInputTime("2:30 PM"), "14:30");
  assert.equal(inputToDisplayTime("14:30"), "02:30 PM");
  assert.equal(formatDisplayTime("00:05"), "12:05 AM");
  assert.equal(formatDisplayTime("12:00"), "12:00 PM");
  assert.equal(formatDisplayTime("23:45"), "11:45 PM");
});

test("runtime schedule validation accepts the current minimal schedule shape", () => {
  const result = validateSchedule(validSchedule());
  assert.equal(result.success, true);
  assert.equal(schedulePayloadBytes(validSchedule()) > 0, true);
});

test("runtime schedule validation accepts preferences.sleepHours", () => {
  const withSleep = validSchedule();
  withSleep.preferences = { sleepHours: 7.5 };
  assert.equal(validateSchedule(withSleep).success, true);

  const withoutSleep = validSchedule();
  withoutSleep.preferences = {};
  assert.equal(validateSchedule(withoutSleep).success, true, "sleepHours stays optional");
});

test("runtime schedule validation rejects missing required structure", () => {
  const invalid = validSchedule();
  delete invalid.activities;
  assert.equal(ScheduleSchema.safeParse(invalid).success, false);
});

test("runtime schedule validation rejects invalid task, recurrence, and metric data", () => {
  const invalid = validSchedule();
  invalid.activities.monday = [{
    id: "",
    title: "Broken",
    startTime: "09:00",
    endTime: "10:00",
    planId: "plan-1",
    recurrence: { type: "weekly", interval: 0, anchorISO: "not-a-date" },
  }];
  invalid.metricEntries = [{ id: "entry-1", planId: "plan-1", trackerId: "tracker-1", value: NaN, date: "2026-99-99" }];
  assert.equal(validateSchedule(invalid).success, false);
});

test("runtime schedule validation rejects malformed milestone, tracker, note, and strategy data", () => {
  const invalid = validSchedule();
  invalid.progressTrackers = [{ id: "tracker-1", planId: "missing-plan", title: "Weight", type: "text" }];
  invalid.milestones = [{
    id: "milestone-1", planId: "plan-1", title: "Phase", startDate: "2026-08-20",
    plannedDurationDays: 0, plannedEndDate: "2026-08-20", status: "upcoming",
    linkedActivities: [], linkedTrackers: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sortOrder: 0,
  }];
  invalid.notes = [{ id: "note-1", title: "Note", body: 42, createdAt: "bad", updatedAt: "bad" }];
  assert.equal(validateSchedule(invalid).success, false);
});

test("backup parsing accepts a PlanR envelope and rejects malformed JSON safely", () => {
  const schedule = validSchedule();
  assert.deepEqual(parseBackup(JSON.stringify({ app: "PlanR", format: 1, schedule })).plans, schedule.plans);
  assert.throws(() => parseBackup("{not json"), /valid JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ app: "PlanR", format: 1, schedule: { activities: [] } })), /schedule data/);
});

test("custom range falls back cleanly when the selected day list is empty", () => {
  const weekDates = DAYS.map((day, i) => ({ day, date: new Date(2026, 7, 15 + i) }));
  assert.deepEqual(normalizeCustomDays([]), [...DAYS]);
  assert.deepEqual(resolveCustomVisibleDates(weekDates, []), weekDates);
  assert.deepEqual(resolveCustomVisibleDates(weekDates, ["monday", "wednesday"]), [
    weekDates[0],
    weekDates[2],
  ]);
});

test("custom range falls back cleanly when the selected day list is empty", () => {
  const weekDates = DAYS.map((day, i) => ({ day, date: new Date(2026, 7, 15 + i) }));
  assert.deepEqual(normalizeCustomDays([]), [...DAYS]);
  assert.deepEqual(resolveCustomVisibleDates(weekDates, []), weekDates);
  assert.deepEqual(resolveCustomVisibleDates(weekDates, ["monday", "wednesday"]), [
    weekDates[0],
    weekDates[2],
  ]);
});

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

// ── Clear day (whole-weekday wipe) ──────────────────────────────────────────
// A template operation, like swapDays: it clears the weekday for good, not the
// one date the user was looking at. These are the first tests any whole-day op
// has had — swapDays and duplicateDay still have none.

function milestoneWith(linkedActivities) {
  return {
    id: "milestone-1",
    planId: "plan-1",
    title: "Milestone",
    startDate: "2026-06-01",
    plannedDurationDays: 7,
    plannedEndDate: "2026-06-08",
    status: "active",
    linkedActivities,
    linkedTrackers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: 0,
  };
}

test("clearDay empties one weekday and leaves the others alone", () => {
  const schedule = emptySchedule();
  schedule.activities.monday = [baseTask("a"), baseTask("b")];
  schedule.activities.tuesday = [baseTask("c")];

  const result = clearDay("monday")(schedule);

  assert.deepEqual(result.activities.monday, []);
  assert.equal(result.activities.tuesday.length, 1, "Tuesday is untouched");
  assert.equal(schedule.activities.monday.length, 2, "the input is not mutated");
});

test("clearDay keeps a repeated task's other weekdays", () => {
  // The same id lives in several buckets — that is what "repeats" means here.
  const schedule = emptySchedule();
  schedule.activities.monday = [{ ...baseTask("repeat-me"), title: "Monday copy" }];
  schedule.activities.wednesday = [{ ...baseTask("repeat-me"), title: "Wednesday copy" }];

  const result = clearDay("monday")(schedule);

  assert.deepEqual(result.activities.monday, []);
  assert.equal(result.activities.wednesday[0].title, "Wednesday copy", "Wednesday survives");
});

test("clearDay prunes a milestone link only when no weekday is left", () => {
  // Exactly the split createTaskDeleteSnapshot encodes. Truncating the bucket
  // without this leaves linkedActivities pointing at tasks that no longer exist.
  const schedule = emptySchedule();
  schedule.activities.monday = [baseTask("gone"), { ...baseTask("survivor") }];
  schedule.activities.friday = [{ ...baseTask("survivor") }];
  schedule.milestones = [milestoneWith(["gone", "survivor"])];

  const result = clearDay("monday")(schedule);

  assert.deepEqual(
    result.milestones[0].linkedActivities,
    ["survivor"],
    "the task with a Friday row keeps its link; the one with nowhere left loses it",
  );
});

test("clearDay leaves milestones untouched when nothing was linked", () => {
  const schedule = emptySchedule();
  schedule.activities.monday = [baseTask("a")];
  schedule.milestones = [milestoneWith(["unrelated"])];

  const result = clearDay("monday")(schedule);
  assert.equal(result.milestones, schedule.milestones, "same reference — no needless rewrite");
});

test("clearDay on an empty day is inert", () => {
  // Identity matters: setSchedule pushes an undo entry for every call, so a
  // no-op clear would otherwise cost the user their real undo step.
  const schedule = emptySchedule();
  const result = clearDay("monday")(schedule);
  assert.equal(result, schedule, "the identical object, not a copy");
});

test("summarizeDayClear counts what the confirmation has to name", () => {
  const schedule = emptySchedule();
  schedule.activities.monday = [
    { ...baseTask("done"), completed: true },
    { ...baseTask("skipped"), missed: true },
    { ...baseTask("repeat") },
    { ...baseTask("one-off"), recurrence: { type: "once", dateISO: "2026-06-01" } },
  ];
  schedule.activities.thursday = [{ ...baseTask("repeat") }];

  const summary = summarizeDayClear(schedule, "monday");

  assert.equal(summary.total, 4);
  assert.equal(summary.completed, 1);
  assert.equal(summary.missed, 1);
  assert.equal(summary.alsoOnOtherDays, 1, "only the task with a Thursday row");
  assert.equal(summary.onceOnly, 1, "a dated task has no other weekday to return on");

  const empty = summarizeDayClear(schedule, "sunday");
  assert.equal(empty.total, 0);
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

// restoreTaskDelete's own index-precise splice-back test was removed along
// with the function (lib/taskMutations.ts) — it's superseded by the general
// Cmd+Z undo stack (lib/scheduleHistory.ts), which restores the whole prior
// Schedule object by reference rather than re-deriving indices, so there's no
// separate restore logic left to test here (see the pushHistory/popHistory
// tests above — popHistory returning the exact prior snapshot is the whole
// guarantee undo needs).

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

test("plan date range constrains linked task windows", () => {
  const plan = { startDate: "2026-06-10", endDate: "2026-06-20" };
  assert.deepEqual(
    constrainTaskToPlanWindow({}, plan),
    { activeFrom: "2026-06-10", activeUntil: "2026-06-20" }
  );
  assert.deepEqual(
    constrainTaskToPlanWindow(
      { activeFrom: "2026-06-12", activeUntil: "2026-06-18" },
      plan
    ),
    { activeFrom: "2026-06-12", activeUntil: "2026-06-18" }
  );
  assert.deepEqual(
    constrainTaskToPlanWindow(
      { activeFrom: "2026-06-01", activeUntil: "2026-06-30" },
      plan
    ),
    { activeFrom: "2026-06-10", activeUntil: "2026-06-20" }
  );
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

  // trackingStart: schedule-wide cutoff hides everything before it, regardless of recurrence
  assert.equal(isTaskScheduledOn(base(), D, true, "2026-06-23"), false, "before trackingStart -> hidden");
  assert.equal(isTaskScheduledOn(base(), D, true, D), true, "on trackingStart -> still visible");
  assert.equal(isTaskScheduledOn(base(), D, true, "2026-06-01"), true, "after trackingStart -> unaffected");
  assert.equal(isTaskScheduledOn(base(), D, true), true, "omitted trackingStart -> unaffected (regression)");
  assert.equal(isTaskScheduledOn(base(), D, true, undefined), true, "explicit undefined trackingStart -> unaffected");

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

test("moveMilestone reorders the sequence and re-lays dates back-to-back", () => {
  const mk = (id, start, dur, sortOrder) => ({
    id, planId: "p", title: id, startDate: start, plannedDurationDays: dur,
    plannedEndDate: "", status: "upcoming", linkedActivities: [], linkedTrackers: [],
    createdAt: "", updatedAt: "2020-01-01T00:00:00Z", sortOrder,
  });
  const ms = [mk("m0", "2026-06-01", 7, 0), mk("m1", "2026-06-08", 7, 1), mk("m2", "2026-06-15", 7, 2)];

  // Move the middle milestone up: order becomes m1, m0, m2, and the whole set
  // re-lays sequentially from the anchor rather than keeping each milestone's
  // own stored date (which would leave the list visually out of chronological
  // order — the whole point of a reorder is that the dates follow it).
  const up = moveMilestone(ms, "m1", "up", "2026-06-01");
  assert.deepEqual(up.map((m) => m.id), ["m1", "m0", "m2"], "m1 swaps ahead of m0");
  assert.deepEqual(up.map((m) => m.sortOrder), [0, 1, 2], "re-indexed 0..n-1");
  assert.equal(up[0].startDate, "2026-06-01");
  assert.equal(up[0].plannedEndDate, "2026-06-07");
  assert.equal(up[1].startDate, "2026-06-08");
  assert.equal(up[2].startDate, "2026-06-15", "m2's slot is unaffected by a swap ahead of it");

  // Move the middle milestone down: order becomes m0, m2, m1.
  const down = moveMilestone(ms, "m1", "down", "2026-06-01");
  assert.deepEqual(down.map((m) => m.id), ["m0", "m2", "m1"]);

  // Moving the first one up, or the last one down, is a no-op on order.
  const pastTop = moveMilestone(ms, "m0", "up", "2026-06-01");
  assert.deepEqual(pastTop.map((m) => m.id), ["m0", "m1", "m2"]);
  const pastBottom = moveMilestone(ms, "m2", "down", "2026-06-01");
  assert.deepEqual(pastBottom.map((m) => m.id), ["m0", "m1", "m2"]);

  // An id that doesn't exist leaves the order untouched but still normalizes.
  const missing = moveMilestone(ms, "nope", "up", "2026-06-01");
  assert.deepEqual(missing.map((m) => m.id), ["m0", "m1", "m2"]);
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

// ── Per-slot "missed" (a task occurring multiple times in the same day) ──────
// Regression coverage for the bug where every block of a repeated-same-day
// task showed the same "missed" state the moment any ONE of them was —
// there was no way to miss (or tell apart) one occurrence independently of
// its siblings.

function multiSlotTask(overrides = {}) {
  return {
    id: "multi-4",
    title: "Portfolio",
    startTime: "9:30 AM",
    endTime: "12:15 PM",
    slots: [
      { startTime: "9:30 AM", endTime: "12:15 PM" },
      { startTime: "12:15 PM", endTime: "1:15 PM" },
    ],
    icon: "code",
    color: "violet",
    planId: "plan-1",
    ...overrides,
  };
}

test("markSlotMissed misses one phase independent of its sibling", () => {
  const task = multiSlotTask();

  const afterFirst = { ...task, ...markSlotMissed(task, 0) };
  assert.deepEqual(afterFirst.missedSlotIndices, [0]);
  assert.equal(afterFirst.missed, false, "one of two phases missed is not the whole task missed");
  assert.equal(resolveSlotState(afterFirst, 0), "missed");
  assert.equal(resolveSlotState(afterFirst, 1), "incomplete", "the sibling phase is untouched");

  const afterSecond = { ...afterFirst, ...markSlotMissed(afterFirst, 1) };
  assert.deepEqual(afterSecond.missedSlotIndices.sort(), [0, 1]);
  assert.equal(afterSecond.missed, true, "every phase missed now reads as the whole task missed");

  const afterUndo = { ...afterSecond, ...markSlotMissed(afterSecond, 0) };
  assert.deepEqual(afterUndo.missedSlotIndices, [1]);
  assert.equal(afterUndo.missed, false, "un-missing one phase clears the whole-task summary again");
  assert.equal(resolveSlotState(afterUndo, 1), "missed", "the still-missed sibling is unaffected by the undo");
});

test("markSlotMissed clears that phase's own completion, not its sibling's", () => {
  const task = { ...multiSlotTask(), completedSlotIndices: [1] }; // phase 1 already done
  const missedFirst = { ...task, ...markSlotMissed(task, 0) };
  assert.deepEqual(missedFirst.missedSlotIndices, [0]);
  assert.deepEqual(missedFirst.completedSlotIndices, [1], "the already-done sibling phase stays done");
});

test("completing a phase un-misses only that phase (not a sibling's independent miss)", () => {
  // The bug: toggleSlotComplete used to strip EVERY missed event for today,
  // so completing phase 1 while phase 0 was separately missed silently
  // un-missed phase 0 too.
  const task = multiSlotTask();
  const bothPending = { ...task, ...markSlotMissed(task, 0) };
  const afterCompletingOther = { ...bothPending, ...toggleSlotComplete(bothPending, 1, 0) };
  assert.deepEqual(afterCompletingOther.completedSlotIndices, [1]);
  assert.deepEqual(afterCompletingOther.missedSlotIndices, [0], "phase 0's miss survives phase 1 being completed");
  assert.equal(resolveSlotState(afterCompletingOther, 0), "missed");
  assert.equal(resolveSlotState(afterCompletingOther, 1), "completed");
});

test("resolveSlotState never falls back to the whole-task missed/completed flags", () => {
  // A stale/legacy whole-task `missed: true` with no per-slot data must not
  // make every phase read as missed — that's exactly the "can't tell the
  // blocks apart" bug this function exists to avoid reintroducing.
  const task = { ...multiSlotTask(), missed: true, completed: false };
  assert.equal(resolveSlotState(task, 0), "incomplete");
  assert.equal(resolveSlotState(task, 1), "incomplete");
});

test("completionForDate reads a per-slot missed event as that phase only, not the whole day", () => {
  const today = localISODate(new Date());
  const task = {
    ...multiSlotTask(),
    id: "multi-5",
    completionHistory: [
      { id: "e1", taskId: "multi-5", completionType: "missed", slotIndex: 0, completedAt: new Date(`${today}T12:00:00`).toISOString() },
    ],
  };
  const derived = completionForDate(task, today);
  assert.deepEqual(derived.missedSlotIndices, [0]);
  assert.equal(derived.missed, false, "one missed phase of two is not the whole day missed");
});

test("completionForDate reports the whole day missed once every phase has its own missed event", () => {
  const today = localISODate(new Date());
  const task = {
    ...multiSlotTask(),
    id: "multi-6",
    completionHistory: [
      { id: "e1", taskId: "multi-6", completionType: "missed", slotIndex: 0, completedAt: new Date(`${today}T12:00:00`).toISOString() },
      { id: "e2", taskId: "multi-6", completionType: "missed", slotIndex: 1, completedAt: new Date(`${today}T12:00:00`).toISOString() },
    ],
  };
  const derived = completionForDate(task, today);
  assert.deepEqual(derived.missedSlotIndices.sort(), [0, 1]);
  assert.equal(derived.missed, true);
});

test("applyAutoMissed only misses a multi-slot task's unresolved phases, not the done one", () => {
  const now = new Date(2026, 0, 15, 10, 0, 0);
  const D = "2026-01-14";
  const task = {
    ...multiSlotTask(),
    id: "t-multi-open",
    taskType: "task",
    subtasks: [],
    // Phase 0 was completed that day; phase 1 was left untouched.
    completionHistory: [
      { id: "e1", taskId: "t-multi-open", completionType: "slot", slotIndex: 0, completedAt: new Date(`${D}T12:00:00`).toISOString() },
    ],
  };
  const sched = autoMissSchedule({ lastRolloverISO: "2026-01-13" });
  sched.activities[autoMissWkKey(D)] = [task];

  const r = applyAutoMissed(sched, now);
  const missedEvents = (r.activities[autoMissWkKey(D)][0].completionHistory ?? []).filter((e) => e.completionType === "missed");
  assert.equal(missedEvents.length, 1, "only the unresolved phase gets a missed event");
  assert.equal(missedEvents[0].slotIndex, 1, "phase 0 (already done) is spared");

  const derived = completionForDate(r.activities[autoMissWkKey(D)][0], D);
  assert.deepEqual(derived.completedSlotIndices, [0]);
  assert.deepEqual(derived.missedSlotIndices, [1]);
  assert.equal(derived.missed, false, "half-done, half-missed is not the whole day missed");
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

test("removeTaskSlot removes one phase and preserves sibling completion state", () => {
  const schedule = emptySchedule();
  schedule.activities.monday = [{
    id: "multi-remove",
    title: "Study",
    startTime: "9:00 AM",
    endTime: "10:00 AM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
      { startTime: "7:00 PM", endTime: "8:00 PM" },
    ],
    completedSlotIndices: [0, 2],
    completed: false,
    icon: "book",
    color: "amber",
    planId: "plan-1",
  }];

  const result = removeTaskSlot("multi-remove", "monday", 1)(schedule);
  const task = result.activities.monday[0];
  assert.deepEqual(getSlots(task).map((slot) => slot.startTime), ["9:00 AM", "7:00 PM"]);
  assert.deepEqual(task.completedSlotIndices, [0, 1]);
  assert.equal(task.completed, true);
  assert.equal(result.activities.monday.length, 1);
});

test("moveTaskSlot: same-day drag behaves identically to retimeSlot", () => {
  const sched = emptySchedule();
  const task = {
    id: "m1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM",
    icon: "run", color: "cyan", planId: "p",
  };
  sched.activities.monday = [task];

  const next = moveTaskSlot("m1", "monday", 0, "monday", "2026-08-17", "11:00 AM", "12:00 PM")(sched);
  assert.equal(next.activities.monday.length, 1);
  assert.equal(next.activities.monday[0].startTime, "11:00 AM");
  assert.equal(next.activities.monday[0].endTime, "12:00 PM");
  // No other day touched.
  assert.deepEqual(next.activities.tuesday, []);
});

test("moveTaskSlot: cross-day, single-slot, no existing target copy — full relocation", () => {
  const sched = emptySchedule();
  const task = {
    id: "m2", title: "Read", startTime: "9:00 AM", endTime: "9:30 AM",
    icon: "book", color: "amber", planId: "p",
    subtasks: [{ id: "sub-1", task: "Chapter 1" }],
    completionHistory: [event("m2", "task", "2026-08-10T09:00:00.000Z")],
  };
  sched.activities.monday = [task];
  sched.activities.tuesday = [];

  const next = moveTaskSlot("m2", "monday", 0, "tuesday", "2026-08-18", "6:00 PM", "6:30 PM")(sched);
  assert.deepEqual(next.activities.monday, [], "removed from the source day entirely");
  assert.equal(next.activities.tuesday.length, 1);
  const moved = next.activities.tuesday[0];
  assert.equal(moved.id, "m2");
  assert.equal(moved.startTime, "6:00 PM");
  assert.equal(moved.endTime, "6:30 PM");
  assert.equal("slots" in moved, false, "single-slot task stays free of a slots field");
  assert.deepEqual(moved.subtasks, task.subtasks, "subtasks carry over — a relocation, not a fresh copy");
  assert.deepEqual(moved.completionHistory, task.completionHistory, "history is preserved, not stripped");
});

test("moveTaskSlot: cross-day, multi-slot — dragging one phase leaves the siblings on sourceDay", () => {
  const sched = emptySchedule();
  const task = {
    id: "m3", title: "Study", startTime: "9:00 AM", endTime: "12:00 PM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "12:00 PM", endTime: "1:00 PM" },
      { startTime: "3:00 PM", endTime: "4:00 PM" },
    ],
    icon: "book", color: "amber", planId: "p",
    completedSlotIndices: [0, 1, 2], // all three phases already done
  };
  sched.activities.monday = [task];

  // Drag the morning phase (index 0) away — two siblings remain, forcing
  // their completedSlotIndices entries to shift down by one.
  const next = moveTaskSlot("m3", "monday", 0, "tuesday", "2026-08-18", "8:00 AM", "9:00 AM")(sched);

  assert.equal(next.activities.monday.length, 1, "two remaining phases keep the entry alive on Monday");
  assert.deepEqual(getSlots(next.activities.monday[0]).map((s) => s.startTime), ["12:00 PM", "3:00 PM"]);
  assert.deepEqual(
    next.activities.monday[0].completedSlotIndices,
    [0, 1],
    "indices 1 and 2's completion shift down to 0 and 1 after index 0 is removed"
  );

  assert.equal(next.activities.tuesday.length, 1);
  const moved = next.activities.tuesday[0];
  assert.equal(moved.startTime, "8:00 AM");
  assert.equal(moved.endTime, "9:00 AM");
  assert.equal("slots" in moved, false, "a single relocated slot collapses to a plain startTime/endTime task");
  assert.deepEqual(moved.completedSlotIndices, [0], "the moved phase's own completion travels with it");
});

test("moveTaskSlot: splitting a task does not duplicate its completion history", () => {
  const sched = emptySchedule();
  const history = [event("split", "task", "2026-08-10T09:00:00.000Z")];
  sched.activities.monday = [{
    id: "split", title: "Study", startTime: "9:00 AM", endTime: "12:00 PM",
    slots: [
      { startTime: "9:00 AM", endTime: "10:00 AM" },
      { startTime: "11:00 AM", endTime: "12:00 PM" },
    ],
    icon: "book", color: "amber", planId: "p", completionHistory: history,
  }];

  const next = moveTaskSlot("split", "monday", 0, "tuesday", "2026-08-18", "8:00 AM", "9:00 AM")(sched);
  assert.deepEqual(next.activities.monday[0].completionHistory, history);
  assert.equal(next.activities.tuesday[0].completionHistory, undefined);
});

test("moveTaskSlot: cross-day, multi-slot, dragging the last slot removes the whole source entry", () => {
  const sched = emptySchedule();
  sched.activities.monday = [
    { id: "m4", title: "Stretch", startTime: "7:00 AM", endTime: "7:15 AM", icon: "run", color: "cyan", planId: "p" },
  ];
  const next = moveTaskSlot("m4", "monday", 0, "wednesday", "2026-08-19", "7:00 AM", "7:15 AM")(sched);
  assert.deepEqual(next.activities.monday, []);
  assert.equal(next.activities.wednesday.length, 1);
});

test("moveTaskSlot: cross-day merge into an existing target copy — before and after re-sort", () => {
  const sched = emptySchedule();
  sched.activities.monday = [
    {
      id: "m5", title: "Read", startTime: "9:00 PM", endTime: "9:30 PM",
      icon: "book", color: "amber", planId: "p",
      completedSlotIndices: [0],
      completionHistory: [event("m5", "task", "2026-08-10T21:00:00.000Z")],
    },
  ];
  sched.activities.wednesday = [
    {
      id: "m5", title: "Read", startTime: "8:00 AM", endTime: "8:30 AM",
      icon: "book", color: "amber", planId: "p",
      completedSlotIndices: [],
      completionHistory: [event("m5", "task", "2026-08-12T08:00:00.000Z")],
    },
  ];

  // New slot (from Monday 9:00 PM, completed) lands *after* Wednesday's
  // existing 8:00 AM slot once sorted.
  const next = moveTaskSlot("m5", "monday", 0, "wednesday", "2026-08-19", "10:00 AM", "10:30 AM")(sched);
  assert.deepEqual(next.activities.monday, []);
  assert.equal(next.activities.wednesday.length, 1, "merged into the existing copy, not duplicated");
  const merged = next.activities.wednesday[0];
  assert.deepEqual(getSlots(merged).map((s) => s.startTime), ["8:00 AM", "10:00 AM"]);
  assert.deepEqual(merged.completedSlotIndices, [1], "the moved (completed) slot is now at index 1 after sorting");
  assert.equal(merged.completionHistory.length, 2, "both sides' history is concatenated, not overwritten");

  // Same merge, but the new slot sorts *before* the existing one.
  const sched2 = emptySchedule();
  sched2.activities.monday = [
    { id: "m6", title: "Read", startTime: "9:00 PM", endTime: "9:30 PM", icon: "book", color: "amber", planId: "p" },
  ];
  sched2.activities.wednesday = [
    { id: "m6", title: "Read", startTime: "8:00 AM", endTime: "8:30 AM", icon: "book", color: "amber", planId: "p", completedSlotIndices: [0] },
  ];
  const next2 = moveTaskSlot("m6", "monday", 0, "wednesday", "2026-08-19", "6:00 AM", "6:30 AM")(sched2);
  const merged2 = next2.activities.wednesday[0];
  assert.deepEqual(getSlots(merged2).map((s) => s.startTime), ["6:00 AM", "8:00 AM"]);
  assert.deepEqual(merged2.completedSlotIndices, [1], "the pre-existing completed slot shifts to index 1");
});

test("moveTaskSlot: merging an incomplete slot clears stale whole-task completion", () => {
  const sched = emptySchedule();
  sched.activities.monday = [
    { id: "complete-merge", title: "Read", startTime: "9:00 PM", endTime: "9:30 PM", icon: "book", color: "amber", planId: "p" },
  ];
  sched.activities.wednesday = [
    {
      id: "complete-merge", title: "Read", startTime: "8:00 AM", endTime: "8:30 AM",
      icon: "book", color: "amber", planId: "p", completed: true, completedAt: "2026-08-10T08:30:00.000Z",
    },
  ];

  const next = moveTaskSlot("complete-merge", "monday", 0, "wednesday", "2026-08-19", "10:00 AM", "10:30 AM")(sched);
  const merged = next.activities.wednesday[0];
  assert.equal(merged.completed, false);
  assert.equal(merged.completedAt, undefined);
  assert.deepEqual(merged.completedSlotIndices, [0]);
});

test("moveTaskSlot: task not found on sourceDay is a no-op", () => {
  const sched = emptySchedule();
  sched.activities.monday = [
    { id: "real", title: "Real", startTime: "9:00 AM", endTime: "10:00 AM", icon: "star", color: "amber", planId: "p" },
  ];
  const next = moveTaskSlot("ghost", "monday", 0, "tuesday", "2026-08-18", "9:00 AM", "10:00 AM")(sched);
  assert.equal(next, sched, "returns the same schedule reference, untouched");
});

test("moveTaskSlot: a once-recurrence task is repinned to the drop date, not left stale", () => {
  // Regression: a task scheduled for a single specific calendar date (not a
  // weekly repeat) that keeps its old recurrence.dateISO after a cross-day
  // move becomes permanently invisible — isTaskScheduledOn compares that
  // date against the *new* weekday bucket's dates, which it can never match.
  const sched = emptySchedule();
  sched.activities.thursday = [
    {
      id: "once-1", title: "One-off review", startTime: "9:00 AM", endTime: "10:00 AM",
      icon: "book", color: "amber", planId: "p",
      recurrence: { type: "once", dateISO: "2026-08-20" }, // Thursday's date
    },
  ];

  const next = moveTaskSlot("once-1", "thursday", 0, "friday", "2026-08-21", "2:00 PM", "3:00 PM")(sched);
  assert.deepEqual(next.activities.thursday, []);
  assert.equal(next.activities.friday.length, 1);
  assert.deepEqual(
    next.activities.friday[0].recurrence,
    { type: "once", dateISO: "2026-08-21" },
    "recurrence.dateISO follows the task to its new date"
  );
  assert.equal(isTaskScheduledOn(next.activities.friday[0], "2026-08-21", true), true, "renders on its new date");
  assert.equal(isTaskScheduledOn(next.activities.friday[0], "2026-08-20", true), false, "no longer pinned to the old date");
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

  const { slices, totalMinutes, committedMinutes } = buildDayBreakdown(tasks, categories, today);
  assert.equal(committedMinutes, 300, "dangling and uncategorised tasks are excluded");
  assert.equal(totalMinutes, 1440, "the ring is the whole day, not just what is booked");
  assert.deepEqual(
    slices.map((s) => [s.id, s.minutes, s.pct]),
    // pct is a share of the 24h day now, so 180 minutes reads as 13%, not 60%.
    [["cat-code", 180, 13], [HELD_TIME_ID, 60, 4], ["cat-barbell", 60, 4], [UNSCHEDULED_ID, 1140, 79]],
    "largest first; equal slices break the tie on label (Held time < Workout)",
  );
  assert.equal(slices[0].label, "Coding");
  assert.equal(slices[0].color, "indigo", "wedge colour is the category's, so it matches the timeline");
  assert.equal(slices.find((s) => s.id === HELD_TIME_ID).label, "Held time");
  assert.equal(slices.find((s) => s.id === HELD_TIME_ID).color, null, "held time has no accent");
});

test("buildDayBreakdown: a task before trackingStart contributes nothing", () => {
  const categories = [{ id: "cat-code", title: "Coding", icon: "code", color: "indigo" }];
  const t = (over) => ({ id: over.id, title: over.id, planId: "p", startTime: over.startTime, endTime: over.endTime, ...over });
  const tasks = [t({ id: "a", categoryId: "cat-code", startTime: "9:00 AM", endTime: "11:00 AM" })]; // 120

  const noCutoff = buildDayBreakdown(tasks, categories, "2026-01-10");
  assert.equal(noCutoff.committedMinutes, 120, "no trackingStart -> counts normally (regression)");

  const beforeCutoff = buildDayBreakdown(tasks, categories, "2026-01-10", undefined, "2026-01-11");
  assert.equal(beforeCutoff.committedMinutes, 0, "day before trackingStart -> nothing counted");
  assert.equal(beforeCutoff.totalMinutes, 1440, "the ring is still the whole day");

  const onCutoff = buildDayBreakdown(tasks, categories, "2026-01-10", undefined, "2026-01-10");
  assert.equal(onCutoff.committedMinutes, 120, "on trackingStart -> still counted");
});

test("buildWeeklyHeatmap buckets scheduled minutes into weekday × time bands", () => {
  const empty = Object.fromEntries(DAYS.map((d) => [d, []]));
  const activities = {
    ...empty,
    monday: [{ id: "m1", title: "Focus", startTime: "9:00 AM", endTime: "11:00 AM" }], // 8 AM band, 120
    tuesday: [{ id: "t1", title: "Sleep", startTime: "10:00 PM", endTime: "1:00 AM" }], // 8 PM band 120 + 12 AM band 60
  };
  const now = new Date();
  const todayKey = DAYS[(now.getDay() + 6) % 7]; // JS Sun=0 → our Mon=0
  const hm = buildWeeklyHeatmap(activities, localISODate(now), todayKey);

  assert.equal(hm.grid.length, 7, "one row per weekday");
  assert.equal(hm.grid[0].length, BAND_COUNT, "six 4-hour bands");
  assert.equal(hm.grid[0][2], 120, "Mon 9–11 AM lands wholly in the 8 AM band");
  assert.equal(hm.grid[1][5], 120, "Tue 10 PM–midnight lands in the 8 PM band");
  assert.equal(hm.grid[1][0], 60, "the post-midnight tail wraps into the 12 AM band");
  assert.equal(hm.totalMinutes, 300);
  assert.equal(hm.maxMinutes, 120, "the busiest cell sets the normalisation ceiling");
  assert.equal(hm.columnTotals[1], 180, "Tuesday's column sums both of its bands");
});

test("buildWeeklyHeatmap is empty when nothing is scheduled", () => {
  const empty = Object.fromEntries(DAYS.map((d) => [d, []]));
  const hm = buildWeeklyHeatmap(empty, localISODate(new Date()), "monday");
  assert.equal(hm.totalMinutes, 0);
  assert.equal(hm.maxMinutes, 0);
});

test("levelForMinutes normalises intensity against the week's peak", () => {
  assert.equal(levelForMinutes(0, 200), 0, "no time → level 0");
  assert.equal(levelForMinutes(200, 0), 0, "no peak → level 0 (no divide-by-zero)");
  assert.equal(levelForMinutes(50, 200), 1); // 0.25
  assert.equal(levelForMinutes(100, 200), 2); // 0.50
  assert.equal(levelForMinutes(150, 200), 3); // 0.75
  assert.equal(levelForMinutes(200, 200), 4); // 1.00 — the peak
});

test("categoryUsageCounts counts a recurring task once, and guards delete", () => {
  // Same id in three weekday buckets = one recurring task, not three.
  const habit = { id: "t1", title: "Gym", categoryId: "cat-fit" };
  const activities = {
    monday: [habit, { id: "t2", title: "Read", categoryId: "cat-read" }],
    wednesday: [habit],
    friday: [habit, { id: "t3", title: "Untagged" }],
  };

  const usage = categoryUsageCounts(activities);
  assert.equal(usage.get("cat-fit"), 1, "a Mon/Wed/Fri habit is one task, not three");
  assert.equal(usage.get("cat-read"), 1);
  assert.equal(usage.get("cat-none"), undefined, "an unused category has no entry");

  assert.equal(canDeleteCategory("cat-fit", usage), false, "in use — refuse");
  assert.equal(canDeleteCategory("cat-none", usage), true, "unused — allow");
  assert.equal(canDeleteCategory("cat-fit", new Map()), true, "the map is the only evidence it reads");
});

test("taskDayMinutes splits an overnight task at the day boundary", () => {
  const t = (startTime, endTime) => ({ id: "x", title: "x", startTime, endTime });

  // Sleep 11 PM - 7 AM: five hours land today, three belong to tomorrow.
  assert.deepEqual(taskDayMinutes(t("11:00 PM", "7:00 AM")), { sameDay: 300, overflow: 180 });
  // The whole duration is unchanged, so callers that want it still get 8h.
  assert.equal(taskScheduledMinutes(t("11:00 PM", "7:00 AM")), 480);

  // 1-3 AM sits in the *tail* of its own schedule day (25:00-27:00), not past it.
  assert.deepEqual(taskDayMinutes(t("1:00 AM", "3:00 AM")), { sameDay: 120, overflow: 0 });
  // 1-5 AM genuinely crosses the 4 AM handover, so one hour carries over.
  assert.deepEqual(taskDayMinutes(t("1:00 AM", "5:00 AM")), { sameDay: 180, overflow: 60 });

  // An ordinary daytime task never overflows.
  assert.deepEqual(taskDayMinutes(t("9:00 AM", "11:00 AM")), { sameDay: 120, overflow: 0 });
});

test("taskDayMinutes splits at a configured day start, not just the 4 AM default", () => {
  const t = (startTime, endTime) => ({ id: "x", title: "x", startTime, endTime });
  const sixAM = 6 * 60;

  // With the anchor moved to 6 AM, a 5-7 AM task now straddles the handover
  // instead of sitting wholly inside the window the way it does at 4 AM.
  assert.deepEqual(taskDayMinutes(t("5:00 AM", "7:00 AM"), sixAM), { sameDay: 60, overflow: 60 });
  // A task that starts exactly at the configured anchor is untouched.
  assert.deepEqual(taskDayMinutes(t("6:00 AM", "8:00 AM"), sixAM), { sameDay: 120, overflow: 0 });
  // The default (no anchor passed) is unchanged: a 5-7 AM task is still whole.
  assert.deepEqual(taskDayMinutes(t("5:00 AM", "7:00 AM")), { sameDay: 120, overflow: 0 });
});

test("continuationInterval expresses the spill in the next day's coordinates", () => {
  assert.equal(SCHEDULE_DAY_HANDOVER_MINUTES, 240, "28:00 on day D is 4:00 on day D+1");

  // 11 PM - 7 AM -> 1380..1860; the tail is 4:00-7:00 tomorrow.
  assert.deepEqual(continuationInterval({ start: 1380, end: 1860 }), { start: 240, end: 420 });
  // Nothing past the window means no continuation at all.
  assert.equal(continuationInterval({ start: 1380, end: 1620 }), null);
  assert.equal(continuationInterval({ start: 540, end: 660 }), null);
  // Exactly at the boundary is not an overrun.
  assert.equal(continuationInterval({ start: 1380, end: 1680 }), null);
  // Malformed data is clipped at the next day's end, never chained onward.
  assert.deepEqual(continuationInterval({ start: 1400, end: 3600 }), { start: 240, end: 1680 });
});

test("buildDayBreakdown counts the previous day's overnight tail on this day", () => {
  const today = "2026-08-05";
  const yesterday = "2026-08-04";
  const categories = [{ id: "cat-rest", title: "Rest", icon: "moon", color: "indigo" }];
  const sleep = {
    id: "sleep", title: "Sleep", planId: "", taskType: "commitment",
    categoryId: "cat-rest", startTime: "11:00 PM", endTime: "7:00 AM",
  };

  const booked = (b) => b.slices.filter((s) => s.id !== UNSCHEDULED_ID);

  // Yesterday's sleep keeps only the five hours that fell before the handover.
  const own = buildDayBreakdown([sleep], categories, yesterday);
  assert.equal(own.committedMinutes, 300, "the tail is no longer counted on the start day");

  // Today receives the remaining three, matching the continuation block drawn there.
  const carried = buildDayBreakdown([], categories, today, { tasks: [sleep], dateISO: yesterday });
  assert.equal(carried.committedMinutes, 180);
  assert.deepEqual(booked(carried).map((s) => [s.id, s.minutes]), [["cat-rest", 180]]);

  // Nothing is invented when the previous occurrence was skipped.
  const skipped = { ...sleep, exceptions: { [yesterday]: { skipped: true } } };
  const none = buildDayBreakdown([], categories, today, { tasks: [skipped], dateISO: yesterday });
  assert.equal(none.committedMinutes, 0, "a skipped occurrence carries nothing over");
});

test("buildDayBreakdown anchors the window at a configured day start, closing the phantom-gap bug", () => {
  const today = "2026-08-05";
  const categories = [{ id: "cat-work", title: "Work", icon: "code", color: "indigo" }];
  const sixAM = 6 * 60;
  // A day booked solid from 6 AM to 6 AM the next day, with nothing before it —
  // exactly the "my whole day is planned" case the bug report described.
  const tasks = [
    { id: "w", title: "Work", planId: "p", categoryId: "cat-work", startTime: "6:00 AM", endTime: "11:00 PM" },
    { id: "s", title: "Sleep", planId: "", taskType: "commitment", startTime: "11:00 PM", endTime: "6:00 AM" },
  ];

  // At the fixed 4 AM default, the 4:00-6:00 gap before the first task reads
  // as two hours of phantom "Unscheduled" time.
  const atDefault = buildDayBreakdown(tasks, categories, today);
  assert.equal(atDefault.unscheduledMinutes, 120, "the old fixed-4AM behaviour: a real gap before a 6 AM start");

  // Anchored at the user's actual 6 AM day start, that gap is gone — the ring
  // finally agrees with a day the user considers fully booked.
  const atConfigured = buildDayBreakdown(tasks, categories, today, undefined, undefined, sixAM);
  assert.equal(atConfigured.unscheduledMinutes, 0, "no gap once the window starts where the user's day does");
  assert.equal(atConfigured.totalMinutes, 1440, "the ring is still exactly one day");
});

// A DayBreakdown literal, so the waking-day derivation can be exercised
// without routing every case through task fixtures.
function breakdownOf({ sleep = 0, rest = 0, active = 0 }) {
  const committed = sleep + rest + active;
  return {
    slices: [],
    totalMinutes: SCHEDULE_DAY_MINUTES,
    committedMinutes: committed,
    sleepMinutes: sleep,
    restMinutes: rest,
    activeMinutes: active,
    unscheduledMinutes: SCHEDULE_DAY_MINUTES - committed,
    overlapMinutes: 0,
    sleepIsScheduled: sleep > 0,
  };
}

test("buildActiveHours keeps sleep out of the active budget in both directions", () => {
  assert.equal(DEFAULT_WAKING_START_MINUTES, 7 * 60, "4 AM is the day boundary, not a wake time");
  assert.equal(DEFAULT_SLEEP_HOURS, 8);
  assert.equal(SCHEDULE_DAY_MINUTES, 24 * 60, "4:00 -> 28:00 is a full day");

  // The regression this whole model exists for: 7h45m of scheduled sleep used
  // to be charged against a window that had already had 7h taken out for it,
  // which is how a normal day reported "25h 30m / 17h".
  const withSleep = buildActiveHours(breakdownOf({ sleep: 465, active: 480 }), 7);
  assert.equal(withSleep.wakingMinutes, 24 * 60 - 465, "scheduled sleep defines the waking day");
  assert.equal(withSleep.activeMinutes, 480, "and is never counted inside it");
  assert.equal(withSleep.sleepSurplusMinutes, 45, "45m more than the 7h target");
  assert.equal(withSleep.sleepShortfallMinutes, 0);
  assert.ok(withSleep.activeMinutes + withSleep.restMinutes <= withSleep.wakingMinutes,
    "active + rest can never exceed the waking window — the old overbooked state is unreachable");

  // Rest is time spent, but not work: it fills the window without being active.
  const withRest = buildActiveHours(breakdownOf({ sleep: 480, rest: 120, active: 300 }), 8);
  assert.equal(withRest.restMinutes, 120);
  assert.equal(withRest.activeMinutes, 300);
  assert.equal(withRest.freeMinutes, 24 * 60 - 480 - 120 - 300);
  assert.ok(withRest.activePct + withRest.restPct <= 100, "the two fills never overrun the track");

  // An empty day still reports a full window of free time.
  const empty = buildActiveHours(breakdownOf({}), 8);
  assert.equal(empty.activePct, 0);
  assert.equal(empty.sleepMinutes, 480, "with nothing booked, the target is simply reserved");
  assert.equal(empty.freeMinutes, 24 * 60 - 480);
});

test("buildActiveHours reports a sleep shortfall instead of an impossible overbooking", () => {
  // Nothing scheduled as sleep, and the day booked so full that only 4h remain:
  // the honest complaint is about sleep, not about exceeding a 17-hour day.
  const packed = buildActiveHours(breakdownOf({ active: 20 * 60 }), 7);
  assert.equal(packed.sleepMinutes, 4 * 60, "only what is left can be slept in");
  assert.equal(packed.sleepShortfallMinutes, 3 * 60, "3h short of the 7h target");
  assert.equal(packed.sleepSurplusMinutes, 0);

  // Sleep actually scheduled, but short of the target.
  const shortNight = buildActiveHours(breakdownOf({ sleep: 5 * 60, active: 480 }), 8);
  assert.equal(shortNight.sleepShortfallMinutes, 3 * 60);
  assert.equal(shortNight.sleepTargetMinutes, 8 * 60);

  // A day that leaves room for the whole target raises nothing.
  const roomy = buildActiveHours(breakdownOf({ active: 8 * 60 }), 8);
  assert.equal(roomy.sleepShortfallMinutes, 0);
});

test("buildActiveHours' waking window shrinks/grows with configured sleepHours", () => {
  const b = breakdownOf({ active: 300 });
  const withDefault = buildActiveHours(b, undefined);
  const withSix = buildActiveHours(b, 6);
  const withTen = buildActiveHours(b, 10);

  // With no sleep block, the target is what gets reserved — so the waking
  // window still tracks the setting exactly as it used to.
  assert.equal(withDefault.wakingMinutes, 24 * 60 - DEFAULT_SLEEP_HOURS * 60);
  assert.equal(withSix.wakingMinutes, 24 * 60 - 6 * 60, "less sleep -> a longer waking window");
  assert.equal(withTen.wakingMinutes, 24 * 60 - 10 * 60, "more sleep -> a shorter waking window");
  assert.ok(withSix.wakingMinutes > withDefault.wakingMinutes);
  assert.ok(withTen.wakingMinutes < withDefault.wakingMinutes);

  // getWakingWindowMinutes clamps/falls back the same way normalizeSchedulePreferences does.
  assert.equal(getWakingWindowMinutes(MIN_SLEEP_HOURS - 5), 24 * 60 - MIN_SLEEP_HOURS * 60, "below range clamps to the minimum");
  assert.equal(getWakingWindowMinutes(MAX_SLEEP_HOURS + 5), 24 * 60 - MAX_SLEEP_HOURS * 60, "above range clamps to the maximum");
  assert.equal(getWakingWindowMinutes(Number.NaN), 24 * 60 - DEFAULT_SLEEP_HOURS * 60, "non-finite falls back to the default");
});

// `normalizeCategories` is private and rebuilds each category from an explicit
// field whitelist, so a field missing from it is silently dropped on every
// load — the category would look right until you refreshed. Nothing else
// catches that, hence this source check, in the same spirit as the syncMeta
// guard in mergeSchedule.test.mjs.
// Same whitelist trap as normalizeCategories below: normalizeTracker rebuilds
// each tracker field-by-field, so a field missing from the returned literal is
// dropped on every load — the daily target would look saved until you reloaded.
test("normalizeTracker carries `dailyTarget` through the whitelist", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/useScheduleDB.ts", import.meta.url), "utf8");

  const start = source.indexOf("function normalizeTracker(value: unknown): ProgressTracker | null {");
  assert.ok(start > -1, "normalizeTracker() was renamed — update this guard");
  const body = source.slice(start, source.indexOf("\nfunction ", start + 10));

  assert.ok(body.includes("dailyTarget:"), "the rebuilt tracker literal drops `dailyTarget`");
  assert.ok(
    body.includes("Number.isFinite(t.dailyTarget)"),
    "a non-finite dailyTarget must be dropped, not stored — it would divide the progress ring by NaN",
  );
});

test("normalizeCategories carries `kind` through the whitelist", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/useScheduleDB.ts", import.meta.url), "utf8");

  const start = source.indexOf("function normalizeCategories(value: unknown): TaskCategory[] {");
  assert.ok(start > -1, "normalizeCategories() was renamed — update this guard");
  const rest = source.slice(start);
  const nextTopLevel = rest.slice(10).search(/\n(?:function|const|export) /);
  const body = rest.slice(0, nextTopLevel === -1 ? undefined : nextTopLevel + 10);

  assert.ok(
    body.includes("kind:"),
    "the rebuilt category literal drops `kind`, so every category resets to active on reload",
  );
});

test("buildDayBreakdown counts an overlap once and reports the double-booking", () => {
  const today = localISODate(new Date());
  const categories = [
    { id: "cat-code", title: "Coding", icon: "code", color: "indigo" },
    { id: "cat-barbell", title: "Workout", icon: "barbell", color: "orange" },
  ];
  const t = (over) => ({ title: over.id, planId: "p", ...over });

  // 9-11 and 10-12: three hours of clock, four hours of blocks.
  const tasks = [
    t({ id: "a", categoryId: "cat-code", startTime: "9:00 AM", endTime: "11:00 AM" }),
    t({ id: "b", categoryId: "cat-barbell", startTime: "10:00 AM", endTime: "12:00 PM" }),
  ];

  const b = buildDayBreakdown(tasks, categories, today);
  assert.equal(b.committedMinutes, 180, "summing these would have said 240");
  assert.equal(b.overlapMinutes, 60, "the hour they share is reported, not silently absorbed");
  // Earliest start owns the contested hour, so Coding keeps its full 9-11.
  assert.deepEqual(
    b.slices.filter((s) => s.id !== UNSCHEDULED_ID).map((s) => [s.id, s.minutes]),
    [["cat-code", 120], ["cat-barbell", 60]],
  );

  // No overlap, no signal.
  const clean = buildDayBreakdown([tasks[0]], categories, today);
  assert.equal(clean.overlapMinutes, 0);
});

test("buildDayBreakdown buckets by category kind and always partitions the day", () => {
  const today = localISODate(new Date());
  const categories = [
    { id: "cat-sleep", title: "Sleep", icon: "sleep", color: "indigo", kind: "sleep" },
    { id: "cat-chill", title: "Chill", icon: "coffee", color: "orange", kind: "rest" },
    { id: "cat-code", title: "Coding", icon: "code", color: "cyan" }, // no kind -> active
  ];
  const t = (over) => ({ title: over.id, planId: "p", ...over });

  const b = buildDayBreakdown([
    t({ id: "kip", categoryId: "cat-sleep", startTime: "11:00 PM", endTime: "12:00 AM" }),   // 60 sleep
    t({ id: "chill", categoryId: "cat-chill", startTime: "8:00 PM", endTime: "9:30 PM" }),   // 90 rest
    t({ id: "work", categoryId: "cat-code", startTime: "9:00 AM", endTime: "12:00 PM" }),    // 180 active
  ], categories, today);

  assert.equal(b.sleepMinutes, 60);
  assert.equal(b.restMinutes, 90, "a rest category is recovery, not work");
  assert.equal(b.activeMinutes, 180, "an unclassified category counts as active");
  assert.equal(b.sleepIsScheduled, true);
  assert.equal(
    b.sleepMinutes + b.restMinutes + b.activeMinutes + b.unscheduledMinutes,
    SCHEDULE_DAY_MINUTES,
    "the four buckets always tile exactly 24 hours",
  );
  assert.equal(
    b.slices.reduce((sum, s) => sum + s.minutes, 0),
    SCHEDULE_DAY_MINUTES,
    "and so do the wedges, so the donut can never over- or under-fill",
  );
});

test("buildDayBreakdown is empty when nothing is scheduled", () => {
  const { slices, totalMinutes, committedMinutes } = buildDayBreakdown([], [], localISODate(new Date()));
  assert.equal(committedMinutes, 0);
  assert.equal(totalMinutes, 1440);
  // An empty day is still a day: the ring is one full unscheduled wedge rather
  // than nothing at all, which is what lets the donut render at any fill level.
  assert.deepEqual(slices.map((s) => [s.id, s.minutes, s.pct]), [[UNSCHEDULED_ID, 1440, 100]]);
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
  return { plans, activities, progressTrackers: [], metricEntries: [], milestones: [], rituals: [], ritualCompletions: [], notes: [], preferences: {} };
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
  // Commitments are no longer forced neutral: held time can be categorised
  // ("Commute" is a real kind of time) and then reads the same everywhere.
  assert.equal(
    taskIdentity({ ...base, categoryId: "cat-code", taskType: "commitment" }, byId).color,
    "indigo",
    "a categorised commitment keeps its category colour",
  );
  assert.equal(
    taskIdentity({ ...base, taskType: "commitment" }, byId).color,
    null,
    "an uncategorised commitment is still neutral — the common case",
  );
});

// ── selectNeedsAttention (the Overview catch-up card) ──────────────────────

/** A schedule carrying milestones and a day of tasks. */
function attentionSchedule({ tasks = [], plans = [], milestones = [], rituals = [], ritualCompletions = [], dayKey } = {}) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  if (dayKey) activities[dayKey] = tasks;
  return { plans, categories: [], activities, progressTrackers: [], metricEntries: [], milestones, rituals, ritualCompletions, notes: [], preferences: {} };
}

const isoShift = (iso, days) => addDaysToISO(iso, days);
/** A dated "missed" event, the shape completionHistory actually stores. */
const missedEvent = (id, iso) => ({ id, taskId: id, completionType: "missed", completedAt: `${iso}T18:00:00.000Z` });

test("selectNeedsAttention surfaces overdue milestones, most overdue first", () => {
  const today = "2026-08-02";
  const m = (over) => ({
    planId: "p1", plannedDurationDays: 7, linkedActivities: [], linkedTrackers: [],
    createdAt: "", updatedAt: "", sortOrder: 0, status: "active", ...over,
  });
  const schedule = attentionSchedule({
    plans: [{ id: "p1", title: "GMAT", category: "learning", emoji: "school", color: "emerald", items: [] }],
    milestones: [
      m({ id: "a", title: "Quant drills", startDate: "2026-07-01", plannedEndDate: "2026-07-30" }), // 3 over
      m({ id: "b", title: "Verbal set",   startDate: "2026-07-01", plannedEndDate: "2026-07-26" }), // 7 over
      m({ id: "c", title: "Not yet due",  startDate: "2026-07-01", plannedEndDate: "2026-08-20" }),
      m({ id: "d", title: "Already done", startDate: "2026-07-01", plannedEndDate: "2026-07-01", actualCompletedDate: "2026-07-01" }),
    ],
  });

  const { overdueMilestones, total } = selectNeedsAttention(schedule, today);
  assert.deepEqual(
    overdueMilestones.map((r) => [r.milestone.id, r.daysOverdue]),
    [["b", 7], ["a", 3]],
    "longest-slipping first; future and completed milestones excluded",
  );
  assert.equal(overdueMilestones[0].plan.title, "GMAT", "the plan is resolved for the row subtitle");
  assert.equal(total, 2);
});

test("selectNeedsAttention lists recent misses but never today's", () => {
  const today = "2026-08-02";
  const dayKey = todayKeyFor(today);
  const base = { planId: "p1", startTime: "9:00 AM", endTime: "10:00 AM" };
  const tasks = [
    { ...base, id: "t-yesterday", title: "Yesterday", completionHistory: [missedEvent("t-yesterday", isoShift(today, -1))] },
    { ...base, id: "t-today",     title: "Today",     completionHistory: [missedEvent("t-today", today)] },
    { ...base, id: "t-old",       title: "Too old",   completionHistory: [missedEvent("t-old", isoShift(today, -(MISSED_LOOKBACK_DAYS + 1)))] },
    { ...base, id: "t-done",      title: "Completed", completionHistory: [{ id: "e", taskId: "t-done", completionType: "task", completedAt: `${isoShift(today, -2)}T10:00:00.000Z` }] },
  ];
  const schedule = attentionSchedule({ dayKey, tasks, plans: [{ id: "p1", title: "Work", category: "work", emoji: "briefcase", color: "cyan", items: [] }] });

  const { missedTasks } = selectNeedsAttention(schedule, today);
  assert.deepEqual(
    missedTasks.map((r) => [r.task.id, r.daysAgo]),
    [["t-yesterday", 1]],
    "today is excluded (already shown as missed on the Today card), and so is anything past the lookback",
  );
  assert.equal(missedTasks[0].plan.title, "Work");
});

test("selectNeedsAttention counts a recurring task's miss once, not once per weekday", () => {
  const today = "2026-08-02";
  const missedISO = isoShift(today, -1);
  // A recurring task is the SAME object in several weekday buckets.
  const task = { id: "recurring", title: "Lift", planId: "p1", startTime: "6:00 AM", endTime: "7:00 AM", completionHistory: [missedEvent("recurring", missedISO)] };
  const activities = Object.fromEntries(DAYS.map((d) => [d, [task]]));
  const schedule = { plans: [], categories: [], activities, progressTrackers: [], metricEntries: [], milestones: [], rituals: [], ritualCompletions: [], notes: [], preferences: {} };

  const { missedTasks, total } = selectNeedsAttention(schedule, today);
  assert.equal(missedTasks.length, 1, "deduped by task id + date");
  assert.equal(total, 1);
});

test("selectNeedsAttention is empty for a user who is on top of things", () => {
  const { atRiskRituals, overdueMilestones, missedTasks, total } = selectNeedsAttention(attentionSchedule({}), "2026-08-02");
  assert.deepEqual(atRiskRituals, []);
  assert.deepEqual(overdueMilestones, []);
  assert.deepEqual(missedTasks, []);
  assert.equal(total, 0, "the card renders nothing at all in this case");
});

test("selectNeedsAttention flags a ritual run that ends tonight", () => {
  const today = "2026-08-02";
  const dayKey = todayKeyFor(today);
  const done = (id, n) => ({ ritualId: id, date: isoShift(today, -n) });
  const schedule = attentionSchedule({
    dayKey,
    rituals: [
      { id: "keep", title: "Morning pages", time: "07:00" },
      { id: "short", title: "One-day only", time: "08:00" },
      { id: "otherday", title: "Not due today", time: "09:00", repeatDays: [todayKeyFor("2026-08-02") === "monday" ? "tuesday" : "monday"] },
      { id: "already", title: "Done today", time: "10:00" },
    ],
    ritualCompletions: [
      done("keep", 1), done("keep", 2), done("keep", 3),
      done("short", 1),
      done("otherday", 1), done("otherday", 2),
      done("already", 1), done("already", 2),
    ],
  });

  const { atRiskRituals } = selectNeedsAttention(schedule, today, dayKey, new Set(["already"]));
  assert.deepEqual(
    atRiskRituals.map((r) => [r.ritual.id, r.streak]),
    [["keep", 3]],
    "only a run of >= MIN_STREAK_TO_WARN, due today, and not already completed",
  );
  assert.equal(MIN_STREAK_TO_WARN, 2);
});

test("selectNeedsAttention orders rows by how recoverable they are", () => {
  // A streak can still be saved today, a milestone compounds, a miss is history.
  const today = "2026-08-02";
  const dayKey = todayKeyFor(today);
  const schedule = attentionSchedule({
    dayKey,
    tasks: [{ id: "t", title: "Gym", planId: "", startTime: "7:00 AM", endTime: "8:00 AM",
              completionHistory: [missedEvent("t", isoShift(today, -1))] }],
    milestones: [{ id: "m", planId: "p", title: "Ship", startDate: "2026-07-01", plannedDurationDays: 7,
                   plannedEndDate: isoShift(today, -2), status: "active", linkedActivities: [], linkedTrackers: [],
                   createdAt: "", updatedAt: "", sortOrder: 0 }],
    rituals: [{ id: "r", title: "Pages", time: "07:00" }],
    ritualCompletions: [{ ritualId: "r", date: isoShift(today, -1) }, { ritualId: "r", date: isoShift(today, -2) }],
  });

  const r = selectNeedsAttention(schedule, today, dayKey, new Set());
  assert.equal(r.total, 3, "one of each kind");
  assert.equal(r.atRiskRituals.length, 1);
  assert.equal(r.overdueMilestones.length, 1);
  assert.equal(r.missedTasks.length, 1);
});

// ── selectNeedsAttention.atRiskMilestones — the forecast reaching Overview ──

test("selectNeedsAttention flags an active milestone whose current pace projects missing its own target", () => {
  const today = "2026-08-02";
  // A daily task, mostly missed since the milestone started 32 days ago.
  const dailyTask = (over) => ({
    id: "t2", title: "Run", planId: "p1", startTime: "7:00 AM", endTime: "8:00 AM", completionHistory: [], ...over,
  });
  const activities = Object.fromEntries(DAYS.map((d) => [d, [dailyTask()]]));
  const schedule = {
    plans: [{ id: "p1", title: "10K", category: "learning", emoji: "run", color: "emerald", items: [] }],
    categories: [], activities, progressTrackers: [], metricEntries: [],
    milestones: [{
      id: "m2", planId: "p1", title: "Run a 10K", startDate: "2026-07-01", plannedDurationDays: 50,
      plannedEndDate: "2026-08-20", status: "active", linkedActivities: ["t2"], linkedTrackers: [],
      createdAt: "", updatedAt: "", sortOrder: 0,
    }],
    rituals: [], ritualCompletions: [], notes: [], preferences: {},
  };

  const { atRiskMilestones, overdueMilestones } = selectNeedsAttention(schedule, today);
  assert.equal(overdueMilestones.length, 0, "not past its own deadline yet");
  assert.equal(atRiskMilestones.length, 1, "but the pace so far already projects missing it");
  assert.equal(atRiskMilestones[0].milestone.id, "m2");
  assert.equal(atRiskMilestones[0].plan.title, "10K");
});

test("selectNeedsAttention never double-counts a milestone that's already past its deadline", () => {
  const today = "2026-08-02";
  const schedule = attentionSchedule({
    plans: [{ id: "p1", title: "GMAT", category: "learning", emoji: "school", color: "emerald", items: [] }],
    milestones: [{
      id: "m3", planId: "p1", title: "Quant", startDate: "2026-07-01", plannedDurationDays: 7,
      plannedEndDate: "2026-07-20", status: "active", linkedActivities: [], linkedTrackers: [],
      createdAt: "", updatedAt: "", sortOrder: 0,
    }],
  });
  const { atRiskMilestones, overdueMilestones } = selectNeedsAttention(schedule, today);
  assert.equal(overdueMilestones.length, 1, "already past plannedEndDate -> overdue, not at-risk");
  assert.equal(atRiskMilestones.length, 0, "never listed in both buckets at once");
});

test("selectNeedsAttention doesn't flag a milestone with nothing linked yet as at-risk", () => {
  const today = "2026-08-02";
  const schedule = attentionSchedule({
    plans: [{ id: "p1", title: "GMAT", category: "learning", emoji: "school", color: "emerald", items: [] }],
    milestones: [{
      id: "m4", planId: "p1", title: "New milestone", startDate: "2026-07-01", plannedDurationDays: 50,
      plannedEndDate: "2026-08-20", status: "active", linkedActivities: [], linkedTrackers: [],
      createdAt: "", updatedAt: "", sortOrder: 0,
    }],
  });
  const { atRiskMilestones } = selectNeedsAttention(schedule, today);
  assert.equal(atRiskMilestones.length, 0, "no linked task/tracker -> 'getting started', not a fake warning");
});

test("buildDayBreakdown gives a categorised commitment its own wedge", () => {
  // Held time used to be one anonymous grey blob. A commitment the user has
  // categorised now earns a labelled, coloured slice; only uncategorised ones
  // still pool.
  const today = localISODate(new Date());
  const categories = [
    { id: "cat-car", title: "Commute", icon: "car", color: "cyan" },
    { id: "cat-code", title: "Coding", icon: "code", color: "indigo" },
  ];
  const t = (over) => ({ id: over.id, title: over.id, planId: "", ...over });

  const tasks = [
    t({ id: "work", categoryId: "cat-code", startTime: "9:00 AM", endTime: "11:00 AM" }),           // 120 Coding
    t({ id: "drive", categoryId: "cat-car", taskType: "commitment", startTime: "8:00 AM", endTime: "9:00 AM" }),  // 60 Commute
    t({ id: "anon", taskType: "commitment", startTime: "5:00 PM", endTime: "5:30 PM" }),            // 30 Held time
    t({ id: "orphan", categoryId: "cat-gone", startTime: "1:00 PM", endTime: "2:00 PM" }),          // dangling -> skipped
    t({ id: "bare", startTime: "3:00 PM", endTime: "4:00 PM" }),                                    // uncategorised tracked -> skipped
  ];

  const { slices, committedMinutes } = buildDayBreakdown(tasks, categories, today);
  assert.equal(committedMinutes, 210, "dangling and uncategorised tracked tasks stay excluded");
  assert.deepEqual(
    slices.filter((s) => s.id !== UNSCHEDULED_ID).map((s) => [s.id, s.minutes]),
    [["cat-code", 120], ["cat-car", 60], [HELD_TIME_ID, 30]],
  );
  const commute = slices.find((s) => s.id === "cat-car");
  assert.equal(commute.label, "Commute");
  assert.equal(commute.color, "cyan", "the commitment is coloured, not grey");
  assert.equal(slices.find((s) => s.id === HELD_TIME_ID).color, null, "only the anonymous remainder stays neutral");
});

// ── Ritual (routine) streak + adherence — the one shared helper ────────────────
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const comp = (dates) => dates.map((date) => ({ ritualId: "r1", date }));

test("calculateRitualStats: streak = consecutive completed scheduled days back from uptoISO", async () => {
  const { calculateRitualStats } = await import("../lib/consistency/calculateRitualStreak.ts");
  const ritual = { id: "r1", title: "Meditate", time: "07:00" }; // no repeatDays = every day
  // 2026-08-07 back to 2026-08-04 done; 2026-08-03 missing -> streak 4.
  const stats = calculateRitualStats(ritual, comp(["2026-08-07", "2026-08-06", "2026-08-05", "2026-08-04"]), "2026-08-07");
  assert.equal(stats.streak, 4);
});

test("calculateRitualStats: an unchecked today does NOT break the streak (grace)", async () => {
  const { calculateRitualStats } = await import("../lib/consistency/calculateRitualStreak.ts");
  const today = new Date();
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return isoOf(d); };
  const ritual = { id: "r1", title: "Read", time: "21:00" };
  // today NOT completed; the two prior days are. Grace keeps the run at 2.
  assert.equal(calculateRitualStats(ritual, comp([daysAgo(1), daysAgo(2)]), isoOf(today)).streak, 2);
});

test("calculateRitualStats: an off-day (weekend) gap doesn't reset a weekday routine", async () => {
  const { calculateRitualStats } = await import("../lib/consistency/calculateRitualStreak.ts");
  // 2026-08-07 is a Friday; Aug 1/2 are Sat/Sun (not scheduled), Jul 31 is a Friday.
  const ritual = { id: "r1", title: "Standup", time: "09:00", repeatDays: ["monday", "tuesday", "wednesday", "thursday", "friday"] };
  const done = comp(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]); // Mon–Fri
  // The unscheduled weekend is skipped; the run is 5 (breaks at the missed Jul 31 Friday).
  assert.equal(calculateRitualStats(ritual, done, "2026-08-07").streak, 5);
});

test("calculateRitualStats: adherence = completed / scheduled over the 30-day window", async () => {
  const { calculateRitualStats } = await import("../lib/consistency/calculateRitualStreak.ts");
  const ritual = { id: "r1", title: "Water", time: "08:00" }; // every day -> 30 scheduled days
  // Complete 15 of the last 30 days ending at a past date (so no today-skip).
  const dates = Array.from({ length: 15 }, (_, i) => { const d = new Date("2026-08-07T00:00:00"); d.setDate(d.getDate() - i); return isoOf(d); });
  const stats = calculateRitualStats(ritual, comp(dates), "2026-08-07");
  assert.equal(stats.adherencePct, 50);
  assert.equal(stats.dots.length, 7);
  assert.equal(stats.dots[6], true, "the last dot is uptoISO itself");
});

// ── Auto-miss rollover (lib/consistency/autoMiss.ts) ─────────────────────────

const autoMissWkKey = (iso) => DAYS[(new Date(`${iso}T00:00:00`).getDay() + 6) % 7];
function autoMissSchedule(preferences = {}) {
  return { ...emptySchedule(), categories: [], preferences };
}

test("applyAutoMissed first run adopts a watermark and misses nothing (forward-only)", () => {
  const now = new Date(2026, 0, 15, 10, 0, 0); // Thu Jan 15 2026, 10:00 local
  const D = "2026-01-14"; // yesterday (Wed)
  const task = { id: "t-open", title: "Open", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [] };
  const sched = autoMissSchedule({}); // no watermark yet
  sched.activities[autoMissWkKey(D)] = [task];

  const r = applyAutoMissed(sched, now);
  assert.equal(r.preferences.lastRolloverISO, "2026-01-15", "watermark adopts the active day");
  assert.equal((r.activities[autoMissWkKey(D)][0].completionHistory ?? []).length, 0, "nothing missed on first run");
});

test("applyAutoMissed marks past un-actioned tracked tasks missed, sparing done + commitments", () => {
  const now = new Date(2026, 0, 15, 10, 0, 0);
  const D = "2026-01-14";
  const open = { id: "t-open", title: "Open", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [] };
  const done = { id: "t-done", title: "Done", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [],
    completionHistory: [event("t-done", "task", new Date(`${D}T12:00:00`).toISOString())] };
  const commit = { id: "t-commit", title: "Commute", startTime: "8:00 AM", endTime: "8:30 AM", taskType: "commitment", subtasks: [] };
  const sched = autoMissSchedule({ lastRolloverISO: "2026-01-13" });
  sched.activities[autoMissWkKey(D)] = [open, done, commit];

  const r = applyAutoMissed(sched, now);
  const bucket = r.activities[autoMissWkKey(D)];
  const openMissed = (bucket.find((t) => t.id === "t-open").completionHistory ?? []).filter((e) => e.completionType === "missed" && !e.subtaskId);
  assert.equal(openMissed.length, 1, "the un-actioned task gets one missed event");
  assert.equal(localISODate(new Date(openMissed[0].completedAt)), D, "the missed event is dated to the occurrence");
  assert.equal((bucket.find((t) => t.id === "t-done").completionHistory ?? []).filter((e) => e.completionType === "missed").length, 0, "a completed task is spared");
  assert.equal((bucket.find((t) => t.id === "t-commit").completionHistory ?? []).length, 0, "a commitment never misses");
  assert.equal(r.preferences.lastRolloverISO, "2026-01-15", "watermark advances to the active day");

  const r2 = applyAutoMissed(r, now);
  assert.equal(r2, r, "re-run with no new rollover returns the same reference (idempotent)");
});

test("applyAutoMissed treats before-day-start as the previous schedule day", () => {
  const now = new Date(2026, 0, 15, 2, 0, 0); // 2 AM, before the default 4 AM start
  const D = "2026-01-14"; // Wed
  const open = { id: "t-open", title: "Open", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [] };
  const sched = autoMissSchedule({ lastRolloverISO: "2026-01-13" });
  sched.activities[autoMissWkKey(D)] = [open];

  const r = applyAutoMissed(sched, now);
  assert.equal(r.preferences.lastRolloverISO, "2026-01-14", "active day is yesterday before the day-start");
  assert.equal((r.activities[autoMissWkKey(D)][0].completionHistory ?? []).length, 0, "the still-active day is not missed yet");
});

test("computeExecutionTrend counts missed occurrences per week", () => {
  const today = localISODate(new Date());
  const missedTask = { id: "m1", title: "Missed", startTime: "9:00 AM", endTime: "10:00 AM", taskType: "task", subtasks: [],
    completionHistory: [event("m1", "missed", new Date().toISOString())] };
  const sched = autoMissSchedule({});
  sched.activities[autoMissWkKey(today)] = [missedTask];

  const trend = computeExecutionTrend(sched);
  assert.equal(trend.currentMissed, 1, "this week's missed count");
  assert.ok(trend.totalMissed >= 1, "missed rolls into the window total");
  assert.equal(trend.current.missed, 1, "the current week row carries missed");
});

// ── Missed-task recovery: dismiss / reschedule (lib/missedRecovery.ts) ────────

test("acknowledgeMiss hides a miss from Needs Attention but keeps the history event", () => {
  const today = "2026-08-02";
  const dayKey = todayKeyFor(today);
  const y = isoShift(today, -1);
  const base = { planId: "p1", startTime: "9:00 AM", endTime: "10:00 AM" };
  const tasks = [
    { ...base, id: "t-a", title: "A", completionHistory: [missedEvent("t-a", y)] },
    { ...base, id: "t-b", title: "B", completionHistory: [missedEvent("t-b", y)] },
  ];
  const schedule = attentionSchedule({ dayKey, tasks, plans: [{ id: "p1", title: "Work", category: "work", emoji: "briefcase", color: "cyan", items: [] }] });

  const acked = acknowledgeMiss(schedule, "t-a", y);
  const { missedTasks } = selectNeedsAttention(acked, today);
  assert.deepEqual(missedTasks.map((r) => r.task.id), ["t-b"], "the acknowledged miss is hidden; others remain");
  assert.deepEqual(acked.preferences.acknowledgedMisses, [missKey("t-a", y)]);
  const taskA = acked.activities[dayKey].find((t) => t.id === "t-a");
  assert.equal(taskA.completionHistory.filter((e) => e.completionType === "missed").length, 1, "the missed event is preserved (analytics stay accurate)");
  const again = acknowledgeMiss(acked, "t-a", y);
  assert.equal(again.preferences.acknowledgedMisses.length, 1, "idempotent — no duplicate ack key");
});

test("rescheduleMissedTaskOnce adds a fresh one-off and dismisses the source miss", () => {
  const today = "2026-08-02";
  const dayKey = todayKeyFor(today);
  const y = isoShift(today, -1);
  const task = { id: "t-run", title: "Run", planId: "p1", categoryId: "cat-fit", taskType: "task", startTime: "6:00 AM", endTime: "7:30 AM", subtasks: [], completionHistory: [missedEvent("t-run", y)] };
  const schedule = attentionSchedule({ dayKey, tasks: [task], plans: [] });

  const target = isoShift(today, 1);
  const targetKey = todayKeyFor(target);
  const next = rescheduleMissedTaskOnce(schedule, task, y, target, 8 * 60); // custom time 8:00 AM

  const added = next.activities[targetKey].find((t) => t.recurrence?.type === "once");
  assert.ok(added, "a one-off clone landed in the target date's weekday bucket");
  assert.equal(added.recurrence.dateISO, target);
  assert.equal(added.startTime, "08:00 AM");
  assert.equal(added.endTime, "09:30 AM", "duration (90m) preserved");
  assert.equal(added.title, "Run");
  assert.equal(added.categoryId, "cat-fit", "identity preserved");
  assert.notEqual(added.id, "t-run", "fresh id, not the source task");
  assert.equal(added.completed ?? false, false);
  assert.equal((added.completionHistory ?? []).length, 0, "clean completion state");
  assert.deepEqual(next.preferences.acknowledgedMisses, [missKey("t-run", y)], "the source miss is dismissed");
  assert.equal(selectNeedsAttention(next, today).missedTasks.length, 0, "the handled miss no longer shows");
});

// ── Cmd+Z undo history stack (lib/scheduleHistory.ts) ──────────────────────────
// useScheduleDB's setSchedule/undo are hook-level (React state + refs) and are
// covered by the manual browser check instead; the cap/push/pop logic itself
// is pure and tested directly here.

test("pushHistory appends without mutating the input array", () => {
  const stack = ["a", "b"];
  const next = pushHistory(stack, "c", HISTORY_LIMIT);
  assert.deepEqual(stack, ["a", "b"], "original stack untouched");
  assert.deepEqual(next, ["a", "b", "c"]);
});

test("pushHistory drops the oldest entry once it exceeds the cap", () => {
  let stack = [];
  for (let i = 0; i < 5; i++) stack = pushHistory(stack, i, 3);
  assert.deepEqual(stack, [2, 3, 4], "only the 3 most recent survive, oldest-first");
});

test("popHistory returns [undefined, unchanged] on an empty stack", () => {
  const [popped, rest] = popHistory([]);
  assert.equal(popped, undefined);
  assert.deepEqual(rest, []);
});

test("popHistory pops the most recent entry and leaves the rest in order", () => {
  const [popped, rest] = popHistory(["a", "b", "c"]);
  assert.equal(popped, "c", "undo restores the *last* pushed snapshot first");
  assert.deepEqual(rest, ["a", "b"]);
});

test("push then pop round-trips to the prior state (the undo() shape)", () => {
  let stack = pushHistory([], "before", HISTORY_LIMIT);
  const [restored, rest] = popHistory(stack);
  assert.equal(restored, "before");
  assert.deepEqual(rest, []);
});

// ── Progress rollup: Task/Subtask → Milestone → Plan (lib/planProgress.ts) ────

test("calculateLinkedTaskProgress excludes commitments and returns null for a deleted task", () => {
  const sched = emptySchedule();
  sched.activities.monday = [
    { id: "c1", title: "Commute", startTime: "8:00 AM", endTime: "9:00 AM", planId: "p1", taskType: "commitment" },
  ];
  assert.equal(calculateLinkedTaskProgress("c1", sched.activities, null), null, "commitments are never tracked");
  assert.equal(calculateLinkedTaskProgress("gone", sched.activities, null), null, "a deleted/missing task id resolves to null");
});

test("calculateLinkedTaskProgress merges completion across weekday-bucket copies of a recurring task", () => {
  const sched = emptySchedule();
  const subtasks = [{ id: "s1", task: "Learn" }, { id: "s2", task: "Practice" }, { id: "s3", task: "Review" }];
  // Same id, two weekday buckets — each accumulates its own completionHistory
  // (every toggle handler writes into just the one day's array), so "ever
  // completed" has to look across both to see s1 AND s2 are done.
  sched.activities.monday = [{
    id: "r1", title: "Study", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    subtasks, completedSubtaskIds: ["s1"],
    completionHistory: [event("r1", "subtask", "2026-06-01T12:00:00Z", "s1")],
  }];
  sched.activities.wednesday = [{
    id: "r1", title: "Study", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    subtasks, completedSubtaskIds: ["s2"],
    completionHistory: [event("r1", "subtask", "2026-06-03T12:00:00Z", "s2")],
  }];

  const progress = calculateLinkedTaskProgress("r1", sched.activities, null);
  assert.equal(progress.totalCount, 3);
  assert.equal(progress.completedCount, 2, "s1 (from monday) + s2 (from wednesday) — union across buckets, not just one");
  assert.equal(progress.pct, 67);
});

test("linked task progress survives a resetStaleCompletions pass (progress never un-earns itself overnight)", () => {
  const today = localISODate(new Date());
  const yesterday = addDaysToISO(today, -1);
  const subtasks = [{ id: "s1", task: "Learn" }, { id: "s2", task: "Practice" }];
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "r2", title: "Session", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    subtasks, completed: true, completedSubtaskIds: ["s1", "s2"],
    completionHistory: [
      event("r2", "subtask", new Date(`${yesterday}T12:00:00`).toISOString(), "s1"),
      event("r2", "subtask", new Date(`${yesterday}T12:00:00`).toISOString(), "s2"),
      event("r2", "task", new Date(`${yesterday}T12:00:00`).toISOString()),
    ],
  }];

  const before = calculateLinkedTaskProgress("r2", sched.activities, null);
  assert.equal(before.pct, 100);

  const reset = resetStaleCompletions(sched, today);
  assert.equal(reset.activities.monday[0].completed, false, "sanity check: the live flag really was wiped for the new day");
  const after = calculateLinkedTaskProgress("r2", reset.activities, null);
  assert.equal(after.pct, 100, "durable completionHistory keeps the progress even though the live flags were reset");
});

test("calculateMilestoneProgress returns hasLinkedTasks:false for zero/deleted-only links, and sums mixed tasks otherwise", () => {
  const sched = emptySchedule();
  const mkTask = (id, subtaskIds, completedIds) => ({
    id, title: id, startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    subtasks: subtaskIds.map((sid) => ({ id: sid, task: sid })),
    completedSubtaskIds: completedIds,
    completionHistory: completedIds.map((sid) => event(id, "subtask", "2026-06-01T12:00:00Z", sid)),
  });
  sched.activities.monday = [
    mkTask("t1", ["a", "b"], ["a", "b"]),  // 2/2
    mkTask("t2", ["c", "d"], ["c"]),        // 1/2
  ];

  const noLinks = { id: "m0", planId: "p1", linkedActivities: [] };
  assert.deepEqual(calculateMilestoneProgress(noLinks, sched.activities, null), {
    milestoneId: "m0", hasLinkedTasks: false, completedCount: 0, totalCount: 0, pct: null, taskBreakdown: [],
  });

  const deletedOnly = { id: "m1", planId: "p1", linkedActivities: ["gone"] };
  assert.equal(calculateMilestoneProgress(deletedOnly, sched.activities, null).hasLinkedTasks, false);

  const linked = { id: "m2", planId: "p1", linkedActivities: ["t1", "t2", "t1"] }; // duplicate id
  const progress = calculateMilestoneProgress(linked, sched.activities, null);
  assert.equal(progress.hasLinkedTasks, true);
  assert.equal(progress.taskBreakdown.length, 2, "duplicate linked id is deduped");
  assert.equal(progress.completedCount, 3, "2 (t1) + 1 (t2)");
  assert.equal(progress.totalCount, 4, "2 (t1) + 2 (t2)");
  assert.equal(progress.pct, 75);
});

test("calculatePlanProgress averages per-milestone pct with equal weight, not per-task", () => {
  const sched = emptySchedule();
  const mkTask = (id, total, completed) => ({
    id, title: id, startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    subtasks: Array.from({ length: total }, (_, i) => ({ id: `${id}-${i}`, task: `${id}-${i}` })),
    completedSubtaskIds: Array.from({ length: completed }, (_, i) => `${id}-${i}`),
    completionHistory: Array.from({ length: completed }, (_, i) => event(id, "subtask", "2026-06-01T12:00:00Z", `${id}-${i}`)),
  });
  // Milestone A: one task, fully done. Milestone B: one 10-subtask task, 10% done.
  sched.activities.monday = [mkTask("a", 1, 1), mkTask("b", 10, 1)];

  const plan = { id: "p1" };
  const milestones = [
    { id: "m-a", planId: "p1", linkedActivities: ["a"] },
    { id: "m-b", planId: "p1", linkedActivities: ["b"] },
  ];
  const progress = calculatePlanProgress(plan, milestones, sched.activities);
  assert.equal(progress.hasLinkedTasks, true);
  assert.equal(progress.pct, 55, "average of 100% and 10% — equal per-milestone weight, not a per-task-weighted ~18%");
});

test("calculatePlanProgress falls back to hasLinkedTasks:false when no milestone has linked tasks", () => {
  const sched = emptySchedule();
  const plan = { id: "p1" };
  const progress = calculatePlanProgress(plan, [{ id: "m0", planId: "p1", linkedActivities: [] }], sched.activities);
  assert.equal(progress.hasLinkedTasks, false);
  assert.equal(progress.pct, null);
});

test("computeRoadmapStats overallPct rolls up linked-task progress, falling back to consistency otherwise", () => {
  const sched = emptySchedule();
  const plan = { id: "p1", title: "P", category: "learning", emoji: "book", color: "blue", items: [], startDate: "2026-06-01" };

  // No milestones at all → falls back to consistencyPct, flagged as such.
  const noMilestones = computeRoadmapStats("p1", sched.activities, [], plan);
  assert.equal(noMilestones.overallPctFromLinkedTasks, false);
  assert.equal(noMilestones.overallPct, noMilestones.consistencyPct);

  // A milestone exists but has no linked tasks → same fallback, not a false 0.
  const unlinkedMilestone = {
    id: "m0", planId: "p1", linkedActivities: [], sortOrder: 0, status: "upcoming",
    startDate: "2026-06-01", plannedEndDate: "2026-06-07", plannedDurationDays: 7, createdAt: "", updatedAt: "",
  };
  const noLinks = computeRoadmapStats("p1", sched.activities, [unlinkedMilestone], plan);
  assert.equal(noLinks.overallPctFromLinkedTasks, false);

  // A milestone with a fully-done linked task → overallPct comes from the
  // rollup (100), independent of the day-consistency scan.
  sched.activities.monday = [{
    id: "t1", title: "T", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p1",
    completed: true, completionHistory: [event("t1", "task", "2026-06-01T12:00:00Z")],
  }];
  const linkedMilestone = { ...unlinkedMilestone, linkedActivities: ["t1"] };
  const withLinks = computeRoadmapStats("p1", sched.activities, [linkedMilestone], plan);
  assert.equal(withLinks.overallPctFromLinkedTasks, true);
  assert.equal(withLinks.overallPct, 100);
});

// ── Typing a time without reaching for the colon ────────────────────────────
// TimeInput accepted only `H` or `H:MM`, so the ordinary keystroke sequence
// "0945" committed nothing at all — the field silently refused it until you
// noticed the colon was missing.

test("punctuateTimeDigits fills minutes from the right", () => {
  // The case that was broken: four digits, no colon.
  assert.equal(punctuateTimeDigits("0945"), "09:45");
  assert.equal(punctuateTimeDigits("1230"), "12:30");
  // Three digits is a single-digit hour — "945" is quarter to ten, not hour 94.
  assert.equal(punctuateTimeDigits("945"), "9:45");
  assert.equal(punctuateTimeDigits("700"), "7:00");
});

test("punctuateTimeDigits leaves a half-typed hour alone", () => {
  // Inserting a colon at one or two digits would fight the typist mid-entry.
  assert.equal(punctuateTimeDigits(""), "");
  assert.equal(punctuateTimeDigits("9"), "9");
  assert.equal(punctuateTimeDigits("09"), "09");
  assert.equal(punctuateTimeDigits("12"), "12");
});

test("punctuateTimeDigits ignores everything that isn't a digit", () => {
  // Covers a pasted "10:15 PM" as well as a re-typed colon.
  assert.equal(punctuateTimeDigits("10:15"), "10:15");
  assert.equal(punctuateTimeDigits("10:15 PM"), "10:15");
  assert.equal(punctuateTimeDigits("9:45am"), "9:45");
});

test("punctuateTimeDigits stops at four digits", () => {
  // A fifth keystroke must not silently reshuffle the time already entered.
  assert.equal(punctuateTimeDigits("094512"), "09:45");
});

// ── Alt-drag: duplicate instead of move ─────────────────────────────────────
// The original must survive untouched, and the copy must not inherit anything
// that describes an occurrence of the original.

test("duplicateTaskSlot leaves the original in place and adds a copy", () => {
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "d1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p",
  }];

  const next = duplicateTaskSlot("d1", "monday", 0, "monday", "2026-08-17", "2:00 PM", "3:00 PM")(sched);
  assert.equal(next.activities.monday.length, 2);
  const [original, copy] = next.activities.monday;
  assert.equal(original.startTime, "9:00 AM", "a duplicate must not move the original");
  assert.equal(copy.startTime, "2:00 PM");
  assert.equal(copy.title, "Gym");
  assert.notEqual(copy.id, "d1", "the copy needs its own id");
});

test("a duplicate starts fresh — no completion, history or per-date edits", () => {
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "d1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p",
    completed: true, completedAt: "2026-08-17T09:30:00.000Z",
    completionHistory: [{ id: "e1", taskId: "d1", completedAt: "2026-08-17T09:30:00.000Z", completionType: "task" }],
    exceptions: { "2026-08-17": { skipped: true } },
  }];

  const copy = duplicateTaskSlot("d1", "monday", 0, "monday", "2026-08-17", "2:00 PM", "3:00 PM")(sched)
    .activities.monday[1];
  assert.equal(copy.completed, undefined);
  assert.equal(copy.completedAt, undefined);
  assert.equal(copy.completionHistory, undefined);
  assert.equal(copy.exceptions, undefined);
});

test("duplicating across days copies rather than relocating", () => {
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "d1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p",
  }];

  const next = duplicateTaskSlot("d1", "monday", 0, "wednesday", "2026-08-19", "7:00 AM", "8:00 AM")(sched);
  assert.equal(next.activities.monday.length, 1, "the source day keeps its task");
  assert.equal(next.activities.wednesday.length, 1);
  assert.equal(next.activities.wednesday[0].startTime, "7:00 AM");
});

test("duplicating one slot of a multi-slot task yields a single-slot copy", () => {
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "d1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p",
    slots: [{ startTime: "9:00 AM", endTime: "10:00 AM" }, { startTime: "5:00 PM", endTime: "6:00 PM" }],
  }];

  const next = duplicateTaskSlot("d1", "monday", 1, "monday", "2026-08-17", "8:00 PM", "9:00 PM")(sched);
  assert.equal(next.activities.monday[0].slots.length, 2, "the original keeps both blocks");
  assert.equal("slots" in next.activities.monday[1], false, "a single-block copy carries no slots array");
  assert.equal(next.activities.monday[1].startTime, "8:00 PM");
});

test("a once-recurrence copy is repinned to the drop date", () => {
  // Left on the source's date the copy would be filed on a day it is not drawn.
  const sched = emptySchedule();
  sched.activities.monday = [{
    id: "d1", title: "Gym", startTime: "9:00 AM", endTime: "10:00 AM", planId: "p",
    recurrence: { type: "once", dateISO: "2026-08-17" },
  }];

  const copy = duplicateTaskSlot("d1", "monday", 0, "wednesday", "2026-08-19", "7:00 AM", "8:00 AM")(sched)
    .activities.wednesday[0];
  assert.deepEqual(copy.recurrence, { type: "once", dateISO: "2026-08-19" });
});

test("duplicating a task that vanished mid-drag is a no-op", () => {
  const sched = emptySchedule();
  assert.equal(
    duplicateTaskSlot("gone", "monday", 0, "monday", "2026-08-17", "2:00 PM", "3:00 PM")(sched),
    sched,
  );
});
