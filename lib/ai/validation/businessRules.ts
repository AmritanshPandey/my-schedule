/**
 * Semantic business rules for AI-generated tasks — distinct from
 * ./taskSchema.ts's shape validation. These check whether a shape-valid task
 * batch actually makes sense against the user's real schedule: is there
 * enough free time, is it a duplicate, is the title actually useful, is the
 * deadline sane. None of this exists today — the current parsing layer only
 * ever checks shape, never meaning.
 *
 * Pure, synchronous, client-side, by necessity: this is a static-export app
 * with no server to run business logic on, so it runs against whatever's
 * already loaded into the Schedule object client-side — same discipline as
 * lib/ai.ts's buildCoachContext (summarize + cap, never scan everything).
 */

import type { DayKey } from "@/lib/scheduleConstants";
import type { AIMilestone, AITask } from "@/lib/ai";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import {
  DEFAULT_TIMELINE_START_MINUTES,
  TIMELINE_END_MINUTES,
  getConfiguredDayStartMinutes,
} from "@/lib/timeline/displayWindow";

export interface RuleIssue {
  severity: "error" | "warning";
  taskIndex?: number;
  message: string;
}

export interface BusinessRuleTaskRef {
  title: string;
  startTime: string;
  endTime: string;
}

export interface BusinessRuleRitualRef {
  title: string;
  time: string;
  duration?: number;
  repeatDays?: DayKey[];
}

export interface BusinessRuleContext {
  /** Existing tracked (non-commitment doesn't need excluding here — caller
   *  passes whatever should count as "busy") tasks, keyed by weekday. */
  existingTasksByDay: Partial<Record<DayKey, BusinessRuleTaskRef[]>>;
  rituals: BusinessRuleRitualRef[];
  /** From schedule.preferences.dayStartTime / dayEndMinutes / dayEndAuto —
   *  see buildBusinessRuleContext below for how these are derived; kept as
   *  plain minute numbers here so this module never has to know about
   *  SchedulePreferences' shape. */
  dayStartMinutes: number;
  dayEndMinutes: number;
  /** Optional user-declared budget for the generated batch, in minutes. */
  availableMinutes?: number;
  planEndDate?: string;
  todayISO: string;
}

const VAGUE_TITLE_PATTERNS = [
  /^work on\b/i,
  /^do (the )?\b/i,
  /^stuff$/i,
  /^task ?\d*$/i,
  /^misc(ellaneous)?$/i,
  /^various$/i,
  /^tbd$/i,
  /^placeholder$/i,
  /^untitled$/i,
];

function durationMinutes(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime) ?? 0;
  const end = parseTimeToMinutes(endTime) ?? 0;
  return (end <= start ? end + 24 * 60 : end) - start;
}

export function checkVagueTitle(title: string, taskIndex: number): RuleIssue | null {
  const trimmed = title.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const isVague = wordCount <= 1 || VAGUE_TITLE_PATTERNS.some((re) => re.test(trimmed));
  if (!isVague) return null;
  return {
    severity: "warning",
    taskIndex,
    message: `"${trimmed}" is a vague title — consider something more specific and actionable.`,
  };
}

export function checkDuplicates(
  tasks: AITask[],
  existingTasksByDay: BusinessRuleContext["existingTasksByDay"],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const seenInBatch = new Map<string, number>(); // "day|normalizedTitle" -> first index

  tasks.forEach((t, index) => {
    const key = `${t.day}|${t.title.trim().toLowerCase()}`;
    const firstIndex = seenInBatch.get(key);
    if (firstIndex !== undefined) {
      issues.push({
        severity: "warning",
        taskIndex: index,
        message: `Duplicates "${tasks[firstIndex].title}" already generated for ${t.day}.`,
      });
    } else {
      seenInBatch.set(key, index);
    }

    const existing = existingTasksByDay[t.day] ?? [];
    const clash = existing.find((e) => e.title.trim().toLowerCase() === t.title.trim().toLowerCase());
    if (clash) {
      issues.push({
        severity: "warning",
        taskIndex: index,
        message: `You already have "${clash.title}" scheduled on ${t.day}.`,
      });
    }
  });

  return issues;
}

