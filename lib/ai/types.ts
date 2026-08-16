/**
 * Provider-agnostic AI types. Nothing in this file knows about MLX, Ollama,
 * or any specific backend — that's the whole point. `lib/aiClient.ts` is the
 * one place that picks a concrete `AIProvider` and hands it to callers.
 */

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/** What a provider needs to reach its server. Every field here is safe to
 *  store in localStorage — none of it is a secret. A provider that DID need
 *  a secret (a remote API key) would hold it server-side instead, the way
 *  the retired Gemini integration held its key as a Worker secret — never
 *  in this config, never in the client bundle. */
export interface AIProviderConfig {
  baseUrl: string;
  model: string;
}

export interface AIConnectionTestResult {
  ok: boolean;
  model?: string;
  tokensPerSecond?: number;
  error?: string;
}

export interface AIGenerateOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * One local or remote model backend. `generate` yields incremental text
 * deltas (never accumulated-so-far text — callers do their own
 * `accumulated += chunk`), matching every existing caller's expectations.
 */
export interface AIProvider {
  readonly kind: string;
  generate(systemPrompt: string, messages: AIMessage[], opts?: AIGenerateOptions): AsyncGenerator<string>;
  testConnection(): Promise<AIConnectionTestResult>;
}
