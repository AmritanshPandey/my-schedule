"use client";

/**
 * useAIActions — unified AI action hook. Every action routes through
 * lib/ai/providers/router.ts, which resolves the active provider (Gemini via
 * the Cloudflare Worker, or a local MLX server) — this hook doesn't know or
 * care which. `available` means "the active provider is usable right now":
 * for Gemini that's still "configured and signed in" (the Worker enforces
 * the real per-user/global caps, unbypassable client-side); for MLX it's
 * always true, since a local server needs no auth — an unreachable MLX
 * server surfaces as a friendly error at generation time instead.
 *
 * All methods return AsyncGenerator<string> so they plug directly into
 * AIActionSheet's onGenerate prop unchanged from before this rewrite.
 */

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { isAiAvailable } from "@/lib/ai/providers/router";
import {
  streamGenerateTasks,
  streamGenerateSubtasks,
  streamGenerateMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
  type AIFollowUp,
} from "@/lib/aiActions";

export interface AIActionsHandle {
  /** AI is configured (Worker URL set at build time) and the caller is signed in. */
  available: boolean;

  streamTasks: (
    planTitle: string,
    description?: string,
    signal?: AbortSignal,
    followUp?: AIFollowUp,
  ) => AsyncGenerator<string>;

  streamSubtasks: (
    taskTitle: string,
    planTitle?: string,
  ) => AsyncGenerator<string>;

  streamMilestones: (
    plan: { title: string; description?: string; startDate?: string; endDate?: string },
    signal?: AbortSignal,
    followUp?: AIFollowUp,
  ) => AsyncGenerator<string>;

  streamMilestoneTasks: (
    milestone: { title: string; description?: string },
    plan: { title: string; description?: string },
    signal?: AbortSignal,
    followUp?: AIFollowUp,
  ) => AsyncGenerator<string>;

  /** Returns null when AI isn't available — callers already skip rendering
   *  the insight in that case, matching the old Ollama-only gating shape. */
  streamWeeklyInsight: (
    weekContext: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<string> | null;
}

export function useAIActions(): AIActionsHandle {
  const { user, isGuest } = useAuth();
  const available = isAiAvailable(isGuest);

  const streamTasks = useCallback(
    (planTitle: string, description?: string, signal?: AbortSignal, followUp?: AIFollowUp): AsyncGenerator<string> =>
      streamGenerateTasks(user, { title: planTitle, description }, signal, followUp),
    [user],
  );

  const streamSubtasks = useCallback(
    (taskTitle: string, planTitle?: string): AsyncGenerator<string> =>
      streamGenerateSubtasks(user, taskTitle, planTitle),
    [user],
  );

  const streamMilestonesAction = useCallback(
    (
      plan: { title: string; description?: string; startDate?: string; endDate?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestones(user, plan, signal, followUp),
    [user],
  );

  const streamMilestoneTasksAction = useCallback(
    (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestoneTasks(user, milestone, plan, signal, followUp),
    [user],
  );

  const streamWeeklyInsightAction = useCallback(
    (weekContext: string, signal?: AbortSignal): AsyncGenerator<string> | null => {
      if (!available) return null;
      return streamWeeklyInsight(user, weekContext, signal);
    },
    [available, user],
  );

  return {
    available,
    streamTasks,
    streamSubtasks,
    streamMilestones: streamMilestonesAction,
    streamMilestoneTasks: streamMilestoneTasksAction,
    streamWeeklyInsight: streamWeeklyInsightAction,
  };
}
