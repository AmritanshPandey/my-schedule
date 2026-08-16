/**
 * MLX provider config — persisted to localStorage, not Firestore. This is
 * deliberate: MLX only ever runs on the machine the browser is on, so it's
 * inherently per-device, the same way "which port is my dev server on" isn't
 * something you'd sync across devices. If a remote provider (a real hosted
 * API) is added later, ITS config can live in Firestore since it's actually
 * portable across the user's devices — that's a decision for that provider,
 * not this one.
 */

import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import type { AIProviderConfig } from "./types";

const STORAGE_KEY = "planr:ai:mlx-config";

export const DEFAULT_MLX_CONFIG: AIProviderConfig = {
  baseUrl: "http://localhost:8080",
  model: "mlx-community/Qwen3-4B-4bit",
};

export function getMLXConfig(): AIProviderConfig {
  const raw = safeGetItem(STORAGE_KEY);
  if (!raw) return DEFAULT_MLX_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<AIProviderConfig>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : DEFAULT_MLX_CONFIG.baseUrl,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : DEFAULT_MLX_CONFIG.model,
    };
  } catch {
    return DEFAULT_MLX_CONFIG;
  }
}

export function setMLXConfig(config: AIProviderConfig): void {
  safeSetItem(STORAGE_KEY, JSON.stringify(config));
}
