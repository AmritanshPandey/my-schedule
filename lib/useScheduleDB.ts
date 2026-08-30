"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import type { AccentColor } from "@/lib/colorSystem";
import { categoryFromIcon, colorFromIcon, resolveAccentColor } from "@/lib/colorSystem";
import type { GoalDirection } from "@/lib/trendUtils";
export type { GoalDirection };
import { mergeCloudIfNewer, queueSync, noteLatestSchedule } from "@/lib/cloudSync";
import { getLocalLastUpdated, writeLocalLastUpdated } from "@/lib/localMeta";
import { logError } from "@/lib/errorLog";
import { useAuth } from "@/contexts/AuthProvider";
import { calculateMilestoneEndDate, normalizeMilestoneTimeline } from "@/lib/roadmapDates";
import { localISODate } from "@/lib/dateUtils";
import { DAYS, DAY_LABELS, type DayKey, MAX_SCHEDULE_EVENTS } from "@/lib/scheduleConstants";
import { normalizeDayStartTime } from "@/lib/timeline/displayWindow";
import { MIN_SLEEP_HOURS, MAX_SLEEP_HOURS } from "@/lib/timeline/sleepWindow";
import { bootLog } from "@/lib/iosSafeMode";

export { DAYS, DAY_LABELS } from "@/lib/scheduleConstants";
export type { DayKey } from "@/lib/scheduleConstants";

// Pure normalization lives in scheduleNormalize.ts (no React/auth deps, so it's
// unit-testable). Re-exported here so existing import sites are unchanged.
import { normalizeTasks, entryToTask, resetStaleCompletions } from "@/lib/scheduleNormalize";
export { normalizeTasks, resetStaleCompletions } from "@/lib/scheduleNormalize";
import { applyAutoMissed } from "@/lib/consistency/autoMiss";
import { CategoryRegistry } from "@/lib/taskCategories";
import { isEditableTarget } from "@/lib/keyboardEvents";
import { pushHistory, popHistory, HISTORY_LIMIT } from "@/lib/scheduleHistory";
import { validateSchedule } from "@/lib/scheduleSchema";
import { mergeSchedules, resolveLocalWrite } from "@/lib/mergeSchedule";
import { onLocalWrite, publishLocalWrite } from "@/lib/tabSync";
import {
  entityMap,
  normalizeSyncMeta,
  stampSchedule,
  type ScheduleSyncMeta,
} from "@/lib/stampSchedule";
export type { ScheduleSyncMeta } from "@/lib/stampSchedule";

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
}

export interface ProgressTracker {
  id: string;
  planId: string;
  title: string;
  type: "number";
  unit?: string;
  goalDirection?: GoalDirection;
  goalValue?: number;
}

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
export const RITUAL_TRACKING_TYPES = ["checkbox", "quantity", "duration", "count", "checklist", "times"] as const;
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

type DayActivities = Record<DayKey, Task[]>;

function applyPlanStartDates(activities: DayActivities, plans: Plan[]): DayActivities {
  const startDateByPlanId = new Map(
    plans.flatMap((plan) => (plan.startDate ? [[plan.id, plan.startDate] as const] : [])),
  );

  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      activities[day].map((task) => {
        const planStartDate = startDateByPlanId.get(task.planId);
        if (!planStartDate || (task.activeFrom && task.activeFrom >= planStartDate)) return task;
        return { ...task, activeFrom: planStartDate };
      }),
    ]),
  ) as DayActivities;
}

function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

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

