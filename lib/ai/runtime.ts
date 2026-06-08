/**
 * AI Runtime Manager — single source of truth for model selection and routing.
 *
 * Users never see model names or runtime configuration.
 * The system auto-selects based on device capability + performance mode preference.
 *
 * Routing:
 *   Desktop + Ollama connected  → Ollama  (strategic depth)
 *   All devices, all actions    → Transformers.js  (embedded, local, offline)
 *   Minimal device + strategic  → none
 */

import type { DeviceTier } from "@/lib/performance/detectLowEndDevice";

export type AIBackend = "ollama" | "transformers" | "none";

export type AIPerformanceMode = "lightweight" | "balanced" | "advanced";

/**
 * Capability tiers — what a model is trusted to do, never shown as model names.
 *   basic    → on-device smallest model (mobile/PWA): break down a task + light task gen
 *   standard → larger on-device model: full creation (plans, bulk tasks, routines, milestones)
 *   coach    → Ollama only: conversational coaching + long-context weekly insight
 */
export type CapabilityLevel = "basic" | "standard" | "coach";

const LEVEL_RANK: Record<CapabilityLevel, number> = {
  basic: 0,
  standard: 1,
  coach: 2,
};

export type AIActionType =
  | "generate-subtasks"
  | "generate-tasks"
  | "generate-milestones"
  | "generate-plan"
  | "weekly-insight"
  | "improve-routine";

export interface AIRoute {
  backend: AIBackend;
}

export const AI_ENABLED_KEY = "planr_ai_enabled";
export const AI_MODE_KEY = "planr_ai_mode";
export const AI_DOWNLOADED_KEY = "planr_ai_downloaded_models";

// ── Downloaded-model registry ───────────────────────────────────────────────────
// Models cached in browser Cache Storage survive reloads, but the in-memory load
// guard does not. We persist which model IDs have finished downloading so the UI
// can show "Ready" (instant load from cache) instead of a misleading download bar.

export function getDownloadedModels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AI_DOWNLOADED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

export function isModelDownloaded(modelId: string): boolean {
  return getDownloadedModels().includes(modelId);
}

export function markModelDownloaded(modelId: string): void {
  if (typeof window === "undefined") return;
  const set = new Set(getDownloadedModels());
  if (set.has(modelId)) return;
  set.add(modelId);
  try {
    localStorage.setItem(AI_DOWNLOADED_KEY, JSON.stringify([...set]));
  } catch { /* storage full / unavailable — non-fatal */ }
}

// ── Model registry ─────────────────────────────────────────────────────────────
// HuggingFace ONNX model IDs — downloaded once, cached in browser Cache Storage.
// Users never see these names.

export const MODELS = {
  // Mobile / lightweight
  smollm2_135m: "HuggingFaceTB/SmolLM2-135M-Instruct",
  smollm2_360m: "HuggingFaceTB/SmolLM2-360M-Instruct",
  smollm2_1b7:  "HuggingFaceTB/SmolLM2-1.7B-Instruct",

  // Desktop embedded
  qwen_0b5:  "onnx-community/Qwen2.5-0.5B-Instruct-ONNX",
  qwen_1b5:  "onnx-community/Qwen2.5-1.5B-Instruct-ONNX",
  qwen_3b:   "onnx-community/Qwen2.5-3B-Instruct-ONNX",
} as const;

// Approximate download sizes in MB (shown in onboarding, not model names)
export const MODEL_SIZES: Record<string, number> = {
  [MODELS.smollm2_135m]: 270,
  [MODELS.smollm2_360m]: 720,
  [MODELS.smollm2_1b7]:  3_400,
  [MODELS.qwen_0b5]:     1_000,
  [MODELS.qwen_1b5]:     3_000,
  [MODELS.qwen_3b]:      6_000,
};

// ── Model → capability tier ────────────────────────────────────────────────────
// Only the smallest model is "basic"; every larger on-device model is "standard".
// "coach" is never an on-device model — it is reached only through Ollama.
export const MODEL_CAPABILITY: Record<string, CapabilityLevel> = {
  [MODELS.smollm2_135m]: "basic",
  [MODELS.smollm2_360m]: "standard",
  [MODELS.smollm2_1b7]:  "standard",
  [MODELS.qwen_0b5]:     "standard",
  [MODELS.qwen_1b5]:     "standard",
  [MODELS.qwen_3b]:      "standard",
};

export function modelCapability(modelId: string): CapabilityLevel {
  return MODEL_CAPABILITY[modelId] ?? "basic";
}

