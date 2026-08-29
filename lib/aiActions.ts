/**
 * Focused AI action functions — structured JSON generation for specific workflows.
 * These are NOT conversational. Each function streams a single structured output.
 */

import type { DayKey, TaskTypeValue } from "./useScheduleDB";
import { streamAIAction, streamAIChat, type AIMessage } from "./aiClient";
import { getAIInstructions, withInstructions } from "./ai/instructions";
import { CATEGORY_LABELS } from "./taskCategories";
import { VALID_TASK_TYPES } from "./ai/domainFacts";
import { repairTruncatedJSON } from "./ai/jsonRepair";

// Same single source of truth as lib/ai.ts — see that file's ICON_LIST comment.
const ICON_LIST = Object.keys(CATEGORY_LABELS).join(", ");

/**
 * A single bounded clarifying round: the question the AI asked in its first
 * reply, and what the user answered (or "" if they skipped it). Passing this
 * back turns a generator's second call into a 3-message conversation instead
 * of a fresh one-shot — the client-side half of the "ask once, then proceed"
 * prompt rule below (tasks/milestones/milestone-tasks only; subtasks and the
 * weekly insight always have enough signal to answer in one shot).
 */
export interface AIFollowUp {
  question: string;
  answer: string;
}

/** Builds the message array for a generator call: just the user's ask, or —
 *  on the bounded second call after a clarifying question — that plus the
 *  AI's question and the user's (possibly empty) answer. */
function toMessages(userMessage: string, followUp?: AIFollowUp): AIMessage[] {
  const messages: AIMessage[] = [{ role: "user", content: userMessage }];
  if (followUp) {
    messages.push({ role: "assistant", content: followUp.question });
    messages.push({ role: "user", content: followUp.answer || "(no answer given — use your best judgment)" });
  }
  return messages;
}

export interface AIGeneratedTask {
  title: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  icon: string;
  subtasks: string[];
  taskType: TaskTypeValue;
}

const VALID_DAYS: DayKey[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];
// VALID_TASK_TYPES now comes from ./ai/domainFacts (see lib/ai.ts's header
// comment on that module) instead of a second hand-typed copy here.

const TASK_GEN_PROMPT = `You are a task planner. Generate 4-7 concrete weekly tasks for a plan.
Output ONLY a raw JSON array — no explanation, no markdown fences, no preamble.
[{"title":"...","day":"monday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"task","subtasks":["Step 1","Step 2"]},...]
Icons (pick most relevant): ${ICON_LIST}
Days: monday tuesday wednesday thursday friday saturday sunday
"taskType": "task" (default, checked off and tracked), "session" (a tracked workout/practice block), or "commitment" (fixed held time, never checked off).
Times: HH:MM 24-hour. Spread tasks across the week. Each task needs 2-3 subtasks.
If the plan description gives no real focus to work from (empty or a placeholder) and no scheduling signal at all, don't guess — reply with ONLY one short plain-text question instead of the JSON array. If a question was already asked earlier in this conversation, don't ask again — generate the array now using your best judgment.`;

const SUBTASK_GEN_PROMPT = `You are a task breakdown assistant.
Output ONLY a raw JSON array of strings — no explanation, no markdown fences.
["Step 1","Step 2","Step 3"]
Generate 3-5 concrete, actionable steps for the given task.`;

const MILESTONE_GEN_PROMPT = `You are a milestones planner. Generate 4-6 key milestones for a plan.
Output ONLY a raw JSON array — no explanation, no markdown fences.
[{"title":"...","description":"one sentence","targetDate":"YYYY-MM-DD"}]
Space milestones evenly across the plan duration. Keep titles concise (3-6 words).
If the plan has no known start/end date and no duration or deadline was mentioned, don't guess dates — reply with ONLY one short plain-text question asking for a rough timeframe instead of the JSON array. If already asked once in this conversation, proceed now with your best judgment.`;

export interface AIGeneratedMilestone {
  title: string;
  description: string;
  targetDate?: string;
}

// repairTruncatedJSON now lives in ./ai/jsonRepair — shared with
// lib/ai.ts's parseAIAction, which needs the same recovery for its nested
// (non-flat-array) JSON shape. See that file's header for the full story.

