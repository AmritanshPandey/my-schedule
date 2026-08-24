"use client";

/**
 * browserPrompts.ts — PlanR-specialized compact prompts for small (≲1B param)
 * browser-local models (Gemma 3 1B, Qwen2.5-0.5B-Instruct, and similar).
 *
 * Problem: the verbose prompts in lib/aiActions.ts are designed for 7 B+ models.
 * Small models fail structurally on them — they drop brackets, emit prose where
 * JSON is expected, or ignore the schema entirely.
 *
 * Solution: intercept every AIChatRequest INSIDE the browser provider and rewrite
 * it before inference. The rest of the app (aiActions.ts, router.ts, useAIActions)
 * is completely unchanged. Unknown action types pass through untouched so future
 * additions to aiActions.ts degrade gracefully rather than breaking.
 *
 * Key technique: embed the few-shot JSON example in the USER message, not the
 * system prompt. Sub-500 M instruction models attend more strongly to the user
 * turn and reliably follow an "example → do the same for X" structure.
 *
 * temperature: 0 (greedy) for all JSON tasks — eliminates structural hallucinations
 * (dropped brackets, swapped quotes) that appear at any positive temperature in
 * small models. Prose (weekly insight) uses 0.4.
 */

import type { AIMessage } from "../types";
import { getAIInstructions } from "../instructions";

/** Appends the user's custom instruction for one category, in the same
 *  compact, unlabeled style as everything else this module builds — small
 *  models attend better to a short plain addition than a verbose labeled
 *  block (contrast lib/ai/instructions.ts's withInstructions(), written for
 *  the bigger MLX/Ollama/API models). Returns `prompt` unchanged when
 *  nothing's saved for that category, same as every rewrite in this file
 *  degrading gracefully rather than adding empty noise. */
function withUserInstruction(prompt: string, instruction?: string): string {
  return instruction?.trim() ? `${prompt}\nUser preference: ${instruction.trim()}` : prompt;
}

/** Request shape this module rewrites — a trimmed mirror of what
 *  lib/ai/providers/browser.ts's `generate()` receives (systemPrompt +
 *  message history), local to the browser-prompt-rewriting concern rather
 *  than shared with the other providers, which don't need it. */
export interface AIChatRequest {
  messages: AIMessage[];
  systemPrompt: string;
  /** Hint for a larger output-token ceiling on requests this module doesn't
   *  specifically recognize (see the `default` branch of rewriteForBrowserModel
   *  below) — mirrors the same flag other providers key off of. */
  isStrategy?: boolean;
  /** The action the user already selected, when known — see
   *  AIGenerateOptions.actionHint. */
  actionHint?: string;
  signal?: AbortSignal;
}

// ── Extended request carries per-action overrides ─────────────────────────────

export interface BrowserAIChatRequest extends AIChatRequest {
  /** Overrides the default max_new_tokens for this action type. */
  _maxNewTokens?: number;
  /** Overrides the default temperature for this action type. */
  _temperature?: number;
}

// ── Action-type detection ─────────────────────────────────────────────────────
// Matched against stable unique substrings from each `const` prompt in aiActions.ts.
// Order matters: milestone_tasks is checked before generic tasks because both
// contain "task planner".

type ActionType =
  | "tasks"
  | "subtasks"
  | "milestones"
  | "milestone_tasks"
  | "insight"
  | "chat"
  | "unknown";

function detectActionType(systemPrompt: string): ActionType {
  if (systemPrompt.includes("task breakdown assistant"))       return "subtasks";
  if (systemPrompt.includes("milestones planner"))            return "milestones";
  if (systemPrompt.includes("performance coach"))             return "insight";
  if (systemPrompt.includes("directly help achieve a specific milestone")) return "milestone_tasks";
  if (systemPrompt.includes("task planner"))                  return "tasks";
  // The AI Assistant chat. Its prompt (lib/ai.ts's GENERAL_PROMPT) is ~1,850
  // tokens of decision rules and JSON schemas written for 7B+ models; handing
  // that to a sub-1B model made it echo the request back in a loop instead of
  // answering. Matched last, since the action prompts above are more specific.
  if (systemPrompt.includes("You are PlanR AI"))              return "chat";
  return "unknown";
}

