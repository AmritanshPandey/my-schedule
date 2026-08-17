/**
 * AI provider config — which provider is active, and each provider's own
 * settings. Persisted to localStorage, not Firestore, for every provider
 * including remote ones with a user-owned API key: this is deliberate, not
 * an oversight. MLX/Ollama are inherently per-device (they only run on the
 * machine the browser is on). A remote key COULD in principle sync across
 * devices via Firestore, but the original spec for this feature explicitly
 * warned against storing API keys as plain text in Firestore, and this app
 * has no secure server-side secret store to keep it behind instead (static
 * export, no backend) — so local-only, entered per-device, is the safer
 * default until/unless a real secret-storage design is built for it.
 */

import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import type { AIProviderConfig, ProviderKind } from "./types";

const STORAGE_KEY = "planr:ai:provider-state";

export const DEFAULT_MLX_CONFIG: AIProviderConfig = {
  baseUrl: "http://localhost:8080",
  model: "mlx-community/Qwen3-4B-4bit",
};

export const DEFAULT_OLLAMA_CONFIG: AIProviderConfig = {
  baseUrl: "http://localhost:11434",
  model: "qwen3:4b",
};

/** "Custom OpenAI-compatible" by default — covers OpenAI, OpenRouter,
 *  Together, Groq, or any other endpoint that speaks the OpenAI chat-
 *  completions format. Presets in the UI just pre-fill baseUrl/label. */
export const DEFAULT_REMOTE_CONFIG: AIProviderConfig = {
  baseUrl: "",
  model: "",
  apiKey: "",
};

export const REMOTE_PRESETS: { label: string; baseUrl: string }[] = [
  { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { label: "Custom", baseUrl: "" },
];

export interface AIProviderState {
  active: ProviderKind;
  mlx: AIProviderConfig;
  ollama: AIProviderConfig;
  remote: AIProviderConfig;
}

const DEFAULT_STATE: AIProviderState = {
  active: "mlx",
  mlx: DEFAULT_MLX_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  remote: DEFAULT_REMOTE_CONFIG,
};

function normalizeConfig(raw: unknown, fallback: AIProviderConfig): AIProviderConfig {
  if (!raw || typeof raw !== "object") return fallback;
  const p = raw as Partial<AIProviderConfig>;
  return {
    baseUrl: typeof p.baseUrl === "string" ? p.baseUrl.trim() : fallback.baseUrl,
    model: typeof p.model === "string" ? p.model.trim() : fallback.model,
    apiKey: typeof p.apiKey === "string" ? p.apiKey : fallback.apiKey,
  };
}

export function getAIProviderState(): AIProviderState {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<AIProviderState>;
    const active: ProviderKind =
      parsed.active === "mlx" || parsed.active === "ollama" || parsed.active === "openai-compatible"
        ? parsed.active
        : DEFAULT_STATE.active;
    return {
      active,
      mlx: normalizeConfig(parsed.mlx, DEFAULT_MLX_CONFIG),
      ollama: normalizeConfig(parsed.ollama, DEFAULT_OLLAMA_CONFIG),
      remote: normalizeConfig(parsed.remote, DEFAULT_REMOTE_CONFIG),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function setAIProviderState(state: AIProviderState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

/** Convenience for a single provider's config, without touching the others —
 *  every settings-form field saves through this so switching providers never
 *  clobbers a different provider's saved config. */
export function setProviderConfig(kind: ProviderKind, config: AIProviderConfig): AIProviderState {
  const state = getAIProviderState();
  const key = kind === "mlx" ? "mlx" : kind === "ollama" ? "ollama" : "remote";
  const next: AIProviderState = { ...state, [key]: config };
  setAIProviderState(next);
  return next;
}

export function setActiveProvider(kind: ProviderKind): AIProviderState {
  const next: AIProviderState = { ...getAIProviderState(), active: kind };
  setAIProviderState(next);
  return next;
}

// Back-compat aliases for the MLX-only version of this module — kept small
// and thin rather than updating every caller, since MLX being the default
// active provider is still true for a fresh install.
export function getMLXConfig(): AIProviderConfig {
  return getAIProviderState().mlx;
}
export function setMLXConfig(config: AIProviderConfig): void {
  setProviderConfig("mlx", config);
}
