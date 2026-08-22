import type { DayKey, Plan, RitualColor, TaskTypeValue } from "./useScheduleDB";
import { todayISO } from "./dateUtils";
import { getAIInstructions } from "./ai/instructions";

export interface AITask {
  title: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  icon: string;
  subtasks?: string[];
  taskType?: TaskTypeValue;
}

export interface AIMilestone {
  title: string;
  description: string;
  targetDate?: string;
}

export type AIActionResult =
  | { type: "create_plan"; payload: { title: string; description: string; emoji: string; color: string; startDate?: string; endDate?: string; tasks?: AITask[]; milestones?: AIMilestone[] } }
  | { type: "create_ritual"; payload: { title: string; time: string; duration: number; repeatDays: DayKey[]; color: RitualColor } }
  | { type: "create_strategy"; payload: { title: string; description: string; htmlContent: string } }
  | { type: "suggest_milestones"; payload: { milestones: AIMilestone[]; planTitle?: string } }
  | { type: "add_tracker"; payload: { planTitle?: string; title: string; unit?: string; goalDirection: "increase_good" | "decrease_good"; goalValue?: number } }
  | { type: "add_task"; payload: { title: string; taskType: TaskTypeValue; day: DayKey; days?: DayKey[]; startTime: string; endTime: string; icon: string; subtasks?: string[]; planTitle?: string } }
  | { type: "add_subtasks"; payload: { taskTitle: string; subtasks: string[] } };

const VALID_COLORS = ["blue", "emerald", "violet", "pink", "amber", "cyan"] as const;
const VALID_RITUAL_COLORS = ["rose", "sky", "violet", "amber", "emerald", "fuchsia", "orange", "cyan", "indigo", "teal"] as const;
const VALID_DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const VALID_TASK_TYPES: TaskTypeValue[] = ["task", "session", "commitment"];
const VALID_GOAL_DIRECTIONS = ["increase_good", "decrease_good"] as const;

