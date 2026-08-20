"use client";

/**
 * The MLX provider — talks to a local `mlx_lm.server` (OpenAI-compatible
 * chat-completions) running on the user's own Mac, e.g.:
 *
 *   mlx_lm.server --model mlx-community/Qwen3-4B-4bit --port 8080
 *
 * This is a DIRECT browser fetch, not proxied through any server. That's not
 * a shortcut — it's the only way it can work at all: PlanR's one real server
 * (the Cloudflare Worker) runs in Cloudflare's data centers and has no path
 * to `localhost` on the user's machine. `localhost` means "this machine" to
 * whoever makes the request, so only code running in the same browser tab,
 * on the same Mac as mlx_lm.server, can ever reach it. This is safe
 * specifically because MLX has no API key to protect — unlike Gemini, which
 * correctly stays behind the Worker (see ./gemini.ts).
 *
 * Non-streaming this pass: awaits the full chat-completion response and
 * yields it as a single chunk, satisfying the same AsyncGenerator<string>
 * contract every existing caller already loops over with
 * `for await (const chunk of stream) accumulated += chunk`.
 */

import { getMlxBaseUrl, getMlxModel } from "./settings";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";

// Conservative output ceilings. Qwen3's "thinking" mode can burn an entire
// token budget on hidden reasoning before ever emitting the requested JSON,
// surfacing as `finish_reason: "length"` with empty visible content. A tight
// cap bounds worst-case latency and forces that failure to happen fast
// instead of hanging; the empty-content-plus-"length" case is detected
// explicitly below and reported with a clear, actionable message rather than
// silently handed to the JSON parser as an unexplained empty string.
//
// This does NOT attempt to disable Qwen3's thinking mode via a request
// parameter — that would mean guessing at flag names this session never
// verified against a live mlx_lm.server. If reasoning-burn turns out to be a
// recurring problem in practice, check the installed mlx-lm version's actual
// server flags / chat_template_kwargs support (e.g. an enable_thinking
// toggle) before wiring anything in here.
const DEFAULT_MAX_TOKENS = 700;
const STRATEGY_MAX_TOKENS = 1400;
const REQUEST_TIMEOUT_MS = 30_000;
const PING_TIMEOUT_MS = 8_000;

interface ChatCompletionChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function chatCompletion(req: AIChatRequest): Promise<{ text: string; finishReason?: string }> {
  const baseUrl = getMlxBaseUrl();
  const body = {
    model: getMlxModel(),
    messages: [{ role: "system", content: req.systemPrompt }, ...req.messages],
    max_tokens: req.isStrategy ? STRATEGY_MAX_TOKENS : DEFAULT_MAX_TOKENS,
    temperature: 0.4,
    stream: false,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: combinedSignal(req.signal, REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // The browser deliberately gives the SAME opaque TypeError for
    // connection-refused, a CORS rejection, and (rare on localhost)
    // mixed-content blocking — it never discloses which. The message has to
    // cover all three plausible causes.
    throw new Error(
      `Can't reach the MLX server at ${baseUrl}. Make sure mlx_lm.server is running and reachable from your browser.`,
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`MLX server error ${response.status}: ${errText.slice(0, 200)}`);
  }

  let data: ChatCompletionResponse;
  try {
    data = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new Error("MLX server returned malformed JSON.");
  }

  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (typeof text !== "string") throw new Error("MLX server response had no message content.");
  return { text, finishReason: choice?.finish_reason };
}

async function generate(req: AIRequest): Promise<AIResponse> {
  const started = performance.now();
  const result = await chatCompletion(req);
  if (result.finishReason === "length" && result.text.trim().length === 0) {
    throw new Error(
      "MLX ran out of tokens before producing any output — try a shorter goal, or check mlx_lm.server's reasoning/thinking settings.",
    );
  }
  return {
    text: result.text,
    provider: "mlx",
    model: getMlxModel(),
    latencyMs: Math.round(performance.now() - started),
  };
}

async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  const { text, finishReason } = await chatCompletion(req);
  if (finishReason === "length" && text.trim().length === 0) {
    throw new Error(
      "MLX ran out of tokens before producing any output — try a shorter goal, or check mlx_lm.server's reasoning/thinking settings.",
    );
  }
  yield text;
}

async function testConnection(): Promise<ConnectionResult> {
  const baseUrl = getMlxBaseUrl();
  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: getMlxModel(),
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - start);
    if (!res.ok) return { ok: false, message: `Server responded ${res.status}`, latencyMs };
    return { ok: true, message: "Connected", latencyMs };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, message: "Timed out — is mlx_lm.server running?" };
    }
    return { ok: false, message: `Can't reach ${baseUrl}. Check the URL and that mlx_lm.server is running.` };
  }
}

export const mlxProvider: AIProvider = {
  id: "mlx",
  label: "MLX (local)",
  generate,
  streamChat,
  testConnection,
};
