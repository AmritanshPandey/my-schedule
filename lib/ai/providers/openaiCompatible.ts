"use client";

import {
  getApiBaseUrl,
  getApiKey,
  getApiModel,
} from "./settings";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";

const REQUEST_TIMEOUT_MS = 30_000;

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  model?: string;
  usage?: AIResponse["usage"];
}

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function signalFor(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function complete(req: AIRequest): Promise<AIResponse> {
  const started = performance.now();
  const model = getApiModel();
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = getApiKey();
  if (key) headers.authorization = `Bearer ${key}`;

  let response: Response;
  try {
    response = await fetch(endpoint(getApiBaseUrl()), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: req.systemPrompt }, ...req.messages],
        max_tokens: req.maxTokens ?? (req.isStrategy ? 1400 : 700),
        temperature: req.temperature ?? 0.4,
        stream: false,
      }),
      signal: signalFor(req.signal),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(`Can't reach the API at ${getApiBaseUrl()}. Check the endpoint and try again.`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`AI API error ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  let data: CompletionResponse;
  try { data = await response.json() as CompletionResponse; }
  catch { throw new Error("The AI API returned malformed JSON."); }

  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("The AI API response had no message content.");
  return {
    text,
    provider: "api",
    model: data.model || model,
    latencyMs: Math.round(performance.now() - started),
    usage: data.usage,
  };
}

async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  yield (await complete(req)).text;
}

async function testConnection(): Promise<ConnectionResult> {
  try {
    const result = await complete({ messages: [{ role: "user", content: "Reply with OK" }], systemPrompt: "Reply with OK.", maxTokens: 8 });
    return { ok: true, message: `${result.model || getApiModel()} connected`, latencyMs: result.latencyMs };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not connect to the AI API." };
  }
}

export const apiProvider: AIProvider = {
  id: "api",
  label: "API",
  generate: complete,
  streamChat,
  testConnection,
};
