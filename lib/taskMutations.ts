/**
 * Pure schedule mutation helpers.
 *
 * Every function returns a `(prev: Schedule) => Schedule` updater so callers
 * can pass it directly to setSchedule(). No component logic lives here.
 */

import type { Schedule, Task } from "./useScheduleDB";
import { DAYS, type DayKey } from "./scheduleConstants";
import { uid } from "./id";
import { localISODate } from "./dateUtils";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { colorFromIcon } from "./colorSystem";

export { uid } from "./id";

// ── Time format converters — re-exported from timeUtils for convenience ───────

export { displayToInputTime, inputToDisplayTime } from "./timeUtils";

// ── Task mutations ────────────────────────────────────────────────────────────

interface PlanItemsUpdate {
  planId: string;
  items: ScheduleEntry[];
}

export type TaskDeleteScope = "day" | "all";

export interface TaskDeleteSnapshot {
  taskId: string;
  scope: TaskDeleteScope;
  sourceDay: DayKey;
  affectedDays: Array<{
    day: DayKey;
    entries: Array<{ index: number; task: Task }>;
  }>;
  milestoneLinks: Array<{ milestoneId: string; linkedActivities: string[] }>;
}

function reconcileEditedTask(existing: Task, updates: Omit<Task, "id">): Task {
  const merged = { ...existing, ...updates };
  if (updates.taskType === "session") return merged;

  const nextSubtaskIds = new Set(updates.subtasks?.map((subtask) => subtask.id) ?? []);
  const completedSubtaskIds = Array.from(
    new Set(existing.completedSubtaskIds ?? [])
  ).filter((id) => nextSubtaskIds.has(id));
  const wasCompleted = existing.completed ?? (
    nextSubtaskIds.size > 0 && completedSubtaskIds.length === nextSubtaskIds.size
  );
  const staysCompleted =
    nextSubtaskIds.size === 0
      ? wasCompleted && (existing.subtasks?.length ?? 0) === 0
      : wasCompleted && completedSubtaskIds.length === nextSubtaskIds.size;
  const today = localISODate(new Date());
  const completionHistory = (existing.completionHistory ?? []).filter((event) => {
    if (localISODate(new Date(event.completedAt)) !== today) return true;
    if (event.completionType === "subtask") {
      return !!event.subtaskId && nextSubtaskIds.has(event.subtaskId);
    }
    if (event.completionType === "missed" && event.subtaskId) {
      return nextSubtaskIds.has(event.subtaskId);
    }
    if (event.completionType === "task") return staysCompleted;
    return true;
  });

  return {
    ...merged,
    completed: staysCompleted,
    completedAt: staysCompleted ? existing.completedAt : undefined,
    completedSubtaskIds,
    completionHistory,
  };
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
          ? existingTasks.map((t) => (t.id === taskId ? reconcileEditedTask(t, updates) : t))
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

export function getTaskActiveDays(schedule: Schedule, taskId: string): DayKey[] {
  return DAYS.filter((day) => schedule.activities[day].some((task) => task.id === taskId));
}

export function createTaskDeleteSnapshot(
  schedule: Schedule,
  taskId: string,
  sourceDay: DayKey,
  scope: TaskDeleteScope
): TaskDeleteSnapshot {
  const activeDays = getTaskActiveDays(schedule, taskId);
  const daysToDelete =
    scope === "all"
      ? activeDays
      : activeDays.includes(sourceDay)
        ? [sourceDay]
        : [];
  const remainingDays = activeDays.filter((day) => !daysToDelete.includes(day));
  const removeMilestoneLinks = remainingDays.length === 0;

  return {
    taskId,
    scope,
    sourceDay,
    affectedDays: daysToDelete.map((day) => ({
      day,
      entries: schedule.activities[day]
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => task.id === taskId),
    })),
    milestoneLinks: removeMilestoneLinks
      ? schedule.milestones
          .filter((milestone) => milestone.linkedActivities.includes(taskId))
          .map((milestone) => ({
            milestoneId: milestone.id,
            linkedActivities: [...milestone.linkedActivities],
          }))
      : [],
  };
}

export function applyTaskDelete(snapshot: TaskDeleteSnapshot): (prev: Schedule) => Schedule {
  return (prev) => {
    const affected = new Set(snapshot.affectedDays.map(({ day }) => day));
    const linkedMilestones = new Set(snapshot.milestoneLinks.map(({ milestoneId }) => milestoneId));

    return {
      ...prev,
      activities: Object.fromEntries(
        DAYS.map((day) => [
          day,
          affected.has(day)
            ? prev.activities[day].filter((task) => task.id !== snapshot.taskId)
            : prev.activities[day],
        ])
      ) as Schedule["activities"],
      milestones: linkedMilestones.size > 0
        ? prev.milestones.map((milestone) =>
            linkedMilestones.has(milestone.id)
              ? {
                  ...milestone,
                  linkedActivities: milestone.linkedActivities.filter((id) => id !== snapshot.taskId),
                }
              : milestone
          )
        : prev.milestones,
    };
  };
}

export function restoreTaskDelete(snapshot: TaskDeleteSnapshot): (prev: Schedule) => Schedule {
  return (prev) => {
    const restoredActivities = { ...prev.activities };

    for (const { day, entries } of snapshot.affectedDays) {
      const withoutDeletedTask = restoredActivities[day].filter((task) => task.id !== snapshot.taskId);
      const restored = [...withoutDeletedTask];
      for (const { index, task } of [...entries].sort((a, b) => a.index - b.index)) {
        restored.splice(Math.min(index, restored.length), 0, task);
      }
      restoredActivities[day] = restored;
    }

    const milestoneLinks = new Map(
      snapshot.milestoneLinks.map(({ milestoneId, linkedActivities }) => [milestoneId, linkedActivities])
    );

    return {
      ...prev,
      activities: restoredActivities,
      milestones: milestoneLinks.size > 0
        ? prev.milestones.map((milestone) =>
            milestoneLinks.has(milestone.id)
              ? { ...milestone, linkedActivities: [...milestoneLinks.get(milestone.id)!] }
              : milestone
          )
        : prev.milestones,
    };
  };
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
    const lso = left.sortOrder;
    const rso = right.sortOrder;
    if (lso !== undefined || rso !== undefined) {
      const orderDiff = (lso ?? Infinity) - (rso ?? Infinity);
      if (orderDiff !== 0) return orderDiff;
    }

    const leftMinutes = parseTimeToMinutes(left.startTime);
    const rightMinutes = parseTimeToMinutes(right.startTime);
    const lm = leftMinutes === null ? null : toScheduleDayMinutes(leftMinutes);
    const rm = rightMinutes === null ? null : toScheduleDayMinutes(rightMinutes);
    if (lm === null && rm === null) {
      return left.title.localeCompare(right.title);
    }
    if (lm === null) return 1;
    if (rm === null) return -1;
    if (lm !== rm) return lm - rm;
    const parsedLeftEnd = parseTimeToMinutes(left.endTime);
    const parsedRightEnd = parseTimeToMinutes(right.endTime);
    let le = parsedLeftEnd === null ? lm : parsedLeftEnd;
    let re = parsedRightEnd === null ? rm : parsedRightEnd;
    while (le <= lm) le += 1440;
    while (re <= rm) re += 1440;
    if (le !== re) return le - re;
    return left.title.localeCompare(right.title);
  });
}
