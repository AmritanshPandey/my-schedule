"use client";

/**
 * BrowserLocalProvider — runs a small language model entirely in-browser using
 * @huggingface/transformers (Transformers.js) with WebGPU acceleration where
 * available, falling back to WASM on devices without WebGPU.
 *
 * Design principles:
 * ─────────────────
 * • No cloud API calls. All inference happens on the user's own device.
 * • Lazy init: the model pipeline is NOT created on page load. It initialises
 *   the first time a request arrives, so the browser stays snappy until the
 *   user explicitly triggers an AI feature.
 * • Singleton: one pipeline shared across all requests; re-entrant callers
 *   wait for the in-flight initialisation to complete rather than starting a
 *   second download.
 * • WebGPU → WASM fallback: attempts GPU-accelerated inference and silently
 *   falls back to the WASM/CPU backend when the browser or hardware doesn't
 *   support WebGPU.
 * • Progress events: dispatches `planr-browser-ai-status` CustomEvents on
 *   `window` so any UI component can render a live download / init indicator
 *   without being coupled to this module.
 *
 * Status event shape (BrowserAIStatusEvent):
 *   { phase: "loading"|"ready"|"error", progress?: number, message?: string }
 *
 * Integration:
 *   This module implements the same AIProvider interface as the MLX, Ollama,
 *   and OpenAI-compatible providers. The router in providers/router.ts picks it
 *   when the user selects the "browser" provider in Settings.
 */

import { getBrowserModel, BROWSER_AI_STATUS_EVENT } from "./settings";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";

// ─── Status event ────────────────────────────────────────────────────────────

export interface BrowserAIStatus {
  phase: "loading" | "ready" | "error";
  /** 0–100 during download, absent after ready/error. */
  progress?: number;
  message?: string;
}

function emitStatus(status: BrowserAIStatus): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BrowserAIStatus>(BROWSER_AI_STATUS_EVENT, { detail: status }));
}

// ─── Pipeline singleton ───────────────────────────────────────────────────────

import type { TextGenerationPipeline } from "@huggingface/transformers";

let _pipeline: TextGenerationPipeline | null = null;
let _initPromise: Promise<TextGenerationPipeline> | null = null;
let _loadedModel = "";

async function getPipeline(): Promise<TextGenerationPipeline> {
  const model = getBrowserModel();

  // Re-use the cached pipeline if the model hasn't changed.
  if (_pipeline && _loadedModel === model) return _pipeline;

  // If a load is already in-flight (another concurrent caller), await it.
  if (_initPromise) return _initPromise;

  _initPromise = (async (): Promise<TextGenerationPipeline> => {
    emitStatus({ phase: "loading", progress: 0, message: "Initialising…" });

    const { pipeline, env } = await import("@huggingface/transformers");

    // Allow the library to cache model files in the browser's Cache API.
    env.useBrowserCache = true;
    // Never try to load from a local filesystem path.
    env.allowLocalModels = false;

    // Progress callback — converts raw file-download progress to a 0-100
    // percentage and forwards it as a window event so the UI can react.
    function onProgress(event: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) {
      if (event.status === "progress" && typeof event.progress === "number") {
        emitStatus({
          phase: "loading",
          progress: Math.round(event.progress),
          message: event.file ? `Downloading ${event.file.split("/").pop()}…` : "Downloading model…",
        });
      } else if (event.status === "initiate") {
        emitStatus({ phase: "loading", progress: 0, message: "Preparing…" });
      } else if (event.status === "done") {
        emitStatus({ phase: "loading", progress: 100, message: "Loading into memory…" });
      }
    }

    // Detect WebGPU availability; fall back to WASM/CPU.
    const device =
      typeof navigator !== "undefined" && "gpu" in navigator
        ? "webgpu"
        : "wasm";

    // Cast to TextGenerationPipeline — we always call pipeline("text-generation")
    // so the specific union member is known even though TypeScript can't narrow it.
    let pipe: TextGenerationPipeline;
    try {
      pipe = (await pipeline("text-generation", model, {
        device,
        progress_callback: onProgress,
      })) as TextGenerationPipeline;
    } catch (gpuErr) {
      if (device === "webgpu") {
        // WebGPU init failed (driver issue, unsupported GPU, etc.) — retry on WASM.
        emitStatus({ phase: "loading", progress: 0, message: "Falling back to CPU…" });
        pipe = (await pipeline("text-generation", model, {
          device: "wasm",
          progress_callback: onProgress,
        })) as TextGenerationPipeline;
      } else {
        throw gpuErr;
      }
    }

    _pipeline = pipe;
    _loadedModel = model;
    _initPromise = null;
    emitStatus({ phase: "ready", message: model });
    return pipe;
  })().catch((err) => {
    _initPromise = null;
    const message = err instanceof Error ? err.message : "Unknown error loading model.";
    emitStatus({ phase: "error", message });
    throw err;
  });

  return _initPromise;
}

