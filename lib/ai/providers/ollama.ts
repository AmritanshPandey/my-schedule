"use client";

import { getOllamaBaseUrl, getOllamaModel } from "./settings";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";

const REQUEST_TIMEOUT_MS = 30_000;

interface OllamaResponse {
  model?: string;
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

function endpoint(): string {
  return `${getOllamaBaseUrl().replace(/\/+$/, "")}/api/chat`;
}

function signalFor(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function complete(req: AIRequest): Promise<AIResponse> {
  const started = performance.now();
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: getOllamaModel(),
        messages: [{ role: "system", content: req.systemPrompt }, ...req.messages],
        stream: false,
        options: {
          num_predict: req.maxTokens ?? (req.isStrategy ? 1400 : 700),
          temperature: req.temperature ?? 0.4,
        },
      }),
      signal: signalFor(req.signal),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error(`Can't reach Ollama at ${getOllamaBaseUrl()}. Start Ollama and try again.`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`Ollama error ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  let data: OllamaResponse;
  try { data = await response.json() as OllamaResponse; }
  catch { throw new Error("Ollama returned malformed JSON."); }
  const text = data.message?.content;
  if (typeof text !== "string") throw new Error("Ollama response had no message content.");

  const promptTokens = data.prompt_eval_count;
  const completionTokens = data.eval_count;
  return {
    text,
    provider: "ollama",
    model: data.model || getOllamaModel(),
    latencyMs: Math.round(performance.now() - started),
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined,
    },
  };
}

async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  yield (await complete(req)).text;
}

async function testConnection(): Promise<ConnectionResult> {
  try {
    const result = await complete({ messages: [{ role: "user", content: "Reply with OK" }], systemPrompt: "Reply with OK.", maxTokens: 8 });
    return { ok: true, message: `${result.model || getOllamaModel()} connected`, latencyMs: result.latencyMs };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not connect to Ollama." };
  }
}

export const ollamaProvider: AIProvider = {
  id: "ollama",
  label: "Ollama",
  generate: complete,
  streamChat,
  testConnection,
};
