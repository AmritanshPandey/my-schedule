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

/** Browser AI has no server to reach — `baseUrl`/`apiKey` are unused; `model`
 *  is a HuggingFace ONNX repo id, downloaded and cached in-browser on first
 *  use (see lib/ai/providers/browser.ts). Gemma 3 1B (dense, text-only —
 *  not the multimodal "3n" line, which needs a different pipeline class
 *  entirely) is noticeably more capable at following PlanR's JSON-schema
 *  prompts than the previous 0.5B default, at the cost of a bigger
 *  download (~850 MB vs ~400-750 MB) and no WebGPU fp16 fast path yet — see
 *  FP16_SAFE_MODELS in browser.ts, which only ever grows once a model's
 *  been verified to actually generate real output under it, not just load. */
export const DEFAULT_BROWSER_CONFIG: AIProviderConfig = {
  baseUrl: "",
  model: "onnx-community/gemma-3-1b-it-ONNX-GQA",
};

/**
 * Browser model ids that no longer resolve upstream, mapped to their
 * replacement.
 *
 * The id is persisted per device, so a repo disappearing from the Hub breaks
 * that device permanently — changing the default alone only helps installs
 * that never saved one. onnx-community re-published its ports with an
 * explicit `-ONNX` suffix and the old ids now return 401 (not a redirect),
 * which surfaced as "Unauthorized access to file: …/config.json".
 *
 * Only exact matches are rewritten, so a model the user typed themselves is
 * left alone.
 */
const RENAMED_BROWSER_MODELS: Record<string, string> = {
  "onnx-community/SmolLM2-360M-Instruct": "onnx-community/SmolLM2-360M-Instruct-ONNX",
};

export function migrateBrowserModel(model: string): string {
  return RENAMED_BROWSER_MODELS[model] ?? model;
}

export interface AIProviderState {
  active: ProviderKind;
  mlx: AIProviderConfig;
  ollama: AIProviderConfig;
  remote: AIProviderConfig;
  browser: AIProviderConfig;
}

/**
 * Browser AI is the default because it is the only provider that works with
 * nothing installed and nothing configured: MLX and Ollama need a server
 * running on this machine, and the remote provider needs the user's own API
 * key. A fresh install therefore has working AI out of the box, at the cost of
 * a one-time model download on first use (see lib/ai/providers/browser.ts).
 *
 * Only affects installs that have never saved provider state — anyone who has
 * already chosen a provider keeps it, since getAIProviderState() reads theirs
 * from storage before this is consulted.
 */
const DEFAULT_STATE: AIProviderState = {
  active: "browser",
  mlx: DEFAULT_MLX_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  remote: DEFAULT_REMOTE_CONFIG,
  browser: DEFAULT_BROWSER_CONFIG,
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
      parsed.active === "mlx" || parsed.active === "ollama" || parsed.active === "openai-compatible" || parsed.active === "browser"
        ? parsed.active
        : DEFAULT_STATE.active;
    return {
      active,
      mlx: normalizeConfig(parsed.mlx, DEFAULT_MLX_CONFIG),
      ollama: normalizeConfig(parsed.ollama, DEFAULT_OLLAMA_CONFIG),
      remote: normalizeConfig(parsed.remote, DEFAULT_REMOTE_CONFIG),
      browser: (() => {
        const browser = normalizeConfig(parsed.browser, DEFAULT_BROWSER_CONFIG);
        return { ...browser, model: migrateBrowserModel(browser.model) };
      })(),
    };
  } catch {
    return DEFAULT_STATE;
  }
}

/** Fired whenever provider state changes (active provider or any provider's
 *  config) — components that derive UI from it (e.g. a nav subtitle, or a
 *  sheet open elsewhere) can listen instead of polling. */
export const AI_SETTINGS_CHANGED_EVENT = "planr:ai:settings-changed";

export function setAIProviderState(state: AIProviderState): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
}

/** Convenience for a single provider's config, without touching the others —
 *  every settings-form field saves through this so switching providers never
 *  clobbers a different provider's saved config. */
export function setProviderConfig(kind: ProviderKind, config: AIProviderConfig): AIProviderState {
  const state = getAIProviderState();
  const key = kind === "mlx" ? "mlx" : kind === "ollama" ? "ollama" : kind === "browser" ? "browser" : "remote";
  const next: AIProviderState = { ...state, [key]: config };
  setAIProviderState(next);
  return next;
}

export function setActiveProvider(kind: ProviderKind): AIProviderState {
  const next: AIProviderState = { ...getAIProviderState(), active: kind };
  setAIProviderState(next);
  return next;
}

// ── Master AI switch ─────────────────────────────────────────────────────────

const AI_FEATURES_KEY = "planr:ai:features-enabled";

/**
 * One switch for every AI surface — the assistant, the generate buttons, the
 * plan coach, the AI tab itself. Off means the user never sees an AI entry
 * point anywhere, without having to decline each one individually.
 *
 * Per-device (localStorage) like the rest of the AI config, not a synced
 * schedule preference: "don't show me AI" is usually about the machine you're
 * on — a work laptop, a shared device — rather than about the account.
 *
 * Defaults to on. Unlike the provider settings this is stored only once the
 * user actually chooses, so an absent key means "never decided" and reads as
 * enabled.
 */
export function getAIFeaturesEnabled(): boolean {
  return safeGetItem(AI_FEATURES_KEY) !== "0";
}

export function setAIFeaturesEnabled(enabled: boolean): void {
  safeSetItem(AI_FEATURES_KEY, enabled ? "1" : "0");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
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