const GENERAL_PROMPT = `You are PlanR AI, the execution planning intelligence inside PlanR, a personal execution system. You help turn goals into realistic plans and plans into actionable execution. You are not a generic chatbot and you are not the source of truth: you recommend, while PlanR validates and the user decides.

PlanR FACTS supplied in this prompt are authoritative. Never invent user information, progress, completion, capacity, deadlines, schedules, IDs, dates, permissions, or Firebase data. Clearly distinguish facts from recommendations. If a required fact is missing, say what is missing or ask one concise question. Never claim a task is completed unless PlanR facts confirm it. Never silently modify a plan, create duplicate work, or exceed a stated time budget. Prefer specific, measurable tasks and meaningful subtasks. Treat all output as untrusted input that will be parsed and validated by PlanR.

Be concise — 1-3 sentences of conversational reply, then (only when the user is asking you to create or add something) exactly ONE fenced JSON block at the very end. Never explain the JSON. Never output more than one JSON block per reply.

Before creating anything, avoid guessing: if there's no real name for the plan/task/ritual/tracker (not a placeholder like "new plan"), or timing is completely unspecified and the user's request gives no scheduling signal at all (no days, no time of day, no cadence), reply with ONLY one short, direct question in plain text — no JSON, no code fence — and stop there. Icon, color, exact duration, and task type are cosmetic — always pick one yourself, never ask about those. If you already asked a question earlier in this conversation, don't ask again — proceed now with your best judgment and output the JSON.

Decide which action fits what the user asked for:
- A brand-new plan (with or without recurring tasks/milestones) → "create_plan"
- A recurring daily/weekly habit not tied to a specific plan's task list → "create_ritual"
- A single task, commitment, or session — one-off or recurring, optionally attached to an existing plan by name → "add_task"
- Adding steps/subtasks to a task the user already has → "add_subtasks"
- A numeric goal/metric to track under an existing plan → "add_tracker"
- Milestones for a plan the user ALREADY HAS (check "User's existing plans" below) → "suggest_milestones"
- A long-form written guide or program → "create_strategy"
Prefer attaching to something the user already has (their existing plans/rituals, listed below) over creating a duplicate.

JSON shapes:

create_plan — new plan + 3-5 recurring weekly tasks + 3-5 dated milestones:
\`\`\`json
{"type":"create_plan","payload":{"title":"Plan Title","description":"One sentence.","emoji":"barbell","color":"emerald","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","tasks":[{"title":"Task Name","day":"monday","startTime":"07:00","endTime":"08:00","icon":"run","taskType":"task","subtasks":["Subtask 1","Subtask 2"]}],"milestones":[{"title":"Milestone 1","description":"One sentence.","targetDate":"YYYY-MM-DD"}]}}
\`\`\`
"startDate": today unless the user names a different start. "endDate": derive only from a timeframe or deadline the user gives; if neither is known, ask one concise timeframe question instead of inventing a deadline. Each task needs 2-4 subtasks and a "taskType" (see add_task below).

create_ritual — a recurring habit/routine, not tied to one plan's task list:
\`\`\`json
{"type":"create_ritual","payload":{"title":"Habit Title","time":"07:00","duration":30,"repeatDays":["monday","tuesday","wednesday","thursday","friday"],"color":"emerald"}}
\`\`\`
Ritual "color": rose, sky, violet, amber, emerald, fuchsia, orange, cyan, indigo, or teal. time is HH:MM, duration is minutes.

add_task — one task/commitment/session, optionally attached to an existing plan:
\`\`\`json
{"type":"add_task","payload":{"title":"Task Name","taskType":"commitment","day":"thursday","days":["thursday"],"startTime":"14:00","endTime":"15:00","icon":"star","subtasks":[],"planTitle":"Plan Title"}}
\`\`\`
"taskType" is one of: "task" (default — checked off, tracked), "session" (a tracked workout/practice block), "commitment" (fixed held time that's never checked off, e.g. commute, an appointment, work hours). "days" is optional — set it (instead of relying on just "day") when the same task recurs on more than one weekday under one id. Omit "planTitle" entirely for a commitment or any task with no specific plan.

add_subtasks — add steps to an existing task the user names:
\`\`\`json
{"type":"add_subtasks","payload":{"taskTitle":"Existing Task Name","subtasks":["Step 1","Step 2"]}}
\`\`\`
"taskTitle" must match (even loosely) a task the user already has.

add_tracker — a numeric goal/metric under an existing plan:
\`\`\`json
{"type":"add_tracker","payload":{"planTitle":"Plan Title","title":"Metric name","unit":"glasses","goalDirection":"increase_good","goalValue":8}}
\`\`\`
"goalDirection" is "increase_good" (higher is better) or "decrease_good" (lower is better). "unit"/"goalValue" are optional.

suggest_milestones — milestones for a plan the user already has:
\`\`\`json
{"type":"suggest_milestones","payload":{"planTitle":"Plan Title","milestones":[{"title":"Short title","description":"one sentence","targetDate":"YYYY-MM-DD"}]}}
\`\`\`
3-5 milestones, titles 3-6 words, dates spread across the plan's remaining timeframe. Only use this for a plan that already exists — for a brand-new plan, bundle milestones into "create_plan" instead.

create_strategy — a long-form written guide the user can save and reference:
\`\`\`json
{"type":"create_strategy","payload":{"title":"...","description":"one-sentence summary","htmlContent":"<!DOCTYPE html>..."}}
\`\`\`
htmlContent must be a COMPLETE, self-contained HTML document: <!DOCTYPE html>, <head> with <meta charset="UTF-8"> and a <style> block (no Tailwind/Bootstrap/CDN links), <body>. Base typography:
   body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; max-width: 680px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
   h1 { font-size: 1.8rem; color: #6366f1; margin-bottom: 0.5rem; }
   h2 { font-size: 1.15rem; font-weight: 700; color: #374151; margin: 1.75rem 0 0.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.25rem; }
   p, li { font-size: 0.95rem; color: #374151; }
   ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
   table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
   th { background: #f3f4f6; text-align: left; padding: 0.5rem 0.75rem; font-weight: 600; }
   td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
   .callout { border-left: 4px solid #6366f1; padding: 0.75rem 1rem; background: #f5f3ff; border-radius: 0 8px 8px 0; margin: 1rem 0; font-size: 0.9rem; }
Structure every guide with <h2> sections: Overview, Key Principles (3-5 bullets), Schedule/Structure (table), Daily Habits, Tips & Troubleshooting (3-5 tips), optional Resources. Use <div class="callout"> for 1-2 highlights. Aim for 600-900 words of visible body text. Escape double-quotes inside htmlContent as \\".

Shared rules:
- "emoji"/task "icon": pick from: run, school, book, sleep, star, briefcase, car, brain, barbell, code, heart, music, palette, plane, chefhat, coin, camera, users, leaf, pencil, yoga, bike, mountain, droplet, moodsmile, flame, language, pill, bolt, dna
- Plan "color": blue, emerald, violet, pink, amber, or cyan
- "day"/"days": monday tuesday wednesday thursday friday saturday sunday (recurs weekly, no calendar date)
- Times are HH:MM 24-hour.`;

