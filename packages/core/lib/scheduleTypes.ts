/**
 * Shared PlanR domain types — extracted from `lib/useScheduleDB.ts` so both
 * `apps/web` and `apps/native` (via `packages/core`) work off one definition
 * instead of two that can drift. The root `lib/useScheduleDB.ts` re-exports
 * everything here for existing `@/lib/useScheduleDB` import sites.
 *
 * Pure types/interfaces only — no IndexedDB, no React, no DOM.
 */

import type { ScheduleEntry } from "./scheduleEntry";
import type { AccentColor } from "./colorSystem";
import type { GoalDirection } from "./trendUtils";
import type { PlanLifecycle } from "./planLifecycle";
import type { DayKey } from "./scheduleConstants";
import type { ScheduleSyncMeta } from "./stampSchedule";

export type { GoalDirection };
export type { ScheduleSyncMeta } from "./stampSchedule";
export type { DayKey } from "./scheduleConstants";

export type PlanCategory = "fitness" | "learning" | "work" | "health" | "routine";

/**
 * A per-Plan metric target (e.g. "burn 500 kcal/day by March 1"), stored on
 * `Plan.goals`. Predates — and is unrelated to — the first-class `Goal`
 * outcome entity below; named distinctly so the two don't collide.
 */
export interface PlanMetricGoal {
  id: string;
  metric: string;
  target: number;
  direction: "below" | "above";
  unit: string;
  startDate: string;
  deadline?: string;
}

/** Explicit user/system state for a Goal. Deliberately small for now — derived
 * states (at-risk, overdue, blocked) belong to a future intelligence layer. */
export type GoalStatus = "active" | "completed" | "paused" | "archived";

/**
 * A first-class outcome the user is ultimately trying to achieve — the "why"
 * above a Plan's "what". Purely descriptive for now: no health/risk/score,
 * no derived progress. Plans optionally reference a Goal via `Plan.goalId`;
 * a Goal never stores its own Plan ids (see lib/goalMutations.ts).
 */
export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  startDate?: string;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

/**
 * Domain event types recorded across the app (see lib/scheduleEvents.ts for
 * the shared append helper). Originally Goal-only (lib/goalMutations.ts);
 * broadened to cover AI Proposal lifecycle events (lib/proposalMutations.ts)
 * without a redesign — this is exactly the generic reuse the event log's
 * shape was designed for.
 */
export type DomainEventType =
  | "GOAL_CREATED"
  | "GOAL_UPDATED"
  | "GOAL_COMPLETED"
  | "GOAL_ARCHIVED"
  | "GOAL_DELETED"
  | "AI_PROPOSAL_CREATED"
  | "AI_PROPOSAL_ACCEPTED"
  | "AI_PROPOSAL_REJECTED"
  | "AI_PROPOSAL_FAILED";

/**
 * A minimal append-only domain event log, persisted on `Schedule.events`.
 * The shape is intentionally generic so future domain events (Plan,
 * Milestone, ...) can reuse it without a redesign. Capped (see
 * MAX_SCHEDULE_EVENTS) so it can't grow unbounded.
 */
export interface ScheduleEvent {
  id: string;
  type: DomainEventType;
  entityId: string;
  timestamp: string; // ISO 8601
  data?: Record<string, unknown>;
}

export interface TaskCompletionEvent {
  id: string;
  taskId: string;
  completedAt: string; // ISO 8601 timestamp (for "missed", the timestamp it was marked)
  completionType: "task" | "subtask" | "missed" | "slot";
  subtaskId?: string;  // present for subtask-level events (completed or missed)
  slotIndex?: number;  // present for slot-level events — index into getSlots(task)
}

/**
 * Per-date override for a single occurrence of a recurring (weekday-template)
 * task — keyed by ISO date in `Task.exceptions`. Lets a user skip or edit just
 * one date without touching every weekday copy. Never overrides identity or
 * history (id / planId / completionHistory).
 */