// ─── Inference ────────────────────────────────────────────────────────────────

/**
 * Build a single-string prompt from the request.
 * Follows the standard chat-template format understood by Qwen2.5 / Qwen3.
 */
function buildPrompt(req: AIRequest): { messages: Array<{ role: string; content: string }> } {
  return {
    messages: [
      { role: "system", content: req.systemPrompt },
      ...req.messages,
    ],
  };
}

async function complete(req: AIRequest): Promise<AIResponse> {
  const started = performance.now();
  const pipe = await getPipeline();

  const maxTokens = req.maxTokens ?? (req.isStrategy ? 1024 : 512);
  const temperature = req.temperature ?? 0.4;

  // `apply_chat_template` is called internally by the pipeline when `messages`
  // are passed as an array of {role, content} objects.
  const result = await pipe(buildPrompt(req).messages, {
    max_new_tokens: maxTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false,
    ...(req.signal ? { signal: req.signal } : {}),
  });

  // Transformers.js returns Array<{ generated_text: string | MessageOutput[] }>
  const raw = Array.isArray(result) ? result[0] : result;
  let text = "";
  if (typeof raw?.generated_text === "string") {
    text = raw.generated_text;
  } else if (Array.isArray(raw?.generated_text)) {
    // Some pipelines return the messages array; extract assistant turn.
    const last = raw.generated_text[raw.generated_text.length - 1] as unknown;
    if (typeof last === "string") {
      text = last;
    } else if (last && typeof last === "object" && "content" in last) {
      const content = (last as { content: unknown }).content;
      text = typeof content === "string" ? content : "";
    }
  }

  return {
    text,
    provider: "browser",
    model: getBrowserModel(),
    latencyMs: Math.round(performance.now() - started),
  };
}

/** Stream by yielding the full completion as a single chunk (same pattern as Ollama). */
async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  yield (await complete(req)).text;
}

async function testConnection(): Promise<ConnectionResult> {
  try {
    const result = await complete({
      messages: [{ role: "user", content: "Reply with: OK" }],
      systemPrompt: "You are a terse assistant. Reply only with the text requested.",
      maxTokens: 16,
      temperature: 0,
    });
    const ok = result.text.trim().length > 0;
    return {
      ok,
      message: ok
        ? `${getBrowserModel()} ready (${result.latencyMs}ms)`
        : "Model loaded but returned no output. Try a different model.",
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not initialise in-browser model.",
    };
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const browserProvider: AIProvider = {
  id: "browser",
  label: "On-device (browser)",
  generate: complete,
  streamChat,
  testConnection,
};

/**
 * Imperatively pre-warm the pipeline. Call this when the user explicitly opts
 * into browser AI in Settings (not on app startup) so the download starts in
 * the background before their first actual request.
 */
export function prewarmBrowserAI(): void {
  getPipeline().catch(() => {
    // Error is already surfaced via the status event — no need to re-throw here.
  });
}
