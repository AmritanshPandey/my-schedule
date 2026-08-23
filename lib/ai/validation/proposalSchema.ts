/**
 * Zod validation for `AIProposal` (lib/aiProposal.ts), mirroring this
 * directory's existing taskSchema.ts: this module runs strictly AFTER
 * `buildCreateTaskProposal` has already constructed the proposal — it only
 * re-checks shape, it never re-derives `changes`/`title`/ids. Reuses
 * taskSchema.ts's `TIME_RE` rather than duplicating it.
 *
 * Used twice: once when a proposal is first shown to the user (defense
 * against a malformed builder result becoming a "pending" proposal at all),
 * and again at accept-time (lib/proposalMutations.ts) — "never trust the
 * schedule/proposal is still valid just because it was valid once."
 */
import { z } from "zod";
import { DAYS, type DayKey } from "@/lib/scheduleConstants";
import { TIME_RE } from "./taskSchema";

export const CreateTaskProposalDataSchema = z.object({
  title: z.string().trim().min(2, "Title too short").max(80, "Title too long"),
  taskType: z.enum(["task", "session", "commitment"]),
  days: z.array(z.enum(DAYS as [DayKey, ...DayKey[]])).min(1, "At least one day is required"),
  startTime: z.string().regex(TIME_RE, "startTime must be HH:MM"),
  endTime: z.string().regex(TIME_RE, "endTime must be HH:MM"),
  icon: z.string().min(1),
  subtasks: z.array(z.string().trim().min(1)).max(8),
  planId: z.string().min(1).optional(),
  planTitleAtProposalTime: z.string().optional(),
}).passthrough();

export const AIProposalSchema = z.object({
  id: z.string().min(1),
  operation: z.literal("create"),
  entity: z.literal("task"),
  entityId: z.string().min(1).optional(),
  status: z.enum(["pending", "accepted", "rejected", "failed"]),
  title: z.string().min(1),
  description: z.string().optional(),
  changes: z.array(z.object({ label: z.string(), value: z.string() }).passthrough()),
  data: CreateTaskProposalDataSchema,
  createdAt: z.string().datetime({ offset: true }),
  source: z.enum(["ai_chat", "plan_creator", "task_generator", "milestone_generator", "coach"]),
}).passthrough();

export type AIProposalValidated = z.infer<typeof AIProposalSchema>;

export function validateProposal(
  value: unknown,
): { success: true; data: AIProposalValidated } | { success: false; error: z.ZodError } {
  const result = AIProposalSchema.safeParse(value);
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}
