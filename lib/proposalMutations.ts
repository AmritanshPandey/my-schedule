/**
 * Proposal execution — the ONLY place an accepted AIProposal is allowed to
 * touch `Schedule`. Mirrors lib/goalMutations.ts's pattern: pure `(schedule:
 * Schedule, ...) => Schedule` functions, no React/IndexedDB/auth.
 *
 * `executeCreateTaskProposal` never calls a second, AI-specific task-creation
 * implementation — it calls the exact same `lib/taskMutations.ts` `createTask`
 * that `ScheduleApp.tsx`'s `handleApplyAction` already uses, so there is one
 * source of truth for "what does creating a task actually do."
 *
 * Staleness: `Task`/`Plan` carry no `createdAt`/`updatedAt` in this codebase
 * (confirmed in lib/useScheduleDB.ts), so timestamp-based optimistic
 * concurrency isn't implementable without a schema change. The one
 * meaningful check available today for a create_task proposal is "does the
 * Plan it was going to attach to still exist" — if the proposal never named
 * a plan, there's nothing to go stale, and this always succeeds.
 */
import type { AIProposal } from "./aiProposal";
import { validateProposal } from "./ai/validation/proposalSchema";
import type { Schedule, Task } from "./useScheduleDB";
import type { DayKey } from "./scheduleConstants";
import { createTask } from "./taskMutations";
import { ensureCategoryIn } from "./taskCategories";
import { pushEvent } from "./scheduleEvents";
import { uid } from "./id";

export interface ExecuteProposalResult {
  ok: boolean;
  /** The new schedule on success; the UNCHANGED input schedule on failure —
   * a caller that always does `setSchedule(result.schedule)` is safe either way. */
  schedule: Schedule;
  error?: string;
}

/** Appends AI_PROPOSAL_CREATED only — no domain array (plans/activities/
 * milestones/progressTrackers/categories) is touched. Called the moment a
 * proposal is built and shown, so an ignored suggestion still leaves a
 * lifecycle trace. */
export function recordProposalCreated(schedule: Schedule, proposal: AIProposal): Schedule {
  const now = new Date().toISOString();
  return {
    ...schedule,
    events: pushEvent(schedule.events, "AI_PROPOSAL_CREATED", proposal.id, now, {
      entity: proposal.entity,
      source: proposal.source,
      changeCount: proposal.changes.length,
    }),
  };
}

/** Appends AI_PROPOSAL_REJECTED only — no domain array is touched.
 *  Deliberately no `title`/free-text content here (see
 *  tests/proposal.test.mjs's "only ever carry whitelisted metadata" test —
 *  schedule.events is shared/synced and never carries raw AI-generated
 *  text). lib/ai/rejectionContext.ts's own separate, on-device-only store is
 *  where "what was rejected" lives for feeding back into future prompts;
 *  callers record into it alongside calling this function, not inside it —
 *  this stays a pure `(schedule, proposal) => schedule` function. */
export function recordProposalRejected(schedule: Schedule, proposal: AIProposal): Schedule {
  const now = new Date().toISOString();
  return {
    ...schedule,
    events: pushEvent(schedule.events, "AI_PROPOSAL_REJECTED", proposal.id, now, {
      entity: proposal.entity,
      source: proposal.source,
      changeCount: proposal.changes.length,
    }),
  };
}

/** Appends AI_PROPOSAL_FAILED with a reason — no domain array is touched. */
export function recordProposalFailed(schedule: Schedule, proposal: AIProposal, reason: string): Schedule {
  const now = new Date().toISOString();
  return {
    ...schedule,
    events: pushEvent(schedule.events, "AI_PROPOSAL_FAILED", proposal.id, now, {
      entity: proposal.entity,
      source: proposal.source,
      changeCount: proposal.changes.length,
      reason,
    }),
  };
}

/**
 * Re-validates the proposal and the current Schedule, then — only if both
 * still hold — executes it via the real `createTask` and appends
 * AI_PROPOSAL_ACCEPTED in the same pass. Never silently reports success: on
 * any failure the returned `schedule` is the identical input.
 */
export function executeCreateTaskProposal(schedule: Schedule, proposal: AIProposal): ExecuteProposalResult {
  const revalidated = validateProposal(proposal);
  if (!revalidated.success) {
    return { ok: false, schedule, error: "This suggestion is no longer valid." };
  }
  if (proposal.operation !== "create" || proposal.entity !== "task") {
    return { ok: false, schedule, error: "Unsupported proposal type." };
  }

  const { data } = proposal;
  if (data.planId && !schedule.plans.some((p) => p.id === data.planId)) {
    return { ok: false, schedule, error: "The plan this task was going to attach to no longer exists." };
  }

  const categoryDraft = [...schedule.categories];
  const draft: Omit<Task, "id"> = {
    title: data.title,
    startTime: data.startTime,
    endTime: data.endTime,
    categoryId: ensureCategoryIn(categoryDraft, data.icon),
    planId: data.planId ?? "",
    taskType: data.taskType,
    subtasks: data.subtasks.map((s) => ({ id: uid(), task: s })),
  };
  const mutated = createTask(draft, data.days as DayKey[], null)({ ...schedule, categories: categoryDraft });

  const now = new Date().toISOString();
  return {
    ok: true,
    schedule: {
      ...mutated,
      events: pushEvent(mutated.events, "AI_PROPOSAL_ACCEPTED", proposal.id, now, {
        entity: proposal.entity,
        source: proposal.source,
        changeCount: proposal.changes.length,
      }),
    },
  };
}
