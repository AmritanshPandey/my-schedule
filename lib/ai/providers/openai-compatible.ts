/**
 * Generic OpenAI-compatible provider — for any REMOTE API that speaks the
 * OpenAI chat-completions format: OpenAI itself, OpenRouter, Together, Groq,
 * or a custom endpoint. One provider instead of one-per-service, since the
 * request/response shape is identical; only `baseUrl`/`apiKey`/`model` differ
 * (see lib/ai/config.ts's REMOTE_PRESETS for the baseUrl shortcuts the
 * Settings UI offers).
 *
 * Unlike MLX/Ollama (lib/ai/providers/mlx.ts, ollama.ts), this calls a real
 * remote host, not localhost — still called directly from the browser with
 * the user's OWN key (never a shared, developer-owned secret), since this
 * app has no server to hold a secret behind even if it wanted to (static
 * export). Some providers don't allow direct browser calls (no permissive
 * CORS headers) — OpenAI's own API is one of them as of this writing;
 * OpenRouter explicitly does. `testConnection()`'s error message is the
 * signal for that: a network-level failure with no HTTP status back at all
 * usually means CORS, not "server is down."
 */

import type { AIConnectionTestResult, AIGenerateOptions, AIMessage, AIProvider, AIProviderConfig } from "../types";

interface OpenAIChatChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
}

interface OpenAIChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { completion_tokens?: number };
}

function toOpenAIMessages(systemPrompt: string, messages: AIMessage[]): Array<{ role: string; content: string }> {
  return [{ role: "system", content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly kind = "openai-compatible" as const;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKey?.trim()) headers.authorization = `Bearer ${this.config.apiKey.trim()}`;
    return headers;
  }

  async *generate(systemPrompt: string, messages: AIMessage[], opts: AIGenerateOptions = {}): AsyncGenerator<string> {
    if (!this.config.baseUrl?.trim()) throw new Error("Add an API base URL first.");
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: toOpenAIMessages(systemPrompt, messages),
          stream: true,
          max_tokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.7,
        }),
        signal: opts.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new Error(
        `Can't reach ${this.config.baseUrl}. Check the server URL, your connection, and that this provider allows direct browser requests (CORS).`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`API error ${response.status}: ${detail.slice(0, 300)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from the API");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const data = JSON.parse(jsonStr) as OpenAIChatChunk;
          const text = data.choices?.[0]?.delta?.content;
          if (typeof text === "string" && text.length > 0) yield text;
        } catch {
          // skip malformed/partial lines — the next chunk usually completes them
        }
      }
    }
  }

  async testConnection(): Promise<AIConnectionTestResult> {
    if (!this.config.baseUrl?.trim()) return { ok: false, error: "Add an API base URL first." };
    if (!this.config.model?.trim()) return { ok: false, error: "Add a model name first." };
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: "Reply with just: OK" }],
          stream: false,
          max_tokens: 8,
        }),
      });
    } catch {
      return {
        ok: false,
        error: `Can't reach ${this.config.baseUrl}. Check the server URL, your connection, and that this provider allows direct browser requests (CORS) — OpenRouter does, some providers (including OpenAI itself) don't.`,
      };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      const hint = response.status === 401 ? " Check your API key." : "";
      return { ok: false, error: `API error ${response.status}: ${detail.slice(0, 200)}${hint}` };
    }

    let body: OpenAIChatCompletion;
    try {
      body = (await response.json()) as OpenAIChatCompletion;
    } catch {
      return { ok: false, error: "The API responded, but not with valid JSON — check the server URL and model." };
    }

    const elapsedSeconds = (performance.now() - started) / 1000;
    const tokens = body.usage?.completion_tokens;
    return {
      ok: true,
      model: body.model || this.config.model,
      tokensPerSecond: tokens && elapsedSeconds > 0 ? Math.round(tokens / elapsedSeconds) : undefined,
    };
  }

  async listModels(): Promise<string[]> {
    if (!this.config.baseUrl?.trim()) throw new Error("Add an API base URL first.");
    const response = await fetch(`${this.config.baseUrl}/models`, { headers: this.headers() });
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    return (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
  }
}
