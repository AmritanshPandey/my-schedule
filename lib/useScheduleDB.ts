"use client";

import { useEffect, useRef, useState } from "react";
import { ScheduleEntry } from "@/components/ScheduleItem";

export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export const DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export interface ActivitySection {
  id: string;
  title: string;
  iconName: string;
  items: ScheduleEntry[];
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
  items: ScheduleEntry[];
  metaFields?: string[];
  summary?: SummaryConfig[];
}

type DayActivities = Record<DayKey, ActivitySection[]>;

function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

export interface Schedule {
  plans: Plan[];
  activities: DayActivities;
}

const DB_NAME = "daily-planner";
const DB_VERSION = 4;
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

function defaultPlans(): Plan[] {
  return [
    {
      id: "diet",
      title: "Diet",
      emoji: "🥗",
      items: [],
      metaFields: ["Calories", "Protein"],
      summary: [
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-400/10 text-amber-400 border-amber-400/30" },
        { label: "Protein", metaKey: "Protein", unit: "g", colorClass: "bg-cyan-400/10 text-cyan-400 border-cyan-400/30" },
      ],
    },
    {
      id: "workout",
      title: "Workout",
      emoji: "🏋️",
      items: [],
      metaFields: ["Duration", "Calories", "Sets"],
      summary: [
        { label: "Duration", metaKey: "Duration", unit: "min", colorClass: "bg-lime-400/10 text-lime-400 border-lime-400/30" },
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-400/10 text-amber-400 border-amber-400/30" },
      ],
    },
  ];
}

/** Migrate v1/v2/v3 -> v4 (dynamic plans + dynamic day activity sections) */
function migrate(raw: unknown): Schedule {
  const empty = emptyEmpty();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;

  // Already v4
  if (isPerDay(r.activities) && Array.isArray(r.plans)) {
    return {
      plans: r.plans as Plan[],
      activities: r.activities as DayActivities,
    };
  }

  // v3 to v4 migration (diet/workout -> plans)
  if (isPerDay(r.activities) && (Array.isArray(r.diet) || Array.isArray(r.workout))) {
    const plans = defaultPlans();
    plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
    plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];
    return {
      plans,
      activities: r.activities as DayActivities,
    };
  }

  // Migrate from v2 (per-day work/personal) or v1 (flat arrays)
  const activities = emptyDayActivities();
  for (const day of DAYS) {
    const workItems: ScheduleEntry[] = isPerDay(r.work)
      ? ((r.work as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.work) ? r.work : [];
    const personalItems: ScheduleEntry[] = isPerDay(r.personal)
      ? ((r.personal as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.personal) ? r.personal : [];

    if (workItems.length > 0)
      activities[day].push({ id: `migrated-work-${day}`, title: "Work Schedule", iconName: "briefcase", items: workItems });
    if (personalItems.length > 0)
      activities[day].push({ id: `migrated-personal-${day}`, title: "Personal", iconName: "leaf", items: personalItems });
  }

  const plans = defaultPlans();
  plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
  plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];

  return {
    plans,
    activities,
  };
}

function emptyEmpty(): Schedule {
  return { plans: defaultPlans(), activities: emptyDayActivities() };
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