// Friendly model names (shown in settings so users can see exactly what runs).
// Source: downloaded on-demand from the Hugging Face Hub, cached in-browser.
export const MODEL_LABELS: Record<string, string> = {
  [MODELS.smollm2_135m]: "SmolLM2 135M",
  [MODELS.smollm2_360m]: "SmolLM2 360M",
  [MODELS.smollm2_1b7]:  "SmolLM2 1.7B",
  [MODELS.qwen_0b5]:     "Qwen2.5 0.5B",
  [MODELS.qwen_1b5]:     "Qwen2.5 1.5B",
  [MODELS.qwen_3b]:      "Qwen2.5 3B",
};

export function modelLabel(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId;
}

// ── Mode → model mapping ───────────────────────────────────────────────────────

function selectModel(
  mode: AIPerformanceMode,
  tier: DeviceTier,
  isDesktop: boolean,
): string {
  if (isDesktop) {
    if (mode === "lightweight") return MODELS.smollm2_360m;
    if (mode === "balanced")    return MODELS.qwen_0b5;
    return MODELS.qwen_1b5;       // advanced desktop
  }

  // Mobile
  if (tier === "minimal")       return MODELS.smollm2_135m;
  if (mode === "lightweight")   return MODELS.smollm2_135m;
  if (mode === "balanced")      return MODELS.smollm2_360m;
  if (tier === "high")          return MODELS.smollm2_1b7;
  return MODELS.smollm2_360m;   // balanced default
}

export function resolveTransformersModel(
  mode: AIPerformanceMode,
  tier: DeviceTier,
  isDesktop: boolean,
): string {
  return selectModel(mode, tier, isDesktop);
}

// ── Default mode per device ────────────────────────────────────────────────────
// Mobile/PWA defaults to the smallest ("basic") model. Capable phones can raise
// the mode in AI settings to pull a "standard" model. Desktop defaults to a
// "standard" model so full creation works out of the box.

export function defaultPerformanceMode(
  tier: DeviceTier,
  isDesktop = true,
): AIPerformanceMode {
  if (!isDesktop) return "lightweight";
  if (tier === "minimal" || tier === "low") return "lightweight";
  return "balanced";
}

// ── Action capability requirements ─────────────────────────────────────────────

export const ACTION_REQUIRES: Record<AIActionType, CapabilityLevel> = {
  "generate-subtasks":  "basic",     // break down a task
  "generate-tasks":     "basic",     // light task generation (mobile-allowed)
  "generate-plan":      "standard",  // full plan creation
  "generate-milestones":"standard",  // milestone roadmap
  "improve-routine":    "standard",  // routine creation/coaching
  "weekly-insight":     "coach",     // long-context coaching → Ollama only
};

// ── Action availability resolver ───────────────────────────────────────────────

export interface ActionAvailability {
  backend: AIBackend;
  available: boolean;
  lockedReason?: string;
}

export function resolveActionAvailability(
  action: AIActionType,
  opts: {
    tier: DeviceTier;
    isDesktop: boolean;
    ollamaConnected: boolean;
    aiEnabled: boolean;
    modelCapability: CapabilityLevel;
  },
): ActionAvailability {
  const { isDesktop, ollamaConnected, aiEnabled } = opts;
  const required = ACTION_REQUIRES[action];

  // Ollama (desktop) is the top "coach" tier — every action is available.
  if (isDesktop && ollamaConnected) {
    return { backend: "ollama", available: true };
  }

  // Coach-tier actions need Ollama; no on-device model can satisfy them.
  if (required === "coach") {
    return {
      backend: "none",
      available: false,
      lockedReason: "Available on desktop with Ollama",
    };
  }

  // On-device path.
  if (!aiEnabled) {
    return {
      backend: "none",
      available: false,
      lockedReason: "Turn on on-device AI to use this",
    };
  }

  if (LEVEL_RANK[opts.modelCapability] >= LEVEL_RANK[required]) {
    return { backend: "transformers", available: true };
  }

  return {
    backend: "none",
    available: false,
    lockedReason: isDesktop
      ? "Switch to a larger model in AI settings"
      : "Available with the larger desktop model",
  };
}

// ── Route resolver (thin wrapper kept for existing callers) ─────────────────────

export function resolveAIRoute(
  action: AIActionType,
  opts: {
    tier: DeviceTier;
    isDesktop: boolean;
    ollamaConnected: boolean;
    aiEnabled: boolean;
    modelCapability?: CapabilityLevel;
  },
): AIRoute {
  const { backend } = resolveActionAvailability(action, {
    ...opts,
    // When the caller doesn't know the loaded model yet, assume the lowest
    // on-device tier so only basic actions resolve to a backend.
    modelCapability: opts.modelCapability ?? "basic",
  });
  return { backend };
}
