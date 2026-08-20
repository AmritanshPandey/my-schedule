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

export const DEFAULT_MLX_BASE_URL = "http://localhost:8080";
export const DEFAULT_MLX_MODEL = "mlx-community/Qwen3-4B-4bit";
export const DEFAULT_AI_PROVIDER: AIProviderType = "mlx";

export function getActiveProviderType(): AIProviderType {
  if (typeof window === "undefined") return DEFAULT_AI_PROVIDER;
  try {
    const stored = localStorage.getItem(PROVIDER_KEY);
    return stored === "gemini" || stored === "mlx" ? stored : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

export function setActiveProviderType(type: AIProviderType): void {
  try {
    localStorage.setItem(PROVIDER_KEY, type);
  } catch {
    // storage full/unavailable — non-fatal, the picker just won't persist
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
