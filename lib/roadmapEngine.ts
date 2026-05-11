/**
 * Roadmap computation engine.
 * Pure functions — no React, no side-effects.
 */

import type { Task, Milestone, Plan } from "./useScheduleDB";
import { DAYS } from "./useScheduleDB";
import type { DayKey } from "./useScheduleDB";
import { localISODate } from "./dateUtils";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isoDate(d: Date): string {
  return localISODate(d);
}

export function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

// ── Exported types ────────────────────────────────────────────────────────────

export interface DayCell {
  date: string;            // "YYYY-MM-DD"
  intensity: 0 | 1 | 2 | 3;
  count: number;
  isFuture: boolean;
  isOutsidePlan: boolean;  // padding cells before/after plan date range
}

export interface StatusSegment {
  date: string;
  state: "success" | "warning" | "fail" | "future" | "none";
}

export interface RoadmapStats {
  overallPct: number;
  consistencyPct: number;
  streakDays: number;
  statusSummary: string;
  dailyCells: DayCell[];            // full plan period, padded to week boundaries
  statusBarSegments: StatusSegment[];
  currentPhaseName: string | null;
  completedMilestones: number;
  totalMilestones: number;
  targetDate: string | null;
}

// Day-of-week mapping: JS getDay() → DayKey
const JS_TO_DAYKEY: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
void JS_TO_DAYKEY; // used by reference elsewhere if needed

/**
 * Build a map of date → completion event count for a given planId,
 * scanning completionHistory events on all tasks.
 */
function buildCompletionMap(
  planId: string,
  activities: Record<string, Task[]>
): Map<string, number> {
  const map = new Map<string, number>();

  const increment = (dateStr: string) => {
    map.set(dateStr, (map.get(dateStr) ?? 0) + 1);
  };

  for (const day of DAYS) {
    const tasks: Task[] = activities[day] ?? [];
    for (const task of tasks) {
      if (task.planId !== planId) continue;

      if (Array.isArray(task.completionHistory)) {
        for (const event of task.completionHistory) {
          if (event.completionType === "task") {
            increment(localISODate(new Date(event.completedAt)));
          }
        }
      } else if (task.completedAt && task.completed) {
        increment(localISODate(new Date(task.completedAt)));
      }
    }
  }

  return map;
}

/**
 * Build per-day cells covering the plan's full date range.
 *
 * The grid is padded to complete week boundaries (weeks start on Sunday).
 * Cells outside the plan date range are marked isOutsidePlan=true so the
 * heatmap can render them as invisible spacers.
 *
 * Max cap: if plan is longer than 2 years, only show the last 2 years so
 * the grid stays usable.
 */
