/**
 * AI-powered companion to lib/scheduleParser.ts's deterministic parser.
 *
 * The deterministic parser is instant, offline, and free — but it only
 * understands PlanR's own paste syntax (`# Title`, day headers, `- Task 7
 * AM` bullets). Text copied from anywhere else (an email, a coach's PDF, a
 * text message, a calendar export) rarely matches that shape. This module
 * hands the SAME raw text to the AI and turns its answer into the exact
 * same `ParseResult` — so it's a drop-in for BulkImportSheet's existing
 * preview / missing-time Q&A / commit flow. Only the DATA source changes;
 * see lib/scheduleParser.ts's own header comment, which called this out
 * as the intended extension point before it existed.
 *
 * Deliberately reuses lib/ai.ts's JSON extraction/sanitization
 * (extractJSONCandidate/tryParseJSONLoose) and lib/scheduleParser.ts's
 * icon/plan-matching heuristics (iconForTitle/matchPlan) rather than
 * duplicating either — both have already had real bugs fixed in them this
 * project (see their own comments), and reimplementing risks reintroducing
 * those from scratch.
 */

import { streamAIAction } from "./aiClient";
import { extractJSONCandidate, tryParseJSONLoose } from "./ai";
import { colorFromIcon } from "./colorSystem";
import { DAYS, type DayKey } from "./scheduleConstants";
import { DAY_LABEL, iconForTitle, matchPlan, type ParsedDay, type ParsedPlan, type ParsedSubtask, type ParsedTask, type ParseResult } from "./scheduleParser";
import { uid } from "./taskMutations";
import { categoryFromIcon, type Plan } from "./useScheduleDB";

const VALID_DAYS = new Set<string>(DAYS);
// 12-hour "H:MM AM/PM" — the exact format lib/scheduleParser.ts's own
// resolveTimes()/toMinutes() expect. A time in any other shape would parse
// as NaN downstream and silently break the task, so a value that doesn't
// match this is treated as "no time given" (needsTime: true) rather than
// trusted as-is — same honesty the deterministic parser already applies to
// its own fuzzy-time guesses.
const TIME_RE = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i;

export const AI_SCHEDULE_PARSE_PROMPT = `You turn a pasted schedule — copied from anywhere, in any format — into structured JSON. Output ONLY the JSON object below, no prose, no markdown fence, nothing before or after it.

{
  "plans": [
    {"title": "string", "description": "string (optional)", "startDate": "YYYY-MM-DD (optional)", "endDate": "YYYY-MM-DD (optional)"}
  ],
  "days": [
    {
      "day": "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
      "tasks": [
        {
          "title": "string",
          "startTime": "H:MM AM/PM (e.g. 6:00 AM) — OMIT this field entirely if the source text doesn't state or clearly imply a time",
          "endTime": "H:MM AM/PM (optional — infer from a stated duration, or leave a sensible +1h to +2h gap)",
          "planTitle": "string (optional) — the plan/goal this task belongs to",
          "subtasks": [{"title": "string", "info": "string (optional)", "duration": "string (optional, e.g. '10 min')"}]
        }
      ]
    }
  ]
}

Rules:
- "day" must be the full lowercase weekday name. If the source repeats a task on multiple days (e.g. "gym Mon/Wed/Fri"), emit one entry in "days" per day, each with its own copy of that task.
- If the text names a clear time-of-day word ("morning", "after lunch", "evening") but no clock time, convert it to a concrete, reasonable clock time yourself rather than omitting startTime — you understand context better than a fixed lookup table. Only omit startTime when there is truly no time signal at all for that task.
- "planTitle": if the pasted text is clearly about one overarching goal (a heading, a program name, a repeated theme), set it on every task from that section. If a plan by that name already exists (see "User's existing plans" below), reuse its EXACT title so it links instead of duplicating.
- Only include a "plans" entry for a genuinely NEW plan — never repeat an existing plan's title there.
- Skip any day with no tasks. Never fabricate a task, time, or plan that isn't actually implied by the source text.`;

/** One-shot: streams the model's raw JSON reply for the given pasted text. */
export function streamAIScheduleParse(text: string, existingPlans: Pick<Plan, "title">[], signal?: AbortSignal) {
  const planList = existingPlans.length > 0
    ? `\n\nUser's existing plans:\n${existingPlans.map((p) => `- "${p.title}"`).join("\n")}`
    : "";
  return streamAIAction(AI_SCHEDULE_PARSE_PROMPT + planList, text, signal);
}

interface RawAITask {
  title?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  planTitle?: unknown;
  subtasks?: unknown;
}

interface RawAIDay {
  day?: unknown;
  tasks?: unknown;
}