// ── Shared icon list ──────────────────────────────────────────────────────────
const ICONS =
  "run,school,book,sleep,star,briefcase,car,brain,barbell,code,heart,music," +
  "palette,plane,chefhat,coin,camera,users,leaf,pencil,yoga,bike,mountain," +
  "droplet,moodsmile,flame,language,pill,bolt,dna";

// ─────────────────────────────────────────────────────────────────────────────
// Task generation
// ─────────────────────────────────────────────────────────────────────────────

// All four items used to be taskType "session" — a small model copies the
// example's *pattern* more readily than the prose rule above it, so it kept
// over-using "session" for everything. This mix actually demonstrates all
// three values so the model has something to pattern-match onto for each.
const TASK_FEW_SHOT = `Example output for plan "Morning Fitness":
[{"title":"Morning Run","day":"monday","startTime":"06:30","endTime":"07:15","icon":"run","taskType":"session","subtasks":["5 min warm-up walk","Run 3 km at easy pace","5 min cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3×12","Push-ups 3×15","Plank 60 s"]},{"title":"Meal Prep Sunday","day":"sunday","startTime":"11:00","endTime":"12:00","icon":"chefhat","taskType":"task","subtasks":["Cook 3 protein portions","Portion into containers","Fridge for the week"]},{"title":"Physio Check-in","day":"friday","startTime":"09:00","endTime":"09:30","icon":"heart","taskType":"commitment","subtasks":["Bring last week's log","Ask about knee soreness"]}]`;

const TASK_SYSTEM = `Output 4-7 weekly tasks as a JSON array. No explanation, no markdown fences, no preamble.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task" (default, checked off), "session" (workout/practice block), "commitment" (fixed time, never checked off).
Times: 24-hour HH:MM. Spread across the week. Each task needs 2-3 subtasks.
If the plan has no description or focus, output ONE short question instead of JSON. If a question was already asked, output JSON.`;

const TASK_SYSTEM_FOLLOWUP = `Output 4-7 weekly tasks as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.`;

