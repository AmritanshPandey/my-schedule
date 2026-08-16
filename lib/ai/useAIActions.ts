"use client";

/**
 * useAIActions — unified AI action hook. Every action runs through Gemini via
 * the Cloudflare Worker proxy (lib/aiClient.ts) — there's no backend routing
 * here anymore (this hook used to branch between a user-run Ollama server and
 * an in-browser Transformers.js runtime; both are gone, replaced by one
 * shared, sign-in-gated cloud backend). `available` just means "AI is
 * configured and the caller is signed in" — the actual per-user/global rate
 * limiting happens server-side in the Worker, not here, so it can't be
 * bypassed by anything client-side.
 *
 * All methods return AsyncGenerator<string> so they plug directly into
 * AIActionSheet's onGenerate prop unchanged from before this rewrite.
 */

import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { isAiConfigured } from "@/lib/aiClient";
import {
  streamGenerateTasks,
  streamGenerateSubtasks,
  streamGenerateMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
} from "@/lib/aiActions";

export interface AIActionsHandle {
  /** AI is configured (Worker URL set at build time) and the caller is signed in. */
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
   *  the insight in that case, matching the old Ollama-only gating shape. */
  streamWeeklyInsight: (
    weekContext: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<string> | null;
}

export function useAIActions(): AIActionsHandle {
  const { user, isGuest } = useAuth();
  const available = isAiConfigured() && !isGuest;

  const streamTasks = useCallback(
    (planTitle: string, description?: string, signal?: AbortSignal): AsyncGenerator<string> =>
      streamGenerateTasks(user, { title: planTitle, description }, signal),
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
    ): AsyncGenerator<string> => streamGenerateMilestones(user, plan, signal),
    [user],
  );

  const streamMilestoneTasksAction = useCallback(
    (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
    ): AsyncGenerator<string> => streamGenerateMilestoneTasks(user, milestone, plan, signal),
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
