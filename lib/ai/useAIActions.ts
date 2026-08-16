"use client";

/**
 * useAIActions — unified AI action hook. Every action runs through the local
 * MLX provider (lib/aiClient.ts) — there's no auth or sign-in gating here:
 * a local model has no per-call cost, so there's nothing to protect the way
 * the old shared, sign-in-gated Gemini key needed. `available` just means
 * "a provider is configured" (always true given MLX's built-in defaults,
 * false only if the user clears the server URL in AI Settings) — actual
 * reachability is what AI Settings' "Test connection" and the try/catch
 * around every real generate() call are for.
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
} from "@/lib/aiActions";

export interface AIActionsHandle {
  /** A provider is configured — see the module doc comment above. */
  available: boolean;

  streamTasks: (
    planTitle: string,
    description?: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<string>;

  streamSubtasks: (
    taskTitle: string,
    planTitle?: string,
  ) => AsyncGenerator<string>;

  streamMilestones: (
    plan: { title: string; description?: string; startDate?: string; endDate?: string },
    signal?: AbortSignal,
  ) => AsyncGenerator<string>;

  streamMilestoneTasks: (
    milestone: { title: string; description?: string },
    plan: { title: string; description?: string },
    signal?: AbortSignal,
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
    (planTitle: string, description?: string, signal?: AbortSignal): AsyncGenerator<string> =>
      streamGenerateTasks({ title: planTitle, description }, signal),
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
    ): AsyncGenerator<string> => streamGenerateMilestones(plan, signal),
    [],
  );

  const streamMilestoneTasksAction = useCallback(
    (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
    ): AsyncGenerator<string> => streamGenerateMilestoneTasks(milestone, plan, signal),
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
