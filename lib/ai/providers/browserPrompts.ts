"use client";

/**
 * browserPrompts.ts — PlanR-specialized compact prompts for small (<500 M param)
 * browser-local models (SmolLM2-360M-Instruct et al).
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

import type { AIChatRequest, AIMessage } from "./types";

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
  | "unknown";

function detectActionType(systemPrompt: string): ActionType {
  if (systemPrompt.includes("task breakdown assistant"))       return "subtasks";
  if (systemPrompt.includes("milestones planner"))            return "milestones";
  if (systemPrompt.includes("performance coach"))             return "insight";
  if (systemPrompt.includes("directly help achieve a specific milestone")) return "milestone_tasks";
  if (systemPrompt.includes("task planner"))                  return "tasks";
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

const TASK_FEW_SHOT = `Example output for plan "Morning Fitness":
[{"title":"Morning Run","day":"monday","startTime":"06:30","endTime":"07:15","icon":"run","taskType":"session","subtasks":["5 min warm-up walk","Run 3 km at easy pace","5 min cool-down stretch"]},{"title":"Strength Training","day":"wednesday","startTime":"07:00","endTime":"08:00","icon":"barbell","taskType":"session","subtasks":["Squats 3×12","Push-ups 3×15","Plank 60 s"]},{"title":"Yoga & Recovery","day":"friday","startTime":"07:30","endTime":"08:15","icon":"yoga","taskType":"session","subtasks":["Sun salutation","Hip opener holds","5 min meditation"]},{"title":"Long Run","day":"saturday","startTime":"07:00","endTime":"08:30","icon":"run","taskType":"session","subtasks":["Easy pace 8 km","Hydrate every 2 km","Post-run stretch"]}]`;

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

  if (isFollowUp) {
    return {
      ...req,
      systemPrompt: TASK_SYSTEM_FOLLOWUP,
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
    systemPrompt: TASK_SYSTEM,
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
    systemPrompt: SUBTASK_SYSTEM,
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

  if (isFollowUp) {
    return {
      ...req,
      systemPrompt: MILESTONE_SYSTEM_FOLLOWUP,
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
    systemPrompt: MILESTONE_SYSTEM,
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

  return {
    ...req,
    systemPrompt: isFollowUp ? MILESTONE_TASK_SYSTEM_FOLLOWUP : MILESTONE_TASK_SYSTEM,
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

/**
 * Rewrites a generic AIChatRequest from aiActions.ts into a compact,
 * few-shot-guided prompt optimised for <500 M instruction-tuned models.
 *
 * Returns the original request unchanged for unknown action types so that
 * future additions to aiActions.ts degrade gracefully rather than failing.
 */
export function rewriteForBrowserModel(req: AIChatRequest): BrowserAIChatRequest {
  switch (detectActionType(req.systemPrompt)) {
    case "tasks":           return buildTaskRequest(req);
    case "subtasks":        return buildSubtaskRequest(req);
    case "milestones":      return buildMilestoneRequest(req);
    case "milestone_tasks": return buildMilestoneTaskRequest(req);
    case "insight":         return buildInsightRequest(req);
    default:                return req;
  }
}
