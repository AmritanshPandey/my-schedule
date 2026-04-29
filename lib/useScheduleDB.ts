"use client";

import { useEffect, useRef, useState } from "react";
import { ScheduleEntry } from "@/components/ScheduleItem";
import type { AccentColor } from "@/lib/colorSystem";
import { colorFromIcon, resolveAccentColor } from "@/lib/colorSystem";

export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

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

export interface Task {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  icon: string;
  color: AccentColor;
  planId?: string;
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
  emoji: string;
  color: AccentColor;
  items: ScheduleEntry[];
  metaFields?: string[];
  summary?: SummaryConfig[];
  goals?: Goal[];
  metric?: { name: string; unit: string };
}

export interface MetricEntry {
  id: string;
  planId: string;
  value: number;
  date: string; // ISO "YYYY-MM-DD"
}

type DayActivities = Record<DayKey, Task[]>;

function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

export interface Schedule {
  plans: Plan[];
  activities: DayActivities;
  metricEntries: MetricEntry[];
}

const DB_NAME = "daily-planner";
const DB_VERSION = 8;
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

function entryToTask(entry: ScheduleEntry, icon: string, description?: string): Task {
  const { startTime, endTime } = splitLegacyTimeRange(entry.time ?? "");
  return {
    id: entry.id,
    title: entry.task,
    description,
    startTime,
    endTime,
    icon,
    color: colorFromIcon(icon),
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
    emoji: p.emoji,
    color: resolveAccentColor((p as Plan & { color?: string }).color, p.emoji),
    items: Array.isArray(p.items) ? p.items : [],
    metaFields: Array.isArray(p.metaFields) ? p.metaFields : [],
    summary: Array.isArray(p.summary) ? p.summary : [],
    goals: Array.isArray(p.goals) ? p.goals : [],
    metric,
  };
}

function normalizeMetricEntry(value: unknown): MetricEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as MetricEntry;
  if (!e.id || !e.planId || typeof e.value !== "number" || !e.date) return null;
  return { id: e.id, planId: e.planId, value: e.value, date: e.date };
}

function normalizeTasks(value: unknown, fallbackIcon = "briefcase", fallbackDescription?: string): Task[] {
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
        planId: task.planId,
      }];
    }

    if ("items" in item && Array.isArray((item as { items: unknown[] }).items)) {
      const section = item as { title?: string; iconName?: string; items: ScheduleEntry[] };
      return section.items.map((entry) => entryToTask(entry, section.iconName ?? fallbackIcon, section.title));
    }

    if ("time" in item && "task" in item) {
      return [entryToTask(item as ScheduleEntry, fallbackIcon, fallbackDescription)];
    }

    return [];
  });
}

function defaultPlans(): Plan[] {
  return [
    {
      id: "diet",
      title: "Diet",
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

  const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
    ? (r.metricEntries as unknown[]).map(normalizeMetricEntry).filter((e): e is MetricEntry => e !== null)
    : [];

  // Already current shape or existing activities that still need per-day normalization.
  if (isPerDay(r.activities) && Array.isArray(r.plans)) {
    const normalizedPlans = (r.plans as unknown[])
      .map((plan) => normalizePlan(plan))
      .filter((plan): plan is Plan => plan !== null);

    return {
      plans: normalizedPlans,
      activities: Object.fromEntries(
        DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day])])
      ) as DayActivities,
      metricEntries,
    };
  }

  // v3/v4 migration: fixed diet/workout plans plus nested day sections.
  if (isPerDay(r.activities) && (Array.isArray(r.diet) || Array.isArray(r.workout))) {
    const plans = defaultPlans();
    plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
    plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];
    return {
      plans,
      activities: Object.fromEntries(
        DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day])])
      ) as DayActivities,
      metricEntries,
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

    activities[day].push(...workItems.map((entry) => entryToTask(entry, "briefcase", "Work Schedule")));
    activities[day].push(...personalItems.map((entry) => entryToTask(entry, "star", "Personal")));
  }

  const plans = defaultPlans();
  plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
  plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];

  return { plans, activities, metricEntries };
}

function emptyEmpty(): Schedule {
  return { plans: defaultPlans(), activities: emptyDayActivities(), metricEntries: [] };
}

export function useScheduleDB() {
  const [schedule, setScheduleState] = useState<Schedule>(emptyEmpty());
  const [ready, setReady] = useState(false);
  const dbRef = useRef<IDBDatabase | null>(null);

  useEffect(() => {
    openDB()
      .then(async (db) => {
        dbRef.current = db;
        const stored = await readDB(db);
        if (stored) setScheduleState(migrate(stored));
        setReady(true);
      })
      .catch((err) => {
        console.error("IndexedDB open failed:", err);
        setReady(true);
      });
  }, []);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!ready || !dbRef.current) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    writeDB(dbRef.current, schedule).catch((err) =>
      console.error("IndexedDB write failed:", err)
    );
  }, [schedule, ready]);

  function setSchedule(updater: (prev: Schedule) => Schedule) {
    setScheduleState(updater);
  }

  return { schedule, setSchedule, ready };
}
