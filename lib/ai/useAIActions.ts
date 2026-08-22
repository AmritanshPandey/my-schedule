"use client";

/**
 * useAIActions — unified AI action hook. Every action runs through the
 * active provider (lib/aiClient.ts's activeProvider(), configured in AI
 * Settings) — there's no auth or sign-in gating here: none of MLX, Ollama,
 * or a user's own remote API key has a per-call cost the way the old
 * shared, sign-in-gated Gemini key needed. `available` just means "a
 * provider is configured" (always true for MLX/Ollama given their built-in
 * defaults; for a remote provider it means a base URL + model are set) —
 * actual reachability is what AI Settings' "Test connection" and the
 * try/catch around every real generate() call are for.
 *
 * All methods return AsyncGenerator<string> so they plug directly into
 * AIActionSheet's onGenerate prop unchanged from before this rewrite.
 */

import { useCallback } from "react";
import { isAiConfigured } from "@/lib/aiClient";
import {
  streamGenerateTasks,
  streamGenerateSubtasks,
  streamGenerateMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
  type AIFollowUp,
} from "@/lib/aiActions";

export interface AIActionsHandle {
  /** A provider is configured — see the module doc comment above. */
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
   *  the insight in that case. */
  streamWeeklyInsight: (
    weekContext: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<string> | null;
}

export function useAIActions(): AIActionsHandle {
  const available = isAiConfigured();

  const streamTasks = useCallback(
    (planTitle: string, description?: string, signal?: AbortSignal, followUp?: AIFollowUp): AsyncGenerator<string> =>
      streamGenerateTasks({ title: planTitle, description }, signal, followUp),
    [],
  );

  const streamSubtasks = useCallback(
    (taskTitle: string, planTitle?: string): AsyncGenerator<string> =>
      streamGenerateSubtasks(taskTitle, planTitle),
    [],
  );

  const streamMilestonesAction = useCallback(
    (
      plan: { title: string; description?: string; startDate?: string; endDate?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestones(plan, signal, followUp),
    [],
  );

  const streamMilestoneTasksAction = useCallback(
    (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestoneTasks(milestone, plan, signal, followUp),
    [],
  );

  const streamWeeklyInsightAction = useCallback(
    (weekContext: string, signal?: AbortSignal): AsyncGenerator<string> | null => {
      if (!available) return null;
      return streamWeeklyInsight(weekContext, signal);
    },
    [available],
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
