/**
 * First use of Zod in this repo. This is deliberately additive, not a
 * replacement for lib/ai.ts's parseAIAction / lib/aiActions.ts's
 * parseGeneratedTasks — those already do lenient extraction + coercion
 * (missing day → "monday", missing icon → "star", etc.) and, critically,
 * already return null/[] gracefully when the model's reply isn't valid JSON
 * at all. That null-on-failure behavior is load-bearing: it's exactly how
 * the AI "ask a clarifying question instead of guessing" feature detects
 * "this reply is prose, not JSON". This module runs strictly AFTER that
 * extraction has already succeeded — it only ever sees an already-parsed
 * AITask[], and it never changes what counts as a parse failure.
 *
 * What it actually catches that the lenient coercion above doesn't:
 *  - an invalid duration (while allowing an end time before the start time to
 *    represent an overnight task)
 *  - a malformed time string that's technically a string but not HH:MM
 *    (e.g. the model wrote "7am" — passes the existing `typeof === "string"`
 *    check, would not pass this)
 *  - a title that's present but near-empty after trimming
 */

import { z } from "zod";
import { DAYS, type DayKey } from "@/lib/scheduleConstants";
import type { AITask } from "@/lib/ai";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 16 * 60;

function durationMinutes(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;
  return (end <= start ? end + 24 * 60 : end) - start;
}

export const AIGeneratedTaskSchema = z
  .object({
    title: z.string().trim().min(2, "Title too short").max(80, "Title too long"),
    day: z.enum(DAYS as [DayKey, ...DayKey[]]),
    startTime: z.string().regex(TIME_RE, "startTime must be HH:MM"),
    endTime: z.string().regex(TIME_RE, "endTime must be HH:MM"),
    icon: z.string().min(1),
    subtasks: z.array(z.string().trim().min(1)).max(8).optional().default([]),
    taskType: z.enum(["task", "session", "commitment"]).optional().default("task"),
  })
  .refine((t) => {
    const duration = durationMinutes(t.startTime, t.endTime);
    return duration >= MIN_DURATION_MINUTES && duration <= MAX_DURATION_MINUTES;
  }, {
    message: `Task duration must be between ${MIN_DURATION_MINUTES} minutes and ${MAX_DURATION_MINUTES / 60} hours`,
    path: ["endTime"],
  });

export interface TaskShapeIssue {
  index: number;
  title: string;
  message: string;
}

export interface TaskShapeResult {
  valid: AITask[];
  issues: TaskShapeIssue[];
}

/** Splits an already-parsed AITask[] into the subset that passes semantic
 *  shape validation and a list of per-index issues for the rejected ones —
 *  never throws, mirrors the rest of this AI surface's "degrade gracefully,
 *  never crash the sheet" convention. */
export function validateTaskShapes(tasks: AITask[]): TaskShapeResult {
  const valid: AITask[] = [];
  const issues: TaskShapeIssue[] = [];
  tasks.forEach((t, index) => {
    const result = AIGeneratedTaskSchema.safeParse(t);
    if (result.success) {
      valid.push(result.data as AITask);
    } else {
      issues.push({
        index,
        title: t.title || `Task ${index + 1}`,
        message: result.error.issues[0]?.message ?? "Invalid task",
      });
    }
  });
  return { valid, issues };
}
