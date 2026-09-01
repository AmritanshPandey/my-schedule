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
    const startDate = cursor;
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

/**
 * Swap a milestone with its neighbor one position earlier/later, then re-lay
 * the whole timeline back-to-back in the new order from `roadmapStartDate`.
 * Unlike `normalizeMilestoneTimeline` (used by add/delete/edit to preserve
 * each milestone's own date and any gaps), a reorder is a deliberate "the
 * sequence changed" edit — `recalculateRoadmapTimeline` is the same
 * full-relay the plan's own start-date edit and template generation already
 * use.
 *
 * A no-op move (already at that end, or an id that isn't found) still runs
 * the re-lay rather than short-circuiting, so `sortOrder`/dates stay
 * normalized either way — matching `recalculateRoadmapTimeline`'s own
 * behavior for unchanged input.
 */
export function moveMilestone(
  milestones: Milestone[],
  milestoneId: string,
  direction: "up" | "down",
  roadmapStartDate?: string
): Milestone[] {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = sorted.findIndex((m) => m.id === milestoneId);
  const swapWith = index === -1 ? -1 : direction === "up" ? index - 1 : index + 1;
  // Swap the `sortOrder` *values*, not just array position — recalculateRoadmapTimeline
  // re-sorts its input by that field, so a position-only swap would be silently
  // undone the moment it re-derives its own order from the (unchanged) field.
  const withSwap =
    index !== -1 && swapWith >= 0 && swapWith < sorted.length
      ? sorted.map((m, i) =>
          i === index
            ? { ...m, sortOrder: sorted[swapWith].sortOrder }
            : i === swapWith
              ? { ...m, sortOrder: sorted[index].sortOrder }
              : m
        )
      : sorted;
  return recalculateRoadmapTimeline(withSwap, roadmapStartDate);
}

function isValidISODate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Per-milestone normalization that PRESERVES each milestone's stored start date
 * (so user-edited dates survive load + structural ops), deriving a start only
 * when one is missing/invalid — sequentially after the previous milestone, or
 * the roadmap start for the first. Always recomputes the derived end date,
 * status, sortOrder, and legacy mirror fields. Unlike `recalculateRoadmapTimeline`
 * it never re-lays the timeline from a single anchor, so gaps the user created
 * are kept.
 */
export function normalizeMilestoneTimeline(
  milestones: Milestone[],
  roadmapStartDate?: string
): Milestone[] {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  let prevEnd: string | null = null;

  return sorted.map((milestone, index) => {
    const plannedDurationDays = normalizeDurationDays(milestone.plannedDurationDays ?? milestone.estimatedDays);
    const startDate = isValidISODate(milestone.startDate)
      ? milestone.startDate
      : prevEnd
        ? calculateNextMilestoneStart(prevEnd)
        : roadmapStartDate || todayISO();
    const plannedEndDate = calculateMilestoneEndDate(startDate, plannedDurationDays);
    prevEnd = plannedEndDate;
    const actualCompletedDate = milestone.actualCompletedDate ?? milestone.completedDate;
    const status = resolveMilestoneStatus({
      status: actualCompletedDate ? "completed" : milestone.status,
      startDate,
      plannedEndDate,
      actualCompletedDate,
    });

    return {
      ...milestone,
      startDate,
      plannedDurationDays,
      plannedEndDate,
      actualCompletedDate,
      status,
      sortOrder: index,
      updatedAt: milestone.updatedAt ?? new Date().toISOString(),
      targetDate: plannedEndDate,
      estimatedDays: plannedDurationDays,
      completionStatus: status === "completed" ? "completed" : "pending",
      completedDate: actualCompletedDate,
    };
  });
}

/**
 * Apply `updates` to one milestone and push every later milestone so the
 * remaining ones follow automatically. Milestones BEFORE the edited one keep
 * their dates; the edited one anchors at its (possibly new) start date, and all
 * subsequent milestones are laid back-to-back after it. This is what makes
 * changing one milestone's date cascade to the rest.
 */
export function cascadeMilestoneDates(
  milestones: Milestone[],
  editedId: string,
  updates: Partial<Milestone>
): Milestone[] {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  const editedIndex = sorted.findIndex((m) => m.id === editedId);
  if (editedIndex === -1) return normalizeMilestoneTimeline(sorted);

  const result: Milestone[] = [];
  // Earlier milestones are untouched (just re-index sortOrder).
  for (let i = 0; i < editedIndex; i++) result.push({ ...sorted[i], sortOrder: i });

  // From the edited milestone onward: anchor at its start, lay back-to-back.
  let cursor = isValidISODate(updates.startDate) ? updates.startDate : sorted[editedIndex].startDate;
  for (let i = editedIndex; i < sorted.length; i++) {
    const merged = i === editedIndex ? { ...sorted[i], ...updates } : sorted[i];
    const plannedDurationDays = normalizeDurationDays(merged.plannedDurationDays ?? merged.estimatedDays);
    const startDate = cursor;
    const plannedEndDate = calculateMilestoneEndDate(startDate, plannedDurationDays);
    const actualCompletedDate = merged.actualCompletedDate ?? merged.completedDate;
    const status = resolveMilestoneStatus({
      status: actualCompletedDate ? "completed" : merged.status,
      startDate,
      plannedEndDate,
      actualCompletedDate,
    });
    cursor = calculateNextMilestoneStart(plannedEndDate);

    result.push({
      ...merged,
      startDate,
      plannedDurationDays,
      plannedEndDate,
      actualCompletedDate,
      status,
      sortOrder: i,
      updatedAt: new Date().toISOString(),
      targetDate: plannedEndDate,
      estimatedDays: plannedDurationDays,
      completionStatus: status === "completed" ? "completed" : "pending",
      completedDate: actualCompletedDate,
    });
  }
  return result;
}

/**
 * When a plan really ends, given its roadmap.
 *
 * A plan's stored `endDate` is what the user typed when they created it;
 * milestones are what they have actually laid out since, and those routinely
 * run past it. Nothing reconciled the two in either direction, yet the plan
 * header and the roadmap heatmap had each grown their own inline version of
 * this — so a plan could show one end date and score its consistency against
 * another.
 *
 * Returns the LATEST milestone end, not the last one by `sortOrder`.
 * `normalizeMilestoneTimeline` preserves user-set start dates and the gaps
 * between them, so the final milestone in order is not reliably the
 * latest-ending one — which is exactly what both inline versions assumed.
 *
 * `plan.endDate` is never written from this. Task windows deliberately keep
 * using the stored value (see constrainTaskToPlanWindow): it only ever takes
 * the *earlier* of the two, so it cannot re-widen a task that an earlier,
 * shorter end already clamped, and `activeUntil` records only the result —
 * there is no way to tell "the plan clamped this" from "the user chose this".
 */
export function planEffectiveEndDate(
  plan: { endDate?: string },
  milestones: Milestone[],
): string | undefined {
  let latest: string | undefined;
  for (const milestone of milestones) {
    const end = milestone.plannedEndDate;
    if (typeof end !== "string" || !end) continue;
    if (latest === undefined || end > latest) latest = end;
  }
  return latest ?? plan.endDate;
}
