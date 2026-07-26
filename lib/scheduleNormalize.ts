/**
 * Pure schedule normalization — no React, no IndexedDB, no auth.
 *
 * Split out of `useScheduleDB.ts` (a client hook module that pulls in React and
 * AuthProvider) so this logic can be unit-tested directly. `useScheduleDB`
 * re-exports everything here, so existing import sites are unchanged.
 *
 * Type-only imports from `./useScheduleDB` are erased at compile time, so there
 * is no runtime cycle — the same pattern `roadmapDates.ts` already uses.
 */

import type { Schedule, Task } from "./useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { colorFromIcon, resolveAccentColor } from "./colorSystem";
import { DAYS } from "./scheduleConstants";
import { localISODate } from "./dateUtils";

/**
 * Every optional `Task` field that `normalizeTasks` must carry through, paired
 * with the guard that decides whether it survives. This list is the single
 * source of truth for the allowlist below — adding a field here (and to `Task`)
 * is all that's needed to persist it.
 *
 * Historically the allowlist was inlined and easy to forget: `slots` was added
 * to `Task` but not here, so every multi-slot task silently lost all but its
 * first phase on the next reload. `tests/core-logic.test.mjs` now asserts this
 * list covers every optional key on `Task`.
 */
const OPTIONAL_TASK_FIELDS = [
  "description",
  "slots",
  "taskType",
  "completed",
  "completedAt",
  "completedSubtaskIds",
  "completedSlotIndices",
  "missed",
  "missedAt",
  "completionHistory",
  "streakEnabled",
  "sortOrder",
  "subtasks",
  "exceptions",
  "recurrence",
] as const;

/** Exposed for the round-trip test that guards against silent field loss. */
export const NORMALIZED_OPTIONAL_TASK_FIELDS: readonly string[] = OPTIONAL_TASK_FIELDS;

function isPlainObject(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Per-field survival rules. Anything not listed simply must be `!== undefined`. */
function keepField(key: (typeof OPTIONAL_TASK_FIELDS)[number], value: unknown): boolean {
  switch (key) {
    case "slots":
      return Array.isArray(value) && value.length > 0;
    case "completedSlotIndices":
    case "subtasks":
      return Array.isArray(value);
    case "exceptions":
    case "recurrence":
      return isPlainObject(value);
    default:
      return value !== undefined;
  }
}

export function splitLegacyTimeRange(value: string): { startTime: string; endTime: string } {
  const raw = value.trim();
  const parts = raw.split(/\s*(?:-|–|—|to)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { startTime: parts[0], endTime: parts[1] };
  }
  return { startTime: raw, endTime: raw };
}

export function entryToTask(entry: ScheduleEntry, icon: string, planId: string, description?: string): Task {
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

export function normalizeTasks(value: unknown, fallbackPlanId: string, fallbackIcon = "briefcase", fallbackDescription?: string): Task[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    if ("startTime" in item && "endTime" in item && "title" in item && "icon" in item) {
      const task = item as Task & Record<string, unknown>;
      const rawType: string | undefined = task.taskType;
      const taskType: Task["taskType"] =
        rawType === "session" || rawType === "routine" ? "session" :
        rawType === "task" || rawType === "normal" ? "task" :
        undefined;

      // Required identity/time fields first, then every optional field that
      // passes its guard — driven by OPTIONAL_TASK_FIELDS so a newly added
      // `Task` field can't be silently dropped.
      const normalized: Task = {
        id: task.id,
        title: task.title,
        startTime: task.startTime,
        endTime: task.endTime,
        icon: task.icon || fallbackIcon,
        color: resolveAccentColor((task as Task & { color?: string }).color, task.icon || fallbackIcon),
        planId: task.planId || fallbackPlanId,
      };

      for (const key of OPTIONAL_TASK_FIELDS) {
        // taskType is coerced above (legacy "routine"/"normal" values), so it
        // uses the derived value rather than the raw one.
        const raw = key === "taskType" ? taskType : task[key];
        if (keepField(key, raw)) {
          (normalized as unknown as Record<string, unknown>)[key] = raw;
        }
      }

      return [normalized];
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
      const hasLiveState = !!t.completed || !!t.missed || (t.completedSubtaskIds?.length ?? 0) > 0 || (t.completedSlotIndices?.length ?? 0) > 0;
      if (!hasLiveState) return t;
      const activeToday =
        (t.completedAt && localISODate(new Date(t.completedAt)) === todayISO) ||
        (t.missedAt && localISODate(new Date(t.missedAt)) === todayISO) ||
        (t.completionHistory ?? []).some((e) => localISODate(new Date(e.completedAt)) === todayISO);
      if (activeToday) return t;
      dayChanged = true;
      return { ...t, completed: false, completedAt: undefined, completedSubtaskIds: [], completedSlotIndices: [], missed: false, missedAt: undefined };
    });
    if (dayChanged) {
      activities[day] = next;
      changed = true;
    }
  }
  return changed ? { ...schedule, activities } : schedule;
}
