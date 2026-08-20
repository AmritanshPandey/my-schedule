/**
 * The AI provider abstraction — the seam that lets PlanR call one `streamAI()`
 * without caring whether it's talking to MLX, Ollama, or an OpenAI-compatible
 * API. All providers are configured by the user and called through one seam.
 *
 * Deliberately small: provider-specific settings stay outside this contract so
 * future providers can be added without changing feature call sites.
 */

export type AIProviderType = "mlx" | "ollama" | "api";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatRequest {
  messages: AIMessage[];
  systemPrompt: string;
  /** Mirrors lib/aiClient.ts's existing `isStrategy` flag — a hint for a
   *  larger output budget, not a raw token count, so each provider can map it
   *  to its own sane ceiling. */
  isStrategy?: boolean;
  signal?: AbortSignal;
}

export interface AIRequest extends AIChatRequest {
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  text: string;
  provider: AIProviderType;
  model?: string;
  latencyMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ConnectionResult {
  ok: boolean;
  /** Human-readable — shown directly in the Settings UI, never a raw stack trace. */
  message: string;
  latencyMs?: number;
}

export interface AIProvider {
  readonly id: AIProviderType;
  readonly label: string;
  generate(request: AIRequest): Promise<AIResponse>;
  /** Providers may return one complete chunk or incremental text deltas. */
  streamChat(request: AIChatRequest): AsyncGenerator<string>;
  testConnection(): Promise<ConnectionResult>;
}