export interface Schedule {
  goals: Goal[];
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

const DB_NAME = "daily-planner";
const DB_VERSION = 10;
const STORE = "schedule";
const LEGACY_RECORD_KEY = "data";
const GUEST_RECORD_KEY = "guest:data";

function recordKeyForUid(uid: string): string {
  return `user:${uid}:data`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Per-tab memory of the record revision this tab last read or wrote.
 *
 * Module scope is exactly the semantics wanted: two tabs of one browser share
 * the IndexedDB record but each gets its own copy of this map, so a mismatch
 * against the stored revision means *the other tab wrote*.
 */
const _seenLocalRev = new Map<string, number>();

/** Companion record holding a monotonic revision for `key`. */
function localRevKey(key: string): string {
  return `${key}:localRev`;
}

function readDB(db: IDBDatabase, key: string): Promise<Schedule | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    // Seed the revision this tab is now up to date with, in the same
    // transaction, so the first write after boot doesn't look like a conflict.
    const revReq = store.get(localRevKey(key));
    revReq.onsuccess = () => {
      _seenLocalRev.set(key, typeof revReq.result === "number" ? revReq.result : 0);
    };
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist the schedule, merging first if another tab wrote since this one last
 * touched the record.
 *
 * This is the local analogue of the cloud compare-and-swap, and it is where
 * two-tab correctness actually lives: a plain `put()` here was erasing the
 * other tab's work on disk, with no network involved. The read, the merge and
 * the write all happen inside ONE IndexedDB transaction, which the engine
 * serializes, so no lock is needed.
 *
 * A whole-schedule replacement (clear data, clear progress, restore backup)
 * survives this merge because those paths stamp tombstones through
 * `stampSchedule` first, and a tombstone newer than the other side's edit wins.
 */
function writeDB(db: IDBDatabase, key: string, data: Schedule, uid?: string | null): Promise<void> {
  const validation = validateSchedule(data);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    return Promise.reject(new Error(`Schedule validation failed at ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid data"}`));
  }
  const mine = validation.data;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let nextRev = 1;

    const commit = (payload: Schedule, storedRev: number) => {
      nextRev = storedRev + 1;
      store.put(payload, key);
      store.put(nextRev, localRevKey(key));
    };

    const revReq = store.get(localRevKey(key));
    revReq.onsuccess = () => {
      const storedRev = typeof revReq.result === "number" ? revReq.result : 0;
      const expected = _seenLocalRev.get(key);
      // `undefined` means this tab has never read the record; treat that as a
      // conflict too, since writing blind is the very thing being fixed.
      if (expected !== undefined && storedRev === expected) {
        commit(mine, storedRev);
        return;
      }
      const currentReq = store.get(key);
      currentReq.onsuccess = () => {
        commit(
          resolveLocalWrite({
            mine,
            stored: (currentReq.result as Schedule | null) ?? null,
            storedRev,
            expectedRev: expected,
            otherLastUpdated: getLocalLastUpdated(uid),
            now: Date.now(),
          }),
          storedRev,
        );
      };
    };

    tx.oncomplete = () => {
      _seenLocalRev.set(key, nextRev);
      // Announce after the transaction commits, so a tab that re-reads on the
      // message is guaranteed to see this write.
      publishLocalWrite({ recordKey: key, rev: nextRev });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function deleteDBKey(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * True if a schedule holds anything the user actually created — used to decide
 * whether orphaned guest data is worth migrating into a freshly signed-in
 * account. Empty/untouched guest records are ignored.
 */
function hasMeaningfulData(s: Schedule): boolean {
  if ((s.goals?.length ?? 0) > 0) return true;
  if ((s.plans?.length ?? 0) > 0) return true;
  if ((s.notes?.length ?? 0) > 0) return true;
  if ((s.progressTrackers?.length ?? 0) > 0) return true;
  if ((s.rituals?.length ?? 0) > 0) return true;
  if ((s.milestones?.length ?? 0) > 0) return true;
  if (Object.values(s.activities ?? {}).some((arr) => (arr?.length ?? 0) > 0)) return true;
  return false;
}

function isPerDay(val: unknown): boolean {
  return !!val && typeof val === "object" && !Array.isArray(val) && "monday" in (val as object);
}

// Defined in lib/colorSystem.ts so pure modules can reach it without pulling in
// this hook (and, through it, contexts/AuthProvider). Re-exported here because
// a dozen call sites import it from this module.
export { categoryFromIcon };

function hasAnyTasks(activities: unknown): boolean {
  if (!isPerDay(activities)) return false;
  return DAYS.some((day) => {
    const tasks = (activities as Record<string, unknown>)[day];
    return Array.isArray(tasks) && tasks.length > 0;
  });
}

function legacyActivityPlan(): Plan {
  return {
    id: "legacy-activities",
    title: "General Plan",
    description: "Imported activities",
    category: "routine",
    emoji: "star",
    color: colorFromIcon("star"),
    items: [],
    metaFields: [],
    summary: [],
    goals: [],
  };
}

function ensureActivityPlans(plans: Plan[], activities: unknown): Plan[] {
  if (plans.length > 0 || !hasAnyTasks(activities)) return plans;
  return [legacyActivityPlan()];
}

function normalizePlan(value: unknown): Plan | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Plan;
  const rawMetric = (p as Plan & { metric?: unknown }).metric;
  const metric =
    rawMetric && typeof rawMetric === "object" && "name" in rawMetric
      ? { name: String((rawMetric as { name: unknown }).name ?? ""), unit: String((rawMetric as { unit?: unknown }).unit ?? "") }
      : undefined;
  const rawCoachMessages = (value as { coachMessages?: unknown }).coachMessages;
  const coachMessages: PlanCoachMessage[] = Array.isArray(rawCoachMessages)
    ? rawCoachMessages
        .filter((m): m is Record<string, unknown> =>
          !!m &&
          typeof m === "object" &&
          ((m as Record<string, unknown>).role === "user" || (m as Record<string, unknown>).role === "assistant") &&
          typeof (m as Record<string, unknown>).content === "string"
        )
        .map((m) => {
          const suggestedMilestones = Array.isArray(m.suggestedMilestones)
            ? m.suggestedMilestones
                .filter((s): s is Record<string, unknown> =>
                  !!s && typeof s === "object" && typeof (s as Record<string, unknown>).title === "string"
                )
                .map((s) => ({
                  title: String(s.title),
                  description: typeof s.description === "string" ? s.description : "",
                  targetDate: typeof s.targetDate === "string" ? s.targetDate : undefined,
                }))
            : undefined;
          return {
            role: m.role as "user" | "assistant",
            content: String(m.content),
            type: m.type === "confirmation" ? "confirmation" : undefined,
            suggestedMilestones,
          };
        })
    : [];

  return {
    id: p.id,
    title: p.title,
    description: typeof (p as Plan & { description?: unknown }).description === "string" ? (p as Plan & { description: string }).description : undefined,
    startDate: typeof (p as Plan & { startDate?: unknown }).startDate === "string" ? (p as Plan & { startDate: string }).startDate : undefined,
    endDate: typeof (p as Plan & { endDate?: unknown }).endDate === "string" ? (p as Plan & { endDate: string }).endDate : undefined,
    category: (p as Plan & { category?: PlanCategory }).category ?? categoryFromIcon(p.emoji),
    emoji: p.emoji,
    color: resolveAccentColor((p as Plan & { color?: string }).color, p.emoji),
    items: Array.isArray(p.items) ? p.items : [],
    metaFields: Array.isArray(p.metaFields) ? p.metaFields : [],
    summary: Array.isArray(p.summary) ? p.summary : [],
    goals: Array.isArray(p.goals) ? p.goals : [],
    metric,
    coachMessages,
    goalId: typeof (p as Plan & { goalId?: unknown }).goalId === "string" ? (p as Plan & { goalId: string }).goalId : undefined,
  };
}

/** Keep only well-formed stored Goals; anything malformed is dropped. */
function normalizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  if (typeof g.id !== "string" || !g.id) return null;
  if (typeof g.title !== "string" || !g.title.trim()) return null;
  const now = new Date().toISOString();
  const status: GoalStatus =
    g.status === "completed" || g.status === "paused" || g.status === "archived" ? g.status : "active";
  return {
    id: g.id,
    title: g.title,
    description: typeof g.description === "string" ? g.description : undefined,
    status,
    startDate: typeof g.startDate === "string" ? g.startDate : undefined,
    targetDate: typeof g.targetDate === "string" ? g.targetDate : undefined,
    createdAt: typeof g.createdAt === "string" ? g.createdAt : now,
    updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : now,
    schemaVersion: typeof g.schemaVersion === "number" ? g.schemaVersion : 1,
  };
}

function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeGoal).filter((g): g is Goal => g !== null);
}

const KNOWN_EVENT_TYPES: readonly DomainEventType[] = [
  "GOAL_CREATED",
  "GOAL_UPDATED",
  "GOAL_COMPLETED",
  "GOAL_ARCHIVED",
  "GOAL_DELETED",
  "AI_PROPOSAL_CREATED",
  "AI_PROPOSAL_ACCEPTED",
  "AI_PROPOSAL_REJECTED",
  "AI_PROPOSAL_FAILED",
];

