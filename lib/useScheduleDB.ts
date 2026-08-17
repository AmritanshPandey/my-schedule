"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import type { AccentColor } from "@/lib/colorSystem";
import { colorFromIcon, resolveAccentColor } from "@/lib/colorSystem";
import type { GoalDirection } from "@/lib/trendUtils";
export type { GoalDirection };
import { flushNow, mergeCloudIfNewer, queueSync, noteLatestSchedule } from "@/lib/cloudSync";
import { getLocalLastUpdated, writeLocalLastUpdated } from "@/lib/localMeta";
import { logError } from "@/lib/errorLog";
import { useAuth } from "@/contexts/AuthProvider";
import { calculateMilestoneEndDate, normalizeMilestoneTimeline } from "@/lib/roadmapDates";
import { localISODate } from "@/lib/dateUtils";
import { DAYS, DAY_LABELS, type DayKey } from "@/lib/scheduleConstants";
import { normalizeDayStartTime } from "@/lib/timeline/displayWindow";
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

export type PlanCategory = "fitness" | "learning" | "work" | "health" | "routine";

export interface Goal {
  id: string;
  metric: string;
  target: number;
  direction: "below" | "above";
  unit: string;
  startDate: string;
  deadline?: string;
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
  goals?: Goal[];
  metric?: { name: string; unit: string };
  coachMessages?: PlanCoachMessage[];
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

export interface StrategyAsset {
  id: string;
  type: "html" | "pdf";
  title: string;
  description?: string;
  htmlContent?: string;
  pdfData?: string;       // base64 local fallback (guest users)
  pdfUrl?: string;        // Firebase Storage download URL (authenticated users)
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  planId?: string;
}

export const RITUAL_COLORS = ["rose", "sky", "violet", "amber", "emerald", "fuchsia", "orange", "cyan", "indigo", "teal"] as const;
export type RitualColor = typeof RITUAL_COLORS[number];

export interface Ritual {
  id: string;
  title: string;
  time: string;           // "HH:MM" 24-hour
  duration?: number;      // minutes (display only)
  repeatDays?: DayKey[];  // undefined / empty = every day
  color?: RitualColor;
  notes?: string;
  sortOrder?: number;     // drag-reorder position
}

export type Activity = Task;
export type ProgressEntry = MetricEntry;

type DayActivities = Record<DayKey, Task[]>;

function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

export interface RitualCompletion {
  ritualId: string;
  date: string; // ISO "YYYY-MM-DD"
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
}

/**
 * A kind of activity — "Workout", "Deep work", "Study".
 *
 * Owns the icon and colour that every task in it renders with, so a hue on the
 * timeline encodes what you are doing rather than which task object you happen
 * to be looking at. Categories are user-managed (Settings → Categories) and are
 * back-filled from each task's old per-task icon on first load after upgrade.
 */
export interface TaskCategory {
  id: string;
  title: string;
  /** A `SECTION_ICONS` name (components/SectionIcons.tsx). */
  icon: string;
  color: AccentColor;
  sortOrder?: number;
}

export interface Schedule {
  plans: Plan[];
  categories: TaskCategory[];
  activities: DayActivities;
  progressTrackers: ProgressTracker[];
  metricEntries: MetricEntry[];
  milestones: Milestone[];
  rituals: Ritual[];
  strategies: StrategyAsset[];
  ritualCompletions: RitualCompletion[];
  notes: Note[];
  preferences: SchedulePreferences;
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

function readDB(db: IDBDatabase, key: string): Promise<Schedule | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function writeDB(db: IDBDatabase, key: string, data: Schedule): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, key);
    tx.oncomplete = () => resolve();
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

export function categoryFromIcon(icon: string): PlanCategory {
  if (icon === "run" || icon === "barbell") return "fitness";
  if (icon === "school" || icon === "book" || icon === "brain" || icon === "code") return "learning";
  if (icon === "briefcase" || icon === "car") return "work";
  if (icon === "sleep") return "health";
  return "routine";
}

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
  };
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

    const strategies: StrategyAsset[] = Array.isArray(r.strategies)
      ? (r.strategies as StrategyAsset[]).filter((s) => s && typeof s.id === "string" && typeof s.type === "string" && typeof s.title === "string")
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
      plans,
      categories: categories.all(),
      activities: migratedActivities,
      progressTrackers,
      metricEntries,
      milestones: normalizedMilestones,
      rituals,
      strategies,
      ritualCompletions,
      notes,
      preferences,
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
      plans,
      categories: categories.all(),
      activities: migratedActivities,
      progressTrackers,
      metricEntries,
      milestones: [],
      rituals: [],
      strategies: [],
      ritualCompletions: [],
      notes: normalizeNotes(r.notes),
      preferences,
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
    plans,
    categories: categories.all(),
    activities,
    progressTrackers,
    metricEntries,
    milestones: [],
    rituals: [],
    strategies: [],
    ritualCompletions: [],
    notes: normalizeNotes(r.notes),
    preferences,
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
    }));
}