const FRAMING: Record<"plans" | "routine" | "strategy", string> = {
  plans: "The user opened this from the Plans view — lean toward plan/task/milestone/tracker actions if the ask is ambiguous, but still handle any other request.",
  routine: "The user opened this from the Routines view — lean toward suggesting a ritual (create_ritual) if the ask is ambiguous, but still handle any other request.",
  strategy: "The user opened this from the Strategy view — lean toward a written guide (create_strategy) if the ask is ambiguous, but still handle any other request.",
};

export const PLAN_COACH_PROMPT = `You are a coaching AI inside PlanR, dedicated exclusively to the user's plan.

RULES — follow these strictly:
- STAY ON TOPIC: Every response must relate directly to this specific plan. If asked anything unrelated, redirect: "I'm here to coach you on this plan — let's keep our session focused."
- BE CONCISE: 2–4 sentences per reply. No walls of text. End with exactly one question or one action.
- BE SPECIFIC: Reference the plan's actual tasks, milestones, and dates in your replies. Avoid generic advice.
- USE CONTEXT: Plan details, scheduled tasks, milestones, and trackers are provided below. Reference them.

When you have enough context to suggest milestones, append this JSON at the END of your reply (never mid-reply):
\`\`\`json
{"type":"suggest_milestones","payload":{"milestones":[{"title":"Short title","description":"one sentence","targetDate":"YYYY-MM-DD"}]}}
\`\`\`
Only suggest milestones once you know roughly how the plan is timed — its dates, or a duration/deadline mentioned in the conversation. If that's still unclear, ask about it instead of guessing dates. 3–5 milestones. Keep titles 3–6 words. ONE JSON block. Do not explain it.`;

export function buildPlanContext(plan: Plan | undefined): string {
  if (!plan) return "";
  const parts = [`Plan: "${plan.title}"`, `Category: ${plan.category}`];
  if (plan.description) parts.push(`Description: ${plan.description}`);
  if (plan.startDate) parts.push(`Started: ${plan.startDate}`);
  if (plan.endDate) parts.push(`Target end: ${plan.endDate}`);
  return parts.join(". ");
}

export function buildCoachContext(
  plan: Plan,
  opts: {
    tasks?: Array<{ task: { title: string; startTime: string; endTime: string }; activeDays: string[] }>;
    milestones?: Array<{
      title: string;
      status: string;
      plannedEndDate?: string;
      targetDate?: string;
      linkedActivities?: string[];
      linkedTrackers?: string[];
    }>;
    trackers?: Array<{ title: string; unit?: string; goalDirection?: string; goalValue?: number }>;
  } = {},
): string {
  const parts: string[] = [`Today's date: ${todayISO()}`];

  const basic = [`Plan: "${plan.title}"`, `Category: ${plan.category}`];
  if (plan.description) basic.push(`Description: ${plan.description}`);
  if (plan.startDate) basic.push(`Start: ${plan.startDate}`);
  if (plan.endDate) basic.push(`End: ${plan.endDate}`);
  parts.push(basic.join(". "));

  if (opts.tasks && opts.tasks.length > 0) {
    const lines = opts.tasks.slice(0, 8).map(({ task, activeDays }) =>
      `- ${task.title} (${activeDays.join("/")}, ${task.startTime}–${task.endTime})`
    );
    parts.push(`Scheduled activities:\n${lines.join("\n")}`);
  }

  if (opts.milestones && opts.milestones.length > 0) {
    const lines = opts.milestones.map((m) => {
      const date = m.plannedEndDate || m.targetDate || "";
      const taskCount = m.linkedActivities?.length ?? 0;
      const trackerCount = m.linkedTrackers?.length ?? 0;
      const linked =
        taskCount > 0 || trackerCount > 0
          ? ` — ${taskCount} task${taskCount !== 1 ? "s" : ""} linked, ${trackerCount} tracker${trackerCount !== 1 ? "s" : ""} linked`
          : " — no tasks yet";
      return `- [${m.status}] ${m.title}${date ? ` → ${date}` : ""}${linked}`;
    });
    parts.push(`Milestones:\n${lines.join("\n")}`);
  }

  if (opts.trackers && opts.trackers.length > 0) {
    const lines = opts.trackers.map((t) => {
      const goal = t.goalValue !== undefined
        ? `goal ${t.goalValue}${t.unit ? ` ${t.unit}` : ""}`
        : t.goalDirection === "increase_good" ? "trending up" : "trending down";
      return `- ${t.title}${t.unit ? ` (${t.unit})` : ""}: ${goal}`;
    });
    parts.push(`Trackers:\n${lines.join("\n")}`);
  }

  return parts.join("\n\n");
}

