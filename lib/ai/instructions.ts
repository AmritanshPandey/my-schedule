/**
 * User-editable custom instructions, appended to the built-in system prompts
 * for each generation category — Plan, Task, Subtask, Milestone (Settings →
 * AI → Instructions). Purely additive: an empty/unset category changes
 * nothing, the built-in prompt behaves exactly as before.
 *
 * Persisted to localStorage, not Firestore, matching lib/ai/config.ts's
 * provider settings — see that file's comment for why. Read directly by
 * lib/ai.ts's buildSystemPrompt and lib/aiActions.ts's generators, with no
 * React threading needed anywhere: any component can edit these without
 * plumbing the value through every AI call site.
 */

import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import type { AIInstructions } from "./types";

const STORAGE_KEY = "planr:ai:instructions";

export function getAIInstructions(): AIInstructions {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Partial<AIInstructions>;
    const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      plan: pick(parsed.plan),
      task: pick(parsed.task),
      subtask: pick(parsed.subtask),
      milestone: pick(parsed.milestone),
    };
  } catch {
    return {};
  }
}

export function setAIInstructions(instructions: AIInstructions): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(instructions));
}

/** Appends a labeled "Additional instructions" block for one category, or
 *  returns the prompt unchanged if there's nothing to add. */
export function withInstructions(prompt: string, categoryLabel: string, instructions?: string): string {
  if (!instructions?.trim()) return prompt;
  return `${prompt}\n\nAdditional instructions for ${categoryLabel} from the user — follow these unless they conflict with the output format rules above:\n${instructions.trim()}`;
}
