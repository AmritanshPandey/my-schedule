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
  snoozeTaskLater,
  getTaskCheckableItems,
  getTaskSubtaskSummary,
} = await import("../lib/taskCompletion.ts");
const {
  applyTaskDelete,
  createTaskDeleteSnapshot,
  restoreTaskDelete,
  updateTaskDays,
  setTaskException,
  clearTaskException,
} = await import("../lib/taskMutations.ts");
const { isTaskScheduledOn, resolveOccurrence, diffException, weeksBetween } = await import("../lib/taskOccurrence.ts");
const { normalizeMilestoneTimeline, cascadeMilestoneDates } = await import("../lib/roadmapDates.ts");
const { resolveLinkedTasks } = await import("../lib/notes/linkedTasks.ts");
const { computeExecutionTrend, trendNarrative } = await import("../lib/executionAnalytics.ts");
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