export function buildSystemPrompt(
  context: "plans" | "routine" | "strategy",
  planContext?: string,
  existingPlans?: Pick<Plan, "title" | "category" | "description">[],
  existingRituals?: Pick<{ title: string; time: string; duration?: number }, "title" | "time" | "duration">[],
): string {
  const parts: string[] = [GENERAL_PROMPT, FRAMING[context], `Today's date: ${todayISO()}`];
  if (planContext) parts.push(`Current plan context: ${planContext}`);
  if (existingPlans && existingPlans.length > 0) {
    const list = existingPlans.map((p) => `- "${p.title}" (${p.category}${p.description ? `: ${p.description}` : ""})`).join("\n");
    parts.push(`User's existing plans:\n${list}`);
  }
  if (existingRituals && existingRituals.length > 0) {
    const list = existingRituals.map((r) => `- "${r.title}" at ${r.time}${r.duration ? `, ${r.duration}min` : ""}`).join("\n");
    parts.push(`User's existing rituals:\n${list}`);
  }
  // Custom instructions (Settings → AI → Instructions) — this prompt can
  // produce any category's action, so include every non-empty one rather
  // than guessing which applies before the model has even replied.
  const instructions = getAIInstructions();
  const customLines = [
    instructions.plan && `- Plans: ${instructions.plan}`,
    instructions.task && `- Tasks: ${instructions.task}`,
    instructions.subtask && `- Subtasks: ${instructions.subtask}`,
    instructions.milestone && `- Milestones: ${instructions.milestone}`,
  ].filter(Boolean);
  if (customLines.length > 0) {
    parts.push(`Additional instructions from the user, by category — follow these unless they conflict with the output format rules above:\n${customLines.join("\n")}`);
  }
  return parts.join("\n\n");
}

/**
 * Loose JSON.parse for AI output — tolerates the two malformations MLX/Qwen3
 * reliably produce that Gemini rarely did: trailing commas, and single
 * quotes used as string delimiters. Exported so other AI-JSON consumers
 * (e.g. lib/aiScheduleParser.ts) don't reimplement this same cleanup and
 * risk drifting from whatever gets fixed here later.
 *
 * NOTE the blind `'` → `"` replace is exactly why lib/ai.ts's own JSON
 * generation prompts avoid contractions in copy — a genuine apostrophe
 * ("don't") would otherwise get corrupted into a stray quote. Callers with
 * looser prompts (free-form user text passed through, not just prompt
 * copy) should keep that in mind before trusting this on arbitrary input.
 */
export function tryParseJSONLoose<T = Record<string, unknown>>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/,\s*([}\]])/g, "$1")   // trailing commas
    .replace(/'/g, '"');              // single → double quotes
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function tryParseJSON(raw: string): { type?: string; payload?: unknown } | null {
  return tryParseJSONLoose(raw);
}

/**
 * Pull the most likely JSON object out of raw AI output — fenced ```json
 * blocks preferred (last one wins), falling back to the widest bare {...}
 * span. Exported so other AI-JSON consumers reuse the exact same
 * extraction (see the greedy-vs-lazy history below — reimplementing this
 * elsewhere risks reintroducing the same bug from scratch).
 */
export function extractJSONCandidate(text: string): string | null {
  // 1. Prefer fenced ```json … ``` blocks (take the last one)
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  if (fenced.length > 0) return fenced[fenced.length - 1][1];
  // 2. Fall back to the widest bare {...} span in the text — greedy, from the
  // first "{" to the LAST "}". A lazy match here (stopping at the first "}")
  // corrupts any nested object, e.g. add_task's payload is itself an object:
  // {"type":"add_task","payload":{"title":"...", ...}} — a lazy match only
  // captures through payload's closing brace, dropping the outer one, which
  // is invalid JSON. Confirmed live: Qwen3 (MLX) doesn't reliably wrap its
  // output in a ```json fence the way Gemini did, so this fallback path is
  // exercised far more often now than it used to be.
  const bare = text.match(/\{[\s\S]*\}/);
  return bare ? bare[0] : null;
}

function parseAITaskFields(t: Record<string, unknown>): AITask {
  return {
    title: String(t.title),
    day: VALID_DAYS.includes(t.day as DayKey) ? (t.day as DayKey) : "monday",
    startTime: typeof t.startTime === "string" ? t.startTime : "09:00",
    endTime: typeof t.endTime === "string" ? t.endTime : "10:00",
    icon: typeof t.icon === "string" ? t.icon : "star",
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter((s): s is string => typeof s === "string") : [],
    taskType: VALID_TASK_TYPES.includes(t.taskType as TaskTypeValue) ? (t.taskType as TaskTypeValue) : "task",
  };
}

function parseAIMilestones(raw: unknown): AIMilestone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).title === "string")
    .map((m) => ({
      title: String(m.title),
      description: typeof m.description === "string" ? m.description : "",
      targetDate: typeof m.targetDate === "string" ? m.targetDate : undefined,
    }));
}