export interface TaskException {
  skipped?: boolean;      // this date's occurrence is removed from the schedule
  startTime?: string;     // per-date time override (reschedule within the day)
  endTime?: string;
  title?: string;         // edit just this occurrence
  description?: string;
  /**
   * A note about *this date's* occurrence, shown alongside the task's own
   * description rather than replacing it — "felt tired, cut it short" under a
   * standing "Run 5k".
   *
   * Deliberately separate from `description` above, which is an OVERRIDE: set
   * that and the task's permanent description disappears for the day, which is
   * the wrong shape for a diary entry. For the same reason this is not part of
   * `OccurrenceFields` and `resolveOccurrence` never folds it into the task —
   * readers ask for it by date (see `occurrenceNote` in lib/taskOccurrence.ts).
   */
  note?: string;
}

/**
 * Recurrence rule layered on the weekday template. Absent = a plain weekly task
 * (every matching weekday). `weekly` with interval > 1 repeats every N weeks;
 * `once` is a single dated occurrence (lives in that date's weekday bucket).
 */
export type TaskRecurrence =
  | { type: "weekly"; interval: number; anchorISO: string }
  | { type: "once"; dateISO: string };

/**
 * A single time block ("phase") of a task within one day. A task with multiple
 * slots occupies several blocks on the same day but is still one task with one
 * shared completion. Times are in display format (e.g. "09:00 AM").
 */
export interface TaskSlot {
  startTime: string;
  endTime: string;
}

/**
 * A task's kind. "task" (default) and "session" are executed and tracked;
 * "commitment" is held time that blocks the calendar but is never tracked.
 * Exported so UI state that mirrors it can't drift from this union.
 */
export type TaskTypeValue = "task" | "session" | "commitment";

export interface Task {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  /**
   * Ordered extra time blocks within the day. Absent = a single block described
   * by startTime/endTime. When present it is the full ordered set of phases and
   * startTime/endTime always mirror slots[0] (earliest) for back-compat with
   * readers that only understand a single block.
   */
  slots?: TaskSlot[];
  /**
   * The task's category — what *kind* of activity this is. Identity (icon and
   * colour) comes from the category, never from the task itself, so every
   * "Workout" block is the same hue without the user re-picking it each time.
   *
   * Optional because commitments carry no identity (they render neutral), and
   * because a task whose category was deleted still has to load. Resolve it
   * through `taskIdentity` (lib/taskIdentity.ts) rather than reading it raw.
   */
  categoryId?: string;
  planId: string;
  // ─── Completion state ───────────────────────────────────────
  completed?: boolean;
  completedAt?: string;               // ISO timestamp of last full completion
  completedSubtaskIds?: string[];
  completedSlotIndices?: number[];    // indices into getSlots(task) completed today (multi-slot tasks)
  missed?: boolean;                   // today's occurrence was marked "missed" — for a
                                       // multi-slot task this means EVERY slot is missed;
                                       // see missedSlotIndices for one phase at a time.
  missedAt?: string;                  // ISO timestamp it was marked missed
  missedSlotIndices?: number[];       // indices into getSlots(task) marked missed today
                                       // (multi-slot tasks) — the per-phase analogue of
                                       // completedSlotIndices, so one occurrence of a
                                       // repeated-same-day task can be missed independently
                                       // of its other occurrences.
  completionHistory?: TaskCompletionEvent[]; // append-only event log
  streakEnabled?: boolean;            // opt-in to streak tracking
  sortOrder?: number;                 // drag-reorder position within a day
  subtasks?: ScheduleEntry[];         // per-task subtask list (overrides plan.items)
  /**
   * Standard rest inserted between session steps, in minutes. Counts toward the
   * step total (and the "fits the allotted time" check) but never moves the
   * task's start/end. Only meaningful for `taskType: "session"`.
   */
  stepBufferMinutes?: number;
  /**
   * "task" (default) and "session" are executed and tracked. "commitment" is
   * held time — commute, fixed office hours — that blocks the calendar but is
   * never checked off and never counts toward any statistic. See
   * `isTrackedTask` in lib/taskCompletion.ts.
   */
  taskType?: TaskTypeValue;            // undefined treated as "task"
  exceptions?: Record<string, TaskException>; // per-date overrides, keyed by ISO date
  recurrence?: TaskRecurrence;         // absent = weekly (every matching weekday)
  /**
   * Optional active window (ISO "YYYY-MM-DD"). The task only appears on dates
   * within [activeFrom, activeUntil]; either bound may be omitted for an open
   * start/end. Layers on top of the weekday template and recurrence rule, so a
   * habit can run only Mar 1–Apr 30 without editing each weekday copy.
   */
  activeFrom?: string;
  activeUntil?: string;
  /**
   * Groups this task with exactly one other task that occupies the same time
   * slot (e.g. "Cardio" + "Workout" both at the gym at 6pm) so the calendar
   * renders them as one combined block instead of splitting into lanes.
   * Purely a rendering hint — each task keeps its own category, completion
   * state, and stats. Shared by exactly the tasks in the pair; see
   * lib/taskMerge.ts.
   */
  mergeGroupId?: string;
}

