/**
 * AI action taxonomy — still-useful UI vocabulary for what an AI call is
 * doing, even though there's only one backend (local MLX) now. Kept as its
 * own module so `AIAssistant.tsx`'s suggestion cards don't need to import
 * from `lib/aiActions.ts` just for a type.
 */
export type AIActionType =
  | "generate-subtasks"
  | "generate-tasks"
  | "generate-milestones"
  | "generate-plan"
  | "weekly-insight"
  | "improve-routine";
