/**
 * MLX provider — talks directly to a local `mlx_lm.server` instance
 * (`mlx_lm.server --model <name> --port 8080`), which exposes an
 * OpenAI-compatible `POST /v1/chat/completions` endpoint.
 *
 * This calls `baseUrl` directly from the browser, not through a server proxy.
 * That's deliberate, not an oversight: this app is a static export (no
 * Next.js server exists, in dev or prod — see lib/aiClient.ts's top comment),
 * and even a real server tier couldn't reach `localhost:8080` on a USER's
 * machine from wherever it was deployed. The browser tab is the only process
 * that's ever on the same machine as the MLX server it's talking to.
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

/** Network-level failure reaching the server at all (refused, DNS, timeout) —
 *  distinct from the server responding with an error status, which means it's
 *  at least running. Lets callers give a much more specific "start your MLX
 *  server" message instead of a generic one. */
export class MLXUnreachableError extends Error {
  constructor(baseUrl: string) {
    super(`Can't reach MLX at ${baseUrl}. Make sure your local MLX server is running.`);
    this.name = "MLXUnreachableError";
  }
}

export class MLXProvider implements AIProvider {
  readonly kind = "mlx";
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async *generate(systemPrompt: string, messages: AIMessage[], opts: AIGenerateOptions = {}): AsyncGenerator<string> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      throw new MLXUnreachableError(this.config.baseUrl);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`MLX error ${response.status}: ${detail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from MLX server");

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
    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: "Reply with just: OK" }],
          stream: false,
          max_tokens: 8,
        }),
      });
    } catch {
      return { ok: false, error: `Can't reach MLX at ${this.config.baseUrl}. Make sure your local MLX server is running.` };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      return { ok: false, error: `MLX responded with an error (${response.status}): ${detail.slice(0, 200)}` };
    }

    let body: OpenAIChatCompletion;
    try {
      body = (await response.json()) as OpenAIChatCompletion;
    } catch {
      return { ok: false, error: "MLX responded, but not with valid JSON — check the server URL and model." };
    }

    const elapsedSeconds = (performance.now() - started) / 1000;
    const tokens = body.usage?.completion_tokens;
    return {
      ok: true,
      model: body.model || this.config.model,
      tokensPerSecond: tokens && elapsedSeconds > 0 ? Math.round(tokens / elapsedSeconds) : undefined,
    };
  }
}