export interface SummaryConfig {
  label: string;
  metaKey: string;
  unit: string;
  colorClass?: string;
}

export interface PlanCoachMessage {
  role: "user" | "assistant";
  content: string;
  type?: "confirmation";
  suggestedMilestones?: Array<{ title: string; description: string; targetDate?: string }>;
}

export interface Plan {
  id: string;
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  category: PlanCategory;
  emoji: string;
  color: AccentColor;
  items: ScheduleEntry[];
  metaFields?: string[];
  summary?: SummaryConfig[];
  goals?: PlanMetricGoal[];
  metric?: { name: string; unit: string };
  coachMessages?: PlanCoachMessage[];
  /**
   * Optional link to a first-class Goal (the outcome this plan serves).
   * Undefined = no Goal, which is the default for every existing Plan and
   * remains fully valid — never made mandatory. A Goal's plans are derived
   * by filtering on this field (see lib/goalMutations.ts); it is never
   * stored as a reverse list on Goal.
   */
  goalId?: string;
  /**
   * Explicit user-set lifecycle state, distinct from the *derived* health in
   * lib/planInsights.ts's `derivePlanStatus` — that one answers "how is this
   * going", this one answers "is this running at all". They are never
   * interchangeable: a plan can be `active` and `at_risk` at once.
   *
   * Absent means `active`, so every existing Plan keeps working untouched.
   * A `paused` plan is deliberately held: its tasks stop being expected, so
   * they raise no misses and count toward no consistency figure (see
   * `isPlanRunning`). That is the whole point — pausing must be a way out of
   * a failing streak, not a silent way to keep failing.
   */
  status?: PlanLifecycle;
}

export interface ProgressTracker {
  id: string;
  planId: string;
  title: string;
  type: "number";
  unit?: string;
  goalDirection?: GoalDirection;
  goalValue?: number;
  /**
   * The value this tracker started from — needed to compute a % of the way
   * to `goalValue` (see lib/milestoneHealth.ts). Optional: a tracker with no
   * explicit starting value falls back to its earliest MetricEntry, so
   * existing trackers need no migration.
   */
  startingValue?: number;
  /**
   * A per-day amount to hit, for metrics you accumulate through the day
   * (water, protein, minutes read). Its presence is what makes a tracker
   * *cumulative daily* rather than *point-in-time*: the page fills a ring from
   * that day's summed entries and resets at midnight.
   *
   * Deliberately separate from `goalValue`, which is an *overall* target the
   * tracker moves toward once (weight to 70kg, a test score to 700). The two
   * answer different questions and a tracker can carry either, both, or
   * neither — so this could not be folded into the existing field.
   */
  dailyTarget?: number;
  /**
   * How often this metric wants an entry — the check-in rhythm the Tracking
   * page, Today and Overview prompt against (see lib/trackerCadence.ts).
   * Optional: an unset cadence reads as "daily" for a tracker with a
   * `dailyTarget` (it already resets every day) and "weekly" otherwise, so
   * every existing tracker gets a sensible rhythm with no migration.
   */
  cadence?: TrackerCadence;
}

/** How often a tracker asks for an entry. */
export const TRACKER_CADENCES = ["daily", "weekly", "monthly", "yearly"] as const;
export type TrackerCadence = typeof TRACKER_CADENCES[number];

export interface MetricEntry {
  id: string;
  planId: string;
  trackerId: string;
  value: number;
  date: string; // ISO "YYYY-MM-DD"
}

