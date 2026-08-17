/**
 * Ollama provider — talks directly to a local `ollama serve` instance
 * (default port 11434). Uses Ollama's NATIVE `/api/chat` and `/api/tags`
 * endpoints rather than its OpenAI-compatible shim: the native API streams
 * newline-delimited JSON (simpler to parse reliably than SSE) and `/api/tags`
 * is what makes "Detect models" possible — the OpenAI-compat surface doesn't
 * reliably expose the same model list on every Ollama version.
 *
 * Like MLX (lib/ai/providers/mlx.ts), this calls `baseUrl` directly from the
 * browser — see that file's comment for why (no server tier exists in this
 * app, and a real one couldn't reach the user's own localhost anyway).
 */

import type { AIConnectionTestResult, AIGenerateOptions, AIMessage, AIProvider, AIProviderConfig } from "../types";

interface OllamaChatChunk {
  message?: { content?: string };
  done?: boolean;
  eval_count?: number;
  eval_duration?: number; // nanoseconds
}

function toOllamaMessages(systemPrompt: string, messages: AIMessage[]): Array<{ role: string; content: string }> {
  return [{ role: "system", content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
}

export class OllamaProvider implements AIProvider {
  readonly kind = "ollama" as const;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  async *generate(systemPrompt: string, messages: AIMessage[], opts: AIGenerateOptions = {}): AsyncGenerator<string> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          messages: toOllamaMessages(systemPrompt, messages),
          stream: true,
          options: { temperature: opts.temperature ?? 0.7, num_predict: opts.maxTokens ?? 1024 },
        }),
        signal: opts.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new Error(`Can't reach Ollama at ${this.config.baseUrl}. Make sure "ollama serve" is running.`);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama error ${response.status}: ${detail}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body from Ollama");

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
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as OllamaChatChunk;
          const text = data.message?.content;
          if (typeof text === "string" && text.length > 0) yield text;
        } catch {
          // skip malformed/partial lines — the next chunk usually completes them
        }
      }
    }
  }

  async testConnection(): Promise<AIConnectionTestResult> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "user", content: "Reply with just: OK" }],
          stream: false,
          options: { num_predict: 8 },
        }),
      });
    } catch {
      return { ok: false, error: `Can't reach Ollama at ${this.config.baseUrl}. Make sure "ollama serve" is running.` };
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      return { ok: false, error: `Ollama responded with an error (${response.status}): ${detail.slice(0, 200)}` };
    }

    let body: OllamaChatChunk;
    try {
      body = (await response.json()) as OllamaChatChunk;
    } catch {
      return { ok: false, error: "Ollama responded, but not with valid JSON — check the server URL and model." };
    }

    const tokensPerSecond =
      body.eval_count && body.eval_duration
        ? Math.round(body.eval_count / (body.eval_duration / 1e9))
        : undefined;
    return { ok: true, model: this.config.model, tokensPerSecond };
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.config.baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Ollama responded with ${response.status}`);
    const body = (await response.json()) as { models?: Array<{ name?: string }> };
    return (body.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === "string");
  }
}