function tryParseJSON<T>(raw: string): T | null {
  const trimmed = raw.trim().replace(/,\s*([}\]])/g, "$1");
  // The model reliably emits well-formed double-quoted JSON per the prompt,
  // and real generated text often contains genuine apostrophes (e.g. "today's
  // schedule"). Try the untouched string first so those aren't corrupted.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Fall back to blind single-quote-to-double-quote conversion only if the
    // clean parse failed — a last resort for the rare case of a model
    // actually emitting single-quoted JSON-like output. This can still
    // mangle apostrophes inside string values, but only on an input that
    // wasn't parseable anyway.
    try {
      return JSON.parse(trimmed.replace(/'/g, '"')) as T;
    } catch {
      const repaired = repairTruncatedJSON(trimmed);
      if (!repaired) return null;
      try {
        return JSON.parse(repaired) as T;
      } catch {
        return null;
      }
    }
  }
}

/** True when every bracket in `s` closes and no string is left open — used
 *  to tell a genuinely complete `[...]` match apart from one that only
 *  LOOKS complete because the greedy regex below latched onto a NESTED
 *  array's closer (e.g. a task's own "subtasks": [...]) inside a response
 *  that was actually cut off mid-generation before its real outer `]`. */
function isBracketBalanced(s: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return depth === 0 && !inString;
}

function extractArray(text: string): string | null {
  // fenced block first
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenced.length > 0) return fenced[fenced.length - 1][1];
  // bare [...] array, but only trust it if it's actually balanced — a
  // truncated response with a completed nested array inside (e.g. a task's
  // own subtasks list) still contains SOME `]`, so the naive greedy match
  // "succeeds" against the wrong, nested one instead of the real, missing
  // outer close.
  const match = text.match(/\[[\s\S]*\]/);
  if (match && isBracketBalanced(match[0])) return match[0];
  // No balanced match — either no `]` at all, or the response was cut off
  // mid-generation. Hand the whole unterminated tail (from the first `[`)
  // to tryParseJSON's repair path instead of a wrong, too-short slice.
  const openIdx = text.indexOf("[");
  return openIdx === -1 ? null : text.slice(openIdx);
}

// ── Task generation ──────────────────────────────────────────────────────────

export function streamGenerateTasks(
  plan: { title: string; description?: string },
  signal?: AbortSignal,
  followUp?: AIFollowUp,
): AsyncGenerator<string> {
  const userMessage = `Generate tasks for: "${plan.title}"${plan.description ? `. ${plan.description}` : ""}`;
  const prompt = withInstructions(TASK_GEN_PROMPT, "Tasks", getAIInstructions().task);
  return streamAIChat(toMessages(userMessage, followUp), prompt, 1024, signal);
}

