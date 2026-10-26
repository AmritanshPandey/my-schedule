/**
 * Single source of truth for PlanR's AI-facing domain vocabulary — task
 * types, ritual tracking types, plan/ritual colors, goal directions, and
 * action-type purposes. Backed by domainFacts.json (a plain, human-editable
 * JSON file) so the same values back both:
 *  - the compact "Shared rules" section of the system prompt (lib/ai.ts), and
 *  - the runtime VALID_* arrays parseAIAction/parseGeneratedTasks validate
 *    AI output against (lib/ai.ts, lib/aiActions.ts).
 *
 * Before this file, both of those lived as separately hand-typed literal
 * arrays/prose in lib/ai.ts AND lib/aiActions.ts (the task-type list, the
 * icon list, etc.) — three copies of the same icon list alone. A copy
 * getting edited without the others meant the prompt could tell the model
 * something was valid that the parser then silently rejected (falling back
 * to a default instead of what the user actually asked for). Editing
 * domainFacts.json is now the only place that needs to change.
 *
 * Icons are deliberately NOT duplicated here — lib/taskCategories.ts's
 * CATEGORY_LABELS is already the single source for those (shared with
 * components/SectionIcons.tsx), so the prompt builder imports it directly
 * instead of this file re-copying it into a second source of truth.
 */
import domainFacts from "./domainFacts.json" with { type: "json" };

export interface DomainFactValue<T extends string = string> {
  value: T;
  description: string;
  example?: Record<string, unknown>;
}

export interface DomainFacts {
  taskTypes: DomainFactValue[];
  trackingTypes: DomainFactValue[];
  planColors: string[];
  ritualColors: string[];
  goalDirections: DomainFactValue[];
  actionTypes: DomainFactValue[];
}

export const DOMAIN_FACTS = domainFacts as DomainFacts;

export const VALID_TASK_TYPES: string[] = DOMAIN_FACTS.taskTypes.map((t) => t.value);
export const VALID_TRACKING_TYPES: string[] = DOMAIN_FACTS.trackingTypes.map((t) => t.value);
export const VALID_PLAN_COLORS: string[] = DOMAIN_FACTS.planColors;
export const VALID_RITUAL_COLORS: string[] = DOMAIN_FACTS.ritualColors;
export const VALID_GOAL_DIRECTIONS: string[] = DOMAIN_FACTS.goalDirections.map((d) => d.value);
export const VALID_ACTION_TYPES: string[] = DOMAIN_FACTS.actionTypes.map((a) => a.value);
