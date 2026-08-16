/**
 * Focused AI action functions — structured JSON generation for specific workflows.
 * These are NOT conversational. Each function streams a single structured output.
 */

import type { DayKey } from "./useScheduleDB";
import { streamGeminiAction, type IdTokenSource } from "./aiClient";

export interface AIGeneratedTask {
  title: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  icon: string;
  subtasks: string[];
}

const VALID_DAYS: DayKey[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const TASK_GEN_PROMPT = `You are a task planner. Generate 4-7 concrete weekly tasks for a plan.
Output ONLY a raw JSON array — no explanation, no markdown fences, no preamble.
[{"title":"...","day":"monday","startTime":"07:00","endTime":"08:00","icon":"barbell","subtasks":["Step 1","Step 2"]},...]
Icons (pick most relevant): run, school, book, sleep, star, briefcase, car, brain, barbell, code, heart, music, palette, plane, chefhat, coin, camera, users, leaf, pencil, yoga, bike, mountain, droplet, moodsmile, flame, language, pill, bolt, dna
Days: monday tuesday wednesday thursday friday saturday sunday
Times: HH:MM 24-hour. Spread tasks across the week. Each task needs 2-3 subtasks.`;

const SUBTASK_GEN_PROMPT = `You are a task breakdown assistant.
Output ONLY a raw JSON array of strings — no explanation, no markdown fences.
["Step 1","Step 2","Step 3"]
Generate 3-5 concrete, actionable steps for the given task.`;

const MILESTONE_GEN_PROMPT = `You are a milestones planner. Generate 4-6 key milestones for a plan.
Output ONLY a raw JSON array — no explanation, no markdown fences.
[{"title":"...","description":"one sentence","targetDate":"YYYY-MM-DD"}]
Space milestones evenly across the plan duration. Keep titles concise (3-6 words).`;

export interface AIGeneratedMilestone {
  title: string;
  description: string;
  targetDate?: string;
}

function tryParseJSON<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/'/g, '"');
  try { return JSON.parse(cleaned) as T; } catch { return null; }
}

function extractArray(text: string): string | null {
  // fenced block first
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenced.length > 0) return fenced[fenced.length - 1][1];
  // bare [...] array
  const match = text.match(/\[[\s\S]*\]/);
  return match ? match[0] : null;
}

// ── Task generation ──────────────────────────────────────────────────────────

export function streamGenerateTasks(
  user: IdTokenSource | null,
  plan: { title: string; description?: string },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const userMessage = `Generate tasks for: "${plan.title}"${plan.description ? `. ${plan.description}` : ""}`;
  return streamGeminiAction(user, TASK_GEN_PROMPT, userMessage, signal);
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
    }));
}

// ── Subtask generation ───────────────────────────────────────────────────────

export function streamGenerateSubtasks(
  user: IdTokenSource | null,
  taskTitle: string,
  planTitle?: string,
): AsyncGenerator<string> {
  const userMessage = `Generate subtasks for: "${taskTitle}"${planTitle ? ` (part of "${planTitle}")` : ""}`;
  return streamGeminiAction(user, SUBTASK_GEN_PROMPT, userMessage);
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
  user: IdTokenSource | null,
  plan: { title: string; description?: string; startDate?: string; endDate?: string },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const context = [
    `Plan: "${plan.title}"`,
    plan.description ? `Description: ${plan.description}` : "",
    plan.startDate ? `Start: ${plan.startDate}` : "",
    plan.endDate ? `End: ${plan.endDate}` : "",
  ].filter(Boolean).join(". ");
  return streamGeminiAction(user, MILESTONE_GEN_PROMPT, `Generate milestones for: ${context}`, signal);
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
[{"title":"...","day":"monday","startTime":"07:00","endTime":"08:00","icon":"barbell","subtasks":["Step 1","Step 2"]},...]
Icons (pick most relevant): run, school, book, sleep, star, briefcase, car, brain, barbell, code, heart, music, palette, plane, chefhat, coin, camera, users, leaf, pencil, yoga, bike, mountain, droplet, moodsmile, flame, language, pill, bolt, dna
Days: monday tuesday wednesday thursday friday saturday sunday
Times: HH:MM 24-hour. Spread tasks across the week. Each task needs 2-3 subtasks.`;

export function streamGenerateMilestoneTasks(
  user: IdTokenSource | null,
  milestone: { title: string; description?: string },
  plan: { title: string; description?: string },
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const userMessage = [
    `Generate tasks for milestone: "${milestone.title}"${milestone.description ? ` — ${milestone.description}` : ""}.`,
    `Part of plan: "${plan.title}"${plan.description ? ` (${plan.description})` : ""}.`,
  ].join(" ");
  return streamGeminiAction(user, MILESTONE_TASK_GEN_PROMPT, userMessage, signal);
}

// ── Weekly insight generation ─────────────────────────────────────────────────

const WEEKLY_INSIGHT_PROMPT = `You are a personal performance coach reviewing someone's week. Write exactly 2-3 sentences of coaching insight as plain prose — no bullet points, no markdown, no lists. Call out the strongest or weakest execution area, name the exact plan or habit that needs the most attention, and give one concrete next action. Use the exact plan or habit names from the provided week stats when available. Be direct, specific, and encouraging. Never start with "I", "As a coach", or a generic greeting.`;

/**
 * Streams a 2-3 sentence weekly coaching insight based on the week's stats.
 * `weekContext` should be a compact summary string (built by the caller from schedule data).
 */
export function streamWeeklyInsight(
  user: IdTokenSource | null,
  weekContext: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamGeminiAction(
    user,
    WEEKLY_INSIGHT_PROMPT,
    `Weekly stats:\n${weekContext}\n\nProvide your coaching insight:`,
    signal,
  );
}
