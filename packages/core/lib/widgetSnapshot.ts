/**
 * What the iOS home-screen and Lock Screen widget shows, worked out here and
 * handed to the widget as JSON (docs/superpowers/specs/2026-11-08-ios-widget-design.md).
 *
 * The widget runs in its own process and can't run this code, so it only
 * draws: every rule lives here, and it is the Overview's own rule. The first
 * item is selectNextUp's task, the counts are its counts, so the widget and
 * the app can never disagree about what's next.
 *
 * Today and tomorrow are both included, so the widget turns the day at
 * midnight without the app being opened. Times are plain minutes after
 * midnight; the widget decides "Now · ends 7:45" against its own clock.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { DayKey, Plan, Schedule, Task } from "./scheduleTypes";
import { addDaysToISO } from "./dateUtils";
import { parseTimeToMinutes } from "./timeUtils";
import { getSlots } from "./taskMutations";
import { getTaskSubtaskSummary, isTaskResolved } from "./taskCompletion";
import { selectTodayTasks } from "./todayTasks";
import { calculateExecutionStreak } from "./consistency/calculateExecutionStreak";

export const WIDGET_SNAPSHOT_VERSION = 1;

/** Next up plus the ones after it: all a medium widget has room for. */
export const WIDGET_MAX_ITEMS = 4;

export interface WidgetItem {
  id: string;
  /** The date this occurrence is on, for the deep link. */
  dateISO: string;
  title: string;
  planTitle?: string;
  /** Minutes after midnight of the open slot; absent for an anytime task. */
  startMinutes?: number;
  endMinutes?: number;
  /** The category's accent token ("emerald"), when the task has one. */
  accent?: string;
}

export interface WidgetDay {
  dateISO: string;
  state: "task" | "day-done" | "empty";
  done: number;
  total: number;
  /** Open tasks in Today's order; the first is Next up. */
  items: WidgetItem[];
}

export interface WidgetSnapshot {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  generatedAt: string;
  /** Consecutive active days up to today, as the Overview shows it. */
  streak: number;
  /** Today, then tomorrow. */
  days: WidgetDay[];
}

const JS_DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayKeyForISO(iso: string): DayKey {
  return JS_DAY_KEYS[new Date(`${iso}T00:00:00`).getDay()];
}

/** The slot still open: a multi-slot task's first uncompleted one. */
function openSlot(task: Task): { startTime: string; endTime: string } {
  const slots = getSlots(task);
  if (slots.length <= 1) return { startTime: task.startTime, endTime: task.endTime };
  const completed = new Set(task.completedSlotIndices ?? []);
  return slots.find((_, i) => !completed.has(i)) ?? slots[0];
}

function toItem(task: Task, plan: Plan | null, dateISO: string, schedule: Schedule): WidgetItem {
  const slot = openSlot(task);
  const start = parseTimeToMinutes(slot.startTime);
  const end = parseTimeToMinutes(slot.endTime);
  const category = task.categoryId ? schedule.categories.find((c) => c.id === task.categoryId) : undefined;
  return {
    id: task.id,
    dateISO,
    title: task.title,
    ...(plan ? { planTitle: plan.title } : {}),
    ...(start !== null ? { startMinutes: start } : {}),
    ...(start !== null && end !== null ? { endMinutes: end } : {}),
    ...(category ? { accent: category.color } : {}),
  };
}

export function selectWidgetDay(schedule: Schedule, dateISO: string): WidgetDay {
  const { tasks, done, total } = selectTodayTasks(schedule, dateISO, dayKeyForISO(dateISO));
  if (total === 0) return { dateISO, state: "empty", done: 0, total: 0, items: [] };

  const plansById = new Map(schedule.plans.map((plan) => [plan.id, plan]));
  const planFor = (task: Task) => (task.planId ? plansById.get(task.planId) ?? null : null);
  // Missed counts as resolved: it belongs to Needs attention, not to "next".
  const open = tasks.filter((task) => !isTaskResolved(task, getTaskSubtaskSummary(task, planFor(task)).totalCount));
  if (open.length === 0) return { dateISO, state: "day-done", done, total, items: [] };

  return {
    dateISO,
    state: "task",
    done,
    total,
    items: open.slice(0, WIDGET_MAX_ITEMS).map((task) => toItem(task, planFor(task), dateISO, schedule)),
  };
}

export function selectWidgetSnapshot(schedule: Schedule, todayISO: string, now: Date = new Date()): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    streak: calculateExecutionStreak(schedule, todayISO).streak,
    days: [selectWidgetDay(schedule, todayISO), selectWidgetDay(schedule, addDaysToISO(todayISO, 1))],
  };
}
