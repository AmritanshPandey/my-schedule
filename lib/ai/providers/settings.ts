"use client";

/**
 * Live-editable AI provider preferences — localStorage-backed, not env vars.
 * A static-export app has no server to hold "real" env vars for the web
 * bundle anyway (only NEXT_PUBLIC_* values, baked in at build time), and the
 * whole point of a Settings-driven provider picker is changing it without a
 * rebuild. Same guarded pattern as lib/errorTelemetry.ts: "use client",
 * typeof window checks, try/catch around every read/write (Safari Private
 * Browsing throws on access, not just on write).
 */

import type { AIProviderType } from "./types";

const PROVIDER_KEY = "planr-ai-provider";
const MLX_BASE_URL_KEY = "planr-mlx-base-url";
const MLX_MODEL_KEY = "planr-mlx-model";
const OLLAMA_BASE_URL_KEY = "planr-ollama-base-url";
const OLLAMA_MODEL_KEY = "planr-ollama-model";
const API_BASE_URL_KEY = "planr-ai-api-base-url";
const API_MODEL_KEY = "planr-ai-api-model";
const API_KEY_KEY = "planr-ai-api-key";
const CONNECTIONS_KEY = "planr-ai-connections";
export const AI_SETTINGS_CHANGED_EVENT = "planr-ai-settings-changed";

export const DEFAULT_MLX_BASE_URL = "http://localhost:8080";
export const DEFAULT_MLX_MODEL = "mlx-community/Qwen3-4B-4bit";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.2";
export const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_API_MODEL = "gpt-4o-mini";
export const DEFAULT_AI_PROVIDER: AIProviderType = "mlx";

export function getActiveProviderType(): AIProviderType {
  if (typeof window === "undefined") return DEFAULT_AI_PROVIDER;
  try {
    const stored = localStorage.getItem(PROVIDER_KEY);
    return stored === "mlx" || stored === "ollama" || stored === "api" ? stored : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export function setActiveProviderType(type: AIProviderType): void {
  try {
    localStorage.setItem(PROVIDER_KEY, type);
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
  } catch {
    // storage full/unavailable — non-fatal, the picker just won't persist
  }
}

export function getAiConnectionStatus(provider: AIProviderType = getActiveProviderType()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? "{}");
    return stored?.[provider] === true;
  } catch {
    return false;
  }
}

export function setAiConnectionStatus(provider: AIProviderType, connected: boolean): void {
  try {
    const stored = JSON.parse(localStorage.getItem(CONNECTIONS_KEY) ?? "{}") as Record<string, boolean>;
    stored[provider] = connected;
    localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(stored));
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
  } catch {
    // storage unavailable — the feature stays hidden until the next successful check
  }
}

export function getMlxBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_MLX_BASE_URL;
  try {
    return localStorage.getItem(MLX_BASE_URL_KEY)?.trim() || DEFAULT_MLX_BASE_URL;
  } catch {
    return DEFAULT_MLX_BASE_URL;
  }
}

export function setMlxBaseUrl(url: string): void {
  try {
    localStorage.setItem(MLX_BASE_URL_KEY, url.trim());
  } catch {
    // non-fatal
  }
}

export function getMlxModel(): string {
  if (typeof window === "undefined") return DEFAULT_MLX_MODEL;
  try {
    return localStorage.getItem(MLX_MODEL_KEY)?.trim() || DEFAULT_MLX_MODEL;
  } catch {
    return DEFAULT_MLX_MODEL;
  }
}

export function setMlxModel(model: string): void {
  try {
    localStorage.setItem(MLX_MODEL_KEY, model.trim());
  } catch {
    // non-fatal
  }
}

function getStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try { return localStorage.getItem(key)?.trim() || fallback; } catch { return fallback; }
}

function setStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value.trim());
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED_EVENT));
  } catch { /* non-fatal */ }
}

export const getOllamaBaseUrl = () => getStored(OLLAMA_BASE_URL_KEY, DEFAULT_OLLAMA_BASE_URL);
export const setOllamaBaseUrl = (value: string) => setStored(OLLAMA_BASE_URL_KEY, value);
export const getOllamaModel = () => getStored(OLLAMA_MODEL_KEY, DEFAULT_OLLAMA_MODEL);
export const setOllamaModel = (value: string) => setStored(OLLAMA_MODEL_KEY, value);
export const getApiBaseUrl = () => getStored(API_BASE_URL_KEY, DEFAULT_API_BASE_URL);
export const setApiBaseUrl = (value: string) => setStored(API_BASE_URL_KEY, value);
export const getApiModel = () => getStored(API_MODEL_KEY, DEFAULT_API_MODEL);
export const setApiModel = (value: string) => setStored(API_MODEL_KEY, value);
export const getApiKey = () => getStored(API_KEY_KEY, "");
export const setApiKey = (value: string) => setStored(API_KEY_KEY, value);
