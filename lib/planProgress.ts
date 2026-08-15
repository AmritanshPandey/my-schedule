/**
 * Live-computed progress rollup: Task/Subtask → Milestone → Plan.
 *
 * There is no stored "milestone progress" anywhere in the schema — this reads
 * `Milestone.linkedActivities` (task ids) and derives a live completion %,
 * feeding `roadmapEngine`'s `overallPct` (see roadmapEngine.ts). Milestone
 * `status` itself stays exactly as-is (manually completed, date-derived
 * otherwise, via `resolveMilestoneStatus` in roadmapDates.ts) — this module
 * never writes anything, it only reads.
 *
 * Deliberately reads the durable `completionHistory` rather than a task's
 * live `completed`/`completedSubtaskIds` flags. Those live flags only ever
 * describe "today's occurrence" and are wiped the day after by
 * `resetStaleCompletions` (scheduleNormalize.ts) — feeding them straight into
 * this rollup would make a milestone that was 100% done yesterday silently
 * drop back toward 0% on the next load. Instead each linked task contributes
 * whether it/its subtasks have *ever* been completed, which only ever goes up.
 *
 * A recurring task shares one id across every weekday bucket it repeats on
 * (see lib/needsAttention.ts for the same fact handled the same way), and
 * each bucket's copy accumulates its own independent `completionHistory`
 * (every completion-toggle handler writes into just the one day's array —
 * see components/ScheduleApp.tsx / components/ios/IOSScheduleApp.tsx). So
 * "has this task ever been completed" has to be answered by looking across
 * every bucket copy sharing the id, not just one.
 *
 * Pure and React-free, matching roadmapEngine.ts / planInsights.ts / taskCompletion.ts.
 */

import { DAYS } from "./scheduleConstants";
import type { Task, Milestone, Plan } from "./useScheduleDB";
import { isTrackedTask, calculateTaskProgress, getTaskSubtaskSummary } from "./taskCompletion";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LinkedTaskProgress {
  taskId: string;
  completedCount: number;
  totalCount: number;
  pct: number;
}

export interface MilestoneProgress {
  milestoneId: string;
  /** False = zero *trackable* linked tasks (none linked, all deleted, or all commitments). */
  hasLinkedTasks: boolean;
  completedCount: number;
  totalCount: number;
  /** Null (never a false 0) when `hasLinkedTasks` is false. */
  pct: number | null;
  taskBreakdown: LinkedTaskProgress[];
}

export interface PlanProgress {
  planId: string;
  /** True iff at least one milestone has `hasLinkedTasks`. */
  hasLinkedTasks: boolean;
  /** Null (never a false 0) when `hasLinkedTasks` is false — caller should fall back to consistencyPct. */
  pct: number | null;
  milestoneBreakdown: MilestoneProgress[];
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Every weekday-bucket copy of a task sharing this id. */
function findTaskCopies(taskId: string, activities: Record<string, Task[]>): Task[] {
  return DAYS.flatMap((d) => activities[d] ?? []).filter((t) => t.id === taskId);
}

/**
 * A durable completion snapshot merged across every bucket copy of a task:
 * "ever completed" rather than "completed today." Set-based union, so
 * cross-copy duplication (if any write path ever produces it) is naturally
 * absorbed rather than needing an explicit dedupe pass.
 */
function durableTaskSnapshot(copies: Task[]): Task {
  const representative = copies[0];
  let everCompletedTask = false;
  const everCompletedSubtaskIds = new Set<string>();
  for (const copy of copies) {
    if (copy.completed) everCompletedTask = true;
    for (const id of copy.completedSubtaskIds ?? []) everCompletedSubtaskIds.add(id);
    for (const event of copy.completionHistory ?? []) {
      if (event.completionType === "task") everCompletedTask = true;
      else if (event.completionType === "subtask" && event.subtaskId) everCompletedSubtaskIds.add(event.subtaskId);
    }
  }
  return { ...representative, completed: everCompletedTask, completedSubtaskIds: [...everCompletedSubtaskIds] };
}

// ── Public selectors ─────────────────────────────────────────────────────────

/**
 * A single linked task's durable completion progress. Null when the task no
 * longer exists (deleted) or is a commitment (held time — never tracked, see
 * `isTrackedTask`), so a milestone/plan rollup can drop it rather than count
 * a phantom item.
 */
export function calculateLinkedTaskProgress(
  taskId: string,
  activities: Record<string, Task[]>,
  plan: Plan | null,
): LinkedTaskProgress | null {
  const copies = findTaskCopies(taskId, activities);
  if (copies.length === 0) return null;
  const representative = copies[0];
  if (!isTrackedTask(representative)) return null;

  const totalCount = getTaskSubtaskSummary(representative, plan).totalCount;
  const snapshot = durableTaskSnapshot(copies);
  // Reuse the existing task-level completion math unmodified — this module
  // only supplies a durable input, never reimplements how "done" is derived.
  const progress = calculateTaskProgress(snapshot, totalCount);
  return { taskId, completedCount: progress.completedCount, totalCount: progress.totalCount, pct: progress.pct };
}

/**
 * A milestone's progress from its `linkedActivities` — the % of linked
 * tasks/subtasks ever completed. Does NOT drive `milestone.status`, which
 * stays manual ("Mark as Done") and date-derived otherwise; this is a
 * separate, purely informational live number layered on top.
 */
export function calculateMilestoneProgress(
  milestone: Milestone,
  activities: Record<string, Task[]>,
  plan: Plan | null,
): MilestoneProgress {
  const seen = new Set<string>();
  const taskBreakdown: LinkedTaskProgress[] = [];
  for (const taskId of milestone.linkedActivities ?? []) {
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    const progress = calculateLinkedTaskProgress(taskId, activities, plan);
    if (progress) taskBreakdown.push(progress);
  }

  if (taskBreakdown.length === 0) {
    return { milestoneId: milestone.id, hasLinkedTasks: false, completedCount: 0, totalCount: 0, pct: null, taskBreakdown: [] };
  }

  const completedCount = taskBreakdown.reduce((sum, t) => sum + t.completedCount, 0);
  const totalCount = taskBreakdown.reduce((sum, t) => sum + t.totalCount, 0);
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return { milestoneId: milestone.id, hasLinkedTasks: true, completedCount, totalCount, pct, taskBreakdown };
}

/**
 * A plan's progress across its milestones — the average of each
 * linked-task-bearing milestone's `pct` (equal weight per milestone, not per
 * task, so a 10-task milestone doesn't drown out a 1-task one). Milestones
 * with no linked tasks are excluded from the average rather than counted as 0.
 */
export function calculatePlanProgress(
  plan: Plan,
  milestones: Milestone[],
  activities: Record<string, Task[]>,
): PlanProgress {
  const planMilestones = milestones.filter((m) => m.planId === plan.id);
  const milestoneBreakdown = planMilestones.map((m) => calculateMilestoneProgress(m, activities, plan));
  const withTasks = milestoneBreakdown.filter((m) => m.hasLinkedTasks);

  if (withTasks.length === 0) {
    return { planId: plan.id, hasLinkedTasks: false, pct: null, milestoneBreakdown };
  }

  const avgPct = withTasks.reduce((sum, m) => sum + (m.pct ?? 0), 0) / withTasks.length;
  return { planId: plan.id, hasLinkedTasks: true, pct: Math.round(avgPct), milestoneBreakdown };
}
