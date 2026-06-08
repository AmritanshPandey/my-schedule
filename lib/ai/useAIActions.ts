"use client";

/**
 * useAIActions — unified AI action hook.
 *
 * Routes all AI actions to the best available backend:
 *   Ollama configured  → Ollama (higher quality, streaming)
 *   Embedded enabled   → Transformers.js worker (offline, private)
 *   Neither            → unavailable (show enable prompt)
 *
 * All methods return AsyncGenerator<string> so they plug directly into
 * AIActionSheet's onGenerate prop regardless of which backend runs.
 */

import { useCallback } from "react";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import {
  resolveActionAvailability,
  type AIActionType,
  type ActionAvailability,
  type CapabilityLevel,
} from "@/lib/ai/runtime";
import { getDeviceCapabilities } from "@/lib/performance/detectLowEndDevice";
import {
  streamGenerateTasks,
  streamGenerateSubtasks,
  streamGenerateMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
  parseGeneratedTasks,
  parseGeneratedMilestones,
  type AIGeneratedTask,
  type AIGeneratedMilestone,
} from "@/lib/aiActions";
import {
  OLLAMA_URL_KEY,
  OLLAMA_MODEL_KEY,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/lib/ai";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Wraps a Promise result as a single-chunk AsyncGenerator so it's compatible
// with streaming consumers (AIActionSheet expects AsyncGenerator<string>).
async function* promiseToStream(fn: () => Promise<string>): AsyncGenerator<string> {
  yield await fn();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface AIActionsHandle {
  /** Any AI backend is available and ready to use. */
  available: boolean;
  /** Ollama is configured (URL + model set in settings). */
  hasOllama: boolean;
  /** Embedded AI (Transformers.js) is enabled and loaded. */
  hasEmbedded: boolean;
  /** Highest capability tier currently reachable (coach via Ollama, else on-device). */
  capabilityLevel: CapabilityLevel;
  /** Whether a specific action is available, and why it's locked if not. */
  availability: (action: AIActionType) => ActionAvailability;

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

  /** Weekly insight — Ollama only (needs long context). Returns null if unavailable. */
  streamWeeklyInsight: (
    weekContext: string,
    signal?: AbortSignal,
  ) => AsyncGenerator<string> | null;
}

export function useAIActions(
  ollamaUrlProp?: string,
  ollamaModelProp?: string,
): AIActionsHandle {
  const runtime = useAIRuntime();

  // Read Ollama config from props first, fall back to localStorage
  const ollamaUrl =
    ollamaUrlProp ||
    (typeof window !== "undefined" ? localStorage.getItem(OLLAMA_URL_KEY) : null) ||
    DEFAULT_OLLAMA_URL;
  const ollamaModel =
    ollamaModelProp ||
    (typeof window !== "undefined" ? localStorage.getItem(OLLAMA_MODEL_KEY) : null) ||
    DEFAULT_OLLAMA_MODEL;

  // Ollama is "configured" if a non-default URL is set OR the user explicitly stored a model
  const hasOllama = !!(
    ollamaUrlProp ||
    (typeof window !== "undefined" && localStorage.getItem(OLLAMA_URL_KEY))
  );
  const hasEmbedded = runtime.enabled && runtime.status === "ready";
  const available = hasOllama || hasEmbedded || runtime.enabled;

  const { tier, isDesktop } = getDeviceCapabilities();
  const capabilityLevel: CapabilityLevel = hasOllama ? "coach" : runtime.capabilityLevel;

  const availability = useCallback(
    (action: AIActionType): ActionAvailability =>
      resolveActionAvailability(action, {
        tier,
        isDesktop,
        ollamaConnected: hasOllama,
        aiEnabled: runtime.enabled,
        modelCapability: runtime.capabilityLevel,
      }),
    [tier, isDesktop, hasOllama, runtime.enabled, runtime.capabilityLevel],
  );

  const streamTasks = useCallback(
    async function* (
      planTitle: string,
      description?: string,
      signal?: AbortSignal,
    ): AsyncGenerator<string> {
      if (hasOllama) {
        return yield* streamGenerateTasks(ollamaUrl, ollamaModel, { title: planTitle, description }, signal);
      }
      return yield* promiseToStream(async () => {
        const tasks = await runtime.generateTasks(planTitle, description);
        return JSON.stringify(tasks);
      });
    },
    [hasOllama, ollamaUrl, ollamaModel, runtime],
  );

  const streamSubtasks = useCallback(
    async function* (taskTitle: string, planTitle?: string): AsyncGenerator<string> {
      if (hasOllama) {
        return yield* streamGenerateSubtasks(ollamaUrl, ollamaModel, taskTitle, planTitle);
      }
      return yield* promiseToStream(async () => {
        const steps = await runtime.generateSubtasks(taskTitle, planTitle);
        return JSON.stringify(steps);
      });
    },
    [hasOllama, ollamaUrl, ollamaModel, runtime],
  );

  const streamMilestonesAction = useCallback(
    async function* (
      plan: { title: string; description?: string; startDate?: string; endDate?: string },
      signal?: AbortSignal,
    ): AsyncGenerator<string> {
      if (hasOllama) {
        return yield* streamGenerateMilestones(ollamaUrl, ollamaModel, plan, signal);
      }
      // Embedded: generate tasks and reshape as milestones
      return yield* promiseToStream(async () => {
        const tasks = await runtime.generateTasks(
          plan.title,
          plan.description ? `Create milestone-style phases: ${plan.description}` : undefined,
        );
        const milestones: AIGeneratedMilestone[] = tasks.map((t, i) => ({
          title: t.title,
          description: `Phase ${i + 1} of the plan`,
          targetDate: undefined,
        }));
        return JSON.stringify(milestones);
      });
    },
    [hasOllama, ollamaUrl, ollamaModel, runtime],
  );

  const streamMilestoneTasksAction = useCallback(
    async function* (
      milestone: { title: string; description?: string },
      plan: { title: string; description?: string },
      signal?: AbortSignal,
    ): AsyncGenerator<string> {
      if (hasOllama) {
        return yield* streamGenerateMilestoneTasks(ollamaUrl, ollamaModel, milestone, plan, signal);
      }
      return yield* promiseToStream(async () => {
        const tasks = await runtime.generateTasks(
          plan.title,
          `For milestone "${milestone.title}": ${milestone.description ?? ""}`,
        );
        return JSON.stringify(tasks);
      });
    },
    [hasOllama, ollamaUrl, ollamaModel, runtime],
  );

  const streamWeeklyInsightAction = useCallback(
    (weekContext: string, signal?: AbortSignal): AsyncGenerator<string> | null => {
      if (!hasOllama) return null;
      return streamWeeklyInsight(ollamaUrl, ollamaModel, weekContext, signal);
    },
    [hasOllama, ollamaUrl, ollamaModel],
  );

  return {
    available,
    hasOllama,
    hasEmbedded,
    capabilityLevel,
    availability,
    streamTasks,
    streamSubtasks,
    streamMilestones: streamMilestonesAction,
    streamMilestoneTasks: streamMilestoneTasksAction,
    streamWeeklyInsight: streamWeeklyInsightAction,
  };
}
