"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScheduleEntry } from "@/components/ScheduleItem";
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

export { DAYS, DAY_LABELS } from "@/lib/scheduleConstants";
export type { DayKey } from "@/lib/scheduleConstants";

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
  completionType: "task" | "subtask" | "missed";
  subtaskId?: string;  // present for subtask-level events (completed or missed)
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

export interface Task {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  icon: string;
  color: AccentColor;
  planId: string;
  // ─── Completion state ───────────────────────────────────────
  completed?: boolean;
  completedAt?: string;               // ISO timestamp of last full completion
  completedSubtaskIds?: string[];
  missed?: boolean;                   // today's occurrence was marked "missed"
  missedAt?: string;                  // ISO timestamp it was marked missed
  completionHistory?: TaskCompletionEvent[]; // append-only event log
  streakEnabled?: boolean;            // opt-in to streak tracking
  sortOrder?: number;                 // drag-reorder position within a day
  subtasks?: ScheduleEntry[];         // per-task subtask list (overrides plan.items)
  taskType?: "task" | "session";       // undefined treated as "task"
  exceptions?: Record<string, TaskException>; // per-date overrides, keyed by ISO date
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
}

export interface SchedulePreferences {
  dayStartTime?: string;
}

export interface Schedule {
  plans: Plan[];
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

function splitLegacyTimeRange(value: string): { startTime: string; endTime: string } {
  const raw = value.trim();
  const parts = raw.split(/\s*(?:-|–|—|to)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { startTime: parts[0], endTime: parts[1] };
  }
  return { startTime: raw, endTime: raw };
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

function entryToTask(entry: ScheduleEntry, icon: string, planId: string, description?: string): Task {
  const { startTime, endTime } = splitLegacyTimeRange(entry.time ?? "");
  return {
    id: entry.id,
    title: entry.task,
    description,
    startTime,
    endTime,
    icon,
    color: colorFromIcon(icon),
    planId,
  };
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

function normalizeTasks(value: unknown, fallbackPlanId: string, fallbackIcon = "briefcase", fallbackDescription?: string): Task[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    if ("startTime" in item && "endTime" in item && "title" in item && "icon" in item) {
      const task = item as Task;
      const rawType: string | undefined = task.taskType;
      const taskType: Task["taskType"] =
        rawType === "session" || rawType === "routine" ? "session" :
        rawType === "task" || rawType === "normal" ? "task" :
        undefined;
      return [{
        id: task.id,
        title: task.title,
        ...(task.description !== undefined && { description: task.description }),
        startTime: task.startTime,
        endTime: task.endTime,
        icon: task.icon || fallbackIcon,
        color: resolveAccentColor((task as Task & { color?: string }).color, task.icon || fallbackIcon),
        planId: task.planId || fallbackPlanId,
        ...(taskType !== undefined && { taskType }),
        // Completion state — must be preserved across page reloads
        ...(task.completed !== undefined && { completed: task.completed }),
        ...(task.completedAt !== undefined && { completedAt: task.completedAt }),
        ...(task.completedSubtaskIds !== undefined && { completedSubtaskIds: task.completedSubtaskIds }),
        ...(task.missed !== undefined && { missed: task.missed }),
        ...(task.missedAt !== undefined && { missedAt: task.missedAt }),
        ...(task.completionHistory !== undefined && { completionHistory: task.completionHistory }),
        ...(task.streakEnabled !== undefined && { streakEnabled: task.streakEnabled }),
        ...(task.sortOrder !== undefined && { sortOrder: task.sortOrder }),
        ...(Array.isArray(task.subtasks) && task.subtasks.length > 0 && { subtasks: task.subtasks }),
        ...(task.exceptions && typeof task.exceptions === "object" && !Array.isArray(task.exceptions) && { exceptions: task.exceptions }),
      }];
    }

    if ("items" in item && Array.isArray((item as { items: unknown[] }).items)) {
      const section = item as { title?: string; iconName?: string; items: ScheduleEntry[] };
      return section.items.map((entry) => entryToTask(entry, section.iconName ?? fallbackIcon, fallbackPlanId, section.title));
    }

    if ("time" in item && "task" in item) {
      return [entryToTask(item as ScheduleEntry, fallbackIcon, fallbackPlanId, fallbackDescription)];
    }

    return [];
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

/** Migrate legacy day-activity data into flat per-day tasks plus dynamic plans. */
function migrate(raw: unknown): Schedule {
  const empty = emptyEmpty();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const preferences = normalizeSchedulePreferences(r.preferences);

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

    return {
      plans,
      activities: Object.fromEntries(
        DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], fallbackPlanId)])
      ) as DayActivities,
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
    return {
      plans,
      activities: Object.fromEntries(
        DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], plans[0].id)])
      ) as DayActivities,
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

    activities[day].push(...workItems.map((entry) => entryToTask(entry, "briefcase", "workout", "Work Schedule")));
    activities[day].push(...personalItems.map((entry) => entryToTask(entry, "star", "diet", "Personal")));
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
    }));
}