export interface Milestone {
  id: string;
  planId: string;
  title: string;
  description?: string;
  startDate: string;              // ISO "YYYY-MM-DD"
  plannedDurationDays: number;
  plannedEndDate: string;         // ISO "YYYY-MM-DD"
  actualCompletedDate?: string;   // ISO "YYYY-MM-DD"
  status: "upcoming" | "active" | "completed" | "delayed";
  linkedActivities: string[];
  linkedTrackers: string[];
  createdAt: string;
  updatedAt: string;
  // Legacy fields retained for backward-compatible reads/writes.
  targetDate?: string;            // deprecated: mirrors plannedEndDate
  estimatedDays?: number;         // deprecated: mirrors plannedDurationDays
  linkedTrackerId?: string;       // deprecated: first linkedTrackers item
  completionStatus?: "pending" | "completed";
  completedDate?: string;         // deprecated: mirrors actualCompletedDate
  notes?: string;
  sortOrder: number;
}

export const RITUAL_COLORS = ["rose", "sky", "violet", "amber", "emerald", "fuchsia", "orange", "cyan", "indigo", "teal"] as const;
export type RitualColor = typeof RITUAL_COLORS[number];

/**
 * How a Routine's completion is measured. Absent/undefined ≡ "checkbox" —
 * every ritual created before this field existed keeps behaving exactly as
 * a plain done/not-done habit, with zero migration.
 *
 * "times" is a sibling of "checklist" for a routine that happens several
 * times a day (e.g. water at 8am/1pm/6pm) rather than once — same storage,
 * same per-item completion, same day-complete-only-when-every-item-is-done
 * rule; see `RitualStep`'s own comment for what `label` holds under each type.
 */
export const RITUAL_TRACKING_TYPES = ["checkbox", "quantity", "duration", "count", "checklist"] as const;
export type RitualTrackingType = typeof RITUAL_TRACKING_TYPES[number];

/**
 * One named item in a Ritual's `steps` list — see that field's own comment
 * for how its meaning (individually completable vs. descriptive-only)
 * depends on the ritual's trackingType.
 *
 * For trackingType "times", `label` is not free text — it's a raw 24-hour
 * "HH:MM" string (the same representation `Ritual.time` uses everywhere
 * else), one per daily occurrence, kept sorted ascending. Every renderer
 * formats it through `formatDisplayTime` before showing it, exactly like
 * `ritual.time` itself.
 */
export interface RitualStep {
  id: string;
  label: string;
  /**
   * Optional "HH:MM" for a descriptive item — "Lunch: dal, rice, salad" at
   * 13:00 on a diet routine. Reference detail only: it never schedules
   * anything or changes when the routine counts as done. Unused by "times",
   * whose `label` already is the time.
   */
  time?: string;
}

/**
 * Richer recurrence than a plain weekday set. `repeatDays` on `Ritual` stays
 * the canonical, derived weekday projection that every existing reader
 * (streak calc, timeline grouping, reminders) already understands — this is
 * layered on top for `interval` scheduling (every N days) and to remember
 * which preset ("Weekdays", "Weekends"...) produced the current `repeatDays`,
 * so re-opening the edit form doesn't collapse back to "Custom".
 */
export type RitualRecurrenceKind = "daily" | "weekdays" | "weekends" | "custom" | "interval";
export interface RitualRecurrence {
  kind: RitualRecurrenceKind;
  days?: DayKey[];        // custom only
  intervalDays?: number;  // interval only, >= 2
  anchorDate?: string;    // ISO "YYYY-MM-DD" — day 0 of the interval cycle
}

export interface Ritual {
  id: string;
  title: string;
  time: string;           // "HH:MM" 24-hour — stays required even for anyTime
                           // routines (see `anyTime`), so existing normalization
                           // (which validates `typeof time === "string"`) never
                           // has to change to accept a routine with no time.
  duration?: number;      // minutes (display only)
  repeatDays?: DayKey[];  // undefined / empty = every day
  color?: RitualColor;
  notes?: string;
  sortOrder?: number;     // drag-reorder position

