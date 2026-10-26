/**
 * Provider-agnostic AI types. Nothing in this file knows about MLX, Ollama,
 * or any specific backend — that's the whole point. `lib/aiClient.ts` is the
 * one place that picks a concrete `AIProvider` and hands it to callers.
 */

export type ProviderKind = "mlx" | "ollama" | "openai-compatible" | "browser";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * What a provider needs to reach its server. `apiKey` is only ever set for a
 * remote provider the user brings their own key to (OpenAI, OpenRouter, a
 * custom OpenAI-compatible endpoint) — MLX and Ollama never use it, since
 * they're local and need no credential. Everything here is stored in
 * localStorage, on THIS device only, entered by the user themselves: this is
 * not the shared, developer-owned secret the old Gemini integration held
 * server-side (worker/src/gemini.ts, since removed) — a user's own key on
 * their own machine is a different threat model, and this app has no server
 * to hold a secret behind even if it wanted to (static export, no backend).
 */
export interface AIProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
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
  /**
   * The action the user already chose, when the UI knows it — e.g. tapping
   * "Create a 30-day fitness plan" is unambiguously a create_plan.
   *
   * Passing it lets a provider skip the hardest part of the job. Without it a
   * model has to infer, from a prompt describing every action type, which one
   * a sentence means; small models spend their whole budget on that and
   * degenerate before producing content. Optional: free-text asks have no
   * hint and still go through the full decide-then-act prompt.
   */
  actionHint?: string;
  /**
   * Titles of recently-rejected AI proposals (see lib/ai/rejectionContext.ts),
   * most recent first. Threaded as its own field rather than smuggled into
   * `systemPrompt`'s text because the browser provider's rewriteForBrowserModel
   * mostly discards that text and rebuilds its own compact prompt — this has
   * to survive that rewrite to reach the model that actually needs it most.
   */
  recentRejections?: string[];
}

/**
 * One local or remote model backend. `generate` yields incremental text
 * deltas (never accumulated-so-far text — callers do their own
 * `accumulated += chunk`), matching every existing caller's expectations.
 * `listModels` is optional — not every provider exposes model discovery.
 */
export interface AIProvider {
  readonly kind: ProviderKind;
  generate(systemPrompt: string, messages: AIMessage[], opts?: AIGenerateOptions): AsyncGenerator<string>;
  testConnection(): Promise<AIConnectionTestResult>;
  listModels?(): Promise<string[]>;
}

/** Per-category system-prompt additions the user can customize — see
 *  lib/ai/instructions.ts. Empty/unset means "use the built-in prompt as-is." */
export interface AIInstructions {
  plan?: string;
  task?: string;
  subtask?: string;
  milestone?: string;
}