function normalizeScheduleEvent(value: unknown): ScheduleEvent | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id) return null;
  if (typeof e.entityId !== "string" || !e.entityId) return null;
  if (typeof e.timestamp !== "string") return null;
  if (typeof e.type !== "string" || !KNOWN_EVENT_TYPES.includes(e.type as DomainEventType)) return null;
  const data = e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : undefined;
  return { id: e.id, type: e.type as DomainEventType, entityId: e.entityId, timestamp: e.timestamp, data };
}

function normalizeScheduleEvents(raw: unknown): ScheduleEvent[] {
  if (!Array.isArray(raw)) return [];
  const events = raw.map(normalizeScheduleEvent).filter((e): e is ScheduleEvent => e !== null);
  return events.length > MAX_SCHEDULE_EVENTS ? events.slice(events.length - MAX_SCHEDULE_EVENTS) : events;
}

function defaultTrackerId(planId: string): string {
  return `${planId}-tracker-main`;
}

function normalizeTracker(value: unknown): ProgressTracker | null {
  if (!value || typeof value !== "object") return null;
  const t = value as ProgressTracker;
  if (!t.id || !t.planId || !t.title) return null;
  const gd = (t as ProgressTracker & { goalDirection?: unknown }).goalDirection;
  return {
    id: t.id,
    planId: t.planId,
    title: t.title,
    type: "number",
    unit: t.unit,
    goalDirection: gd === "increase_good" || gd === "decrease_good" ? gd : undefined,
    goalValue: typeof t.goalValue === "number" && Number.isFinite(t.goalValue) ? t.goalValue : undefined,
  };
}