function buildPlanDailyCells(
  planStart: string | null,
  planEnd: string | null,
  completionMap: Map<string, number>,
  today: Date
): DayCell[] {
  const todayStr = isoDate(today);

  // ── Ongoing plans: rolling loop ───────────────────────────────────────────
  // No end date → treat the entire 1-year look-back window as "inside the plan".
  // Every cell is active (isOutsidePlan=false). Activity shows as grey if none,
  // coloured if present — exactly like a GitHub contribution graph.
  if (!planEnd) {
    const displayStart = addDays(today, -364); // 52 full weeks back
    const displayEnd   = today;

    const gridStart = new Date(displayStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(displayEnd);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

    const cells: DayCell[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const dateStr  = isoDate(cursor);
      const isFuture = dateStr > todayStr;
      const count    = completionMap.get(dateStr) ?? 0;
      let intensity: 0 | 1 | 2 | 3 = 0;
      if (!isFuture) {
        if (count === 1) intensity = 1;
        else if (count <= 3) intensity = 2;
        else if (count > 3) intensity = 3;
      }
      cells.push({ date: dateStr, intensity, count, isFuture, isOutsidePlan: false });
      cursor.setDate(cursor.getDate() + 1);
    }
    return cells;
  }

  // ── Fixed-duration plans: planStart → planEnd ─────────────────────────────
  const planActiveStart = planStart
    ? new Date(planStart + "T00:00:00")
    : addDays(today, -90);

  let planActiveEnd = new Date(planEnd + "T00:00:00");
  const futureCap = addDays(today, 180);
  if (planActiveEnd > futureCap) planActiveEnd = futureCap;
  if (planActiveEnd < planActiveStart) planActiveEnd = today;

  const planStartStr = isoDate(planActiveStart);
  const planEndStr   = isoDate(planActiveEnd);

  // Cap to the most recent 2 years ending at planEnd for very long plans
  let displayStart = new Date(planActiveStart);
  const twoYearsBeforeEnd = addDays(planActiveEnd, -730);
  if (displayStart < twoYearsBeforeEnd) displayStart = twoYearsBeforeEnd;

  // ── Pad to full week boundaries (Sunday = day 0) ──────────────────────────
  const gridStart = new Date(displayStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday

  const gridEnd = new Date(planActiveEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay())); // forward to Saturday

  // ── Build cells ───────────────────────────────────────────────────────────
  const cells: DayCell[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const dateStr = isoDate(cursor);
    const isOutsidePlan = dateStr < planStartStr || dateStr > planEndStr;
    const isFuture = dateStr > todayStr;
    const count = completionMap.get(dateStr) ?? 0;

    let intensity: 0 | 1 | 2 | 3 = 0;
    if (!isFuture && !isOutsidePlan) {
      if (count === 1) intensity = 1;
      else if (count <= 3) intensity = 2;
      else if (count > 3) intensity = 3;
    }

    cells.push({ date: dateStr, intensity, count, isFuture, isOutsidePlan });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
}

// ── Main exported function ────────────────────────────────────────────────────

export function computeRoadmapStats(
  planId: string,
  activities: Record<string, Task[]>,
  milestones: Milestone[],
  plan: Plan
): RoadmapStats {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = isoDate(today);

  const completionMap = buildCompletionMap(planId, activities);

  const planMilestones = milestones
    .filter((m) => m.planId === planId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const roadmapEnd = planMilestones[planMilestones.length - 1]?.plannedEndDate ?? plan.endDate ?? null;
  const planStart = plan.startDate ?? null;
  const planEnd = roadmapEnd;

  // ── Daily cells spanning the plan period ──────────────────────────────────
  const dailyCells = buildPlanDailyCells(planStart, planEnd, completionMap, today);

  // ── Status bar segments (plan period, up to 90 segments) ─────────────────
  // Use the same logical range but cap to 90 most-recent days for the bar
  const barStart = planStart
    ? new Date(Math.max(new Date(planStart + "T00:00:00").getTime(), addDays(today, -89).getTime()))
    : addDays(today, -59);
  const barEnd = today;

  const statusBarSegments: StatusSegment[] = [];
  const barCursor = new Date(barStart);
  while (barCursor <= barEnd) {
    const dateStr = isoDate(barCursor);
    const count = completionMap.get(dateStr) ?? 0;
    const isFuture = dateStr > todayStr;
    const inPlanRange =
      (!planStart || dateStr >= planStart) && (!planEnd || dateStr <= planEnd);

    let state: StatusSegment["state"];
    if (isFuture) {
      state = "future";
    } else if (count >= 2) {
      state = "success";
    } else if (count === 1) {
      state = "warning";
    } else if (inPlanRange) {
      state = "fail";
    } else {
      state = "none";
    }

    statusBarSegments.push({ date: dateStr, state });
    barCursor.setDate(barCursor.getDate() + 1);
  }

  // ── Consistency % (only days within plan range, not future) ──────────────
  const planCells = dailyCells.filter((c) => !c.isOutsidePlan && !c.isFuture);
  const activeDays = planCells.filter((c) => c.count > 0).length;
  const consistencyPct =
    planCells.length > 0
      ? Math.round((activeDays / planCells.length) * 100)
      : 0;

  // ── Streak (consecutive days from today going backwards) ─────────────────
  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const dateStr = isoDate(addDays(today, -i));
    if ((completionMap.get(dateStr) ?? 0) > 0) {
      streakDays++;
    } else {
      break;
    }
  }

  const completedMilestones = planMilestones.filter(
    (m) => m.status === "completed" || m.completionStatus === "completed"
  ).length;
  const totalMilestones = planMilestones.length;
  const firstPending = planMilestones.find((m) => m.status !== "completed" && m.completionStatus !== "completed");
  const currentPhaseName = firstPending?.title ?? null;

  // ── Overall % ────────────────────────────────────────────────────────────
  let overallPct: number;
  if (totalMilestones > 0) {
    const milestonePct = Math.round((completedMilestones / totalMilestones) * 100);
    overallPct = Math.round(milestonePct * 0.6 + consistencyPct * 0.4);
  } else {
    overallPct = consistencyPct;
  }

  // ── Status summary ───────────────────────────────────────────────────────
  let statusSummary: string;
  if (consistencyPct >= 80) {
    statusSummary = `On track with ${consistencyPct}% accuracy`;
  } else if (consistencyPct > 0) {
    statusSummary = `Building momentum · ${consistencyPct}% consistency`;
  } else {
    statusSummary = "Start completing tasks to build your streak";
  }

  return {
    overallPct,
    consistencyPct,
    streakDays,
    statusSummary,
    dailyCells,
    statusBarSegments,
    currentPhaseName,
    completedMilestones,
    totalMilestones,
    targetDate: roadmapEnd,
  };
}