export function parseGeneratedTasks(text: string): AIGeneratedTask[] {
  const candidate = extractArray(text);
  if (!candidate) return [];
  const parsed = tryParseJSON<unknown[]>(candidate);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((t): t is Record<string, unknown> =>
      typeof t === "object" && t !== null && typeof (t as Record<string, unknown>).title === "string"
    )
    .map((t) => ({
      title: String(t.title),
      day: VALID_DAYS.includes(t.day as DayKey) ? (t.day as DayKey) : "monday",
      startTime: typeof t.startTime === "string" ? t.startTime : "09:00",
      endTime: typeof t.endTime === "string" ? t.endTime : "10:00",
      icon: typeof t.icon === "string" ? t.icon : "star",
      subtasks: Array.isArray(t.subtasks)
        ? (t.subtasks as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
      taskType: VALID_TASK_TYPES.includes(t.taskType as TaskTypeValue) ? (t.taskType as TaskTypeValue) : "task",
    }));
}

// ── Subtask generation ───────────────────────────────────────────────────────

export function streamGenerateSubtasks(
  taskTitle: string,
  planTitle?: string,
): AsyncGenerator<string> {
  const userMessage = `Generate subtasks for: "${taskTitle}"${planTitle ? ` (part of "${planTitle}")` : ""}`;
  const prompt = withInstructions(SUBTASK_GEN_PROMPT, "Subtasks", getAIInstructions().subtask);
  return streamAIAction(prompt, userMessage);
}

export function parseGeneratedSubtasks(text: string): string[] {
  const candidate = extractArray(text);
  if (!candidate) return [];
  const parsed = tryParseJSON<unknown[]>(candidate);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

// ── Milestone generation ─────────────────────────────────────────────────────

export function streamGenerateMilestones(
  plan: { title: string; description?: string; startDate?: string; endDate?: string },
  signal?: AbortSignal,
  followUp?: AIFollowUp,
): AsyncGenerator<string> {
  const context = [
    `Plan: "${plan.title}"`,
    plan.description ? `Description: ${plan.description}` : "",
    plan.startDate ? `Start: ${plan.startDate}` : "",
    plan.endDate ? `End: ${plan.endDate}` : "",
  ].filter(Boolean).join(". ");
  const prompt = withInstructions(MILESTONE_GEN_PROMPT, "Milestones", getAIInstructions().milestone);
  const userMessage = `Generate milestones for: ${context}`;
  return streamAIChat(toMessages(userMessage, followUp), prompt, 1024, signal);
}

export function parseGeneratedMilestones(text: string): AIGeneratedMilestone[] {
  const candidate = extractArray(text);
  if (!candidate) return [];
  const parsed = tryParseJSON<unknown[]>(candidate);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((m): m is Record<string, unknown> =>
      typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).title === "string"
    )
    .map((m) => ({
      title: String(m.title),
      description: typeof m.description === "string" ? m.description : "",
      targetDate: typeof m.targetDate === "string" ? m.targetDate : undefined,
    }));
}

// ── Milestone-scoped task generation ─────────────────────────────────────────

const MILESTONE_TASK_GEN_PROMPT = `You are a task planner. Generate 4-6 concrete weekly tasks that directly help achieve a specific milestone.
Output ONLY a raw JSON array — no explanation, no markdown fences, no preamble.
[{"title":"...","day":"monday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"task","subtasks":["Step 1","Step 2"]},...]
Icons (pick most relevant): ${ICON_LIST}
Days: monday tuesday wednesday thursday friday saturday sunday
"taskType": "task" (default, checked off and tracked), "session" (a tracked workout/practice block), or "commitment" (fixed held time, never checked off).
Times: HH:MM 24-hour. Spread tasks across the week. Each task needs 2-3 subtasks.
If the milestone description gives no real focus to work from (empty or a placeholder) and no scheduling signal at all, don't guess — reply with ONLY one short plain-text question instead of the JSON array. If a question was already asked earlier in this conversation, don't ask again — generate the array now using your best judgment.`;

export function streamGenerateMilestoneTasks(
  milestone: { title: string; description?: string },
  plan: { title: string; description?: string },
  signal?: AbortSignal,
  followUp?: AIFollowUp,
): AsyncGenerator<string> {
  const userMessage = [
    `Generate tasks for milestone: "${milestone.title}"${milestone.description ? ` — ${milestone.description}` : ""}.`,
    `Part of plan: "${plan.title}"${plan.description ? ` (${plan.description})` : ""}.`,
  ].join(" ");
  const prompt = withInstructions(MILESTONE_TASK_GEN_PROMPT, "Tasks", getAIInstructions().task);
  return streamAIChat(toMessages(userMessage, followUp), prompt, 1024, signal);
}

// ── Weekly insight generation ─────────────────────────────────────────────────

const WEEKLY_INSIGHT_PROMPT = `You are a personal performance coach reviewing someone's week. Write exactly 2-3 sentences of coaching insight as plain prose — no bullet points, no markdown, no lists. Call out the strongest or weakest execution area, name the exact plan or habit that needs the most attention, and give one concrete next action. Use the exact plan or habit names from the provided week stats when available. Be direct, specific, and encouraging. Never start with "I", "As a coach", or a generic greeting.`;

/**
 * Streams a 2-3 sentence weekly coaching insight based on the week's stats.
 * `weekContext` should be a compact summary string (built by the caller from schedule data).
 */
export function streamWeeklyInsight(
  weekContext: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAIAction(
    WEEKLY_INSIGHT_PROMPT,
    `Weekly stats:\n${weekContext}\n\nProvide your coaching insight:`,
    signal,
  );
}