interface RawAIPlan {
  title?: unknown;
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}

function parseAISubtasks(raw: unknown): ParsedSubtask[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const subtasks = raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null && typeof (s as Record<string, unknown>).title === "string" && (s as Record<string, unknown>).title !== "")
    .map((s): ParsedSubtask => ({
      id: uid(),
      title: String(s.title),
      info: typeof s.info === "string" && s.info ? s.info : undefined,
      duration: typeof s.duration === "string" && s.duration ? s.duration : undefined,
    }));
  return subtasks.length > 0 ? subtasks : undefined;
}

/** Validates AND canonicalizes into the exact "H:MM AM/PM" shape (e.g. a
 *  model reply of "06:00am" or "6:00  AM" both become "6:00 AM") rather than
 *  trusting the model's own spacing/casing/zero-padding. */
function validTime(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const m = raw.trim().match(TIME_RE);
  if (!m) return undefined;
  return `${parseInt(m[1], 10)}:${m[2]} ${m[3].toUpperCase()}`;
}

/**
 * Turns the model's raw text reply into the exact same `ParseResult` shape
 * the deterministic parser produces. Never throws — malformed or empty AI
 * output just yields an empty result (BulkImportSheet already handles zero
 * tasks as "nothing to import yet"), matching this codebase's established
 * convention of coercing AI output with safe defaults rather than crashing.
 *
 * No `fallbackDay` parameter (unlike lib/scheduleParser.ts's parseSchedule):
 * every AI task carries its own "day" by construction, so there's no
 * un-headered-bullet case to fall back for.
 */
export function parseAIScheduleResult(raw: string, existingPlans: Plan[]): ParseResult {
  const candidate = extractJSONCandidate(raw);
  if (!candidate) return { days: [], plans: [] };
  const parsed = tryParseJSONLoose<{ plans?: unknown; days?: unknown }>(candidate);
  if (!parsed) return { days: [], plans: [] };

  const rawPlans = Array.isArray(parsed.plans) ? (parsed.plans as RawAIPlan[]) : [];
  const parsedPlans: ParsedPlan[] = [];
  const planRefByTitle = new Map<string, string>(); // lowercase title -> ref
  for (const p of rawPlans) {
    if (typeof p.title !== "string" || !p.title.trim()) continue;
    const title = p.title.trim();
    // The model was told to only list genuinely new plans, but stay honest
    // with what it actually sent — skip anything that in fact matches an
    // existing plan by title instead of creating a duplicate.
    if (matchPlan(title, existingPlans)) continue;
    const icon = iconForTitle(title);
    const plan: ParsedPlan = {
      ref: uid(),
      title,
      description: typeof p.description === "string" && p.description ? p.description : undefined,
      startDate: typeof p.startDate === "string" && p.startDate ? p.startDate : undefined,
      endDate: typeof p.endDate === "string" && p.endDate ? p.endDate : undefined,
      emoji: icon,
      color: colorFromIcon(icon),
      category: categoryFromIcon(icon),
    };
    parsedPlans.push(plan);
    planRefByTitle.set(title.toLowerCase(), plan.ref);
  }

  const rawDays = Array.isArray(parsed.days) ? (parsed.days as RawAIDay[]) : [];
  const days: ParsedDay[] = [];
  for (const d of rawDays) {
    const day = typeof d.day === "string" ? (d.day.trim().toLowerCase() as DayKey) : null;
    if (!day || !VALID_DAYS.has(day)) continue;
    const rawTasks = Array.isArray(d.tasks) ? (d.tasks as RawAITask[]) : [];
    const tasks: ParsedTask[] = [];
    for (const t of rawTasks) {
      if (typeof t.title !== "string" || !t.title.trim()) continue;
      const title = t.title.trim();
      const startTime = validTime(t.startTime);
      const endTime = startTime ? validTime(t.endTime) : undefined;

      const planTitle = typeof t.planTitle === "string" ? t.planTitle.trim() : "";
      const planRef = planTitle ? planRefByTitle.get(planTitle.toLowerCase()) : undefined;
      const existingPlan = !planRef && planTitle ? matchPlan(planTitle, existingPlans) : null;
      const icon = iconForTitle(title);

      tasks.push({
        id: uid(),
        title,
        startTime,
        endTime,
        planRef,
        planId: existingPlan?.id,
        icon,
        suggestedTime: undefined, // the AI was asked to commit to a real time or omit it, not hedge
        needsTime: !startTime,
        subtasks: parseAISubtasks(t.subtasks),
      });
    }
    if (tasks.length > 0) days.push({ day, label: DAY_LABEL[day], tasks });
  }

  return { days, plans: parsedPlans };
}