  // ── Generic tracking (all optional; undefined ⇒ today's plain checkbox habit) ──
  trackingType?: RitualTrackingType;
  target?: number;         // per-scheduled-day goal — quantity/duration/count only
  unit?: string;           // "ml" | "kcal" | "g" | "min" | "pages" | "reps" | custom
  quickAmounts?: number[]; // explicit quick-log presets (e.g. Water's [250,500,750]);
                           // falls back to a unit-based guess when unset — see lib/quickAmounts.ts
  // "checklist": each step is its own checkbox (RitualCompletion.stepId),
  // and the day counts done once every step is. "times": same as checklist,
  // but each step's label is a raw "HH:MM" occurrence time rather than a
  // free-text label — a routine that happens several times a day (e.g. water
  // at 8am/1pm/6pm) instead of once. "checkbox": steps are a purely
  // descriptive sub-item list (e.g. "Hair" -> coconut oil, shampoo,
  // conditioner) — never individually completed; one tap on the routine's
  // own checkbox covers all of them. Unused by "quantity"/"duration"/"count".
  steps?: RitualStep[];

  recurrence?: RitualRecurrence;
  anyTime?: boolean;       // true ⇒ `time` is ignored by grouping/timeline/reminders
  icon?: string;           // key into components/SectionIcons.tsx's registry (iconGlyph/getIconPickerStyle)
  description?: string;
}

export type Activity = Task;
export type ProgressEntry = MetricEntry;

export type DayActivities = Record<DayKey, Task[]>;


/**
 * One completion/log row for a Ritual. For a plain checkbox routine this is
 * unchanged from before — exactly `{ritualId, date}`, one row per day,
 * toggled in place (see `toggleRitualCompletion` in lib/ritualCompletions.ts).
 *
 * For quantity/duration/count/checklist routines, multiple rows can exist
 * for the same (ritualId, date) — each one an individually-timestamped log
 * event (`appendRitualLog`/`toggleRitualStep`), never toggled/deduped.
 *
 * A row with neither `value` nor `stepId` is a "day marked done" sentinel —
 * this is what every legacy row already looks like, so `isRitualDayComplete`
 * (lib/consistency/ritualDayStatus.ts) treats it as complete regardless of
 * the ritual's trackingType. This is the backward-compat guarantee: no
 * existing completion is ever reinterpreted as incomplete.
 */
export interface RitualCompletion {
  ritualId: string;
  date: string;        // ISO "YYYY-MM-DD"
  id?: string;         // uid(); absent on every legacy row
  timestamp?: string;  // ISO datetime of this specific log event
  value?: number;      // amount logged — quantity/duration/count
  stepId?: string;     // which checklist step this row completes
  note?: string;
  /**
   * How closely the routine was followed that day, 1–100 — set by the user
   * when marking the day done ("Protein intake: 75%"). Only meaningful on the
   * day-done sentinel row; absent means 100, so every completion written
   * before this field existed reads as fully followed. It never decides
   * whether the day counts as done — marking it done does that. See
   * `ritualDayProgress` in lib/consistency/ritualDayStatus.ts.
   */
  followed?: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;          // markdown source (paragraphs + "- [ ]" checklists)
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
  pinned?: boolean;
  tags?: string[];       // free-text labels for grouping/filtering
  linkedTaskIds?: string[]; // ids of tasks this note references
  linkedPlanIds?: string[]; // ids of plans this note was used to generate (AI "turn into plan")
}

