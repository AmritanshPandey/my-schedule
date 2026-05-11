import type { Milestone } from "./useScheduleDB";
import { localISODate, todayISO } from "./dateUtils";

export type DurationType = "days" | "weeks" | "months";

const DEFAULT_DURATION_DAYS = 7;

function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addDaysToISO(value: string, days: number): string {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return localISODate(date);
}

function normalizeDurationDays(value: unknown): number {
  const days = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_DURATION_DAYS;
  return Math.max(1, days);
}

export function normalizeDurationToDays(value: number, type: DurationType): number {
  const safeValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
  if (type === "weeks") return safeValue * 7;
  if (type === "months") return safeValue * 30;
  return safeValue;
}

export function calculateMilestoneEndDate(startDate: string, durationDays: number): string {
  return addDaysToISO(startDate, Math.max(1, Math.round(durationDays)) - 1);
}

export function calculateNextMilestoneStart(previousEndDate: string): string {
  return addDaysToISO(previousEndDate, 1);
}

export function resolveMilestoneStatus(
  milestone: Pick<Milestone, "status" | "plannedEndDate" | "startDate" | "actualCompletedDate">,
  today = todayISO()
): Milestone["status"] {
  if (milestone.status === "completed" || milestone.actualCompletedDate) return "completed";
  if (today > milestone.plannedEndDate) return "delayed";
  if (today >= milestone.startDate) return "active";
  return "upcoming";
}

export function recalculateRoadmapTimeline(
  milestones: Milestone[],
  roadmapStartDate?: string
): Milestone[] {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor = roadmapStartDate || sorted[0]?.startDate || todayISO();

  return sorted.map((milestone, index) => {
    const plannedDurationDays = normalizeDurationDays(milestone.plannedDurationDays ?? milestone.estimatedDays);
    const startDate = index === 0 ? cursor : cursor;
    const plannedEndDate = calculateMilestoneEndDate(startDate, plannedDurationDays);
    const actualCompletedDate = milestone.actualCompletedDate ?? milestone.completedDate;
    const status = resolveMilestoneStatus({
      status: actualCompletedDate ? "completed" : milestone.status,
      startDate,
      plannedEndDate,
      actualCompletedDate,
    });

    cursor = calculateNextMilestoneStart(plannedEndDate);

    return {
      ...milestone,
      startDate,
      plannedDurationDays,
      plannedEndDate,
      actualCompletedDate,
      status,
      sortOrder: index,
      updatedAt: milestone.updatedAt ?? new Date().toISOString(),
      // Legacy fields remain populated so older UI/sync snapshots continue to read safely.
      targetDate: plannedEndDate,
      estimatedDays: plannedDurationDays,
      completionStatus: status === "completed" ? "completed" : "pending",
      completedDate: actualCompletedDate,
    };
  });
}

export function shiftFutureMilestones(
  milestones: Milestone[],
  milestoneId: string,
  updates: Partial<Milestone>,
  roadmapStartDate?: string
): Milestone[] {
  const updated = milestones.map((milestone) =>
    milestone.id === milestoneId ? { ...milestone, ...updates } : milestone
  );
  return recalculateRoadmapTimeline(updated, roadmapStartDate);
}
