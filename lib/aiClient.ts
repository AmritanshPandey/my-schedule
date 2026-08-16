/**
 * The one entry point every AI feature streams through — `streamAIChat`
 * (multi-turn) and `streamAIAction` (one-shot). Neither caller nor consumer
 * needs to know which provider is behind them; this file is the router.
 *
 * Today there's exactly one provider (MLX, lib/ai/providers/mlx.ts), talking
 * directly to a local `mlx_lm.server` from the browser — see mlx.ts's own
 * comment for why that's a direct client→localhost call rather than routed
 * through a server. This app is a static export: `next.config`'s
 * `output: "export"` means there is no Next.js server anywhere, dev or prod,
 * so "the AI Gateway" is necessarily a client-side router, not a server tier.
 *
 * A previous version of this file proxied Gemini through a Cloudflare Worker
 * (worker/src/index.ts's old `POST /ai/chat`, since removed) using a single
 * shared, developer-owned API key with server-enforced daily caps — that's
 * why every function used to take a Firebase user and could throw
 * AiAuthError/AiCapError. None of that applies to a local model with no per-
 * call cost, so this version drops the auth/cap machinery entirely. Adding a
 * remote provider back later (a real hosted API) would reintroduce a need for
 * server-held secrets for THAT provider specifically — it wouldn't change
 * this file's shape, just add a second case in `activeProvider()`.
 */

import { getMLXConfig } from "./ai/config";
import { MLXProvider } from "./ai/providers/mlx";
import type { AIMessage } from "./ai/types";

export type { AIMessage };

/** The active AI request couldn't reach its provider at all — as opposed to
 *  the provider responding with an error, which means it's at least running.
 *  Callers show this directly; it's already written to be user-facing. */
export class AiConnectionError extends Error {
  constructor(message = "Can't reach your local AI — make sure MLX is running.") {
    super(message);
    this.name = "AiConnectionError";
  }
}

/** MLX always has a usable default (localhost:8080, Qwen3-4B) — "configured"
 *  here means "has a non-empty base URL to try," not "verified reachable."
 *  Actual reachability is what `testConnection()` (surfaced in AI Settings)
 *  and the try/catch around every real `generate()` call are for. */
export function isAiConfigured(): boolean {
  return !!getMLXConfig().baseUrl;
}

function activeProvider(): MLXProvider {
  return new MLXProvider(getMLXConfig());
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