export interface SchedulePreferences {
  dayStartTime?: string;
  /**
   * Timeline end expressed as minutes from midnight. Allows values beyond 24h
   * (e.g. 28:00 -> 1680) to represent an end into the next calendar day.
   */
  dayEndMinutes?: number;
  /**
   * When true, derive the timeline end from the last timed task rather than a fixed minute value.
   * Mirrors the "Auto from tasks" behaviour used for the start-of-day setting.
   */
  dayEndAuto?: boolean;
  /**
   * ISO date ("YYYY-MM-DD") from which analytics are measured. Streaks,
   * trends, and consistency ignore everything before it, so the empty weeks
   * that predate a user adopting the app don't drag their numbers down.
   * Unset = measure over all history (the original behaviour).
   */
  startDate?: string;
  /**
   * Watermark for the auto-miss rollover: the last schedule day whose tasks have
   * been reconciled into missed marks. Advances forward only, so past days are
   * never re-scanned and adopting the feature doesn't retroactively miss history.
   */
  lastRolloverISO?: string;
  /**
   * Missed occurrences the user has handled (dismissed or rescheduled), as
   * `${taskId}|${dateISO}` keys. "Needs attention" hides these; the underlying
   * `"missed"` history event is kept so analytics stay accurate.
   */
  acknowledgedMisses?: string[];
  /**
   * Rows of "Needs attention" the user has dismissed that are NOT missed
   * occurrences — at-risk routines and milestones. Each key ends in the date
   * that made the row appear (see lib/attentionDismissal.ts), so a genuinely
   * new instance of the same problem comes back rather than being silenced
   * forever. Nothing underlying is deleted; this only hides card rows.
   */
  acknowledgedAttention?: string[];
  /**
   * Hours of sleep the user needs, used to size the "waking window" the
   * Overview's "Where the day goes" active-hours bar measures free/overbooked
   * time against (see lib/timeline/sleepWindow.ts). Half-hour granularity,
   * clamped to [MIN_SLEEP_HOURS, MAX_SLEEP_HOURS]. Unset = DEFAULT_SLEEP_HOURS.
   */
  sleepHours?: number;
}

/**
 * A kind of activity — "Workout", "Deep work", "Study".
 *
 * Owns the icon and colour that every task in it renders with, so a hue on the
 * timeline encodes what you are doing rather than which task object you happen
 * to be looking at. Categories are user-managed (Settings → Categories) and are
 * back-filled from each task's old per-task icon on first load after upgrade.
 */
/**
 * What a category's time *is*, for the day's accounting.
 *
 * Not every hour on the timeline is work. Sleep is recovery the day is built
 * around, and rest ("Chill", a walk, reading) is recovery you schedule on
 * purpose — counting either as committed effort is what made the Overview
 * report a 25-hour day. Absent means "active": the safe default, since a
 * category nobody has classified is far more likely to be work than rest.
 */
export type CategoryKind = "active" | "rest" | "sleep";

export interface TaskCategory {
  id: string;
  title: string;
  /** A `SECTION_ICONS` name (components/SectionIcons.tsx). */
  icon: string;
  color: AccentColor;
  sortOrder?: number;
  /** See CategoryKind. Unset = "active". */
  kind?: CategoryKind;
}

/**
 * How one Goal relates to another (§6.4). Two are directional and two are
 * mutual, which changes how they read and how they are resolved:
 *
 *  - `supports` — progress on `from` makes `to` more likely. Directional.
 *  - `depends_on` — `from` needs progress on `to` first. Directional, and the
 *    one with real downstream consequences: a blocked goal is blocked whether
 *    or not it is itself behind.
 *  - `conflicts_with` — both compete for the same time, energy or money.
 *    Mutual; stored from whichever side the user created it.
 *  - `shares_resource` — both draw on one limited thing. Mutual.
 */
export type GoalConnectionType = "supports" | "depends_on" | "conflicts_with" | "shares_resource";

export interface GoalConnection {
  id: string;
  /** The goal the relationship is stated from. */
  fromGoalId: string;
  toGoalId: string;
  type: GoalConnectionType;
  /** Optional free text — e.g. which resource is shared. */
  note?: string;
  createdAt: string;
}

export interface Schedule {
  goals: Goal[];
  /**
   * Typed relationships between goals. Kept as its own flat list rather than
   * as arrays on each Goal so a connection has exactly one representation and
   * deleting either endpoint can be resolved in one pass.
   */
  goalConnections: GoalConnection[];
  plans: Plan[];
  categories: TaskCategory[];
  activities: DayActivities;
  progressTrackers: ProgressTracker[];
  metricEntries: MetricEntry[];
  milestones: Milestone[];
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  notes: Note[];
  events: ScheduleEvent[];
  preferences: SchedulePreferences;
  /**
   * Which entities changed or were deleted, and when — the bookkeeping the
   * cloud merge needs to combine two devices' edits without losing either.
   * Written only by `stampSchedule` at the `setSchedule` boundary and read
   * only by `mergeSchedules`; no feature code should ever touch it.
   */
  syncMeta?: ScheduleSyncMeta;
}
