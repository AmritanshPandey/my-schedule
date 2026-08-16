/**
 * A believable schedule, built fresh relative to "now".
 *
 * Most of PlanR only says anything once there is history behind it — streaks,
 * consistency, the accuracy calendar, the execution trend, "Needs attention".
 * A fresh install shows none of that, so those surfaces can't be judged or
 * demoed without hand-building data, and hand-building it is a minefield:
 *
 *  - `resetStaleCompletions` wipes any live completion flag that has no proof
 *    dated *today*, so a fixture with frozen dates loads as un-completed.
 *  - `migrate` shape-sniffs on `isPerDay(activities) && Array.isArray(plans)`;
 *    miss either and it takes the legacy branch, replacing the plans with
 *    defaults and dropping milestones, rituals and trackers entirely.
 *  - `normalizeMilestoneTimeline` recomputes `plannedEndDate` from
 *    `startDate + plannedDurationDays`, so an overdue milestone has to be
 *    *dated* overdue rather than *labelled* overdue.
 *
 * This module is the single place that knows all of that. Pure and React-free:
 * same `now` in, same schedule out, so the tests can assert on it directly.
 */

import type {
  DayKey,
  Milestone,
  MetricEntry,
  Note,
  Plan,
  ProgressTracker,
  Ritual,
  RitualCompletion,
  Schedule,
  Task,
  TaskCategory,
  TaskCompletionEvent,
  TaskSlot,
} from "@/lib/useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { DAYS } from "@/lib/scheduleConstants";
import { localISODate } from "@/lib/dateUtils";

// ── Shape of the story ────────────────────────────────────────────────────────

/** How far back history runs. Comfortably inside the 90-day floor at which
 *  `ritualCompletions` start being dropped on load. */
const HISTORY_DAYS = 70;

/**
 * Length of the unbroken run ending today.
 *
 * Not enforced by completing things every day — it falls out of the first entry
 * in `BLANK_DAYS_AGO`, since a day counts as "showing up" if *anything* landed
 * on it, ritual or task. Deliberately not a value in `STREAK_MILESTONES`:
 * landing on one fires the milestone celebration, which should be something the
 * user earns rather than something a demo hands them.
 */
const STREAK_DAYS = 12;

/** Recent days (excluding today) that carry an explicit missed mark, so
 *  "Needs attention" has real occurrences to offer. Inside MISSED_LOOKBACK_DAYS. */
const FORCED_MISS_DAYS_AGO = [2, 3, 6];

/**
 * Days with no activity of any kind — no task completed, no ritual ticked.
 *
 * These are what actually bound the streak. `buildActiveDates` counts a ritual
 * completion as showing up just as much as a task completion, so leaving the
 * daily rituals unbroken would report a 60-day run no matter what the tasks
 * did. The most recent entry therefore has to sit exactly `STREAK_DAYS` back:
 * that blank day is the reason the streak reads 12 rather than "since the
 * dataset began". The rest are the ordinary gaps of a real life — travel, a
 * cold, a week that got away.
 */
const BLANK_DAYS_AGO = new Set([STREAK_DAYS, 19, 20, 27, 34, 41, 42, 55, 63]);

// ── Date helpers ──────────────────────────────────────────────────────────────

function shiftDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDaysAgo(now: Date, days: number): string {
  return localISODate(shiftDays(now, -days));
}

/** `DAYS` is Monday-first; `Date.getDay()` is Sunday-first. */
function dayKeyOf(date: Date): DayKey {
  return DAYS[(date.getDay() + 6) % 7];
}

/**
 * A timestamp at local midday on `dateISO`.
 *
 * Midday rather than midnight on purpose: every reader compares these through
 * `localISODate(new Date(ts))`, and a `T00:00:00Z` literal lands on the
 * *previous* local day for anyone west of UTC — which would silently move a
 * completion out of the day it belongs to.
 */
