/**
 * "Your day" on the Overview: today's timed blocks laid on one horizontal bar,
 * plus a short legend of where the time goes. Pure — no React.
 *
 * Blocks are drawn in clock order and colored by category (falling back to
 * the plan's accent), the same colors the timeline and the day-breakdown
 * donut use. The legend is the day breakdown's own slices, so its minutes
 * agree with the donut on desktop.
 */
import type { DayKey, Schedule, Task } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { addDaysToISO } from "./dateUtils";
import { buildDayBreakdown, taskIntervals } from "./dayBreakdown";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { isPlanRunning } from "./planLifecycle";
import { categoriesById, taskIdentity } from "./taskIdentity";
import { categoryHex, resolveAccentColor } from "./colorSystem";
import { DEFAULT_TIMELINE_START_MINUTES } from "./timeline/displayWindow";
import { sessionsForDate } from "./sessions";
import { parseTimeToMinutes } from "./timeUtils";

export interface DayBlock {
  id: string;
  title: string;
  /** Minutes since midnight; may run past 24h for a block after midnight. */
  start: number;
  end: number;
  /** Hex, or null for neutral (uncategorised held time). */
  color: string | null;
}

export interface DayLegendRow {
  id: string;
  label: string;
  color: string | null;
  minutes: number;
}

export interface DayShape {
  blocks: DayBlock[];
  legend: DayLegendRow[];
  /** The bar's span, whole hours, minutes since midnight. */
  windowStart: number;
  windowEnd: number;
  plannedMinutes: number;
  /** The shown window minus what's planned in it. */
  freeMinutes: number;
}

/** 6 AM to 10 PM unless the day's blocks reach further. */
const DEFAULT_WINDOW = { start: 6 * 60, end: 22 * 60 };

export function selectDayShape(schedule: Schedule, todayISO: string, todayKey: DayKey): DayShape {
  const trackingStart = schedule.preferences?.startDate;
  const plansById = new Map(schedule.plans.map((plan) => [plan.id, plan]));
  const categories = categoriesById(schedule.categories ?? []);
  const dayStart = DEFAULT_TIMELINE_START_MINUTES;

  const tasks: Task[] = (schedule.activities[todayKey] ?? [])
    .filter((task) =>
      isTaskScheduledOn(task, todayISO, true, trackingStart)
      && isPlanRunning(task.planId ? plansById.get(task.planId) : undefined))
    .map((task) => resolveOccurrence(task, todayISO));

  const blocks: DayBlock[] = [];
  for (const task of tasks) {
    const { category } = taskIdentity(task, categories);
    // Sleep frames the day rather than filling it: left off the bar (it would
    // stretch the window to the next morning) and off the legend.
    if (category?.kind === "sleep") continue;
    const plan = task.planId ? plansById.get(task.planId) : undefined;
    const color = category?.color
      ? categoryHex(category.color)
      : plan
        ? categoryHex(resolveAccentColor(plan.color, plan.emoji))
        : null;
    taskIntervals(task, "sameDay", dayStart).forEach((interval, index) => {
      blocks.push({ id: `${task.id}:${index}`, title: task.title, start: interval.start, end: interval.end, color });
    });
  }
  // Timed runs take their estimated length from their start, coloured by their plan.
  const runLegend = new Map<string, DayLegendRow>();
  for (const session of sessionsForDate(schedule, todayISO)) {
    if (session.status === "skipped" || !session.startTime || !session.estimatedMinutes) continue;
    const start = parseTimeToMinutes(session.startTime);
    const plan = plansById.get(session.planId);
    if (start == null || !plan) continue;
    const color = categoryHex(resolveAccentColor(plan.color, plan.emoji));
    blocks.push({ id: `session:${session.id}`, title: session.title, start, end: start + session.estimatedMinutes, color });
    const id = `plan:${plan.id}`;
    const row = runLegend.get(id) ?? { id, label: plan.title, color, minutes: 0 };
    runLegend.set(id, { ...row, minutes: row.minutes + session.estimatedMinutes });
  }
  blocks.sort((a, b) => a.start - b.start || a.end - b.end);

  const prevKey = DAYS[(DAYS.indexOf(todayKey) + 6) % 7] as DayKey;
  const breakdown = buildDayBreakdown(
    schedule.activities[todayKey] ?? [],
    schedule.categories ?? [],
    todayISO,
    { tasks: schedule.activities[prevKey] ?? [], dateISO: addDaysToISO(todayISO, -1) },
    trackingStart,
    dayStart,
  );
  const legend = breakdown.slices
    .filter((slice) => slice.kind !== "unscheduled" && slice.kind !== "sleep" && slice.minutes > 0)
    .map((slice) => ({ id: slice.id, label: slice.label, color: slice.color ? categoryHex(slice.color) : null, minutes: slice.minutes }))
    .concat([...runLegend.values()])
    .sort((a, b) => b.minutes - a.minutes);

  const first = blocks.length ? Math.min(...blocks.map((b) => b.start)) : DEFAULT_WINDOW.start;
  const last = blocks.length ? Math.max(...blocks.map((b) => b.end)) : DEFAULT_WINDOW.end;
  const windowStart = Math.min(DEFAULT_WINDOW.start, Math.floor(first / 60) * 60);
  const windowEnd = Math.max(DEFAULT_WINDOW.end, Math.ceil(last / 60) * 60);

  // Planned time inside the window, with overlaps counted once.
  let planned = 0;
  let cursor = windowStart;
  for (const block of blocks) {
    const start = Math.max(block.start, cursor, windowStart);
    const end = Math.min(block.end, windowEnd);
    if (end > start) {
      planned += end - start;
      cursor = end;
    }
  }

  return {
    blocks,
    legend,
    windowStart,
    windowEnd,
    plannedMinutes: planned,
    freeMinutes: Math.max(0, windowEnd - windowStart - planned),
  };
}
