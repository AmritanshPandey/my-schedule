/**
 * The Overview screen's read model, shared by all three shells: desktop web
 * (components/OverviewDashboard.tsx), the mobile PWA (components/ios/IOSOverview.tsx)
 * and native iOS (apps/native/src/components/ios/IOSOverview.tsx).
 *
 * Every surface answers the same questions in the same order (see
 * docs/superpowers/specs/2026-10-31-overview-redesign-plan.md):
 * Next → Fix → Status → Goals → Patterns. Fix is selectNeedsAttention and
 * the check-ins card; Patterns is the pattern engine in ./intelligence. This
 * module owns the other three, so the shells only decide how deep to show
 * each answer and can no longer drift on what the numbers mean.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { DayKey, Milestone, Plan, Schedule, Task } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { addDaysToISO, localISODate } from "./dateUtils";
import { formatDisplayTime } from "./timeUtils";
import { isPlanRunning } from "./planLifecycle";
import { getPlanCardStats } from "./planInsights";
import { getSlots } from "./taskMutations";
import { getTaskCheckableItems, getTaskSubtaskSummary, isTaskCompleted, isTaskResolved, isTrackedTask } from "./taskCompletion";
import { selectTodayTasks } from "./todayTasks";
import { computeExecutionTrend } from "./executionAnalytics";
import { calculateExecutionStreak, type ExecutionStreak } from "./consistency/calculateExecutionStreak";
import { ritualScheduledOnDate } from "./consistency/calculateRitualStreak";
import { completedRitualIdsOn } from "./consistency/ritualDayStatus";
import { calculateMilestoneState, type MilestoneHealth, type MilestoneState } from "./milestoneHealth";
import { taskDurationMinutes } from "./intelligence/taskStats";

// ── Status ramp ──────────────────────────────────────────────────────────────

export type StatusTone = "good" | "warn" | "bad" | "none";

/**
 * The one status ramp every Overview instrument reads on (DESIGN.md, "The
 * Instruments"): green ≥70, amber 40–69, rose below 40. Zero is "none", not
 * "bad" — an untouched bar is grey rather than shouting at a day that hasn't
 * started.
 */
export function statusTone(pct: number): StatusTone {
  if (pct >= 70) return "good";
  if (pct >= 40) return "warn";
  if (pct > 0) return "bad";
  return "none";
}

function ratioPct(done: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
}

