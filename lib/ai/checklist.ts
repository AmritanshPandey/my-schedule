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
import { VALID_TASK_TYPES, VALID_GOAL_DIRECTIONS } from "./domainFacts";
import {
  resolvePlanTarget,
  resolveTaskTarget,
  describeTargetProblem,
  type TargetMatch,
  type TaskCandidate,
} from "./targets";
import { checkLimits, type LimitCheck } from "./limits";

/**
 * Which inline editor AIReviewSheet.tsx should render for a field that's
 * missing or being changed — omitted for fields with no sensible inline
 * editor (an array the model should have generated content for, like
 * `tasks`/`milestones`/`subtasks` — hand-authoring those via checkboxes
 * isn't reasonable, so those stay read-only there regardless of `required`).
 */
export type FieldKind = "text" | "date" | "time" | "day" | "days" | "enum";

export interface ReviewField {
  key: string;
  label: string;
  /** Current value, or null when the model didn't supply one. */
  value: string | null;
  /** Missing required fields block the confirm; missing optional ones don't. */
  required: boolean;
  kind?: FieldKind;
  /** Only meaningful for `kind: "enum"`. */
  enumOptions?: string[];
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

function field(
  key: string,
  label: string,
  value: unknown,
  required: boolean,
  kind?: FieldKind,
  enumOptions?: string[],
): ReviewField {
  const str =
    value === undefined || value === null || value === "" ? null :
    Array.isArray(value) ? (value.length ? `${value.length}` : null) :
    String(value);
  return { key, label, value: str, required, kind, enumOptions };
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
        field("title", "Plan name", p.title, true, "text"),
        field("description", "Description", p.description, false, "text"),
        field("startDate", "Start date", p.startDate, false, "date"),
        field("endDate", "End date", p.endDate, false, "date"),
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
      // p.day/startTime/endTime are never actually absent by the time they
      // get here — lib/ai.ts's parser backfills a placeholder (day:"monday",
      // 9:00-10:00) so the value always type-checks. _unspecified is the
      // parser's separate record of which of those were real vs. backfilled;
      // treating an unspecified one as missing here is what lets a genuinely
      // guessed time actually block confirm and get asked about, instead of
      // silently passing through as if the model had said 9am Monday.
      const unspecified = new Set(p._unspecified ?? []);
      fields = [
        field("title", "Task name", p.title, true, "text"),
        field("day", "Day", unspecified.has("day") ? null : (p.days?.length ? p.days.join(", ") : p.day), true, "day"),
        field("startTime", "Start time", unspecified.has("startTime") ? null : p.startTime, true, "time"),
        field("endTime", "End time", unspecified.has("endTime") ? null : p.endTime, true, "time"),
        field("taskType", "Type", p.taskType, false, "enum", VALID_TASK_TYPES),
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
        field("title", "Tracker name", p.title, true, "text"),
        field("goalDirection", "Direction", p.goalDirection, true, "enum", VALID_GOAL_DIRECTIONS),
        field("unit", "Unit", p.unit, false, "text"),
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
      // See the add_task case above — same "backfilled vs. genuinely
      // supplied" distinction, here for a ritual's time/repeatDays.
      const ritualUnspecified = new Set(p._unspecified ?? []);
      fields = [
        field("title", "Routine name", p.title, true, "text"),
        field("time", "Time", ritualUnspecified.has("time") ? null : p.time, true, "time"),
        field("repeatDays", "Days", ritualUnspecified.has("repeatDays") ? null : p.repeatDays, true, "days"),
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