function normalizeSchedulePreferences(raw: unknown): SchedulePreferences {
  if (!raw || typeof raw !== "object") return {};
  const dayStartTime = normalizeDayStartTime((raw as { dayStartTime?: unknown }).dayStartTime);
  return dayStartTime ? { dayStartTime } : {};
}

function emptyEmpty(): Schedule {
  return {
    plans: [],
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
 * Recurring weekday tasks store their completion on the template itself
 * (`completed` / `completedSubtaskIds`). That state belongs to a single day's
 * occurrence — without resetting it, yesterday's (or last week's) completion
 * bleeds into the new day. This clears the live completion flags for any task
 * whose most recent activity isn't today, while leaving `completionHistory`
 * (the dated, permanent record used by analytics/heatmaps) fully intact.
 */
export function resetStaleCompletions(schedule: Schedule, todayISO: string): Schedule {
  let changed = false;
  const activities = { ...schedule.activities };
  for (const day of DAYS) {
    const tasks = activities[day];
    if (!tasks?.length) continue;
    let dayChanged = false;
    const next = tasks.map((t) => {
      const hasLiveState = !!t.completed || !!t.missed || (t.completedSubtaskIds?.length ?? 0) > 0;
      if (!hasLiveState) return t;
      const activeToday =
        (t.completedAt && localISODate(new Date(t.completedAt)) === todayISO) ||
        (t.missedAt && localISODate(new Date(t.missedAt)) === todayISO) ||
        (t.completionHistory ?? []).some((e) => localISODate(new Date(e.completedAt)) === todayISO);
      if (activeToday) return t;
      dayChanged = true;
      return { ...t, completed: false, completedAt: undefined, completedSubtaskIds: [], missed: false, missedAt: undefined };
    });
    if (dayChanged) {
      activities[day] = next;
      changed = true;
    }
  }
  return changed ? { ...schedule, activities } : schedule;
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
    return resetStaleCompletions(migrate(raw), localISODate(new Date()));
  } catch (err) {
    logError("indexeddb:migrate", err);
    return null;
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
              const migrated = resetStaleCompletions(migrate(guestData), localISODate(new Date()));
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
      // Hydrating from cloud: tag the identity and skip the echo-write so the
      // write effect doesn't overwrite the cloud `lastUpdated` with a fresh now.
      loadedKeyRef.current = activeStorageKey;
      skipNextWriteRef.current = true;
      setScheduleState(migrated);
      setIsFirstLaunch(false);
      if (dbRef.current) {
        writeDB(dbRef.current, activeStorageKey, migrated).catch(logWriteError);
      }
      writeLocalLastUpdated(lastUpdated, storageUid);
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

  // Stable identity (setScheduleState is stable) so downstream effects and
  // useCallback hooks that depend on it don't re-run/recreate every render.
  const setSchedule = useCallback((updater: (prev: Schedule) => Schedule) => {
    setScheduleState(updater);
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
          const { completed: _c, completedAt: _a, completedSubtaskIds: _s, completionHistory: _h, missed: _m, missedAt: _ma, ...rest } = t;
          void _c; void _a; void _s; void _h; void _m; void _ma;
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

  return { schedule, setSchedule, ready, clearData, clearProgress, isFirstLaunch };
}