function trackersFromPlans(plans: Plan[], storedTrackers: ProgressTracker[]): ProgressTracker[] {
  if (storedTrackers.length > 0) return storedTrackers;
  return plans.flatMap((plan) => {
    if (plan.metric) {
      return [{ id: defaultTrackerId(plan.id), planId: plan.id, title: plan.metric.name, type: "number" as const, unit: plan.metric.unit }];
    }
    return (plan.metaFields ?? []).map((field) => ({
      id: `${plan.id}-tracker-${field.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      planId: plan.id,
      title: field,
      type: "number" as const,
      unit: "",
    }));
  });
}

function normalizeMilestone(value: unknown): Milestone | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Milestone & Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.planId !== "string" || typeof m.title !== "string") return null;
  const plannedDurationDays =
    typeof m.plannedDurationDays === "number"
      ? Math.max(1, Math.round(m.plannedDurationDays))
      : typeof m.estimatedDays === "number"
      ? Math.max(1, Math.round(m.estimatedDays))
      : 7;
  const startDate =
    typeof m.startDate === "string"
      ? m.startDate
      : typeof m.targetDate === "string"
      ? m.targetDate
      : localISODate(new Date());
  const plannedEndDate =
    typeof m.plannedEndDate === "string"
      ? m.plannedEndDate
      : typeof m.targetDate === "string"
      ? m.targetDate
      : calculateMilestoneEndDate(startDate, plannedDurationDays);
  const actualCompletedDate =
    typeof m.actualCompletedDate === "string"
      ? m.actualCompletedDate
      : typeof m.completedDate === "string"
      ? m.completedDate
      : undefined;
  const legacyCompleted = m.completionStatus === "completed";
  const rawStatus = m.status;
  const status =
    actualCompletedDate || legacyCompleted
      ? "completed"
      : rawStatus === "upcoming" || rawStatus === "active" || rawStatus === "delayed"
      ? rawStatus
      : "upcoming";
  const linkedTrackers = Array.isArray(m.linkedTrackers)
    ? m.linkedTrackers.filter((id): id is string => typeof id === "string")
    : typeof m.linkedTrackerId === "string"
    ? [m.linkedTrackerId]
    : [];
  const linkedActivities = Array.isArray(m.linkedActivities)
    ? m.linkedActivities.filter((id): id is string => typeof id === "string")
    : [];
  const now = new Date().toISOString();
  return {
    id: m.id,
    planId: m.planId,
    title: m.title,
    description: typeof m.description === "string" ? m.description : undefined,
    startDate,
    plannedDurationDays,
    plannedEndDate,
    actualCompletedDate,
    status,
    linkedActivities,
    linkedTrackers,
    createdAt: typeof m.createdAt === "string" ? m.createdAt : now,
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : now,
    targetDate: plannedEndDate,
    estimatedDays: plannedDurationDays,
    linkedTrackerId: linkedTrackers[0],
    completionStatus: status === "completed" ? "completed" : "pending",
    completedDate: actualCompletedDate,
    notes: typeof m.notes === "string" ? m.notes : undefined,
    sortOrder: typeof m.sortOrder === "number" ? m.sortOrder : 0,
  };
}

function normalizeMetricEntry(value: unknown, trackers: ProgressTracker[]): MetricEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as MetricEntry;
  if (!e.id || !e.planId || typeof e.value !== "number" || !e.date) return null;
  const fallbackTracker = trackers.find((tracker) => tracker.planId === e.planId);
  const trackerId = e.trackerId || fallbackTracker?.id;
  if (!trackerId) return null;
  return { id: e.id, planId: e.planId, trackerId, value: e.value, date: e.date };
}

function normalizeMilestoneTimelines(plans: Plan[], milestones: Milestone[]): Milestone[] {
  return plans.flatMap((plan) => {
    const planMilestones = milestones.filter((milestone) => milestone.planId === plan.id);
    // Preserve stored (possibly user-edited) start dates across loads; only
    // derived fields are recomputed. Re-laying from plan.startDate would wipe
    // every manual date change on the next reload.
    return normalizeMilestoneTimeline(planMilestones, plan.startDate);
  });
}


function defaultPlans(): Plan[] {
  return [
    {
      id: "diet",
      title: "Diet",
      description: "Track meals, hydration, and daily nutrition.",
      category: "health",
      emoji: "sleep",
      color: "emerald",
      items: [],
      metaFields: ["Calories", "Protein"],
      summary: [
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35" },
        { label: "Protein", metaKey: "Protein", unit: "g", colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35" },
      ],
    },
    {
      id: "workout",
      title: "Workout",
      description: "Plan workouts and track training progress.",
      category: "fitness",
      emoji: "barbell",
      color: "cyan",
      items: [],
      metaFields: ["Duration", "Calories", "Sets"],
      summary: [
        { label: "Duration", metaKey: "Duration", unit: "min", colorClass: "bg-sky-500/10 text-sky-600 border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-400/35" },
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35" },
      ],
    },
  ];
}

/**
 * A stored `kind` always wins; only an *unset* one is inferred, and only from
 * the sleep icon (the same signal lib/colorSystem.ts already reads). Inferring
 * on every pass instead would silently overrule a user who deliberately marked
 * their sleep-icon category as active — and since this runs on every load, it
 * would do so forever.
 */
function resolveCategoryKind(stored: unknown, icon: string): CategoryKind {
  if (stored === "active" || stored === "rest" || stored === "sleep") return stored;
  return icon === "sleep" ? "sleep" : "active";
}

/** Keep only well-formed stored categories; anything malformed is dropped. */
function normalizeCategories(value: unknown): TaskCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id || seen.has(c.id)) return [];
    if (typeof c.title !== "string" || !c.title.trim()) return [];
    seen.add(c.id);
    const icon = typeof c.icon === "string" && c.icon ? c.icon : "star";
    return [{
      id: c.id,
      title: c.title.trim(),
      icon,
      color: resolveAccentColor(typeof c.color === "string" ? c.color : undefined, icon),
      ...(typeof c.sortOrder === "number" ? { sortOrder: c.sortOrder } : {}),
      kind: resolveCategoryKind(c.kind, icon),
    }];
  });
}

/** Migrate legacy day-activity data into flat per-day tasks plus dynamic plans. */
function migrate(raw: unknown): Schedule {
  const empty = emptyEmpty();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const preferences = normalizeSchedulePreferences(r.preferences);

  // Seeded with whatever is stored, then handed to every normalizeTasks call so
  // pre-category tasks can adopt their old icon/colour as a category. Once every
  // task has a categoryId nothing is adopted, which makes this idempotent.
  const categories = new CategoryRegistry(normalizeCategories(r.categories));

  // Already current shape or existing activities that still need per-day normalization.
  if (isPerDay(r.activities) && Array.isArray(r.plans)) {
    const normalizedPlans = (r.plans as unknown[])
      .map((plan) => normalizePlan(plan))
      .filter((plan): plan is Plan => plan !== null);
    const plans = ensureActivityPlans(normalizedPlans, r.activities);
    // Guard: if plans is still empty but raw activities contain tasks, add the
    // legacy plan so those tasks aren't orphaned (hasAnyTasks may miss edge cases).
    if (plans.length === 0) {
      const hasRawTasks = DAYS.some((day) => {
        const dayData = (r.activities as Record<string, unknown>)?.[day];
        return Array.isArray(dayData) && dayData.length > 0;
      });
      if (hasRawTasks) plans.push(legacyActivityPlan());
    }
    const fallbackPlanId = plans[0]?.id ?? legacyActivityPlan().id;
    const progressTrackers = trackersFromPlans(
      plans,
      Array.isArray(r.progressTrackers)
        ? (r.progressTrackers as unknown[]).map(normalizeTracker).filter((t): t is ProgressTracker => t !== null)
        : []
    );
    const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
      ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
      : [];
    const milestones: Milestone[] = Array.isArray(r.milestones)
      ? (r.milestones as unknown[]).map(normalizeMilestone).filter((m): m is Milestone => m !== null)
      : [];
    const normalizedMilestones = normalizeMilestoneTimelines(plans, milestones);

    const rituals: Ritual[] = Array.isArray(r.rituals)
      ? (r.rituals as Ritual[]).filter((ri) => ri && typeof ri.id === "string" && typeof ri.title === "string" && typeof ri.time === "string")
      : [];

    const notes = normalizeNotes(r.notes);

    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return localISODate(d);
    })();
    const ritualCompletions: RitualCompletion[] = Array.isArray(r.ritualCompletions)
      ? (r.ritualCompletions as unknown[]).filter(
          (c): c is RitualCompletion =>
            c !== null && typeof c === "object" &&
            typeof (c as RitualCompletion).ritualId === "string" &&
            typeof (c as RitualCompletion).date === "string" &&
            (c as RitualCompletion).date >= cutoff
        )
      : [];

    // Normalize first: the registry only knows which categories to derive after
    // every task has been through it. Reading `categories.all()` inline in this
    // object literal would evaluate it before `activities` ran and return an
    // empty list, silently un-categorising the whole schedule.
    const migratedActivities = Object.fromEntries(
      DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], fallbackPlanId, undefined, undefined, categories)])
    ) as DayActivities;

    return {
      goals: normalizeGoals(r.goals),
      plans,
      categories: categories.all(),
      activities: applyPlanStartDates(migratedActivities, plans),
      progressTrackers,
      metricEntries,
      milestones: normalizedMilestones,
      rituals,
      ritualCompletions,
      notes,
      events: normalizeScheduleEvents(r.events),
      preferences,
      // Carried raw here and pruned once in safeMigrate, where the final live
      // entity set is known. Dropping it in these literals is exactly how a new
      // top-level Schedule field goes missing on every reload.
      syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
    };
  }

  // v3/v4 migration: fixed diet/workout plans plus nested day sections.
  if (isPerDay(r.activities) && (Array.isArray(r.diet) || Array.isArray(r.workout))) {
    const plans = defaultPlans();
    const progressTrackers = trackersFromPlans(plans, []);
    const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
      ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
      : [];
    plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
    plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];
    // See the note in the branch above: normalize before reading the registry.
    const migratedActivities = Object.fromEntries(
      DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], plans[0].id, undefined, undefined, categories)])
    ) as DayActivities;

    return {
      goals: normalizeGoals(r.goals),
      plans,
      categories: categories.all(),
      activities: migratedActivities,
      progressTrackers,
      metricEntries,
      milestones: [],
      rituals: [],
      ritualCompletions: [],
      notes: normalizeNotes(r.notes),
      events: normalizeScheduleEvents(r.events),
      preferences,
      // Carried raw here and pruned once in safeMigrate, where the final live
      // entity set is known. Dropping it in these literals is exactly how a new
      // top-level Schedule field goes missing on every reload.
      syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
    };
  }

  // Migrate from v2 (per-day work/personal) or v1 (flat arrays).
  const activities = emptyDayActivities();
  for (const day of DAYS) {
    const workItems: ScheduleEntry[] = isPerDay(r.work)
      ? ((r.work as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.work) ? r.work : [];
    const personalItems: ScheduleEntry[] = isPerDay(r.personal)
      ? ((r.personal as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.personal) ? r.personal : [];

    activities[day].push(...workItems.map((entry) => entryToTask(entry, "briefcase", "workout", "Work Schedule", categories)));
    activities[day].push(...personalItems.map((entry) => entryToTask(entry, "star", "diet", "Personal", categories)));
  }

  const plans = defaultPlans();
  const progressTrackers = trackersFromPlans(plans, []);
  const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
    ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
    : [];
  plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
  plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];

  return {
    goals: normalizeGoals(r.goals),
    plans,
    categories: categories.all(),
    activities,
    progressTrackers,
    metricEntries,
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: normalizeNotes(r.notes),
    events: normalizeScheduleEvents(r.events),
    preferences,
    syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
  };
}

const MAX_NOTE_TAGS = 8;
const MAX_NOTE_TAG_LEN = 24;

function normalizeNoteTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().slice(0, MAX_NOTE_TAG_LEN);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_NOTE_TAGS) break;
  }
  return tags.length > 0 ? tags : undefined;
}

function normalizeNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((n): n is Record<string, unknown> =>
      n !== null && typeof n === "object" &&
      typeof (n as Record<string, unknown>).id === "string"
    )
    .map((n) => ({
      id: String(n.id),
      title: typeof n.title === "string" ? n.title : "",
      body: typeof n.body === "string" ? n.body : "",
      createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
      pinned: typeof n.pinned === "boolean" ? n.pinned : undefined,
      tags: normalizeNoteTags(n.tags),
      linkedTaskIds: Array.isArray(n.linkedTaskIds)
        ? (n.linkedTaskIds as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
      linkedPlanIds: Array.isArray(n.linkedPlanIds)
        ? (n.linkedPlanIds as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
    }));
}

function normalizeSchedulePreferences(raw: unknown): SchedulePreferences {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as { dayStartTime?: unknown; dayEndMinutes?: unknown; dayEndAuto?: unknown; startDate?: unknown; lastRolloverISO?: unknown; acknowledgedMisses?: unknown; sleepHours?: unknown };
  const dayStartTime = normalizeDayStartTime(source.dayStartTime);
  // Accept a numeric dayEndMinutes in minutes (may be > 1440 to represent next-day hours)
  let dayEndMinutes: number | undefined = undefined;
  if (typeof source.dayEndMinutes === "number" && Number.isFinite(source.dayEndMinutes)) {
    const v = Math.floor(source.dayEndMinutes as number);
    // Allow reasonable bounds: 24:00 (1440) .. 28:00 (1680)
    if (v >= 24 * 60 && v <= 28 * 60) dayEndMinutes = v;
  }
  // Accept an explicit boolean to derive the end from tasks
  const dayEndAuto = source.dayEndAuto === true ? true : undefined;

  const startDate =
    typeof source.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.startDate)
      ? source.startDate
      : undefined;
  const lastRolloverISO =
    typeof source.lastRolloverISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.lastRolloverISO)
      ? source.lastRolloverISO
      : undefined;
  // Handled-miss keys ("taskId|YYYY-MM-DD"). Capped so the set can't grow without
  // bound; stale keys past the 7-day attention window are harmless (never read).
  const acknowledgedMisses = Array.isArray(source.acknowledgedMisses)
    ? (source.acknowledgedMisses.filter(
        (k): k is string => typeof k === "string" && /\|\d{4}-\d{2}-\d{2}$/.test(k),
      ).slice(-200))
    : undefined;
  // Half-hour granularity, bounds-checked like dayEndMinutes above; invalid
  // input (non-numeric, NaN, out of range) is dropped rather than clamped, so
  // a bad value never silently enters persistence as something the user never
  // chose.
  let sleepHours: number | undefined = undefined;
  if (typeof source.sleepHours === "number" && Number.isFinite(source.sleepHours)) {
    const rounded = Math.round(source.sleepHours * 2) / 2;
    if (rounded >= MIN_SLEEP_HOURS && rounded <= MAX_SLEEP_HOURS) sleepHours = rounded;
  }
  return {
    ...(dayStartTime ? { dayStartTime } : {}),
    ...(typeof dayEndMinutes === "number" ? { dayEndMinutes } : {}),
    ...(dayEndAuto ? { dayEndAuto } : {}),
    ...(startDate ? { startDate } : {}),
    ...(lastRolloverISO ? { lastRolloverISO } : {}),
    ...(acknowledgedMisses && acknowledgedMisses.length ? { acknowledgedMisses } : {}),
    ...(typeof sleepHours === "number" ? { sleepHours } : {}),
  };
}

function emptyEmpty(): Schedule {
  return {
    goals: [],
    plans: [],
    categories: [],
    activities: emptyDayActivities(),
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


/**
 * Log an IndexedDB write failure, calling out a full-storage quota error with an
 * actionable message — on iOS the quota is small and a silent failure means
 * recent edits aren't persisted and are lost on the next reload.
 */
function logWriteError(err: unknown): void {
  const quota =
    err instanceof DOMException && (err.name === "QuotaExceededError" || err.code === 22);
  logError(
    "indexeddb:write",
    quota
      ? "Device storage is full — recent changes couldn't be saved on this device. Free up space (or use Settings → Clear data) to keep saving."
      : err
  );
}

/**
 * Migrate + reset, but never throw: a single corrupt record (e.g. malformed
 * completionHistory) must not reject the whole load and blank the app. On
 * failure it logs to the on-device error reporter and returns null so the caller
 * can fall back (and still let a healthy cloud snapshot load).
 */
function safeMigrate(raw: unknown): Schedule | null {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      logError("indexeddb:validation", "Schedule payload is not an object");
      return null;
    }
    const source = raw as Record<string, unknown>;
    const hasScheduleSignal = ["plans", "activities", "work", "personal", "diet", "workout"].some((key) => key in source);
    if (!hasScheduleSignal) {
      logError("indexeddb:validation", "Schedule payload has no recognized schedule structure");
      return null;
    }
    // Auto-miss past rolled-over occurrences (dated history events) before the
    // reset clears today-relative live flags — the two touch disjoint fields.
    const migrated = resetStaleCompletions(applyAutoMissed(migrate(raw), new Date()), localISODate(new Date()));
    // Prune the sync bookkeeping against what actually survived migration:
    // stamps for entities that are gone, and tombstones past the 90-day horizon
    // the cloud payload already trims to, can only grow the payload.
    const pruned: Schedule = {
      ...migrated,
      syncMeta: normalizeSyncMeta(migrated.syncMeta, new Set(entityMap(migrated).keys())),
    };
    const validation = validateSchedule(pruned);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      logError("indexeddb:validation", `Schedule validation failed at ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid data"}`);
      return null;
    }
    return validation.data;
  } catch (err) {
    logError("indexeddb:migrate", err);
    return null;
  }
}

/**
 * Cheap content-equality check for two schedules. Both sides are produced by the
 * same normalize/migrate pipeline, so key order is deterministic and a string
 * compare is a reliable "did anything change". Used to skip no-op cloud merges
 * that would otherwise rebuild the whole render tree. Falls back to "not equal"
 * if serialization throws (e.g., unexpected cyclic data) so we never wrongly
 * suppress a real update.
 */
function schedulesEqual(a: Schedule, b: Schedule): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useScheduleDB() {
  const { user, authLoading } = useAuth();
  const storageKey = authLoading ? null : user ? recordKeyForUid(user.uid) : GUEST_RECORD_KEY;
  const storageUid = user?.uid ?? null;
  const [schedule, setScheduleState] = useState<Schedule>(emptyEmpty());
  const [ready, setReady] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);
  // Undo (Cmd+Z) support. scheduleRef always mirrors the latest `schedule` —
  // including updates that bypass `setSchedule` (cloud-merge, auto-miss,
  // restore, clear) — via the sync effect below, so `setSchedule` always
  // computes/pushes against the true current value even across renders.
  const scheduleRef = useRef(schedule);
  const historyRef = useRef<Schedule[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  // The storage key the in-memory `schedule` was hydrated for. The write effect
  // only persists when this matches the current `storageKey`, so data for one
  // identity can never be written under another's key (or while auth is still
  // resolving). This replaces the order-dependent isFirstRender guard.
  const loadedKeyRef = useRef<string | null>(null);
  // Suppresses the immediate echo-write right after hydrating from disk/cloud,
  // so freshly-loaded data isn't re-persisted with a new timestamp.
  const skipNextWriteRef = useRef(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, []);

  // ── Load from IndexedDB whenever the resolved auth identity changes ───────
  useEffect(() => {
    if (!storageKey) {
      setReady(false);
      return;
    }

    let cancelled = false;
    const activeStorageKey = storageKey;
    const activeUid = storageUid;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    setReady(false);
    setIsFirstLaunch(false);
    // Do NOT reset loadedKeyRef here: while the new identity loads it must keep
    // pointing at the *previous* key so the write effect refuses to persist the
    // outgoing identity's in-memory data under the incoming key.

    const getDB = async () => {
      if (dbRef.current) return dbRef.current;
      const db = await openDB();
      dbRef.current = db;
      return db;
    };

    getDB()
      .then(async (db) => {
        const stored = await readDB(db, activeStorageKey);
        const legacyGuestStored =
          !stored && activeStorageKey === GUEST_RECORD_KEY
            ? await readDB(db, LEGACY_RECORD_KEY)
            : null;
        if (cancelled) return;

        const hasLocalData = !!stored || !!legacyGuestStored;
        // Mark which identity the in-memory schedule now belongs to, and skip
        // the echo-write of this freshly-hydrated data.
        loadedKeyRef.current = activeStorageKey;
        skipNextWriteRef.current = true;

        let localSchedule: Schedule | null = null;
        if (stored) {
          // If the local record is corrupt, fall back to empty but keep going —
          // the cloud-merge block below can still restore a healthy snapshot.
          localSchedule = safeMigrate(stored);
          setScheduleState(localSchedule ?? emptyEmpty());
        } else if (legacyGuestStored) {
          const migrated = safeMigrate(legacyGuestStored);
          if (migrated) {
            const now = Date.now();
            setScheduleState(migrated);
            writeDB(db, activeStorageKey, migrated, activeUid).catch(logWriteError);
            writeLocalLastUpdated(now, activeUid); // keep sync clock in step with the migrated record
            deleteDBKey(db, LEGACY_RECORD_KEY).catch(() => {}); // adopted → drop the legacy copy
          } else {
            setScheduleState(emptyEmpty());
            if (!activeUid) setIsFirstLaunch(true);
          }
        } else {
          setScheduleState(emptyEmpty());
          if (!activeUid) setIsFirstLaunch(true);
        }
        setReady(true);
        bootLog("LOCAL_DB_READY");

        if (activeUid) {
          const cloudResult = await mergeCloudIfNewer(activeUid, getLocalLastUpdated(activeUid));
          if (cancelled) return;
          const merged = cloudResult === "merged";
          // Deliberately no push here. Boot used to flush the local snapshot
          // whenever its clock looked ahead, and queue it even after a FAILED
          // pull. On a second device holding older data that is precisely how
          // the first device's work got overwritten before the user touched
          // anything. Unsynced work from a previous session is not lost: the
          // normal debounced write path still pushes it on the first edit, and
          // that push is now a compare-and-swap that merges rather than
          // replaces when the two devices have diverged (lib/cloudSync.ts).
          if (!merged && !hasLocalData) {
            // Fresh account: no newer cloud snapshot and no local user record.
            // Adopt any meaningful guest data so trial work isn't orphaned.
            const guestData =
              (await readDB(db, GUEST_RECORD_KEY)) ?? (await readDB(db, LEGACY_RECORD_KEY));
            if (cancelled) return;
            if (guestData && hasMeaningfulData(guestData)) {
              const now = Date.now();
              const migrated = safeMigrate(guestData);
              if (!migrated) {
                setIsFirstLaunch(true);
                return;
              }
              loadedKeyRef.current = activeStorageKey;
              skipNextWriteRef.current = true; // persisted + synced manually below
              setScheduleState(migrated);
              setIsFirstLaunch(false);
              await writeDB(db, activeStorageKey, migrated, activeUid).catch(() => {});
              writeLocalLastUpdated(now, activeUid);
              queueSync(migrated); // back the adopted data up to this user's cloud
              await deleteDBKey(db, GUEST_RECORD_KEY).catch(() => {}); // moved into the account
              await deleteDBKey(db, LEGACY_RECORD_KEY).catch(() => {});
            } else {
              setIsFirstLaunch(true);
            }
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        logError("indexeddb:load", err);
        // Don't crash — fall back to an empty in-memory schedule so the app
        // still renders even if IndexedDB is unavailable (private mode, quota).
        setScheduleState(emptyEmpty());
        setReady(true);
        bootLog("LOCAL_DB_READY");
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey, storageUid]);

  // ── Cloud-merge listener ─────────────────────────────────────────────────
  // cloudSync dispatches this whenever it has read a remote snapshot. The
  // remote is MERGED with local state rather than replacing it: this hook
  // holds the authoritative local schedule, so it is the only place that can
  // combine the two without plumbing app state into the sync engine.
  useEffect(() => {
    if (!storageKey) return;
    const activeStorageKey = storageKey;

    function handleCloudMerge(e: Event) {
      const { uid, schedule: cloudSchedule, lastUpdated, pushed } =
        (e as CustomEvent<{ uid: string; schedule: Schedule; lastUpdated: number; pushed?: boolean }>).detail;
      if (uid !== storageUid) return;

      const migrated = safeMigrate(cloudSchedule);
      if (!migrated) return; // corrupt cloud snapshot — keep current local state

      loadedKeyRef.current = activeStorageKey;
      const localLastUpdated = getLocalLastUpdated(storageUid);
      let merged: Schedule = migrated;
      let changed = false;
      setScheduleState((prev) => {
        merged = mergeSchedules(
          { schedule: prev, lastUpdated: localLastUpdated },
          { schedule: migrated, lastUpdated },
        );
        // Content-identical to what we already render (common right after login
        // when this device wrote the snapshot last) → keep the existing tree.
        // Swapping in a structurally new-but-equal one forces every memo and
        // component to re-render for nothing: a visible flash while syncing.
        if (schedulesEqual(prev, merged)) return prev;
        changed = true;
        return merged;
      });
      setIsFirstLaunch(false);
      writeLocalLastUpdated(lastUpdated, storageUid);
      if (changed) {
        if (pushed) {
          // The engine merged and wrote this to the cloud already. Persist it
          // locally, but suppress the write effect's echo push — otherwise
          // every merge costs a second, entirely redundant revision.
          skipNextWriteRef.current = true;
          if (dbRef.current) writeDB(dbRef.current, activeStorageKey, merged, storageUid).catch(logWriteError);
        }
        // Otherwise the debounced write effect persists this and queues the
        // push: the merge may contain local entities the cloud has never seen,
        // so that push is wanted, not an echo to be suppressed.
        return;
      }
      // Local already covered everything in the merge, so no state change and
      // therefore no write effect — but if the cloud copy is behind, nobody
      // else will publish the difference.
      if (storageUid && !pushed && !schedulesEqual(migrated, merged)) queueSync(merged);
    }
    window.addEventListener("cloud-sync-merge", handleCloudMerge);
    return () => window.removeEventListener("cloud-sync-merge", handleCloudMerge);
  }, [storageKey, storageUid]);

  // ── Other-tab listener ────────────────────────────────────────────────────
  // Two tabs of one browser share the IndexedDB record but not a line of state.
  // `writeDB`'s compare-and-merge already stops them corrupting each other on
  // disk; this is what stops the idle tab *showing* data that is already stale,
  // and it is why the shared planr_baseRev/planr_lastUpdated keys become
  // truthful again — both tabs converge, so "this browser" really is one
  // replica, which is what the cloud compare-and-swap always assumed.
  useEffect(() => {
    if (!storageKey || !ready) return;
    const activeStorageKey = storageKey;

    async function absorbLocalRecord() {
      const db = dbRef.current;
      if (!db || loadedKeyRef.current !== activeStorageKey) return;
      // readDB re-seeds this tab's revision marker, so the next local write
      // won't see a phantom conflict.
      const stored = await readDB(db, activeStorageKey).catch(() => null);
      if (!stored) return;
      const migrated = safeMigrate(stored);
      if (!migrated) return; // corrupt record — keep what we have

      const otherLastUpdated = getLocalLastUpdated(storageUid);
      setScheduleState((prev) => {
        const merged = mergeSchedules(
          { schedule: prev, lastUpdated: otherLastUpdated },
          { schedule: migrated, lastUpdated: otherLastUpdated },
        );
        if (schedulesEqual(prev, merged)) return prev;
        // Suppress the echo write ONLY when the record on disk already contains
        // everything in the merge. If this tab had an edit still inside its own
        // 500ms debounce, the merge is a superset of the record and skipping
        // here would strand that edit in memory for good — so let the write
        // effect run, and let writeDB's compare-and-merge fold it in.
        if (schedulesEqual(migrated, merged)) skipNextWriteRef.current = true;
        return merged;
      });
    }

    const unsubscribe = onLocalWrite((msg) => {
      if (msg.recordKey !== activeStorageKey) return;
      void absorbLocalRecord();
    });
    // Catch-up for anything a throttled background tab never received.
    const onVisible = () => {
      if (document.visibilityState === "visible") void absorbLocalRecord();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [storageKey, storageUid, ready]);

  // ── Debounced IndexedDB write + cloud sync trigger ────────────────────────
  useEffect(() => {
    if (!ready || !dbRef.current || !storageKey) return;
    // Isolation guard: never persist data that belongs to a different identity
    // than the one currently selected (covers auth switches and the resolving
    // window). loadedKeyRef is only advanced once hydration for a key completes.
    if (loadedKeyRef.current !== storageKey) return;
    // Skip the one echo-write that immediately follows hydration.
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const db = dbRef.current;
    const snap = schedule; // capture for closure
    // Keep the sync singleton's latest-snapshot fresh on every edit so a
    // logout/app-close flush never loses the last debounce window of changes.
    if (storageUid) noteLatestSchedule(snap);
    writeTimer.current = setTimeout(() => {
      const now = Date.now();
      writeDB(db, storageKey, snap, storageUid)
        .then(() => {
          writeLocalLastUpdated(now, storageUid); // update local timestamp for cloud comparison
          queueSync(snap);            // queue cloud backup (no-op for guests)
        })
        .catch(logWriteError);
    }, 500);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [schedule, ready, storageKey, storageUid]);

  // Keep scheduleRef current regardless of *how* `schedule` changed, so
  // setSchedule's synchronous read below is never stale — e.g. right after a
  // cloud-merge or auto-miss tick, both of which call setScheduleState
  // directly and don't go through setSchedule/history at all (by design: a
  // stray Cmd+Z should never undo a background sync or a day-rollover).
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Stable identity (setScheduleState is stable) so downstream effects and
  // useCallback hooks that depend on it don't re-run/recreate every render.
  //
  // Resolves the updater synchronously against scheduleRef (rather than
  // passing the updater through to React's functional setState form) so it
  // can push the pre-mutation value onto the undo stack exactly once. Doing
  // that push *inside* a functional setScheduleState(updater) instead would
  // risk double-recording if React ever replays the updater (StrictMode's
  // dev double-invoke, concurrent-mode interruption).
  const setSchedule = useCallback((
    updater: (prev: Schedule) => Schedule,
    options?: { stamp?: boolean },
  ) => {
    const prev = scheduleRef.current;
    const raw = updater(prev);
    // Record which entities changed, so a merge with another device resolves
    // per item instead of per document. `stamp: false` is for deterministic
    // housekeeping (the day-rollover reset) that both devices compute
    // identically — stamping it would let an idle device fabricate a newer
    // revision and beat a device that did real work.
    const next = options?.stamp === false ? raw : stampSchedule(prev, raw);
    if (next !== prev) {
      historyRef.current = pushHistory(historyRef.current, prev, HISTORY_LIMIT);
      scheduleRef.current = next;
      setCanUndo(true);
    }
    setScheduleState(next);
  }, []);

  /** Cmd/Ctrl+Z: pop the last snapshot off the undo stack and restore it.
   *  No-op when the stack is empty. */
  const undo = useCallback(() => {
    const [restored, rest] = popHistory(historyRef.current);
    if (restored === undefined) return;
    historyRef.current = rest;
    // Stamp the step backwards too. Undoing a delete re-creates an entity that
    // already has a tombstone, and without a fresh stamp the next cloud merge
    // would dutifully delete it again.
    const next = stampSchedule(scheduleRef.current, restored);
    scheduleRef.current = next;
    setCanUndo(rest.length > 0);
    setScheduleState(next);
  }, []);

  // Global Cmd+Z (Mac) / Ctrl+Z (Windows/Linux) — one listener covers
  // whichever shell (iOS or desktop) is mounted, since useScheduleDB is
  // called exactly once per shell and only one shell renders at a time.
  // Falls through to the browser's/tiptap's own text-undo while focus is in
  // an editable element (isEditableTarget), and deliberately ignores
  // Cmd+Shift+Z (redo) since no redo exists yet — better to leave that chord
  // untouched than fire a single undo on it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      if (e.key.toLowerCase() !== "z") return;
      if (isEditableTarget(e.target)) return;
      if (historyRef.current.length === 0) return;
      e.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  // Auto-miss also runs on load (safeMigrate); this catches the case where the
  // app stays open across the day-start boundary. `applyAutoMissed` returns the
  // same reference until a new day has actually rolled over, so this minute
  // tick is a cheap no-op (React bails, nothing persists) on every other tick.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      setScheduleState((prev) => applyAutoMissed(prev, new Date()));
    }, 60_000);
    return () => clearInterval(id);
  }, [ready]);

  /**
   * Replace the whole schedule with data restored from a backup file. The raw
   * object goes through the same migrate pipeline as any stored snapshot, so
   * old exports load cleanly. Returns false (state untouched) when the payload
   * is corrupt. Persistence + cloud sync then follow the normal debounced
   * write path, exactly like any other edit.
   */
  const restoreData = useCallback((raw: unknown): boolean => {
    const migrated = safeMigrate(raw);
    if (!migrated) return false;
    // Whole-schedule replacement still has to say what it REMOVED. Without
    // tombstones a merge reads "restore" as "add these back" and every entity
    // the backup doesn't contain returns from the other device.
    const next = stampSchedule(scheduleRef.current, migrated);
    scheduleRef.current = next;
    setScheduleState(next);
    setIsFirstLaunch(false);
    return true;
  }, []);

  async function clearData(): Promise<void> {
    // Same reasoning as restoreData: the wipe has to be expressed as deletions,
    // or the other device simply refills everything on the next merge.
    const empty = stampSchedule(scheduleRef.current, emptyEmpty());
    scheduleRef.current = empty;
    setScheduleState(empty);
    if (dbRef.current && storageKey) {
      // Surface a failed wipe (don't pretend it succeeded). Cloud deletion is
      // paired by the caller (SettingsView → deleteCloudData).
      await writeDB(dbRef.current, storageKey, empty, storageUid).catch((err) => logError("indexeddb:clear", err));
    }
  }

  /**
   * Wipe all *progress* — task completions (incl. history), ritual check-ins,
   * and logged metric values — while keeping the structure (plans, tasks,
   * trackers, rituals, milestones, notes). Used by Settings → "Clear progress".
   */
  async function clearProgress(): Promise<void> {
    const next: Schedule = (() => {
      const activities = {} as Schedule["activities"];
      for (const day of DAYS) {
        activities[day] = (schedule.activities[day] ?? []).map((t) => {
          const { completed: _c, completedAt: _a, completedSubtaskIds: _s, completedSlotIndices: _sl, completionHistory: _h, missed: _m, missedAt: _ma, missedSlotIndices: _msl, ...rest } = t;
          void _c; void _a; void _s; void _sl; void _h; void _m; void _ma; void _msl;
          return rest;
        });
      }
      // Un-complete milestones: strip the completion dates and re-derive status
      // from the roadmap timeline (keeps the milestones, resets their progress).
      const milestones = normalizeMilestoneTimelines(
        schedule.plans,
        schedule.milestones.map((m) => {
          const { actualCompletedDate: _ad, completedDate: _cd, ...rest } = m;
          void _ad; void _cd;
          return { ...rest, status: "upcoming" as const, completionStatus: "pending" as const };
        }),
      );
      return { ...schedule, activities, milestones, ritualCompletions: [], metricEntries: [] };
    })();
    // Cleared ritual check-ins and metric rows are deletions; the reset tasks
    // and milestones are edits. Both need recording or the merge undoes them.
    const stamped = stampSchedule(scheduleRef.current, next);
    scheduleRef.current = stamped;
    setScheduleState(stamped);
    if (dbRef.current && storageKey) {
      await writeDB(dbRef.current, storageKey, stamped, storageUid).catch((err) => logError("indexeddb:clear-progress", err));
    }
  }

  return { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch, undo, canUndo };
}
