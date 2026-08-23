/**
 * The AI Proposal boundary — a typed, reviewable intermediate between AI
 * output and a Schedule mutation. Nothing in this file touches `Schedule` or
 * `setSchedule`; `buildCreateTaskProposal` takes only `plans: Plan[]` (for
 * id resolution), so it is structurally incapable of mutating any domain
 * array. Execution (the actual mutation) lives in lib/proposalMutations.ts.
 *
 * Scope for this first integration: `create` + `task` only, migrating the
 * `add_task` branch of `AIActionResult` (lib/ai.ts) out of
 * ScheduleApp.tsx's un-reviewed `handleApplyAction` and into this reviewed
 * path. Every other AIActionResult type is untouched. `operation`/`entity`
 * are typed as single-literal unions today so a future `update`/`delete`
 * proposal type is additive, not a breaking change.
 */
import type { AIActionResult } from "./ai";
import type { Plan, TaskTypeValue } from "./useScheduleDB";
import { findPlanByTitle } from "./planLookup";
import { uid } from "./id";
import { formatDisplayTime } from "./timeUtils";

export type ProposalOperation = "create";
export type ProposalEntity = "task";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "failed";

/** Where a proposal originated. Only "ai_chat" (the free-form AIPanel chat)
 * actually produces proposals in this integration; the rest are listed so
 * future migrations of the other real AI surfaces don't need a type change. */
export type ProposalSource = "ai_chat" | "plan_creator" | "task_generator" | "milestone_generator" | "coach";

/** One human-readable row of the proposal's diff — never raw JSON. */
export interface ProposalChange {
  label: string;
  value: string;
}

export interface CreateTaskProposalData {
  title: string;
  taskType: TaskTypeValue;
  days: string[]; // DayKey[], kept as string[] here to avoid a scheduleConstants import cycle; validated against DAYS in proposalSchema.ts
  startTime: string;
  endTime: string;
  icon: string;
  subtasks: string[];
  /** Resolved once, at build time, from `planTitle`. Re-checked for
   * continued existence at execution time (see lib/proposalMutations.ts) —
   * this is the proposal's staleness guard. */
  planId?: string;
  /** Display only — never re-resolved or used for execution. */
  planTitleAtProposalTime?: string;
}

export interface AIProposal {
  id: string;
  operation: ProposalOperation;
  entity: ProposalEntity;
  /** Always undefined for a "create" proposal — nothing exists yet. Kept on
   * the type (rather than omitted) so a future update/delete proposal is an
   * additive change, not a shape change. */
  entityId?: string;
  status: ProposalStatus;
  title: string;
  description?: string;
  changes: ProposalChange[];
  data: CreateTaskProposalData;
  createdAt: string;
  source: ProposalSource;
}

const DAY_LABEL: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function formatDays(days: string[]): string {
  return days.map((d) => DAY_LABEL[d] ?? d).join(", ");
}

/**
 * Pure builder: `AIActionResult` (the `add_task` variant) + the current
 * Plans list → a reviewable `AIProposal`. Never touches `Schedule`.
 */
export function buildCreateTaskProposal(
  action: Extract<AIActionResult, { type: "add_task" }>,
  plans: Plan[],
): AIProposal {
  const { payload } = action;
  const days = payload.days?.length ? payload.days : [payload.day];
  const plan = findPlanByTitle(plans, payload.planTitle);
  const subtasks = payload.subtasks ?? [];

  const changes: ProposalChange[] = [
    { label: "Title", value: payload.title },
    { label: "Type", value: payload.taskType === "session" ? "Session" : payload.taskType === "commitment" ? "Commitment" : "Task" },
    { label: "When", value: `${formatDays(days)} · ${formatDisplayTime(payload.startTime)}–${formatDisplayTime(payload.endTime)}` },
  ];
  if (payload.planTitle) {
    changes.push({ label: "Plan", value: plan ? plan.title : `${payload.planTitle} (no match — will add without one)` });
  }
  if (subtasks.length > 0) {
    changes.push({ label: "Steps", value: subtasks.join(" · ") });
  }

  return {
    id: uid(),
    operation: "create",
    entity: "task",
    status: "pending",
    title: `Create task: ${payload.title}`,
    changes,
    data: {
      title: payload.title,
      taskType: payload.taskType,
      days,
      startTime: payload.startTime,
      endTime: payload.endTime,
      icon: payload.icon,
      subtasks,
      planId: plan?.id,
      planTitleAtProposalTime: plan?.title,
    },
    createdAt: new Date().toISOString(),
    source: "ai_chat",
  };
}
