/**
 * Single source of truth for PlanR's AI few-shot examples — realistic
 * worked request→response pairs, backing lib/ai/providers/browserPrompts.ts's
 * few-shot prompts (currently the only consumer; see below for why the other
 * prompt files don't use this).
 *
 * examples.json intentionally holds MORE than one example per category (a
 * "long reference file" to edit/extend), but each formatter below returns
 * only ONE by default (index 0) — the exact same content that used to be
 * hardcoded inline in browserPrompts.ts. That file's own header comment
 * explains why: the small in-browser model (<1B params) degenerates —
 * echoing the request back in a loop — when handed a verbose, multi-example
 * prompt. Feeding it this whole file would regress the reliability work
 * that shaped browserPrompts.ts in the first place. The extra examples exist
 * so a future diversification pass (e.g. rotating which example is shown)
 * has real material to draw from without touching prompt-building code.
 *
 * lib/ai.ts and lib/aiActions.ts deliberately do NOT pull from this file:
 * their prompts use placeholder-style schema templates ("Plan Title", "Task
 * Name"), not realistic worked examples — a different technique for the
 * larger MLX/Ollama/API models, which don't need pattern-matching examples
 * the way the tiny browser model does. Migrating them here would be a
 * prompt-wording change to providers that aren't broken.
 */
import examplesData from "./examples.json" with { type: "json" };

export interface TaskExample {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  icon: string;
  taskType: string;
  subtasks: string[];
}

export interface TaskBatchExample {
  context: string;
  tasks: TaskExample[];
}

export interface SubtaskBatchExample {
  context: string;
  subtasks: string[];
}

export interface MilestoneExample {
  title: string;
  description: string;
  targetDate: string;
}

export interface MilestoneBatchExample {
  planTitle: string;
  dateRange: string;
  milestones: MilestoneExample[];
}

export interface ActionExample {
  request: string;
  response: Record<string, unknown>;
}

export interface AIExamples {
  taskBatch: TaskBatchExample[];
  subtaskBatch: SubtaskBatchExample[];
  milestoneBatch: MilestoneBatchExample[];
  actions: Record<string, ActionExample>;
}

export const AI_EXAMPLES = examplesData as AIExamples;

/** "Example output for plan \"Morning Fitness\":\n[{...}]" — same shape as
 *  browserPrompts.ts's former TASK_FEW_SHOT. */
export function formatTaskBatchExample(index = 0): string {
  const ex = AI_EXAMPLES.taskBatch[index] ?? AI_EXAMPLES.taskBatch[0];
  return `Example output for plan "${ex.context}":\n${JSON.stringify(ex.tasks)}`;
}

/** "Example for \"Write quarterly report\":\n[\"Review...\"]" — same shape
 *  as the former SUBTASK_FEW_SHOT. */
export function formatSubtaskBatchExample(index = 0): string {
  const ex = AI_EXAMPLES.subtaskBatch[index] ?? AI_EXAMPLES.subtaskBatch[0];
  return `Example for "${ex.context}":\n${JSON.stringify(ex.subtasks)}`;
}

/** "Example for \"Learn Spanish\" (2025-01-01 → 2025-06-30):\n[{...}]" —
 *  same shape as the former MILESTONE_FEW_SHOT. */
export function formatMilestoneBatchExample(index = 0): string {
  const ex = AI_EXAMPLES.milestoneBatch[index] ?? AI_EXAMPLES.milestoneBatch[0];
  return `Example for "${ex.planTitle}" (${ex.dateRange}):\n${JSON.stringify(ex.milestones)}`;
}

/** "User: Create a 30-day fitness plan\nYou: {...}" — same shape as the
 *  former FOCUSED_SCHEMAS[type].example strings. */
export function formatActionExample(type: string): string {
  const ex = AI_EXAMPLES.actions[type];
  if (!ex) return "";
  return `User: ${ex.request}\nYou: ${JSON.stringify(ex.response)}`;
}

/** "Example.\nUser: ...\nYou:\n{...}" — same shape as the former
 *  CHAT_FEW_SHOT (reuses the create_plan action example, with the chat
 *  prompt's own surrounding format — a newline before the JSON rather than
 *  a space). */
export function formatChatExample(): string {
  const ex = AI_EXAMPLES.actions.create_plan;
  return `Example.\nUser: ${ex.request}\nYou:\n${JSON.stringify(ex.response)}`;
}
