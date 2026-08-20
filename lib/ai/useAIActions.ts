"use client";

/**
 * useAIActions — unified AI action hook. Every action routes through
 * lib/ai/providers/router.ts, which resolves the active provider. Connection
 * failures are reported by that provider when a request or test is made.
 *
 * All methods return AsyncGenerator<string> so they plug directly into
 * AIActionSheet's onGenerate prop unchanged from before this rewrite.
 */

import { useCallback, useEffect, useState } from "react";
import { isAiAvailable } from "@/lib/ai/providers/router";
import { AI_SETTINGS_CHANGED_EVENT } from "@/lib/ai/providers/settings";
import {
  streamGenerateTasks,
  streamGenerateSubtasks,
  streamGenerateMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
  type AIFollowUp,
} from "@/lib/aiActions";

export interface AIActionsHandle {
  /** AI is enabled; the selected provider reports connection errors separately. */
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
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const refresh = () => setAvailable(isAiAvailable(false));
    refresh();
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const streamTasks = useCallback(
    (planTitle: string, description?: string, signal?: AbortSignal, followUp?: AIFollowUp): AsyncGenerator<string> =>
      streamGenerateTasks(null, { title: planTitle, description }, signal, followUp),
    [],
  );

  const streamSubtasks = useCallback(
    (taskTitle: string, planTitle?: string): AsyncGenerator<string> =>
      streamGenerateSubtasks(null, taskTitle, planTitle),
    [],
  );

  const streamMilestonesAction = useCallback(
    (
      plan: { title: string; description?: string; startDate?: string; endDate?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestones(null, plan, signal, followUp),
    [],
  );

  const streamMilestoneTasksAction = useCallback(
    (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
      followUp?: AIFollowUp,
    ): AsyncGenerator<string> => streamGenerateMilestoneTasks(null, milestone, plan, signal, followUp),
    [],
  );

  const streamWeeklyInsightAction = useCallback(
    (weekContext: string, signal?: AbortSignal): AsyncGenerator<string> | null => {
      if (!available) return null;
      return streamWeeklyInsight(null, weekContext, signal);
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