function buildTaskRequest(req: AIChatRequest): BrowserAIChatRequest {
  const isFollowUp = req.messages.length > 1;
  const originalMsg = (req.messages[0]?.content as string) ?? "";
  const instruction = getAIInstructions().task;

  if (isFollowUp) {
    return {
      ...req,
      systemPrompt: withUserInstruction(TASK_SYSTEM_FOLLOWUP, instruction),
      messages: [
        { role: "user",      content: `${TASK_FEW_SHOT}\n\nNow generate tasks for:\n${originalMsg}` },
        req.messages[1] as AIMessage,  // AI clarifying question
        req.messages[2] as AIMessage,  // user answer
      ].filter(Boolean) as AIMessage[],
      _maxNewTokens: 650,
      _temperature: 0,
    };
  }

  return {
    ...req,
    systemPrompt: withUserInstruction(TASK_SYSTEM, instruction),
    messages: [
      { role: "user", content: `${TASK_FEW_SHOT}\n\nNow generate tasks for:\n${originalMsg}` },
    ],
    _maxNewTokens: 650,
    _temperature: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtask generation
// ─────────────────────────────────────────────────────────────────────────────

const SUBTASK_FEW_SHOT = `Example for "Write quarterly report":
["Review previous quarter metrics","Identify top 3 highlights and gaps","Draft executive summary","Add charts and supporting data","Proofread and send to manager"]`;

const SUBTASK_SYSTEM = `Output 3-5 concrete actionable steps as a JSON array of strings. No explanation, no markdown fences.`;

function buildSubtaskRequest(req: AIChatRequest): BrowserAIChatRequest {
  const originalMsg = (req.messages[0]?.content as string) ?? "";
  return {
    ...req,
    systemPrompt: withUserInstruction(SUBTASK_SYSTEM, getAIInstructions().subtask),
    messages: [
      { role: "user", content: `${SUBTASK_FEW_SHOT}\n\n${originalMsg}\nOutput:` },
    ],
    _maxNewTokens: 130,
    _temperature: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone generation
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONE_FEW_SHOT = `Example for "Learn Spanish" (2025-01-01 → 2025-06-30):
[{"title":"Alphabet & Pronunciation","description":"Learn phonics and 200 core vocabulary words","targetDate":"2025-01-31"},{"title":"Daily Conversations","description":"Hold a 5-minute chat on everyday topics","targetDate":"2025-03-15"},{"title":"Grammar Fluency","description":"Master present, past, and future tenses","targetDate":"2025-05-01"},{"title":"Full Comprehension","description":"Watch a Spanish film without subtitles","targetDate":"2025-06-30"}]`;

const MILESTONE_SYSTEM = `Output 4-6 milestones as a JSON array. No explanation, no markdown fences.
Schema: [{"title":"3-6 word title","description":"one sentence","targetDate":"YYYY-MM-DD"}]
Space milestones evenly across the plan duration.
If no timeframe is given, ask ONE short question about duration instead of JSON. If already asked, output JSON.`;

const MILESTONE_SYSTEM_FOLLOWUP = `Output 4-6 milestones as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"3-6 word title","description":"one sentence","targetDate":"YYYY-MM-DD"}]`;

function buildMilestoneRequest(req: AIChatRequest): BrowserAIChatRequest {
  const isFollowUp = req.messages.length > 1;
  const originalMsg = (req.messages[0]?.content as string) ?? "";
  const instruction = getAIInstructions().milestone;

  if (isFollowUp) {
    return {
      ...req,
      systemPrompt: withUserInstruction(MILESTONE_SYSTEM_FOLLOWUP, instruction),
      messages: [
        { role: "user",      content: `${MILESTONE_FEW_SHOT}\n\nGenerate milestones for:\n${originalMsg}` },
        req.messages[1] as AIMessage,
        req.messages[2] as AIMessage,
      ].filter(Boolean) as AIMessage[],
      _maxNewTokens: 450,
      _temperature: 0,
    };
  }

  return {
    ...req,
    systemPrompt: withUserInstruction(MILESTONE_SYSTEM, instruction),
    messages: [
      { role: "user", content: `${MILESTONE_FEW_SHOT}\n\nGenerate milestones for:\n${originalMsg}` },
    ],
    _maxNewTokens: 450,
    _temperature: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone-scoped task generation
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONE_TASK_SYSTEM = `Output 4-6 weekly tasks as a JSON array that directly help achieve the given milestone. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.
If the milestone has no real description, ask ONE short question instead of JSON. If already asked, output JSON.`;

const MILESTONE_TASK_SYSTEM_FOLLOWUP = `Output 4-6 weekly tasks as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.`;

function buildMilestoneTaskRequest(req: AIChatRequest): BrowserAIChatRequest {
  const isFollowUp = req.messages.length > 1;
  const originalMsg = (req.messages[0]?.content as string) ?? "";
  // "Tasks", not "Milestones" — matches aiActions.ts's own choice for this
  // generator (withInstructions(MILESTONE_TASK_GEN_PROMPT, "Tasks", ...task)),
  // since what's actually being generated here is a task batch.
  const instruction = getAIInstructions().task;

  return {
    ...req,
    systemPrompt: withUserInstruction(isFollowUp ? MILESTONE_TASK_SYSTEM_FOLLOWUP : MILESTONE_TASK_SYSTEM, instruction),
    messages: isFollowUp
      ? [
          { role: "user",  content: `${TASK_FEW_SHOT}\n\nGenerate tasks for:\n${originalMsg}` },
          req.messages[1] as AIMessage,
          req.messages[2] as AIMessage,
        ].filter(Boolean) as AIMessage[]
      : [
          { role: "user", content: `${TASK_FEW_SHOT}\n\nGenerate tasks for:\n${originalMsg}` },
        ],
    _maxNewTokens: 550,
    _temperature: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly coaching insight
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_SYSTEM =
  "Write exactly 2 sentences of direct coaching feedback. Use the exact plan names from the data. " +
  "Call out the strongest or weakest area. Give one concrete next action. " +
  "No bullet points, no greeting, do not start with 'I'.";

function buildInsightRequest(req: AIChatRequest): BrowserAIChatRequest {
  // The week-stats user message from aiActions.ts is already compact — keep it.
  return {
    ...req,
    systemPrompt: INSIGHT_SYSTEM,
    messages: req.messages,
    _maxNewTokens: 110,
    _temperature: 0.4,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Known-intent chat — the user already told us which action they want
// ─────────────────────────────────────────────────────────────────────────────
//
// Tapping "Create a 30-day fitness plan" is unambiguously a create_plan. The
// generic chat prompt still makes the model choose between four schemas before
// writing anything, which is most of the work and where a small model fails.
// With the intent known we hand it one schema and one example, so the whole
// budget goes on content.

const FOCUSED_SCHEMAS: Record<string, { schema: string; example: string; rules: string }> = {
  create_plan: {
    schema: `{"type":"create_plan","payload":{"title":"...","description":"...","emoji":"...","color":"...","tasks":[{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"session","subtasks":["...","..."]}]}}`,
    example: `User: Create a 30-day fitness plan
You: {"type":"create_plan","payload":{"title":"30-Day Fitness","description":"Build a consistent training habit over 30 days.","emoji":"barbell","color":"emerald","tasks":[{"title":"Morning Run","day":"monday","startTime":"07:00","endTime":"07:45","icon":"run","taskType":"session","subtasks":["Warm-up walk","Run 3 km","Cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3x12","Push-ups 3x15","Plank 60s"]},{"title":"Long Run","day":"saturday","startTime":"08:00","endTime":"09:30","icon":"run","taskType":"session","subtasks":["Easy pace 8 km","Hydrate","Stretch"]}]}}`,
    rules: `3-5 tasks spread across the week, each with 2-3 subtasks. Colors: blue, emerald, violet, pink, amber, cyan.`,
  },
  add_task: {
    schema: `{"type":"add_task","payload":{"title":"...","taskType":"commitment","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"..."}}`,
    example: `User: Add a commitment for a dentist appointment on Thursday at 2pm
You: {"type":"add_task","payload":{"title":"Dentist Appointment","taskType":"commitment","day":"thursday","startTime":"14:00","endTime":"15:00","icon":"star"}}`,
    rules: `taskType: "task" (checked off), "session" (a practice block), "commitment" (fixed time, never checked off).`,
  },
  add_tracker: {
    schema: `{"type":"add_tracker","payload":{"title":"...","unit":"...","goalDirection":"increase_good"}}`,
    example: `User: Add a tracker for water intake
You: {"type":"add_tracker","payload":{"title":"Water","unit":"ml","goalDirection":"increase_good"}}`,
    rules: `goalDirection is "increase_good" (more is better) or "decrease_good" (less is better).`,
  },
  suggest_milestones: {
    schema: `{"type":"suggest_milestones","payload":{"milestones":[{"title":"...","description":"...","targetDate":"YYYY-MM-DD"}]}}`,
    example: `User: Suggest milestones for my marathon plan
You: {"type":"suggest_milestones","payload":{"milestones":[{"title":"Run 10 km non-stop","description":"Build the aerobic base.","targetDate":"2026-03-15"},{"title":"Half marathon distance","description":"Prove the endurance is there.","targetDate":"2026-04-20"},{"title":"Race pace 20 km","description":"Dial in target pace.","targetDate":"2026-05-18"}]}}`,
    rules: `3-5 milestones, titles 3-6 words, dates spread across the plan's timeframe.`,
  },
  create_ritual: {
    schema: `{"type":"create_ritual","payload":{"title":"...","time":"HH:MM","duration":30,"repeatDays":["monday"],"color":"emerald"}}`,
    example: `User: Create a morning meditation routine
You: {"type":"create_ritual","payload":{"title":"Morning Meditation","time":"07:00","duration":15,"repeatDays":["monday","tuesday","wednesday","thursday","friday"],"color":"violet"}}`,
    rules: `Ritual colors: rose, sky, violet, amber, emerald, fuchsia, orange, cyan, indigo, teal.`,
  },
};

// Which saved instruction category applies to each focused action — only
// the three with a real category match; add_tracker/create_ritual have no
// corresponding field in Settings → AI → Instructions, so they get none.
const FOCUSED_INSTRUCTION_CATEGORY: Partial<Record<string, "plan" | "task" | "milestone">> = {
  create_plan: "plan",
  add_task: "task",
  suggest_milestones: "milestone",
};

function buildFocusedRequest(req: AIChatRequest, action: string): BrowserAIChatRequest | null {
  const spec = FOCUSED_SCHEMAS[action];
  if (!spec) return null;

  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const ask = (lastUser?.content as string) ?? "";
  const category = FOCUSED_INSTRUCTION_CATEGORY[action];
  const instruction = category ? getAIInstructions()[category] : undefined;

  return {
    ...req,
    systemPrompt: withUserInstruction(`Output ONE JSON object of type "${action}" and nothing else — no explanation, no markdown fences, no repetition.
Schema: ${spec.schema}
${spec.rules}
Icons: ${ICONS}
Times are 24-hour HH:MM. Days are lowercase weekdays.`, instruction),
    messages: [{ role: "user", content: `${spec.example}\n\nNow do the same for:\n${ask}` }],
    _maxNewTokens: 700,
    _temperature: 0,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// AI Assistant chat
// ─────────────────────────────────────────────────────────────────────────────
//
// The full GENERAL_PROMPT covers seven action types, a clarification protocol,
// icon and colour vocabularies and several worked examples. A small model given
// all of that does not choose an action — it degenerates, most visibly by
// restating the user's request over and over. This keeps one schema, one
// example, and nothing else.

const CHAT_FEW_SHOT = `Example.
User: Create a 30-day fitness plan
You:
{"type":"create_plan","payload":{"title":"30-Day Fitness","description":"Build a consistent training habit over 30 days.","emoji":"barbell","color":"emerald","tasks":[{"title":"Morning Run","day":"monday","startTime":"07:00","endTime":"07:45","icon":"run","taskType":"session","subtasks":["Warm-up walk","Run 3 km","Cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3x12","Push-ups 3x15","Plank 60s"]},{"title":"Long Run","day":"saturday","startTime":"08:00","endTime":"09:30","icon":"run","taskType":"session","subtasks":["Easy pace 8 km","Hydrate","Stretch"]}]}}`;

const CHAT_SYSTEM = `You create PlanR items. Reply with ONE JSON object and nothing else — no explanation, no markdown fences, no repetition.

Pick one "type":
- "create_plan" — a new plan. payload: title, description, emoji, color, tasks[]
- "add_task" — one task. payload: title, taskType, day, startTime, endTime, icon
- "create_ritual" — a repeating habit. payload: title, time, duration, repeatDays[], color
- "add_tracker" — a number to track. payload: title, unit, goalDirection

Task fields: day is a lowercase weekday. Times are 24-hour HH:MM. taskType is "task", "session" or "commitment". Each task gets 2-3 subtasks.
Icons: ${ICONS}
Colors: blue, emerald, violet, pink, amber, cyan.`;

function buildChatRequest(req: AIChatRequest): BrowserAIChatRequest {
  // Only the latest user turn is kept. Small models lose the thread across a
  // long history and start replaying earlier turns.
  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const ask = (lastUser?.content as string) ?? "";
  // The reply's type isn't known yet here (that's the whole point of this
  // generic path — buildFocusedRequest handles the known-intent case), so
  // fold in every saved category rather than guessing which one applies.
  const all = getAIInstructions();
  const lines = [
    all.plan && `Plans: ${all.plan}`,
    all.task && `Tasks: ${all.task}`,
    all.subtask && `Subtasks: ${all.subtask}`,
    all.milestone && `Milestones: ${all.milestone}`,
  ].filter(Boolean);
  const systemPrompt = lines.length > 0 ? `${CHAT_SYSTEM}\nUser preferences — ${lines.join(" | ")}` : CHAT_SYSTEM;
  return {
    ...req,
    systemPrompt,
    messages: [{ role: "user", content: `${CHAT_FEW_SHOT}\n\nNow do the same for:\n${ask}` }],
    _maxNewTokens: 700,
    _temperature: 0,
  };
}

/**
 * Rewrites a generic AIChatRequest from aiActions.ts into a compact,
 * few-shot-guided prompt optimised for <500 M instruction-tuned models.
 *
 * Returns the original request unchanged for unknown action types so that
 * future additions to aiActions.ts degrade gracefully rather than failing.
 */
export function rewriteForBrowserModel(req: AIChatRequest): BrowserAIChatRequest {
  // A known intent beats any prompt-sniffing: the UI told us outright.
  if (req.actionHint) {
    const focused = buildFocusedRequest(req, req.actionHint);
    if (focused) return focused;
  }
  switch (detectActionType(req.systemPrompt)) {
    case "tasks":           return buildTaskRequest(req);
    case "subtasks":        return buildSubtaskRequest(req);
    case "milestones":      return buildMilestoneRequest(req);
    case "milestone_tasks": return buildMilestoneTaskRequest(req);
    case "insight":         return buildInsightRequest(req);
    case "chat":            return buildChatRequest(req);
    default:                return req;
  }
}