/** "45m", "2h", "1h 30m" — the remaining-time figure beside Next up. */
export function formatMinutesBrief(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ── Setup ────────────────────────────────────────────────────────────────────

export interface SetupStep {
  key: "plan" | "task" | "ritual";
  label: string;
  /** Tab index the step's CTA opens. */
  tab: number;
  cta: string;
  done: boolean;
}

export interface SetupState {
  steps: SetupStep[];
  doneCount: number;
  next: SetupStep;
  /** Shown until 2 of 3 steps are done (the shell also honours a dismissal). */
  show: boolean;
}

export function selectSetupSteps(schedule: Schedule): SetupState {
  const steps: SetupStep[] = [
    { key: "plan", label: "Create your first plan", tab: 1, cta: "Create plan", done: schedule.plans.length > 0 },
    {
      key: "task",
      label: "Schedule today's tasks",
      tab: 0,
      cta: "Schedule tasks",
      done: Object.values(schedule.activities).some((tasks) => (tasks?.length ?? 0) > 0),
    },
    { key: "ritual", label: "Build a daily routine", tab: 2, cta: "Add a routine", done: (schedule.rituals?.length ?? 0) > 0 },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  return { steps, doneCount, next: steps.find((step) => !step.done) ?? steps[0], show: doneCount < 2 };
}

// ── Next ─────────────────────────────────────────────────────────────────────

export type NextUp =
  | {
      kind: "task";
      task: Task;
      plan: Plan | null;
      /** "9:30 AM", or "" for an untimed task. */
      timeLabel: string;
      /** Set for a multi-slot task: the first slot still open. Completing it goes through toggleSlot. */
      slotIndex?: number;
      /** Ids to pass to the shell's mark-done handler (same as TodayTaskList). */
      checkableIds: string[];
      /** Open tasks left today, including this one. */
      openCount: number;
      remainingMinutes: number;
      done: number;
      total: number;
    }
  | { kind: "day-done"; done: number; total: number }
  | { kind: "empty" };

/**
 * The one thing to do now: the first unresolved task on today's list, in the
 * same order Today shows it. Missed tasks count as resolved — they belong to
 * Needs attention, not to "next".
 */
export function selectNextUp(schedule: Schedule, todayISO: string, todayKey: DayKey): NextUp {
  const { tasks, done, total } = selectTodayTasks(schedule, todayISO, todayKey);
  if (total === 0) return { kind: "empty" };

  const plansById = new Map(schedule.plans.map((plan) => [plan.id, plan]));
  const planFor = (task: Task) => (task.planId ? plansById.get(task.planId) ?? null : null);
  const open = tasks.filter((task) => !isTaskResolved(task, getTaskSubtaskSummary(task, planFor(task)).totalCount));
  if (open.length === 0) return { kind: "day-done", done, total };

  const task = open[0];
  const plan = planFor(task);
  const slots = getSlots(task);
  let slotIndex: number | undefined;
  let startTime = task.startTime;
  if (slots.length > 1) {
    const completed = new Set(task.completedSlotIndices ?? []);
    const index = slots.findIndex((_, i) => !completed.has(i));
    slotIndex = index === -1 ? 0 : index;
    startTime = slots[slotIndex].startTime;
  }

  return {
    kind: "task",
    task,
    plan,
    timeLabel: formatDisplayTime(startTime),
    slotIndex,
    checkableIds: getTaskCheckableItems(task, plan).map((item) => item.id),
    openCount: open.length,
    remainingMinutes: open.reduce((sum, item) => sum + taskDurationMinutes(item), 0),
    done,
    total,
  };
}

// ── Status ───────────────────────────────────────────────────────────────────

export type WeekVerdict = "on-track" | "at-risk" | "behind";

export interface WeekDayStatus {
  day: DayKey;
  /** "Mon" … "Sun". */
  label: string;
  dateISO: string;
  done: number;
  /** Occurrences recorded as missed on that date (auto-miss rollover or by hand). */
  missed: number;
  total: number;
  pct: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekStatus {
  /** Monday-first. */
  days: WeekDayStatus[];
  /** Whole-week task completion (the figure the week bars add up to). */
  tasksPct: number;
  tasksDone: number;
  tasksTotal: number;
  /** Routine follow-through, Monday through today. */
  routinesPct: number;
  /** Missed tasks this week — the same number the execution trend reports. */
  missed: number;
  streak: ExecutionStreak;
  /**
   * How the week is going so far: done ÷ (done + missed), over recorded
   * outcomes only. Work still open today isn't late yet, and a past day with
   * nothing recorded proves nothing either way — the weekday buckets carry no
   * creation date, so a task added this morning would otherwise read as five
   * days missed. Null until something has been done or missed.
   */
  verdict: WeekVerdict | null;
  verdictPct: number;
  /** False when the week has no tasks and no routines at all. */
  hasData: boolean;
}

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const WEEK_VERDICT_LABEL: Record<WeekVerdict, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  behind: "Behind",
};

export function selectWeekStatus(schedule: Schedule, todayISO: string): WeekStatus {
  const plansById = new Map(schedule.plans.map((plan) => [plan.id, plan]));
  const trackingStart = schedule.preferences?.startDate;
  const todayIdx = new Date(`${todayISO}T00:00:00`).getDay();
  const monday = addDaysToISO(todayISO, -((todayIdx + 6) % 7));

  const days: WeekDayStatus[] = DAYS.map((day, i) => {
    // Commitments never count. This keeps the desktop week bar's long-standing
    // occurrence behaviour (no isTaskScheduledOn) so no existing number moves.
    const dateISO = addDaysToISO(monday, i);
    // A day before the tracking start isn't part of the record at all.
    const tracked = !trackingStart || dateISO >= trackingStart;
    const tasks = tracked ? (schedule.activities[day] ?? []).filter(isTrackedTask) : [];
    const isToday = dateISO === todayISO;
    const eventOn = (task: Task, type: "task" | "missed") =>
      (task.completionHistory ?? []).some(
        (event) => event.completionType === type && !event.subtaskId && localISODate(new Date(event.completedAt)) === dateISO,
      );
    const isDone = (task: Task) =>
      isToday
        ? isTaskCompleted(task, getTaskSubtaskSummary(task, task.planId ? plansById.get(task.planId) ?? null : null).totalCount)
        : eventOn(task, "task");
    const done = tasks.filter(isDone).length;
    // A completion wins over a missed mark for the same occurrence, as in
    // computeExecutionTrend.
    const missed = tasks.filter((task) => !isDone(task) && (isToday ? !!task.missed : eventOn(task, "missed"))).length;
    return {
      day,
      label: DAY_SHORT[i],
      dateISO,
      done,
      missed,
      total: tasks.length,
      pct: ratioPct(done, tasks.length),
      isToday,
      isFuture: dateISO > todayISO,
    };
  });

  const tasksTotal = days.reduce((sum, day) => sum + day.total, 0);
  const tasksDone = days.reduce((sum, day) => sum + day.done, 0);

  let routinesDue = 0;
  let routinesDone = 0;
  for (const { dateISO } of days) {
    if (dateISO > todayISO) continue;
    const scheduled = (schedule.rituals ?? []).filter((ritual) =>
      ritualScheduledOnDate(ritual, dateISO, schedule.preferences?.startDate),
    );
    routinesDue += scheduled.length;
    // trackingType-aware: a half-logged quantity routine is not done.
    const doneOn = completedRitualIdsOn(schedule.rituals ?? [], schedule.ritualCompletions ?? [], dateISO);
    routinesDone += scheduled.filter((ritual) => doneOn.has(ritual.id)).length;
  }

  let judgedDue = 0;
  let judgedDone = 0;
  for (const day of days) {
    if (day.isFuture) continue;
    judgedDone += day.done;
    judgedDue += day.done + day.missed;
  }
  const verdictPct = ratioPct(judgedDone, judgedDue);
  const tone = statusTone(verdictPct);
  const verdict: WeekVerdict | null =
    judgedDue === 0 ? null : tone === "good" ? "on-track" : tone === "warn" ? "at-risk" : "behind";

  return {
    days,
    tasksPct: ratioPct(tasksDone, tasksTotal),
    tasksDone,
    tasksTotal,
    routinesPct: ratioPct(routinesDone, routinesDue),
    missed: computeExecutionTrend(schedule, 8, new Date(`${todayISO}T12:00:00`)).currentMissed,
    streak: calculateExecutionStreak(schedule, todayISO),
    verdict,
    verdictPct,
    hasData: tasksTotal > 0 || routinesDue > 0,
  };
}

// ── Goals ────────────────────────────────────────────────────────────────────

export interface GoalPaceRow {
  plan: Plan;
  /** The earliest not-yet-completed milestone in roadmap order. Null = none left / none at all. */
  milestone: Milestone | null;
  state: MilestoneState | null;
  milestonesDone: number;
  milestonesTotal: number;
  /** % of days with at least one task done (calculateConsistency). */
  consistency: number;
}

/** Worst first: what's slipping is what the review is for. */
const HEALTH_RANK: Record<MilestoneHealth, number> = {
  delayed: 0,
  at_risk: 1,
  not_started: 2,
  getting_started: 3,
  on_track: 4,
  ahead: 5,
  completed: 6,
};

/**
 * One row per running plan: its next milestone and how that milestone is
 * pacing, from the same calculateMilestoneState call Plan detail uses, so
 * the two never disagree. `withMilestoneOnly` drops plans with nothing left
 * to pace (mobile shows only milestones; desktop shows every plan).
 */
export function selectGoalPace(
  schedule: Schedule,
  options: { now?: Date; limit?: number; withMilestoneOnly?: boolean } = {},
): { rows: GoalPaceRow[]; totalCount: number } {
  const now = options.now ?? new Date();
  const todayKey = DAYS[(now.getDay() + 6) % 7];
  const allMilestones = schedule.milestones ?? [];

  const rows = schedule.plans
    .filter((plan) => isPlanRunning(plan))
    .map((plan): GoalPaceRow => {
      const milestones = allMilestones
        .filter((milestone) => milestone.planId === plan.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const milestonesDone = milestones.filter((milestone) => milestone.status === "completed").length;
      const milestone = milestones.find((m) => m.status !== "completed") ?? null;
      const state = milestone
        ? calculateMilestoneState({
            milestone,
            plan,
            activities: schedule.activities,
            trackers: schedule.progressTrackers ?? [],
            metricEntries: schedule.metricEntries ?? [],
            now,
            trackingStart: schedule.preferences?.startDate,
            milestones: allMilestones,
            rituals: schedule.rituals ?? [],
            ritualCompletions: schedule.ritualCompletions ?? [],
          })
        : null;
      const { consistency } = getPlanCardStats(
        plan,
        schedule.activities,
        todayKey,
        schedule.preferences?.startDate,
        schedule.milestones,
      );
      return { plan, milestone, state, milestonesDone, milestonesTotal: milestones.length, consistency };
    })
    .filter((row) => !options.withMilestoneOnly || row.milestone !== null)
    .sort((a, b) => {
      const rank = (row: GoalPaceRow) => (row.state ? HEALTH_RANK[row.state.health] : 7);
      return rank(a) - rank(b) || a.consistency - b.consistency;
    });

  return {
    rows: options.limit !== undefined ? rows.slice(0, options.limit) : rows,
    totalCount: rows.length,
  };
}

// ── Greeting ─────────────────────────────────────────────────────────────────

/** The Overview's title on the phone: a greeting by local time, not "Dashboard". */
export function overviewGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
