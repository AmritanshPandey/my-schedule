/**
 * Pure schedule mutation helpers.
 *
 * Every function returns a `(prev: Schedule) => Schedule` updater so callers
 * can pass it directly to setSchedule(). No component logic lives here.
 */

import { DAYS, type Schedule, type Task, type DayKey } from "./useScheduleDB";
import { parseTimeToMinutes } from "./timeUtils";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { colorFromIcon } from "./colorSystem";

// ── Id generator ─────────────────────────────────────────────────────────────

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Time format converters — re-exported from timeUtils for convenience ───────

export { displayToInputTime, inputToDisplayTime } from "./timeUtils";

// ── Task mutations ────────────────────────────────────────────────────────────

interface PlanItemsUpdate {
  planId: string;
  items: ScheduleEntry[];
}

/**
 * Adds a new task to the given days and optionally updates the parent plan's
 * items (subtasks). Generates a single ID shared across all repeat-day copies
 * so they can be recognised as the same recurring task.
 */
export function createTask(
  draft: Omit<Task, "id">,
  targetDays: DayKey[],
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  const id = uid();
  const days = Array.from(new Set(targetDays.length > 0 ? targetDays : ["monday" as DayKey]));
  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = days.reduce(
      (acc, day) => ({
        ...acc,
        [day]: [...acc[day], { ...draft, id }],
      }),
      { ...prev.activities }
    );
    return { ...prev, plans, activities };
  };
}

/**
 * Updates an existing task on a single day and optionally updates the parent
 * plan's items. Preserves all completion history fields that aren't explicitly
 * overwritten.
 */
export function updateTask(
  taskId: string,
  day: DayKey,
  updates: Partial<Omit<Task, "id">>,
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = {
      ...prev.activities,
      [day]: prev.activities[day].map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    };
    return { ...prev, plans, activities };
  };
}

/**
 * Updates a task's editable fields and the days it is visible on. Existing
 * per-day completion state is preserved because only the supplied editable
 * fields are merged into existing copies.
 */
export function updateTaskDays(
  taskId: string,
  updates: Omit<Task, "id">,
  targetDays: DayKey[],
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  const days = new Set(targetDays.length > 0 ? targetDays : ["monday" as DayKey]);

  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = Object.fromEntries(
      DAYS.map((day) => {
        const existingTasks = prev.activities[day];
        const hasTask = existingTasks.some((t) => t.id === taskId);

        if (!days.has(day)) {
          return [day, existingTasks.filter((t) => t.id !== taskId)];
        }

        const updatedTasks = hasTask
          ? existingTasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t))
          : [...existingTasks, { ...updates, id: taskId }];

        return [day, updatedTasks];
      })
    ) as Schedule["activities"];

    return { ...prev, plans, activities };
  };
}

/** Removes a task from a single day. */
export function deleteTask(
  taskId: string,
  day: DayKey
): (prev: Schedule) => Schedule {
  return (prev) => ({
    ...prev,
    activities: {
      ...prev.activities,
      [day]: prev.activities[day].filter((t) => t.id !== taskId),
    },
  });
}

// ── Subtask factory ───────────────────────────────────────────────────────────

export function createSubtask(title: string, duration?: string): ScheduleEntry {
  return {
    id: uid(),
    task: title.trim(),
    duration: duration?.trim() || undefined,
  };
}

// ── Plan icon → color helper (re-exported for TaskSheet) ─────────────────────

export { colorFromIcon };

// ── Task sort ─────────────────────────────────────────────────────────────────

export function sortTasksByTime(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const lm = parseTimeToMinutes(left.startTime);
    const rm = parseTimeToMinutes(right.startTime);
    if (lm === null && rm === null) {
      const lso = left.sortOrder ?? Infinity;
      const rso = right.sortOrder ?? Infinity;
      return lso !== rso ? lso - rso : left.title.localeCompare(right.title);
    }
    if (lm === null) return 1;
    if (rm === null) return -1;
    if (lm !== rm) return lm - rm;
    const le = parseTimeToMinutes(left.endTime) ?? lm;
    const re = parseTimeToMinutes(right.endTime) ?? rm;
    if (le !== re) return le - re;
    const lso = left.sortOrder ?? Infinity;
    const rso = right.sortOrder ?? Infinity;
    return lso !== rso ? lso - rso : left.title.localeCompare(right.title);
  });
}
