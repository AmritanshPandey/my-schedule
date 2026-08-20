/**
 * The provider-agnostic seam. Every call site in the app that generates AI
 * text should go through streamAI()/generateAI() here, never provider-specific
 * implementations directly.
 *
 * Every provider keeps the same async-generator contract, so feature call
 * sites do not need to know which connection is active.
 */

import { mlxProvider } from "./mlx";
import { ollamaProvider } from "./ollama";
import { apiProvider } from "./openaiCompatible";
import { getActiveProviderType, getAiConnectionStatus } from "./settings";
import type { AIMessage, AIProvider } from "./types";

export type { AIProviderType, AIMessage, AIChatRequest, AIRequest, AIResponse, AIProvider, ConnectionResult } from "./types";

function resolveProvider(): AIProvider {
  switch (getActiveProviderType()) {
    case "ollama": return ollamaProvider;
    case "api": return apiProvider;
    default: return mlxProvider;
  }
}

/** Provider-agnostic streaming entry point. */
export function streamAI(
  _user: unknown,
  messages: AIMessage[],
  systemPrompt: string,
  isStrategy = false,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return resolveProvider().streamChat({ messages, systemPrompt, isStrategy, signal });
}

/** Provider-agnostic single-message entry point. */
export function generateAI(
  _user: unknown,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAI(null, [{ role: "user", content: userMessage }], systemPrompt, false, signal);
}

/**
 * A provider must pass its connection test before AI surfaces become visible.
 * This avoids presenting controls that can only fail when the local server or
 * remote API is not connected.
 */
export function isAiAvailable(_isGuest: boolean): boolean {
  return getAiConnectionStatus(getActiveProviderType());
}