export function parseAIAction(text: string): AIActionResult | null {
  const candidate = extractJSONCandidate(text);
  if (!candidate) return null;
  const parsed = tryParseJSON(candidate);
  if (!parsed) return null;
  try {
    if (parsed.type === "create_plan") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      const rawTasks = Array.isArray(p.tasks) ? p.tasks : [];
      const tasks: AITask[] = rawTasks
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null && typeof (t as Record<string,unknown>).title === "string")
        .map(parseAITaskFields);
      const milestones = parseAIMilestones(p.milestones);
      return {
        type: "create_plan",
        payload: {
          title: String(p.title),
          description: String(p.description ?? ""),
          emoji: String(p.emoji ?? "brain"),
          color: VALID_COLORS.includes(p.color as typeof VALID_COLORS[number]) ? String(p.color) : "cyan",
          startDate: typeof p.startDate === "string" ? p.startDate : undefined,
          endDate: typeof p.endDate === "string" ? p.endDate : undefined,
          tasks: tasks.length > 0 ? tasks : undefined,
          milestones: milestones.length > 0 ? milestones : undefined,
        },
      };
    }
    if (parsed.type === "create_ritual") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      const rawDays = Array.isArray(p.repeatDays) ? p.repeatDays : [];
      const repeatDays = rawDays.filter((d) => VALID_DAYS.includes(d as DayKey)) as DayKey[];
      return {
        type: "create_ritual",
        payload: {
          title: String(p.title),
          time: typeof p.time === "string" ? p.time : "08:00",
          duration: typeof p.duration === "number" ? p.duration : 30,
          repeatDays: repeatDays.length > 0 ? repeatDays : VALID_DAYS,
          color: VALID_RITUAL_COLORS.includes(p.color as RitualColor) ? (p.color as RitualColor) : "emerald",
        },
      };
    }
    if (parsed.type === "create_strategy") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      return {
        type: "create_strategy",
        payload: {
          title: String(p.title),
          description: String(p.description ?? ""),
          htmlContent: String(p.htmlContent ?? ""),
        },
      };
    }
    if (parsed.type === "suggest_milestones") {
      const p = parsed.payload as Record<string, unknown>;
      return {
        type: "suggest_milestones",
        payload: {
          milestones: parseAIMilestones(p?.milestones),
          planTitle: typeof p?.planTitle === "string" ? p.planTitle : undefined,
        },
      };
    }
    if (parsed.type === "add_tracker") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      return {
        type: "add_tracker",
        payload: {
          planTitle: typeof p.planTitle === "string" ? p.planTitle : undefined,
          title: String(p.title),
          unit: typeof p.unit === "string" ? p.unit : undefined,
          goalDirection: VALID_GOAL_DIRECTIONS.includes(p.goalDirection as typeof VALID_GOAL_DIRECTIONS[number])
            ? (p.goalDirection as "increase_good" | "decrease_good")
            : "increase_good",
          goalValue: typeof p.goalValue === "number" ? p.goalValue : undefined,
        },
      };
    }
    if (parsed.type === "add_task") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.title !== "string") return null;
      const task = parseAITaskFields(p);
      const rawDays = Array.isArray(p.days) ? p.days : [];
      const days = rawDays.filter((d) => VALID_DAYS.includes(d as DayKey)) as DayKey[];
      return {
        type: "add_task",
        payload: {
          title: task.title,
          taskType: task.taskType ?? "task",
          day: task.day,
          days: days.length > 0 ? days : undefined,
          startTime: task.startTime,
          endTime: task.endTime,
          icon: task.icon,
          subtasks: task.subtasks,
          planTitle: typeof p.planTitle === "string" ? p.planTitle : undefined,
        },
      };
    }
    if (parsed.type === "add_subtasks") {
      const p = parsed.payload as Record<string, unknown>;
      if (typeof p?.taskTitle !== "string" || !p.taskTitle.trim()) return null;
      const subtasks = Array.isArray(p.subtasks)
        ? p.subtasks.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        : [];
      if (subtasks.length === 0) return null;
      return {
        type: "add_subtasks",
        payload: { taskTitle: p.taskTitle, subtasks },
      };
    }
    return null;
  } catch {
    return null;
  }
}