export function checkTimeBudget(tasks: AITask[], ctx: BusinessRuleContext): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const windowMinutes = Math.max(60, ctx.dayEndMinutes - ctx.dayStartMinutes);

  const byDay = new Map<DayKey, number>();
  for (const t of tasks) {
    byDay.set(t.day, (byDay.get(t.day) ?? 0) + durationMinutes(t.startTime, t.endTime));
  }

  for (const [day, newMinutes] of byDay) {
    const existingMinutes = (ctx.existingTasksByDay[day] ?? []).reduce(
      (sum, t) => sum + durationMinutes(t.startTime, t.endTime),
      0,
    );
    const ritualMinutes = ctx.rituals
      .filter((r) => !r.repeatDays?.length || r.repeatDays.includes(day))
      .reduce((sum, r) => sum + (r.duration ?? 0), 0);
    const totalMinutes = newMinutes + existingMinutes + ritualMinutes;

    if (totalMinutes > windowMinutes) {
      issues.push({
        severity: "error",
        message: `${day.charAt(0).toUpperCase() + day.slice(1)} is overbooked — ${Math.round(totalMinutes / 60 * 10) / 10}h of tasks in a ${Math.round(windowMinutes / 60 * 10) / 10}h day.`,
      });
    } else if (totalMinutes > windowMinutes * 0.85) {
      issues.push({
        severity: "warning",
        message: `${day.charAt(0).toUpperCase() + day.slice(1)} is nearly full — ${Math.round(totalMinutes / 60 * 10) / 10}h scheduled.`,
      });
    }
  }

  return issues;
}

export function checkAvailableTimeBudget(tasks: AITask[], availableMinutes?: number): RuleIssue[] {
  if (availableMinutes === undefined) return [];
  if (!Number.isFinite(availableMinutes) || availableMinutes < 0) {
    return [{ severity: "error", message: "Available planning time must be a non-negative number of minutes." }];
  }

  const generatedMinutes = tasks.reduce(
    (sum, task) => sum + durationMinutes(task.startTime, task.endTime),
    0,
  );
  if (generatedMinutes <= availableMinutes) return [];

  return [{
    severity: "error",
    message: `Generated work exceeds the available time — ${generatedMinutes} minutes requested, ${availableMinutes} minutes available.`,
  }];
}

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

export function checkDeadlineSanity(
  tasks: AITask[],
  milestones: AIMilestone[],
  ctx: BusinessRuleContext,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const today = new Date(`${ctx.todayISO}T00:00:00`).getTime();
  const planEnd = ctx.planEndDate ? new Date(`${ctx.planEndDate}T00:00:00`).getTime() : null;

  for (const m of milestones) {
    if (!m.targetDate) continue;
    const target = new Date(`${m.targetDate}T00:00:00`).getTime();
    if (Number.isNaN(target)) continue;
    if (target < today) {
      issues.push({ severity: "error", message: `Milestone "${m.title}" targets ${m.targetDate}, which is in the past.` });
      continue;
    }
    if (planEnd !== null && target > planEnd) {
      issues.push({ severity: "warning", message: `Milestone "${m.title}" (${m.targetDate}) falls after the plan's end date.` });
    } else if (target - today > TWO_YEARS_MS) {
      issues.push({ severity: "warning", message: `Milestone "${m.title}" targets over two years out — double-check that date.` });
    }
  }

  return issues;
}

export function runBusinessRules(
  tasks: AITask[],
  milestones: AIMilestone[],
  ctx: BusinessRuleContext,
): RuleIssue[] {
  return [
    ...tasks.flatMap((t, i) => {
      const issue = checkVagueTitle(t.title, i);
      return issue ? [issue] : [];
    }),
    ...checkDuplicates(tasks, ctx.existingTasksByDay),
    ...checkTimeBudget(tasks, ctx),
    ...checkAvailableTimeBudget(tasks, ctx.availableMinutes),
    ...checkDeadlineSanity(tasks, milestones, ctx),
  ];
}

/** Convenience: builds the minute-window part of BusinessRuleContext from
 *  SchedulePreferences, so callers don't need to know the day-start/day-end
 *  derivation rules. `dayEndAuto` (derive end from the last scheduled task)
 *  is intentionally approximated with the app's own generous fallback
 *  constant here rather than replicated exactly — this is an advisory
 *  warning, not the real timeline renderer, and doesn't need pixel parity
 *  with it. */
export function resolveDayWindowMinutes(preferences: {
  dayStartTime?: string;
  dayEndMinutes?: number;
  dayEndAuto?: boolean;
}): { dayStartMinutes: number; dayEndMinutes: number } {
  const dayStartMinutes = getConfiguredDayStartMinutes(preferences.dayStartTime) ?? DEFAULT_TIMELINE_START_MINUTES;
  const dayEndMinutes =
    !preferences.dayEndAuto && typeof preferences.dayEndMinutes === "number"
      ? preferences.dayEndMinutes
      : TIMELINE_END_MINUTES;
  return { dayStartMinutes, dayEndMinutes };
}