function middayOn(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00`).toISOString();
}

/** Deterministic [0,1) from a string — FNV-1a. Keeps the dataset identical
 *  across reloads so a test can assert on it and the demo looks stable. */
function hash01(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

// ── Categories ────────────────────────────────────────────────────────────────

/**
 * Explicit categories, and every task points at one by id.
 *
 * Leaving a task uncategorised would send `normalizeTasks` down its legacy
 * `icon`/`color` back-fill, which invents categories at load time — so the
 * palette would depend on load order rather than on this file.
 */
const CATEGORIES: TaskCategory[] = [
  { id: "demo-cat-cardio", title: "Cardio", icon: "run", color: "orange", sortOrder: 0 },
  { id: "demo-cat-strength", title: "Strength", icon: "barbell", color: "rose", sortOrder: 1 },
  { id: "demo-cat-language", title: "Language", icon: "language", color: "violet", sortOrder: 2 },
  { id: "demo-cat-deepwork", title: "Deep work", icon: "code", color: "cyan", sortOrder: 3 },
  { id: "demo-cat-reading", title: "Reading", icon: "book", color: "emerald", sortOrder: 4 },
  { id: "demo-cat-cooking", title: "Cooking", icon: "chefhat", color: "amber", sortOrder: 5 },
  { id: "demo-cat-sleep", title: "Sleep", icon: "sleep", color: "indigo", sortOrder: 6 },
];

// ── Plans ─────────────────────────────────────────────────────────────────────

const PLAN_MARATHON = "demo-plan-marathon";
const PLAN_SPANISH = "demo-plan-spanish";
const PLAN_LAUNCH = "demo-plan-launch";

/**
 * How reliably each plan's tasks actually got done.
 *
 * These do not equal the consistency percentages the UI will show.
 * `calculateConsistency` divides *days with at least one completion* by every
 * calendar day since `plan.startDate`, so a plan whose tasks only run three
 * days a week is structurally capped near 43% however diligent the user was.
 * The spread below is chosen with that denominator in mind: marathon covers all
 * seven weekdays and reads healthy, Spanish covers four and reads like it is
 * slipping.
 */
const PLAN_ADHERENCE: Record<string, number> = {
  [PLAN_MARATHON]: 0.82,
  [PLAN_SPANISH]: 0.55,
  [PLAN_LAUNCH]: 0.78,
};

function buildPlans(now: Date): Plan[] {
  return [
    {
      id: PLAN_MARATHON,
      title: "Marathon Training",
      description: "Sixteen weeks to a sub-4 marathon. Base, build, peak, taper.",
      startDate: isoDaysAgo(now, HISTORY_DAYS),
      category: "fitness",
      emoji: "run",
      color: "orange",
      items: [],
      metric: { name: "Weekly distance", unit: "km" },
    },
    {
      id: PLAN_SPANISH,
      title: "Spanish Fluency",
      description: "Conversational Spanish by the end of the year.",
      startDate: isoDaysAgo(now, 56),
      category: "learning",
      emoji: "language",
      color: "violet",
      items: [],
      metric: { name: "Vocabulary", unit: "words" },
    },
    {
      id: PLAN_LAUNCH,
      title: "Ship the Side Project",
      description: "Get the first version in front of real users.",
      startDate: isoDaysAgo(now, 21),
      category: "work",
      emoji: "code",
      color: "cyan",
      items: [],
    },
  ];
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const ALL_DAYS: DayKey[] = [...DAYS];
const WEEKDAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

interface TaskSpec {
  id: string;
  title: string;
  description?: string;
  days: DayKey[];
  startTime: string;
  endTime: string;
  slots?: TaskSlot[];
  categoryId?: string;
  planId: string;
  taskType?: Task["taskType"];
  subtasks?: ScheduleEntry[];
  /** Marathon's daily anchor — the task that carries the visible streak. */
  streakAnchor?: boolean;
}

function subtask(id: string, task: string, duration?: string): ScheduleEntry {
  return duration ? { id, task, duration } : { id, task };
}

const TASK_SPECS: TaskSpec[] = [
  // ── Marathon Training: covers all seven weekdays, which is what lets its
  //    consistency read as healthy rather than as a structural cap.
  {
    id: "demo-task-easy-run",
    title: "Easy run",
    description: "Conversational pace. Nose-breathing the whole way.",
    days: ["monday", "tuesday", "thursday", "friday"],
    startTime: "06:30 AM",
    endTime: "07:15 AM",
    categoryId: "demo-cat-cardio",
    planId: PLAN_MARATHON,
    streakAnchor: true,
  },
  {
    id: "demo-task-strength",
    title: "Strength & core",
    days: ["wednesday"],
    startTime: "06:30 AM",
    endTime: "07:30 AM",
    categoryId: "demo-cat-strength",
    planId: PLAN_MARATHON,
    streakAnchor: true,
  },
  {
    id: "demo-task-long-run",
    title: "Long run",
    description: "The week's key session. Fuel every 45 minutes.",
    days: ["saturday"],
    startTime: "07:00 AM",
    endTime: "09:30 AM",
    categoryId: "demo-cat-cardio",
    planId: PLAN_MARATHON,
    streakAnchor: true,
    subtasks: [
      subtask("demo-sub-lr-1", "Carb load the night before"),
      subtask("demo-sub-lr-2", "Warm-up walk", "10m"),
      subtask("demo-sub-lr-3", "Main distance", "2h"),
      subtask("demo-sub-lr-4", "Cool-down + stretch", "15m"),
      subtask("demo-sub-lr-5", "Log distance in tracker"),
    ],
  },
  {
    // Saturday's second tracked task. Without it the day is one anchor block,
    // which is both thin to look at and unleavable-open: the anchor always
    // completes today, so there would be nothing left to press.
    id: "demo-task-recovery",
    title: "Recovery & foam roll",
    description: "Straight after the long run, before the legs seize up.",
    days: ["saturday"],
    startTime: "10:00 AM",
    endTime: "10:30 AM",
    categoryId: "demo-cat-strength",
    planId: PLAN_MARATHON,
  },
  {
    id: "demo-task-mobility",
    title: "Mobility & stretch",
    days: ["sunday"],
    startTime: "08:00 AM",
    endTime: "08:45 AM",
    categoryId: "demo-cat-strength",
    planId: PLAN_MARATHON,
    streakAnchor: true,
    subtasks: [
      subtask("demo-sub-mob-1", "Hip openers", "12m"),
      subtask("demo-sub-mob-2", "Hamstring series", "12m"),
      subtask("demo-sub-mob-3", "Calf + ankle work", "12m"),
    ],
  },

  // ── Spanish Fluency: four days a week and patchy adherence.
  {
    id: "demo-task-spanish-drill",
    title: "Spanish drills",
    description: "Anki deck, then ten minutes of shadowing.",
    days: ["monday", "wednesday", "friday"],
    startTime: "08:00 PM",
    endTime: "08:45 PM",
    categoryId: "demo-cat-language",
    planId: PLAN_SPANISH,
  },
  {
    id: "demo-task-spanish-read",
    title: "Read in Spanish",
    days: ["sunday"],
    startTime: "09:00 PM",
    endTime: "09:30 PM",
    categoryId: "demo-cat-reading",
    planId: PLAN_SPANISH,
  },

  // ── Ship the Side Project: the multi-slot task, split around lunch.
  {
    id: "demo-task-deep-work",
    title: "Deep work block",
    description: "Phones away. One thing until it ships.",
    days: WEEKDAYS,
    startTime: "09:00 AM",
    endTime: "11:00 AM",
    slots: [
      { startTime: "09:00 AM", endTime: "11:00 AM" },
      { startTime: "02:00 PM", endTime: "03:30 PM" },
    ],
    categoryId: "demo-cat-deepwork",
    planId: PLAN_LAUNCH,
    subtasks: [
      subtask("demo-sub-dw-1", "Review yesterday's diff", "15m"),
      subtask("demo-sub-dw-2", "Write the failing test", "20m"),
      subtask("demo-sub-dw-3", "Make it pass", "1h"),
      subtask("demo-sub-dw-4", "Open the PR", "15m"),
    ],
  },
  {
    id: "demo-task-ship-review",
    title: "Ship review",
    days: ["friday"],
    startTime: "04:00 PM",
    endTime: "04:30 PM",
    categoryId: "demo-cat-deepwork",
    planId: PLAN_LAUNCH,
  },
  {
    // Weekends would otherwise be near-empty — one 45m block against eight
    // hours of sleep, which makes the donut read as 90% sleep and the day
    // card as "2 of 2 done". A demo that lands on a Saturday should still
    // show a day worth looking at.
    id: "demo-task-weekly-planning",
    title: "Weekly planning",
    description: "Pick the three things that actually matter this week.",
    days: ["sunday"],
    startTime: "10:00 AM",
    endTime: "11:00 AM",
    categoryId: "demo-cat-deepwork",
    planId: PLAN_LAUNCH,
    subtasks: [
      subtask("demo-sub-wp-1", "Clear the inbox", "15m"),
      subtask("demo-sub-wp-2", "Review last week's misses", "15m"),
      subtask("demo-sub-wp-3", "Set this week's top three", "20m"),
    ],
  },

  // ── Held time. Commitments are never tracked, so they shape the day without
  //    ever counting for or against a statistic.
  {
    // Runs past the 28:00 end of the schedule day, so it draws a continuation
    // block on the following morning and splits its minutes across both days.
    id: "demo-task-sleep",
    title: "Sleep",
    days: ALL_DAYS,
    startTime: "11:00 PM",
    endTime: "07:00 AM",
    categoryId: "demo-cat-sleep",
    planId: "",
    taskType: "commitment",
  },
  {
    id: "demo-task-meal-prep",
    title: "Meal prep",
    days: ["saturday", "sunday"],
    startTime: "11:30 AM",
    endTime: "12:45 PM",
    categoryId: "demo-cat-cooking",
    planId: "",
    taskType: "commitment",
  },
  {
    // Uncategorised on purpose: held time with no identity renders neutral,
    // which is the common case for a commitment.
    id: "demo-task-commute",
    title: "Commute",
    days: WEEKDAYS,
    startTime: "08:15 AM",
    endTime: "09:00 AM",
    planId: "",
    taskType: "commitment",
  },
];

function isTracked(spec: TaskSpec): boolean {
  return spec.taskType !== "commitment";
}

// ── History ───────────────────────────────────────────────────────────────────

interface DayOutcome {
  completed: Set<string>;
  missed: Set<string>;
}

/**
 * Decide, for every past date in the window, which tasks were done and which
 * were explicitly marked missed.
 *
 * Built as one pass over real dates rather than as per-task date lists, because
 * every reader (`completedOnDate`, `computeExecutionTrend`, `selectNeedsAttention`)
 * cross-checks an event's date against the weekday bucket its task sits in.
 * Walking dates and reading that date's bucket makes the two agree by
 * construction.
 *
 * Not every skipped task becomes a "missed" mark — most real skips are simply
 * never touched, and a dataset where every gap is explicitly marked would make
 * "Needs attention" read as noise rather than as signal.
 */
function buildOutcomes(now: Date, plansById: Map<string, Plan>): Map<string, DayOutcome> {
  const outcomes = new Map<string, DayOutcome>();
  const specsByDay = new Map<DayKey, TaskSpec[]>();
  for (const day of DAYS) {
    specsByDay.set(day, TASK_SPECS.filter((s) => isTracked(s) && s.days.includes(day)));
  }

  for (let back = HISTORY_DAYS; back >= 0; back--) {
    const date = shiftDays(now, -back);
    const dateISO = localISODate(date);
    const outcome: DayOutcome = { completed: new Set(), missed: new Set() };
    outcomes.set(dateISO, outcome);

    // A blank day stays blank: nothing completed, and nothing marked missed
    // either. A day that simply didn't happen reads as absence, not as failure.
    if (BLANK_DAYS_AGO.has(back)) continue;

    for (const spec of specsByDay.get(dayKeyOf(date)) ?? []) {
      // A plan's history starts when the plan does.
      const planStart = plansById.get(spec.planId)?.startDate;
      if (planStart && dateISO < planStart) continue;

      // Today's anchor always lands, because today is the one day the rituals
      // can't carry: "Evening shutdown" is deliberately left unticked so it
      // shows up as an at-risk streak, which would otherwise leave the whole
      // day empty and report the streak as broken. Every *earlier* day in the
      // run is carried by the rituals, so nothing else needs forcing — forcing
      // it would only make the recent weeks read as a suspicious 100%.
      if (spec.streakAnchor && back === 0) {
        outcome.completed.add(spec.id);
        continue;
      }

      const roll = hash01(`${spec.id}|${dateISO}`);
      const adherence = PLAN_ADHERENCE[spec.planId] ?? 0.7;
      if (roll < adherence) outcome.completed.add(spec.id);
      else if (roll < adherence + 0.18) outcome.missed.add(spec.id);
    }

    // Today always keeps one task open. A demo that lands on a fully-ticked day
    // has nothing to press: no pending row in Today's card, no live checkbox,
    // no way to feel what completing something does. Which task is left depends
    // on the weekday, so this has to run after the rolls rather than be baked
    // into a single spec.
    if (back === 0) {
      const openable = (specsByDay.get(dayKeyOf(date)) ?? []).filter((s) => !s.streakAnchor);
      const stillOpen = openable.some(
        (s) => !outcome.completed.has(s.id) && !outcome.missed.has(s.id),
      );
      const last = openable[openable.length - 1];
      if (!stillOpen && last) {
        outcome.completed.delete(last.id);
        outcome.missed.delete(last.id);
      }
    }
  }

  // Guarantee something for "Needs attention" to show. The generator above is
  // deterministic but its misses land wherever they land, and the card is a
  // surface the demo exists to exercise.
  for (const daysAgo of FORCED_MISS_DAYS_AGO) {
    const date = shiftDays(now, -daysAgo);
    const dateISO = localISODate(date);
    const outcome = outcomes.get(dateISO);
    if (!outcome) continue;
    const candidate = (specsByDay.get(dayKeyOf(date)) ?? []).find(
      (s) => !s.streakAnchor && !outcome.completed.has(s.id),
    );
    if (candidate) outcome.missed.add(candidate.id);
  }

  return outcomes;
}

/**
 * Today is the one day whose state lives in two places at once.
 *
 * `completedOnDate` reads the live `completed` flag for today and only consults
 * `completionHistory` for past days, while `buildActiveDates` (the streak) reads
 * history for *every* day including today. So a task finished today needs both
 * the flag and the event, or one of the two surfaces disagrees with the other.
 */
function buildTasks(now: Date, outcomes: Map<string, DayOutcome>): Record<DayKey, Task[]> {
  const todayISO = localISODate(now);
  const todayKey = dayKeyOf(now);
  const nowStamp = new Date(now).toISOString();

  const byId = new Map<string, Task>();

  for (const spec of TASK_SPECS) {
    const history: TaskCompletionEvent[] = [];
    for (const [dateISO, outcome] of outcomes) {
      if (outcome.completed.has(spec.id)) {
        history.push({
          id: `demo-ev-${spec.id}-${dateISO}`,
          taskId: spec.id,
          completedAt: middayOn(dateISO),
          completionType: "task",
        });
      } else if (outcome.missed.has(spec.id)) {
        history.push({
          id: `demo-ev-${spec.id}-${dateISO}-missed`,
          taskId: spec.id,
          completedAt: middayOn(dateISO),
          completionType: "missed",
        });
      }
    }
    history.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

    const task: Task = {
      id: spec.id,
      title: spec.title,
      startTime: spec.startTime,
      endTime: spec.endTime,
      planId: spec.planId,
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.slots ? { slots: spec.slots } : {}),
      ...(spec.categoryId ? { categoryId: spec.categoryId } : {}),
      ...(spec.taskType ? { taskType: spec.taskType } : {}),
      ...(spec.subtasks ? { subtasks: spec.subtasks } : {}),
      ...(history.length ? { completionHistory: history } : {}),
      ...(isTracked(spec) ? { streakEnabled: true } : {}),
    };

    // Live state for today, which must agree with the history written above.
    if (isTracked(spec) && spec.days.includes(todayKey)) {
      const today = outcomes.get(todayISO);
      if (today?.completed.has(spec.id)) {
        task.completed = true;
        task.completedAt = nowStamp;
        // A multi-slot task is only complete when every slot is, so a completed
        // one has to say which slots those were.
        if (spec.slots) task.completedSlotIndices = spec.slots.map((_, i) => i);
        if (spec.subtasks) task.completedSubtaskIds = spec.subtasks.map((s) => s.id);
      } else if (spec.subtasks) {
        // Mid-flight: the first half of the checklist done, the rest still open.
        // This is the state the task detail sheet is most interesting in.
        const half = Math.max(1, Math.floor(spec.subtasks.length / 2));
        task.completedSubtaskIds = spec.subtasks.slice(0, half).map((s) => s.id);
        task.completedAt = nowStamp;
        // Subtask progress is real execution, so it belongs in the streak too.
        history.push({
          id: `demo-ev-${spec.id}-${todayISO}-sub`,
          taskId: spec.id,
          completedAt: nowStamp,
          completionType: "subtask",
          subtaskId: spec.subtasks[0].id,
        });
        task.completionHistory = history;
      }
    }

    byId.set(spec.id, task);
  }

  // One object per task id, placed in each weekday bucket it recurs in — the
  // same aliasing the app itself uses, and what the readers' `taskId|date`
  // de-duping is written against.
  const activities = Object.fromEntries(DAYS.map((d) => [d, [] as Task[]])) as Record<DayKey, Task[]>;
  for (const spec of TASK_SPECS) {
    const task = byId.get(spec.id);
    if (!task) continue;
    for (const day of spec.days) activities[day].push(task);
  }
  for (const day of DAYS) {
    activities[day].sort(
      (a, b) => timeRank(a.startTime) - timeRank(b.startTime),
    );
    activities[day].forEach((t, i) => {
      t.sortOrder = i;
    });
  }
  return activities;
}

/** Minutes past midnight, for ordering a day's blocks. */
function timeRank(display: string): number {
  const m = display.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

// ── Roadmap ───────────────────────────────────────────────────────────────────

interface MilestoneSpec {
  id: string;
  planId: string;
  title: string;
  description?: string;
  startDaysAgo: number;
  durationDays: number;
  /** Days ago it was actually finished. Omit for anything still open. */
  completedDaysAgo?: number;
  linkedTrackers?: string[];
}

/**
 * `normalizeMilestoneTimeline` recomputes `plannedEndDate` as
 * `startDate + durationDays - 1` and re-derives `status` from today's date, so
 * these specs only control the two inputs that survive. "Overdue" therefore has
 * to be arithmetic: `startDaysAgo - durationDays + 1 > 0` with no completion.
 */
const MILESTONE_SPECS: MilestoneSpec[] = [
  {
    id: "demo-ms-base",
    planId: PLAN_MARATHON,
    title: "Base building",
    description: "Four easy weeks. No pace work, just time on feet.",
    startDaysAgo: 70,
    durationDays: 21,
    completedDaysAgo: 51,
    linkedTrackers: ["demo-tracker-distance"],
  },
  {
    id: "demo-ms-half",
    planId: PLAN_MARATHON,
    title: "Half-marathon distance",
    startDaysAgo: 49,
    durationDays: 28,
    completedDaysAgo: 23,
    linkedTrackers: ["demo-tracker-distance"],
  },
  {
    // Ended eight days ago and never closed out — this is the one that puts an
    // overdue row in "Needs attention".
    id: "demo-ms-thirty",
    planId: PLAN_MARATHON,
    title: "30km long run",
    description: "The confidence run. Everything after this is taper.",
    startDaysAgo: 21,
    durationDays: 14,
    linkedTrackers: ["demo-tracker-distance"],
  },
  {
    id: "demo-ms-taper",
    planId: PLAN_MARATHON,
    title: "Race week taper",
    startDaysAgo: 6,
    durationDays: 21,
  },
  {
    id: "demo-ms-race",
    planId: PLAN_MARATHON,
    title: "Marathon day",
    startDaysAgo: -16,
    durationDays: 7,
  },
  {
    id: "demo-ms-a2",
    planId: PLAN_SPANISH,
    title: "A2 vocabulary",
    startDaysAgo: 56,
    durationDays: 30,
    completedDaysAgo: 24,
    linkedTrackers: ["demo-tracker-vocab"],
  },
  {
    id: "demo-ms-convo",
    planId: PLAN_SPANISH,
    title: "First real conversation",
    description: "Thirty unbroken minutes with a tutor.",
    startDaysAgo: 25,
    durationDays: 30,
    linkedTrackers: ["demo-tracker-vocab"],
  },
  {
    id: "demo-ms-b1",
    planId: PLAN_SPANISH,
    title: "B1 reading",
    startDaysAgo: -6,
    durationDays: 45,
  },
  {
    id: "demo-ms-mvp",
    planId: PLAN_LAUNCH,
    title: "Ship the MVP",
    startDaysAgo: 21,
    durationDays: 24,
    linkedTrackers: ["demo-tracker-users"],
  },
  {
    id: "demo-ms-users",
    planId: PLAN_LAUNCH,
    title: "First ten users",
    startDaysAgo: -4,
    durationDays: 21,
    linkedTrackers: ["demo-tracker-users"],
  },
];

function buildMilestones(now: Date): Milestone[] {
  const stamp = isoDaysAgo(now, HISTORY_DAYS);
  return MILESTONE_SPECS.map((spec, index) => {
    const startDate = isoDaysAgo(now, spec.startDaysAgo);
    const plannedEndDate = localISODate(
      shiftDays(now, -spec.startDaysAgo + spec.durationDays - 1),
    );
    const actualCompletedDate =
      spec.completedDaysAgo !== undefined ? isoDaysAgo(now, spec.completedDaysAgo) : undefined;
    return {
      id: spec.id,
      planId: spec.planId,
      title: spec.title,
      description: spec.description,
      startDate,
      plannedDurationDays: spec.durationDays,
      plannedEndDate,
      actualCompletedDate,
      // Re-derived on load by `resolveMilestoneStatus`; written here so the
      // object is already self-consistent before it ever reaches the pipeline.
      status: actualCompletedDate ? "completed" : "upcoming",
      linkedActivities: [],
      linkedTrackers: spec.linkedTrackers ?? [],
      createdAt: middayOn(stamp),
      updatedAt: middayOn(stamp),
      sortOrder: index,
    } satisfies Milestone;
  });
}

// ── Trackers ──────────────────────────────────────────────────────────────────

const TRACKERS: ProgressTracker[] = [
  {
    id: "demo-tracker-distance",
    planId: PLAN_MARATHON,
    title: "Long run distance",
    type: "number",
    unit: "km",
    goalDirection: "increase_good",
    goalValue: 35,
  },
  {
    id: "demo-tracker-vocab",
    planId: PLAN_SPANISH,
    title: "Vocabulary known",
    type: "number",
    unit: "words",
    goalDirection: "increase_good",
    goalValue: 2000,
  },
  {
    id: "demo-tracker-users",
    planId: PLAN_LAUNCH,
    title: "Beta signups",
    type: "number",
    unit: "users",
    goalDirection: "increase_good",
    goalValue: 10,
  },
];

/** A rising line with enough jitter to look measured rather than generated. */
function buildMetricEntries(now: Date): MetricEntry[] {
  const entries: MetricEntry[] = [];

  const push = (trackerId: string, planId: string, daysAgo: number, value: number) => {
    const date = isoDaysAgo(now, daysAgo);
    entries.push({
      id: `demo-metric-${trackerId}-${date}`,
      planId,
      trackerId,
      value: Math.round(value * 10) / 10,
      date,
    });
  };

  // Weekly long runs, 14km building to ~32km.
  for (let i = 0; i < 10; i++) {
    const daysAgo = 70 - i * 7;
    const jitter = (hash01(`dist-${i}`) - 0.5) * 2.4;
    push("demo-tracker-distance", PLAN_MARATHON, daysAgo, 14 + i * 2 + jitter);
  }

  // Vocabulary, sampled every three days across the plan's life.
  for (let i = 0; i < 18; i++) {
    const daysAgo = 54 - i * 3;
    const jitter = hash01(`vocab-${i}`) * 30;
    push("demo-tracker-vocab", PLAN_SPANISH, daysAgo, 620 + i * 52 + jitter);
  }

  // Signups, near-daily over the newest plan's three weeks.
  for (let i = 0; i < 15; i++) {
    const daysAgo = 20 - i;
    push("demo-tracker-users", PLAN_LAUNCH, daysAgo, Math.min(9, Math.floor(i * 0.6 + hash01(`u-${i}`))));
  }

  return entries;
}

// ── Rituals ───────────────────────────────────────────────────────────────────

const RITUALS: Ritual[] = [
  { id: "demo-ritual-pages", title: "Morning pages", time: "06:00", duration: 15, color: "amber", sortOrder: 0 },
  { id: "demo-ritual-hydrate", title: "Hydrate — 3L", time: "12:00", duration: 5, color: "cyan", sortOrder: 1 },
  {
    id: "demo-ritual-shutdown",
    title: "Evening shutdown",
    time: "21:30",
    duration: 10,
    color: "indigo",
    notes: "Close the laptop, write tomorrow's top three.",
    sortOrder: 2,
  },
  {
    id: "demo-ritual-review",
    title: "Weekly review",
    time: "10:00",
    duration: 45,
    repeatDays: ["sunday"],
    color: "violet",
    sortOrder: 3,
  },
];

/**
 * "Evening shutdown" is completed every day up to *yesterday* and never today.
 * That is exactly the shape `selectNeedsAttention` looks for: a live run of two
 * or more days on a ritual that is due today and still unticked, which is the
 * only thing on the card that is still savable before midnight.
 */
function buildRitualCompletions(now: Date): RitualCompletion[] {
  const out: RitualCompletion[] = [];
  for (let back = 60; back >= 0; back--) {
    const date = shiftDays(now, -back);
    const dateISO = localISODate(date);
    const isToday = back === 0;

    // Blank days are blank here too — a ritual completion counts as showing up,
    // so ticking one on an otherwise empty day would keep the streak alive
    // through it and make BLANK_DAYS_AGO a lie.
    if (BLANK_DAYS_AGO.has(back)) continue;

    if (hash01(`pages-${dateISO}`) < 0.85) out.push({ ritualId: "demo-ritual-pages", date: dateISO });
    if (hash01(`hydrate-${dateISO}`) < 0.7) out.push({ ritualId: "demo-ritual-hydrate", date: dateISO });
    if (!isToday) out.push({ ritualId: "demo-ritual-shutdown", date: dateISO });
    if (dayKeyOf(date) === "sunday" && hash01(`review-${dateISO}`) < 0.8) {
      out.push({ ritualId: "demo-ritual-review", date: dateISO });
    }
  }
  return out;
}

// ── Notes ─────────────────────────────────────────────────────────────────────

function buildNotes(now: Date): Note[] {
  return [
    {
      id: "demo-note-race",
      title: "Race day plan",
      body: [
        "Target: sub-4. Even splits, no heroics in the first 10km.",
        "",
        "- [x] Book the hotel",
        "- [x] Break in the race shoes",
        "- [ ] Write the fuelling schedule",
        "- [ ] Pack drop bag",
      ].join("\n"),
      createdAt: middayOn(isoDaysAgo(now, 18)),
      updatedAt: middayOn(isoDaysAgo(now, 3)),
      pinned: true,
      tags: ["marathon", "logistics"],
      linkedTaskIds: ["demo-task-long-run"],
    },
    {
      id: "demo-note-launch",
      title: "What ships in v1",
      body: [
        "Ruthless scope. Everything else is v1.1.",
        "",
        "- [x] Auth",
        "- [x] Core editor",
        "- [ ] Billing",
        "- [ ] Onboarding email",
      ].join("\n"),
      createdAt: middayOn(isoDaysAgo(now, 20)),
      updatedAt: middayOn(isoDaysAgo(now, 1)),
      tags: ["launch"],
      linkedTaskIds: ["demo-task-deep-work"],
    },
    {
      id: "demo-note-spanish",
      title: "Phrases that keep tripping me up",
      body: "por vs para — still not automatic.\n\nsubjunctive after \"espero que\".",
      createdAt: middayOn(isoDaysAgo(now, 9)),
      updatedAt: middayOn(isoDaysAgo(now, 9)),
      tags: ["spanish"],
    },
  ];
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * A complete, self-consistent schedule anchored to `now`.
 *
 * `now` is injectable purely so tests can pin a weekday; production always
 * passes the real clock, because everything here is relative to it.
 */
export function buildDemoSchedule(now: Date = new Date()): Schedule {
  const plans = buildPlans(now);
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const outcomes = buildOutcomes(now, plansById);

  return {
    plans,
    categories: CATEGORIES,
    activities: buildTasks(now, outcomes),
    progressTrackers: TRACKERS,
    metricEntries: buildMetricEntries(now),
    milestones: buildMilestones(now),
    rituals: RITUALS,
    strategies: [],
    ritualCompletions: buildRitualCompletions(now),
    notes: buildNotes(now),
    preferences: {
      dayStartTime: "06:00",
      // Analytics measure from here. Set to the first day of this history so the
      // trend and streak aren't dragged down by empty weeks that predate it.
      startDate: isoDaysAgo(now, HISTORY_DAYS),
      // Deliberately no `lastRolloverISO`: with one set, `applyAutoMissed` runs
      // before `resetStaleCompletions` and back-fills up to 31 days of missed
      // marks on top of the history authored above.
    },
  };
}
