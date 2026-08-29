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
import {
  formatTaskBatchExample,
  formatSubtaskBatchExample,
  formatMilestoneBatchExample,
  formatActionExample,
  formatChatExample,
} from "../examples";

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

/** Same degrade-gracefully shape as withUserInstruction above — omitted
 *  entirely when there's nothing to say (no rejections yet, or none recent
 *  enough to have made the capped list from lib/ai/rejectionContext.ts). */
function withRecentRejections(prompt: string, recentRejections?: string[]): string {
  return recentRejections?.length
    ? `${prompt}\nRecently declined by the user: ${recentRejections.join("; ")}. Don't suggest these again unless asked.`
    : prompt;
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
  /** See AIGenerateOptions.recentRejections. */
  recentRejections?: string[];
  signal?: AbortSignal;
}

// ── Extended request carries per-action overrides ─────────────────────────────

export interface BrowserAIChatRequest extends AIChatRequest {
  /** Overrides the default max_new_tokens for this action type. */
  _maxNewTokens?: number;
  /** Overrides the default temperature for this action type. */
  _temperature?: number;
  /** Which build*Request produced this — "tasks" | "subtasks" | "milestones" |
   *  "milestone_tasks" | "insight" | "chat" | a FOCUSED_SCHEMAS key (e.g.
   *  "create_plan"), or undefined for the unrewritten default: return req
   *  fallback. Read by lib/ai/providers/browser.ts to tag a captured
   *  interaction (lib/ai/capture.ts) with what was actually generated —
   *  purely provenance, doesn't affect the prompt or generation itself. */
  _actionType?: string;
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
// Sourced from lib/ai/examples.json (taskBatch[0]) — see examples.ts's
// header for why only ONE example is used here despite that file holding more.
const TASK_FEW_SHOT = formatTaskBatchExample();

export const TASK_SYSTEM = `Output 4-7 weekly tasks as a JSON array. No explanation, no markdown fences, no preamble.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task" (default, checked off), "session" (workout/practice block), "commitment" (fixed time, never checked off).
Times: 24-hour HH:MM. Spread across the week. Each task needs 2-3 subtasks.
If the plan has no description or focus, output ONE short question instead of JSON. If a question was already asked, output JSON.`;

export const TASK_SYSTEM_FOLLOWUP = `Output 4-7 weekly tasks as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.`;

// Exported (alongside the other build*Request functions below) so
// scripts/build-finetune-dataset.mjs can call the exact live prompt-building
// logic rather than duplicating it — guarantees the fine-tune dataset can
// never drift from what the app actually serves at inference time.
export function buildTaskRequest(req: AIChatRequest): BrowserAIChatRequest {
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
      _actionType: "tasks",
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
    _actionType: "tasks",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subtask generation
// ─────────────────────────────────────────────────────────────────────────────

const SUBTASK_FEW_SHOT = formatSubtaskBatchExample();

export const SUBTASK_SYSTEM = `Output 3-5 concrete actionable steps as a JSON array of strings. No explanation, no markdown fences.`;

export function buildSubtaskRequest(req: AIChatRequest): BrowserAIChatRequest {
  const originalMsg = (req.messages[0]?.content as string) ?? "";
  return {
    ...req,
    systemPrompt: withUserInstruction(SUBTASK_SYSTEM, getAIInstructions().subtask),
    messages: [
      { role: "user", content: `${SUBTASK_FEW_SHOT}\n\n${originalMsg}\nOutput:` },
    ],
    _maxNewTokens: 130,
    _temperature: 0,
    _actionType: "subtasks",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone generation
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONE_FEW_SHOT = formatMilestoneBatchExample();

export const MILESTONE_SYSTEM = `Output 4-6 milestones as a JSON array. No explanation, no markdown fences.
Schema: [{"title":"3-6 word title","description":"one sentence","targetDate":"YYYY-MM-DD"}]
Space milestones evenly across the plan duration.
If no timeframe is given, ask ONE short question about duration instead of JSON. If already asked, output JSON.`;

export const MILESTONE_SYSTEM_FOLLOWUP = `Output 4-6 milestones as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"3-6 word title","description":"one sentence","targetDate":"YYYY-MM-DD"}]`;

export function buildMilestoneRequest(req: AIChatRequest): BrowserAIChatRequest {
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
      _actionType: "milestones",
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
    _actionType: "milestones",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone-scoped task generation
// ─────────────────────────────────────────────────────────────────────────────

export const MILESTONE_TASK_SYSTEM = `Output 4-6 weekly tasks as a JSON array that directly help achieve the given milestone. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.
If the milestone has no real description, ask ONE short question instead of JSON. If already asked, output JSON.`;

export const MILESTONE_TASK_SYSTEM_FOLLOWUP = `Output 4-6 weekly tasks as a JSON array using your best judgment. No explanation, no markdown fences.
Schema: [{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"task","subtasks":["step",...]}]
Icons: ${ICONS}
taskType: "task","session", or "commitment". Times: 24-hour HH:MM.`;

export function buildMilestoneTaskRequest(req: AIChatRequest): BrowserAIChatRequest {
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
    _actionType: "milestone_tasks",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly coaching insight
// ─────────────────────────────────────────────────────────────────────────────

export const INSIGHT_SYSTEM =
  "Write exactly 2 sentences of direct coaching feedback. Use the exact plan names from the data. " +
  "Call out the strongest or weakest area. Give one concrete next action. " +
  "No bullet points, no greeting, do not start with 'I'.";

export function buildInsightRequest(req: AIChatRequest): BrowserAIChatRequest {
  // The week-stats user message from aiActions.ts is already compact — keep it.
  return {
    ...req,
    systemPrompt: INSIGHT_SYSTEM,
    messages: req.messages,
    _maxNewTokens: 110,
    _temperature: 0.4,
    _actionType: "insight",
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

// Every `example` below comes from lib/ai/examples.json via formatActionExample
// — see that file's header comment for why only one example each is used.
export const FOCUSED_SCHEMAS: Record<string, { schema: string; example: string; rules: string }> = {
  create_plan: {
    schema: `{"type":"create_plan","payload":{"title":"...","description":"...","emoji":"...","color":"...","tasks":[{"title":"...","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"...","taskType":"session","subtasks":["...","..."]}]}}`,
    example: formatActionExample("create_plan"),
    rules: `3-5 tasks spread across the week, each with 2-3 subtasks. Colors: blue, emerald, violet, pink, amber, cyan.`,
  },
  add_task: {
    schema: `{"type":"add_task","payload":{"title":"...","taskType":"commitment","day":"monday","startTime":"HH:MM","endTime":"HH:MM","icon":"..."}}`,
    example: formatActionExample("add_task"),
    rules: `taskType: "task" (checked off), "session" (a practice block), "commitment" (fixed time, never checked off).`,
  },
  add_tracker: {
    schema: `{"type":"add_tracker","payload":{"title":"...","unit":"...","goalDirection":"increase_good"}}`,
    example: formatActionExample("add_tracker"),
    rules: `goalDirection is "increase_good" (more is better) or "decrease_good" (less is better).`,
  },
  suggest_milestones: {
    // "planTitle" is load-bearing, not decorative: ScheduleApp.tsx's apply
    // handler calls resolvePlanTarget(schedule.plans, payload.planTitle), and
    // with 2+ plans an absent/unmatched title resolves to "unspecified" —
    // Apply just re-shows "Which plan should these go to?" with no way to
    // answer from this card. Omitting it here (as this schema used to) meant
    // the action could only ever work by accident, for a user with exactly
    // one plan total.
    schema: `{"type":"suggest_milestones","payload":{"planTitle":"...","milestones":[{"title":"...","description":"...","targetDate":"YYYY-MM-DD"}]}}`,
    example: formatActionExample("suggest_milestones"),
    rules: `"planTitle" must match one of the user's real plan names from the request. 3-5 milestones, titles 3-6 words, dates spread across the plan's timeframe.`,
  },
  create_ritual: {
    schema: `{"type":"create_ritual","payload":{"title":"...","time":"HH:MM","duration":30,"repeatDays":["monday"],"color":"emerald"}}`,
    example: formatActionExample("create_ritual"),
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

export function buildFocusedRequest(req: AIChatRequest, action: string): BrowserAIChatRequest | null {
  const spec = FOCUSED_SCHEMAS[action];
  if (!spec) return null;

  const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
  const ask = (lastUser?.content as string) ?? "";
  const category = FOCUSED_INSTRUCTION_CATEGORY[action];
  const instruction = category ? getAIInstructions()[category] : undefined;

  return {
    ...req,
    systemPrompt: withRecentRejections(withUserInstruction(`Output ONE JSON object of type "${action}" and nothing else — no explanation, no markdown fences, no repetition.
Schema: ${spec.schema}
${spec.rules}
Icons: ${ICONS}
Times are 24-hour HH:MM. Days are lowercase weekdays.`, instruction), req.recentRejections),
    messages: [{ role: "user", content: `${spec.example}\n\nNow do the same for:\n${ask}` }],
    _maxNewTokens: 700,
    _temperature: 0,
    _actionType: action,
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

// Reuses the create_plan example from lib/ai/examples.json via formatChatExample.
const CHAT_FEW_SHOT = formatChatExample();

export const CHAT_SYSTEM = `You create PlanR items. Reply with ONE JSON object and nothing else — no explanation, no markdown fences, no repetition.

Pick one "type":
- "create_plan" — a new plan. payload: title, description, emoji, color, tasks[]
- "add_task" — one task. payload: title, taskType, day, startTime, endTime, icon
- "create_ritual" — a repeating habit. payload: title, time, duration, repeatDays[], color
- "add_tracker" — a number to track. payload: title, unit, goalDirection

Task fields: day is a lowercase weekday. Times are 24-hour HH:MM. taskType is "task", "session" or "commitment". Each task gets 2-3 subtasks.
Icons: ${ICONS}
Colors: blue, emerald, violet, pink, amber, cyan.`;

export function buildChatRequest(req: AIChatRequest): BrowserAIChatRequest {
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
  const base = lines.length > 0 ? `${CHAT_SYSTEM}\nUser preferences — ${lines.join(" | ")}` : CHAT_SYSTEM;
  const systemPrompt = withRecentRejections(base, req.recentRejections);
  return {
    ...req,
    systemPrompt,
    messages: [{ role: "user", content: `${CHAT_FEW_SHOT}\n\nNow do the same for:\n${ask}` }],
    _maxNewTokens: 700,
    _temperature: 0,
    _actionType: "chat",
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
