/**
 * Pure Goal domain operations — no React, no IndexedDB, no auth. Mirrors the
 * shape of lib/taskMutations.ts: each function takes a `Schedule` and returns
 * a new one, so callers just do `setSchedule((prev) => createGoal(prev, ...))`.
 *
 * A Goal never stores its own Plan ids; `plansForGoal` derives them by
 * filtering `schedule.plans` on `plan.goalId`. Deleting a Goal clears
 * `goalId` on any Plan that referenced it — it never touches Plans, Tasks,
 * or Milestones otherwise.
 */
import type { Goal, GoalStatus, Plan, Schedule, ScheduleEvent, GoalEventType } from "./useScheduleDB";
import { MAX_SCHEDULE_EVENTS } from "./scheduleConstants";
import { uid } from "./id";

function pushEvent(
  events: ScheduleEvent[] | undefined,
  type: GoalEventType,
  entityId: string,
  timestamp: string,
  data?: Record<string, unknown>,
): ScheduleEvent[] {
  const next = [...(events ?? []), { id: uid(), type, entityId, timestamp, data }];
  return next.length > MAX_SCHEDULE_EVENTS ? next.slice(next.length - MAX_SCHEDULE_EVENTS) : next;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
}

/** Only `title` is mandatory. Returns `schedule` unchanged if title is blank. */
export function createGoal(schedule: Schedule, input: CreateGoalInput): Schedule {
  const title = input.title.trim();
  if (!title) return schedule;
  const now = new Date().toISOString();
  const goal: Goal = {
    id: uid(),
    title,
    description: input.description?.trim() || undefined,
    status: "active",
    startDate: input.startDate || undefined,
    targetDate: input.targetDate || undefined,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
  return {
    ...schedule,
    goals: [...(schedule.goals ?? []), goal],
    events: pushEvent(schedule.events, "GOAL_CREATED", goal.id, now, { title: goal.title }),
  };
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
}

/** Edits title/description/dates only — never touches `status`. No-op if the
 * Goal doesn't exist or the new title would be blank. */
export function updateGoal(schedule: Schedule, goalId: string, input: UpdateGoalInput): Schedule {
  const existing = (schedule.goals ?? []).find((g) => g.id === goalId);
  if (!existing) return schedule;
  const trimmedTitle = input.title !== undefined ? input.title.trim() : undefined;
  if (input.title !== undefined && !trimmedTitle) return schedule;
  const now = new Date().toISOString();
  const updated: Goal = {
    ...existing,
    ...(trimmedTitle !== undefined ? { title: trimmedTitle } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() || undefined } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate || undefined } : {}),
    ...(input.targetDate !== undefined ? { targetDate: input.targetDate || undefined } : {}),
    updatedAt: now,
  };
  return {
    ...schedule,
    goals: (schedule.goals ?? []).map((g) => (g.id === goalId ? updated : g)),
    events: pushEvent(schedule.events, "GOAL_UPDATED", goalId, now),
  };
}

function setGoalStatus(
  schedule: Schedule,
  goalId: string,
  status: GoalStatus,
  eventType: "GOAL_COMPLETED" | "GOAL_ARCHIVED",
): Schedule {
  const existing = (schedule.goals ?? []).find((g) => g.id === goalId);
  if (!existing) return schedule;
  const now = new Date().toISOString();
  return {
    ...schedule,
    goals: (schedule.goals ?? []).map((g) => (g.id === goalId ? { ...g, status, updatedAt: now } : g)),
    events: pushEvent(schedule.events, eventType, goalId, now),
  };
}

/** Explicit user action only — never inferred from task/milestone completion
 * or target date (see PlanR Improvement 03 §17). */
export function completeGoal(schedule: Schedule, goalId: string): Schedule {
  return setGoalStatus(schedule, goalId, "completed", "GOAL_COMPLETED");
}

/** Prefer this over deleteGoal for normal use — Plans/Tasks/Milestones are
 * left completely untouched. */
export function archiveGoal(schedule: Schedule, goalId: string): Schedule {
  return setGoalStatus(schedule, goalId, "archived", "GOAL_ARCHIVED");
}

/**
 * Deletes the Goal itself. Any Plan referencing it has `goalId` cleared —
 * the Plan (and its Tasks/Milestones/Trackers) is never touched otherwise.
 */
export function deleteGoal(schedule: Schedule, goalId: string): Schedule {
  const existing = (schedule.goals ?? []).find((g) => g.id === goalId);
  if (!existing) return schedule;
  const now = new Date().toISOString();
  return {
    ...schedule,
    goals: (schedule.goals ?? []).filter((g) => g.id !== goalId),
    plans: schedule.plans.map((p) => (p.goalId === goalId ? { ...p, goalId: undefined } : p)),
    events: pushEvent(schedule.events, "GOAL_DELETED", goalId, now),
  };
}

/** Derives a Goal's Plans — the authoritative relationship is Plan.goalId,
 * never a reverse list stored on Goal. */
export function plansForGoal(schedule: Schedule, goalId: string): Plan[] {
  return schedule.plans.filter((p) => p.goalId === goalId);
}
