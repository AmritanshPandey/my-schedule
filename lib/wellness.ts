/**
 * Wellness — a single, auto-created Plan that houses the built-in
 * Water/Calories/Protein/Carbs/Fat trackers, so a user can start logging
 * water or a meal without first creating a Plan themselves.
 *
 * Deliberately reuses the existing Plan/ProgressTracker/MetricEntry
 * infrastructure as-is (charts, entry lists, trend arrows, TrackerQuickBar
 * all keep working unmodified) rather than introducing a plan-independent
 * tracker concept.
 *
 * The plan/tracker ids below are fixed, not derived from a
 * `SchedulePreferences` field — `defaultPlans()` and `trackersFromPlans()`
 * (useScheduleDB.ts) already hardcode ids the same way ("diet", "workout",
 * `${planId}-tracker-${slug}`), and a fixed id needs no schema change, no
 * normalizer edit, and survives the user renaming the plan (title-matching
 * would not).
 *
 * Mirrors the shape of lib/goalMutations.ts / lib/taskMutations.ts: every
 * function takes a `Schedule` and returns a new one — no React, no
 * IndexedDB. Callers MUST invoke these inside a `setSchedule(prev => ...)`
 * updater, never against a captured `schedule` value, or React batching can
 * produce duplicate plans.
 */
import type { GoalDirection, MetricEntry, Plan, ProgressTracker, Schedule } from "./useScheduleDB";
import { uid } from "./id";

export const WELLNESS_PLAN_ID = "wellness";

export type WellnessTrackerKey = "water" | "calories" | "protein" | "carbs" | "fat";

interface WellnessTrackerDef {
  key: WellnessTrackerKey;
  id: string;
  title: string;
  unit: string;
  goalDirection: GoalDirection;
  goalValue?: number;
}

export const WELLNESS_TRACKERS: readonly WellnessTrackerDef[] = [
  { key: "water", id: `${WELLNESS_PLAN_ID}-tracker-water`, title: "Water", unit: "ml", goalDirection: "increase_good", goalValue: 2500 },
  { key: "calories", id: `${WELLNESS_PLAN_ID}-tracker-calories`, title: "Calories", unit: "kcal", goalDirection: "increase_good" },
  { key: "protein", id: `${WELLNESS_PLAN_ID}-tracker-protein`, title: "Protein", unit: "g", goalDirection: "increase_good" },
  { key: "carbs", id: `${WELLNESS_PLAN_ID}-tracker-carbs`, title: "Carbs", unit: "g", goalDirection: "increase_good" },
  { key: "fat", id: `${WELLNESS_PLAN_ID}-tracker-fat`, title: "Fat", unit: "g", goalDirection: "increase_good" },
];

/** Preset quick-log amounts by tracker unit — additive only; an unrecognized
 *  or missing unit returns `[]` so every existing tracker in every existing
 *  plan renders exactly as it does today. */
export function quickAmountsForUnit(unit?: string): number[] {
  switch ((unit ?? "").trim().toLowerCase()) {
    case "ml": return [100, 250, 500];
    case "l": return [0.25, 0.5, 1];
    case "oz": return [8, 12, 16];
    case "glass":
    case "glasses":
    case "cup":
    case "cups": return [1, 2];
    case "kcal":
    case "cal":
    case "calories": return [100, 250, 500];
    case "g": return [10, 25, 50];
    case "min": return [15, 30, 60];
    case "hr":
    case "hrs":
    case "hour":
    case "hours": return [0.5, 1, 2];
    default: return [];
  }
}

export function findWellnessPlan(schedule: Schedule): Plan | undefined {
  return schedule.plans.find((p) => p.id === WELLNESS_PLAN_ID);
}

export function wellnessTracker(schedule: Schedule, key: WellnessTrackerKey): ProgressTracker | undefined {
  const def = WELLNESS_TRACKERS.find((t) => t.key === key);
  if (!def) return undefined;
  return schedule.progressTrackers.find((t) => t.id === def.id);
}

/**
 * Idempotent, additive-only bootstrap: creates the Wellness plan if it
 * doesn't exist yet, and adds any of its 5 trackers that are missing
 * (e.g. the user deleted just one). Never touches an existing plan/tracker
 * otherwise — a rename or an edited goal value is preserved. Returns the
 * same `schedule` reference when nothing changed.
 */
export function ensureWellnessPlan(schedule: Schedule): Schedule {
  const hasPlan = schedule.plans.some((p) => p.id === WELLNESS_PLAN_ID);
  const missingTrackers = WELLNESS_TRACKERS.filter(
    (def) => !schedule.progressTrackers.some((t) => t.id === def.id),
  );

  if (hasPlan && missingTrackers.length === 0) return schedule;

  const plans = hasPlan
    ? schedule.plans
    : [
        ...schedule.plans,
        {
          id: WELLNESS_PLAN_ID,
          title: "Wellness",
          description: "Hydration and daily nutrition.",
          category: "health",
          emoji: "droplet",
          color: "sky",
          items: [],
          metaFields: WELLNESS_TRACKERS.map((t) => t.title),
        } as Plan,
      ];

  const progressTrackers = missingTrackers.length === 0
    ? schedule.progressTrackers
    : [
        ...schedule.progressTrackers,
        ...missingTrackers.map((def): ProgressTracker => ({
          id: def.id,
          planId: WELLNESS_PLAN_ID,
          title: def.title,
          type: "number",
          unit: def.unit,
          goalDirection: def.goalDirection,
          goalValue: def.goalValue,
        })),
      ];

  return { ...schedule, plans, progressTrackers };
}

export interface MealInput {
  dateISO: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

/**
 * Bootstraps the Wellness plan/trackers if needed, then appends one ordinary
 * `MetricEntry` per macro that's a finite positive number. Blank/omitted
 * fields write nothing — never a false zero row. No `MetricEntry` schema
 * change: this is just 1-4 normal appends in one call.
 */
export function logMeal(schedule: Schedule, input: MealInput): Schedule {
  const next = ensureWellnessPlan(schedule);
  const macros: Array<[WellnessTrackerKey, number | undefined]> = [
    ["calories", input.calories],
    ["protein", input.protein],
    ["carbs", input.carbs],
    ["fat", input.fat],
  ];

  const newEntries: MetricEntry[] = [];
  for (const [key, value] of macros) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const tracker = wellnessTracker(next, key);
    if (!tracker) continue;
    newEntries.push({ id: uid(), planId: WELLNESS_PLAN_ID, trackerId: tracker.id, value, date: input.dateISO });
  }

  if (newEntries.length === 0) return next;
  return { ...next, metricEntries: [...next.metricEntries, ...newEntries] };
}

/**
 * Bootstraps the Wellness plan/trackers if needed, then appends a single
 * entry for one tracker — the water quick-log path.
 */
export function logWellnessEntry(schedule: Schedule, key: WellnessTrackerKey, value: number, dateISO: string): Schedule {
  if (!Number.isFinite(value) || value <= 0) return schedule;
  const next = ensureWellnessPlan(schedule);
  const tracker = wellnessTracker(next, key);
  if (!tracker) return next;
  const entry: MetricEntry = { id: uid(), planId: WELLNESS_PLAN_ID, trackerId: tracker.id, value, date: dateISO };
  return { ...next, metricEntries: [...next.metricEntries, entry] };
}