function normalizeSchedulePreferences(raw: unknown): SchedulePreferences {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as { dayStartTime?: unknown; dayEndMinutes?: unknown; dayEndAuto?: unknown; startDate?: unknown; lastRolloverISO?: unknown; acknowledgedMisses?: unknown };
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
  return {
    ...(dayStartTime ? { dayStartTime } : {}),
    ...(typeof dayEndMinutes === "number" ? { dayEndMinutes } : {}),
    ...(dayEndAuto ? { dayEndAuto } : {}),
    ...(startDate ? { startDate } : {}),
    ...(lastRolloverISO ? { lastRolloverISO } : {}),
    ...(acknowledgedMisses && acknowledgedMisses.length ? { acknowledgedMisses } : {}),
  };
}

function emptyEmpty(): Schedule {
  return {
    plans: [],
    categories: [],
    activities: emptyDayActivities(),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    strategies: [],
    ritualCompletions: [],
    notes: [],
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
    // Auto-miss past rolled-over occurrences (dated history events) before the
    // reset clears today-relative live flags — the two touch disjoint fields.
    return resetStaleCompletions(applyAutoMissed(migrate(raw), new Date()), localISODate(new Date()));
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
            writeDB(db, activeStorageKey, migrated).catch(logWriteError);
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
          if ((cloudResult === "local-newer" || cloudResult === "missing") && localSchedule) {
            // Recover a local write from a previous session that may have closed
            // before the debounced cloud sync completed.
            await flushNow(localSchedule);
          } else if (cloudResult === "error" && localSchedule) {
            queueSync(localSchedule);
          }
          if (!merged && !hasLocalData) {
            // Fresh account: no newer cloud snapshot and no local user record.
            // Adopt any meaningful guest data so trial work isn't orphaned.
            const guestData =
              (await readDB(db, GUEST_RECORD_KEY)) ?? (await readDB(db, LEGACY_RECORD_KEY));
            if (cancelled) return;
            if (guestData && hasMeaningfulData(guestData)) {
              const now = Date.now();
              const migrated = resetStaleCompletions(applyAutoMissed(migrate(guestData), new Date()), localISODate(new Date()));
              loadedKeyRef.current = activeStorageKey;
              skipNextWriteRef.current = true; // persisted + synced manually below
              setScheduleState(migrated);
              setIsFirstLaunch(false);
              await writeDB(db, activeStorageKey, migrated).catch(() => {});
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
  // When a cloud snapshot is newer than local data, cloudSync dispatches this
  // event. We absorb the new state and persist it to IndexedDB.
  useEffect(() => {
    if (!storageKey) return;
    const activeStorageKey = storageKey;

    function handleCloudMerge(e: Event) {
      const { uid, schedule: cloudSchedule, lastUpdated } = (e as CustomEvent<{ uid: string; schedule: Schedule; lastUpdated: number }>).detail;
      if (uid !== storageUid) return;

      const migrated = safeMigrate(cloudSchedule);
      if (!migrated) return; // corrupt cloud snapshot — keep current local state

      // If the cloud snapshot is content-identical to what we already render
      // (common right after login when this device wrote the snapshot last),
      // skip the state swap entirely. Replacing the schedule with a structurally
      // new-but-equal tree forces every memo/component to re-render for nothing —
      // a visible "flash" while the app syncs. Still reconcile the local
      // timestamp so we don't keep re-merging the same snapshot.
      loadedKeyRef.current = activeStorageKey;
      let changed = false;
      setScheduleState((prev) => {
        if (schedulesEqual(prev, migrated)) return prev;
        changed = true;
        return migrated;
      });
      setIsFirstLaunch(false);
      writeLocalLastUpdated(lastUpdated, storageUid);
      if (!changed) return;
      // Real change absorbed from cloud: skip the echo-write so the write effect
      // doesn't overwrite the cloud `lastUpdated` with a fresh now, and persist.
      skipNextWriteRef.current = true;
      if (dbRef.current) {
        writeDB(dbRef.current, activeStorageKey, migrated).catch(logWriteError);
      }
    }
    window.addEventListener("cloud-sync-merge", handleCloudMerge);
    return () => window.removeEventListener("cloud-sync-merge", handleCloudMerge);
  }, [storageKey, storageUid]);

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
      writeDB(db, storageKey, snap)
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
  const setSchedule = useCallback((updater: (prev: Schedule) => Schedule) => {
    const prev = scheduleRef.current;
    const next = updater(prev);
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
    scheduleRef.current = restored;
    setCanUndo(rest.length > 0);
    setScheduleState(restored);
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
    setScheduleState(migrated);
    setIsFirstLaunch(false);
    return true;
  }, []);

  async function clearData(): Promise<void> {
    const empty = emptyEmpty();
    setScheduleState(empty);
    if (dbRef.current && storageKey) {
      // Surface a failed wipe (don't pretend it succeeded). Cloud deletion is
      // paired by the caller (SettingsView → deleteCloudData).
      await writeDB(dbRef.current, storageKey, empty).catch((err) => logError("indexeddb:clear", err));
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
    setScheduleState(next);
    if (dbRef.current && storageKey) {
      await writeDB(dbRef.current, storageKey, next).catch((err) => logError("indexeddb:clear-progress", err));
    }
  }

  return { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch, undo, canUndo };
}
