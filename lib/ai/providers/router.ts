/**
 * The provider-agnostic seam. Every call site in the app that generates AI
 * text should go through streamAI()/generateAI() here, never
 * streamGeminiChat()/streamGeminiAction() directly — those stay as the
 * Gemini-specific implementation this file wraps, not something feature code
 * calls itself.
 *
 * streamAI/generateAI are intentionally identical in signature to
 * lib/aiClient.ts's streamGeminiChat/streamGeminiAction, so every existing
 * call site changes only its import and the function name — never its own
 * `for await (const chunk of stream) accumulated += chunk` consumption loop.
 */

import type { IdTokenSource } from "@/lib/aiClient";
import { isAiConfigured } from "@/lib/aiClient";
import { createGeminiProvider } from "./gemini";
import { mlxProvider } from "./mlx";
import { getActiveProviderType } from "./settings";
import type { AIMessage, AIProvider } from "./types";

export type { AIProviderType, AIMessage, AIChatRequest, AIRequest, AIResponse, AIProvider, ConnectionResult } from "./types";

function resolveProvider(user: IdTokenSource | null): AIProvider {
  return getActiveProviderType() === "mlx" ? mlxProvider : createGeminiProvider(user);
}

/** Drop-in replacement for lib/aiClient.ts's streamGeminiChat. */
export function streamAI(
  user: IdTokenSource | null,
  messages: AIMessage[],
  systemPrompt: string,
  isStrategy = false,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return resolveProvider(user).streamChat({ messages, systemPrompt, isStrategy, signal });
}

/** Drop-in replacement for lib/aiClient.ts's streamGeminiAction. */
export function generateAI(
  user: IdTokenSource | null,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAI(user, [{ role: "user", content: userMessage }], systemPrompt, false, signal);
}

/**
 * Generalizes lib/aiClient.ts's isAiConfigured(): "is *some* provider usable
 * right now". MLX needs no auth and no build-time config — it's always
 * nominally available; a server that isn't actually running surfaces as a
 * friendly error at generation time, not as an availability gate here.
 * Gemini's existing "Worker URL configured + signed in" gate is unchanged.
 */
export function isAiAvailable(isGuest: boolean): boolean {
  return getActiveProviderType() === "mlx" ? true : isAiConfigured() && !isGuest;
}
