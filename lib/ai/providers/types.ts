/**
 * The AI provider abstraction — the seam that lets PlanR call one `streamAI()`
 * without caring whether it's talking to Gemini (via the Cloudflare Worker,
 * which holds the real secret) or a local MLX server (a direct browser fetch,
 * since no server this app has can ever reach the user's own `localhost`).
 *
 * Deliberately small: no model registry, no tool-calling, no provider plugin
 * system — sized for exactly the two providers that exist today. Grow it when
 * a third provider actually shows up, not before.
 */

export type AIProviderType = "gemini" | "mlx";

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
  /** AsyncGenerator<string> of incremental text deltas (Gemini streams several;
   *  MLX yields exactly one chunk this pass) — callers never need to know which. */
  streamChat(request: AIChatRequest): AsyncGenerator<string>;
  testConnection(): Promise<ConnectionResult>;
}
