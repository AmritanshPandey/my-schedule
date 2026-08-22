/**
 * The one entry point every AI feature streams through — `streamAIChat`
 * (multi-turn) and `streamAIAction` (one-shot). Neither caller nor consumer
 * needs to know which provider is behind them; this file is the router.
 *
 * Four providers exist (Settings → AI): MLX and Ollama (lib/ai/providers/
 * mlx.ts, ollama.ts — local, talking directly to a server on this machine),
 * a generic OpenAI-compatible remote provider (lib/ai/providers/
 * openai-compatible.ts — OpenAI, OpenRouter, or any custom endpoint, with
 * the user's own API key), and an in-browser provider (lib/ai/providers/
 * browser.ts — runs a small model entirely on-device via Transformers.js/
 * WebGPU, no server of any kind). All are called directly from the browser,
 * not through a server: this app is a static export (`next.config`'s
 * `output: "export"` — no Next.js server anywhere, dev or prod), and even a
 * real server tier couldn't reach `localhost` on a user's own machine for
 * the local providers. See lib/ai/config.ts for how the active provider and
 * each provider's own settings are chosen and persisted.
 *
 * A previous version of this file proxied Gemini through a Cloudflare Worker
 * using a single shared, developer-owned API key with server-enforced daily
 * caps — that's why every function used to take a Firebase user and could
 * throw AiAuthError/AiCapError. None of that applies here: local providers
 * have no per-call cost, and a remote provider's key is the user's own, so
 * there's nothing to protect with sign-in or a usage cap.
 */

import { getAIProviderState } from "./ai/config";
import { MLXProvider } from "./ai/providers/mlx";
import { OllamaProvider } from "./ai/providers/ollama";
import { OpenAICompatibleProvider } from "./ai/providers/openai-compatible";
import { BrowserProvider } from "./ai/providers/browser";
import type { AIMessage, AIProvider } from "./ai/types";

export type { AIMessage };

/** The active AI request couldn't reach its provider at all — as opposed to
 *  the provider responding with an error, which means it's at least running.
 *  Callers show this directly; it's already written to be user-facing. */
export class AiConnectionError extends Error {
  constructor(message = "Can't reach your AI provider — check it's running and configured correctly.") {
    super(message);
    this.name = "AiConnectionError";
  }
}

/** Local providers always have a usable default; a remote provider needs at
 *  least a base URL and model. "Configured" means "has enough to try," not
 *  "verified reachable" — that's what testConnection() (AI Settings) and the
 *  try/catch around every real generate() call are for. */
export function isAiConfigured(): boolean {
  const state = getAIProviderState();
  if (state.active === "openai-compatible") return !!state.remote.baseUrl && !!state.remote.model;
  return true;
}

export function activeProvider(): AIProvider {
  const state = getAIProviderState();
  switch (state.active) {
    case "ollama":
      return new OllamaProvider(state.ollama);
    case "openai-compatible":
      return new OpenAICompatibleProvider(state.remote);
    case "browser":
      return new BrowserProvider(state.browser);
    case "mlx":
    default:
      return new MLXProvider(state.mlx);
  }
}

/**
 * Multi-turn streaming chat. `maxTokens` is a ceiling, not a forced length —
 * pass a larger budget for surfaces that might produce long output (a full
 * plan with bundled tasks, a written strategy doc) and a smaller one for
 * quick single-turn replies.
 */
export function streamAIChat(
  messages: AIMessage[],
  systemPrompt: string,
  maxTokens = 1024,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return activeProvider().generate(systemPrompt, messages, { maxTokens, signal });
}

/** One-shot generation from a single user message — backs every structured
 *  generator in lib/aiActions.ts (tasks/subtasks/milestones/insight). */
export function streamAIAction(
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAIChat([{ role: "user", content: userMessage }], systemPrompt, 1024, signal);
}
