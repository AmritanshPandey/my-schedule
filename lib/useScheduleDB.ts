"use client";

import { useEffect, useRef, useState } from "react";
import { ScheduleEntry } from "@/components/ScheduleItem";
import type { AccentColor } from "@/lib/colorSystem";
import { colorFromIcon, resolveAccentColor } from "@/lib/colorSystem";
import type { GoalDirection } from "@/lib/trendUtils";
export type { GoalDirection };
import { queueSync } from "@/lib/cloudSync";
import { writeLocalLastUpdated } from "@/lib/localMeta";

export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type PlanCategory = "fitness" | "learning" | "work" | "health" | "routine";

export const DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};

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
  completedAt: string; // ISO 8601 timestamp
  completionType: "task" | "subtask";
  subtaskId?: string;
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
  completionHistory?: TaskCompletionEvent[]; // append-only event log
  streakEnabled?: boolean;            // opt-in to streak tracking
}

export interface SummaryConfig {
  label: string;
  metaKey: string;
  unit: string;
  colorClass?: string;
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
}

export interface ProgressTracker {
  id: string;
  planId: string;
  title: string;
  type: "number";
  unit?: string;
  goalDirection?: GoalDirection;
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
  targetDate?: string;       // ISO "YYYY-MM-DD"
  estimatedDays?: number;
  linkedTrackerId?: string;
  completionStatus: "pending" | "completed";
  completedDate?: string;    // ISO "YYYY-MM-DD"
  notes?: string;
  sortOrder: number;
}

export type Activity = Task;
export type ProgressEntry = MetricEntry;

type DayActivities = Record<DayKey, Task[]>;

function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

export interface Schedule {
  plans: Plan[];
  activities: DayActivities;
  progressTrackers: ProgressTracker[];
  metricEntries: MetricEntry[];
  milestones: Milestone[];
}

const DB_NAME = "daily-planner";
const DB_VERSION = 9;
const STORE = "schedule";
const RECORD_KEY = "data";

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

function readDB(db: IDBDatabase): Promise<Schedule | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(RECORD_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

function writeDB(db: IDBDatabase, data: Schedule): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
  const m = value as Milestone;
  if (!m.id || !m.planId || !m.title) return null;
  const status = m.completionStatus === "completed" ? "completed" : "pending";
  return {
    id: m.id,
    planId: m.planId,
    title: m.title,
    description: typeof m.description === "string" ? m.description : undefined,
    targetDate: typeof m.targetDate === "string" ? m.targetDate : undefined,
    estimatedDays: typeof m.estimatedDays === "number" ? m.estimatedDays : undefined,
    linkedTrackerId: typeof m.linkedTrackerId === "string" ? m.linkedTrackerId : undefined,
    completionStatus: status,
    completedDate: typeof m.completedDate === "string" ? m.completedDate : undefined,
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

function normalizeTasks(value: unknown, fallbackPlanId: string, fallbackIcon = "briefcase", fallbackDescription?: string): Task[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    if ("startTime" in item && "endTime" in item && "title" in item && "icon" in item) {
      const task = item as Task;
      return [{
        id: task.id,
        title: task.title,
        description: task.description,
        startTime: task.startTime,
        endTime: task.endTime,
        icon: task.icon || fallbackIcon,
        color: resolveAccentColor((task as Task & { color?: string }).color, task.icon || fallbackIcon),
        planId: task.planId || fallbackPlanId,
        // Completion state — must be preserved across page reloads
        ...(task.completed !== undefined && { completed: task.completed }),
        ...(task.completedAt !== undefined && { completedAt: task.completedAt }),
        ...(task.completedSubtaskIds !== undefined && { completedSubtaskIds: task.completedSubtaskIds }),
        ...(task.completionHistory !== undefined && { completionHistory: task.completionHistory }),
        ...(task.streakEnabled !== undefined && { streakEnabled: task.streakEnabled }),
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

  // Already current shape or existing activities that still need per-day normalization.
  if (isPerDay(r.activities) && Array.isArray(r.plans)) {
    const normalizedPlans = (r.plans as unknown[])
      .map((plan) => normalizePlan(plan))
      .filter((plan): plan is Plan => plan !== null);
    const plans = ensureActivityPlans(normalizedPlans, r.activities);
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

    return {
      plans,
      activities: Object.fromEntries(
        DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], fallbackPlanId)])
      ) as DayActivities,
      progressTrackers,
      metricEntries,
      milestones,
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

  return { plans, activities, progressTrackers, metricEntries, milestones: [] };
}

function emptyEmpty(): Schedule {
  return { plans: [], activities: emptyDayActivities(), progressTrackers: [], metricEntries: [], milestones: [] };
}

export function useScheduleDB() {
  const [schedule, setScheduleState] = useState<Schedule>(emptyEmpty());
  const [ready, setReady] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);

  // ── Load from IndexedDB on mount ──────────────────────────────────────────
  useEffect(() => {
    openDB()
      .then(async (db) => {
        dbRef.current = db;
        const stored = await readDB(db);
        if (stored) {
          setScheduleState(migrate(stored));
        } else {
          // No stored data — true first launch
          setIsFirstLaunch(true);
        }
        setReady(true);
      })
      .catch((err) => {
        console.error("IndexedDB open failed:", err);
        setReady(true);
      });
  }, []);

  // ── Cloud-merge listener ─────────────────────────────────────────────────
  // When a cloud snapshot is newer than local data, cloudSync dispatches this
  // event. We absorb the new state and persist it to IndexedDB.
  useEffect(() => {
    function handleCloudMerge(e: Event) {
      const { schedule: cloudSchedule } = (e as CustomEvent<{ schedule: Schedule; lastUpdated: number }>).detail;
      const migrated = migrate(cloudSchedule);
      setScheduleState(migrated);
      if (dbRef.current) {
        writeDB(dbRef.current, migrated).catch(() => {});
      }
    }
    window.addEventListener("cloud-sync-merge", handleCloudMerge);
    return () => window.removeEventListener("cloud-sync-merge", handleCloudMerge);
  }, []);

  // ── Debounced IndexedDB write + cloud sync trigger ────────────────────────
  const isFirstRender = useRef(true);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!ready || !dbRef.current) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    const db = dbRef.current;
    const snap = schedule; // capture for closure
    writeTimer.current = setTimeout(() => {
      const now = Date.now();
      writeDB(db, snap)
        .then(() => {
          writeLocalLastUpdated(now); // update local timestamp for cloud comparison
          queueSync(snap);            // queue cloud backup (no-op for guests)
        })
        .catch((err) => console.error("IndexedDB write failed:", err));
    }, 500);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [schedule, ready]);

  function setSchedule(updater: (prev: Schedule) => Schedule) {
    setScheduleState(updater);
  }

  async function clearData(): Promise<void> {
    const empty = emptyEmpty();
    setScheduleState(empty);
    if (dbRef.current) {
      await writeDB(dbRef.current, empty).catch(() => {});
    }
  }

  return { schedule, setSchedule, ready, clearData, isFirstLaunch };
}
