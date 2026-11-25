/** Wording for Checklist / Steps and partly done work, shared by every shell. */

import type { SubtaskMode } from "./subtaskMode";

export const SUBTASK_MODE_LABEL: Record<SubtaskMode, string> = { checklist: "Checklist", steps: "Steps" };

export const SUBTASK_MODE_HINT: Record<SubtaskMode, string> = {
  checklist: "Starts fresh each time.",
  steps: "Finished steps stay done and the rest carry forward.",
};

/** "4 of 10 steps" for Steps, "4/5" for a checklist. */
export function subtaskCountLabel(mode: SubtaskMode, done: number, total: number): string {
  return mode === "steps" ? `${done} of ${total} ${total === 1 ? "step" : "steps"}` : `${done}/${total}`;
}

export function partlyDoneLabel(done: number, total: number): string {
  return total > 0 ? `Partly done ${done}/${total}` : "Partly done";
}

export function stepsLeftLabel(left: number): string {
  return `${left} ${left === 1 ? "step" : "steps"} left`;
}
