/**
 * What an AI action needs before it may be written.
 *
 * The chat used to apply a parsed action straight to the schedule. Nothing
 * confirmed that the required fields were present, that the named plan existed,
 * or that the user had seen what was about to be created — so a confidently
 * wrong response became a silent edit.
 *
 * This turns any action into a reviewable description: where it lands, what it
 * must have, what it may have, and how much it creates. Required items block the
 * confirm; optional ones are shown so they can be filled or skipped.
 *
 * Table-driven and pure, so the rules are readable in one place and testable
 * without React.
 */

import type { AIActionResult } from "@/lib/ai";
import type { Plan, Schedule } from "@/lib/useScheduleDB";
import {
  resolvePlanTarget,
  resolveTaskTarget,
  describeTargetProblem,
  type TargetMatch,
  type TaskCandidate,
} from "./targets";
import { checkLimits, type LimitCheck } from "./limits";

export interface ReviewField {
  key: string;
  label: string;
  /** Current value, or null when the model didn't supply one. */
  value: string | null;
  /** Missing required fields block the confirm; missing optional ones don't. */
  required: boolean;
}

export type ReviewTarget =
  | { kind: "plan"; match: TargetMatch<Plan>; problem: string | null }
  | { kind: "task"; match: TargetMatch<TaskCandidate>; problem: string | null }
  | { kind: "none" };

export interface ActionReview {
  action: AIActionResult;
  /** Plain-language summary of what is about to happen. */
  summary: string;
  target: ReviewTarget;
  fields: ReviewField[];
  limits: LimitCheck;
  /** Every reason the confirm is currently blocked. Empty means ready. */
  blockers: string[];
}

const NOUNS: Record<AIActionResult["type"], string> = {
  create_plan: "plan",
  create_ritual: "routine",
  suggest_milestones: "milestones",
  add_tracker: "tracker",
  add_task: "task",
  add_subtasks: "subtasks",
  ask_clarification: "question",
};

function field(key: string, label: string, value: unknown, required: boolean): ReviewField {
  const str =
    value === undefined || value === null || value === "" ? null :
    Array.isArray(value) ? (value.length ? `${value.length}` : null) :
    String(value);
  return { key, label, value: str, required };
}

/**
 * Describe an action for review.
 *
 * `schedule` is needed because "is this valid?" depends on what already exists —
 * a tracker needs a plan to attach to, and whether a plan name is ambiguous
 * depends on the other plans.
 */
export function describeAction(action: AIActionResult, schedule: Schedule): ActionReview {
  const limits = checkLimits(action);
  let target: ReviewTarget = { kind: "none" };
  let fields: ReviewField[] = [];
  let summary = "";

  switch (action.type) {
    case "create_plan": {
      const p = action.payload;
      summary = `Create the plan "${p.title}"`;
      fields = [
        field("title", "Plan name", p.title, true),
        field("description", "Description", p.description, false),
        field("startDate", "Start date", p.startDate, false),
        field("endDate", "End date", p.endDate, false),
        field("tasks", "Tasks", p.tasks, false),
        field("milestones", "Milestones", p.milestones, false),
      ];
      break;
    }
    case "add_task": {
      const p = action.payload;
      const match = resolvePlanTarget(schedule.plans, p.planTitle);
      // A task genuinely need not belong to a plan — a commitment is held time
      // with no plan at all — so an unspecified target is only a problem when
      // the model named one that doesn't resolve.
      const optionalPlan = !p.planTitle;
      target = {
        kind: "plan",
        match,
        problem: optionalPlan ? null : describeTargetProblem(match, "plan"),
      };
      summary = `Add the task "${p.title}"`;
      fields = [
        field("title", "Task name", p.title, true),
        field("day", "Day", p.days?.length ? p.days.join(", ") : p.day, true),
        field("startTime", "Start time", p.startTime, true),
        field("endTime", "End time", p.endTime, true),
        field("taskType", "Type", p.taskType, false),
        field("subtasks", "Steps", p.subtasks, false),
      ];
      break;
    }
    case "add_subtasks": {
      const p = action.payload;
      const match = resolveTaskTarget(schedule, p.taskTitle);
      target = { kind: "task", match, problem: describeTargetProblem(match, "task") };
      summary = `Add ${p.subtasks.length} step${p.subtasks.length === 1 ? "" : "s"}`;
      fields = [field("subtasks", "Steps", p.subtasks, true)];
      break;
    }
    case "suggest_milestones": {
      const p = action.payload;
      const match = resolvePlanTarget(schedule.plans, p.planTitle);
      target = { kind: "plan", match, problem: describeTargetProblem(match, "plan") };
      summary = `Add ${p.milestones.length} milestone${p.milestones.length === 1 ? "" : "s"}`;
      fields = [field("milestones", "Milestones", p.milestones, true)];
      break;
    }
    case "add_tracker": {
      const p = action.payload;
      const match = resolvePlanTarget(schedule.plans, p.planTitle);
      target = { kind: "plan", match, problem: describeTargetProblem(match, "plan") };
      summary = `Add the tracker "${p.title}"`;
      fields = [
        field("title", "Tracker name", p.title, true),
        field("goalDirection", "Direction", p.goalDirection, true),
        field("unit", "Unit", p.unit, false),
        field("goalValue", "Goal", p.goalValue, false),
      ];
      break;
    }
    case "create_ritual": {
      const p = action.payload;
      summary = `Create the routine "${p.title}"`;
      // How a routine measures itself changes what completing it means, so it
      // belongs on the review card rather than being a silent default.
      const tracking = p.trackingType
        ? p.trackingType === "checklist"
          ? `Checklist · ${p.steps?.length ?? 0} steps`
          : `${p.trackingType}${p.target ? ` · target ${p.target}${p.unit ? ` ${p.unit}` : ""}` : ""}`
        : "Simple check-off";
      fields = [
        field("title", "Routine name", p.title, true),
        field("time", "Time", p.time, true),
        field("repeatDays", "Days", p.repeatDays, true),
        field("trackingType", "Tracking", tracking, false),
        field("steps", "Steps", p.steps?.length ? p.steps : null, false),
        field("duration", "Duration", p.duration ? `${p.duration} min` : null, false),
      ];
      break;
    }
    case "ask_clarification": {
      // Not a write — it has nothing to review.
      summary = action.payload.question;
      break;
    }
  }

  const blockers: string[] = [];
  if (limits.rejected) {
    blockers.push("That response is too large to be valid — ask for a smaller change.");
  }
  if (target.kind !== "none" && target.problem) blockers.push(target.problem);
  for (const f of fields) {
    if (f.required && f.value === null) blockers.push(`${f.label} is missing.`);
  }

  return { action, summary, target, fields, limits, blockers };
}

/** Ready to write: nothing blocking, and any soft-cap breach acknowledged. */
export function canConfirm(review: ActionReview, softCapAcknowledged: boolean): boolean {
  if (review.blockers.length > 0) return false;
  if (review.limits.needsConfirmation && !softCapAcknowledged) return false;
  return true;
}

/** The noun for an action, for headings and toasts. */
export function actionNoun(action: AIActionResult): string {
  return NOUNS[action.type] ?? "change";
}
