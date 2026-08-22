"use client";

/**
 * BrowserLocalProvider — runs a small language model entirely in-browser using
 * @huggingface/transformers (Transformers.js) with WebGPU acceleration where
 * available, falling back to WASM on devices without WebGPU.
 *
 * Design principles:
 * ─────────────────
 * • No cloud API calls. All inference happens on the user's own device.
 * • Lazy init: the pipeline is NOT created on page load. It initialises the
 *   first time a request arrives, keeping the browser snappy until the user
 *   explicitly triggers an AI feature.
 * • Singleton: one pipeline shared across all requests. Re-entrant callers
 *   await the in-flight initialisation promise rather than starting a second
 *   download.
 * • WebGPU → WASM fallback: attempts GPU-accelerated inference and silently
 *   falls back to the WASM/CPU backend when the browser or hardware doesn't
 *   support WebGPU.
 * • q4 quantization: enforced at pipeline() call time via `dtype: "q4"` so
 *   Transformers.js fetches the model_q4.onnx variant (~100–140 MB for
 *   SmolLM2-360M) rather than the larger fp16 default.
 * • Real token streaming: TextStreamer callbacks are bridged to an AsyncGenerator
 *   via a queue, giving the UI progressive "Found N tasks…" updates.
 * • PlanR-specialized prompts: all requests are rewritten via rewriteForBrowserModel()
 *   from browserPrompts.ts before inference — compact, few-shot-guided prompts
 *   tuned for <500M instruction models. aiActions.ts is not modified.
 * • Progress events: planr-browser-ai-status CustomEvents on window so any UI
 *   component can render a live download indicator without coupling.
 *
 * Status event shape (BrowserAIStatus):
 *   { phase: "loading"|"ready"|"error", progress?: number, message?: string }
 */

import { getBrowserModel, BROWSER_AI_STATUS_EVENT } from "./settings";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";
import { rewriteForBrowserModel, type BrowserAIChatRequest } from "./browserPrompts";
import type { TextGenerationPipeline, PreTrainedTokenizer } from "@huggingface/transformers";

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

// TextStreamer is stored after the first dynamic import so streamChat can use it
// without a redundant await import(). Type is the class constructor, not an instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _TextStreamer: (new (tokenizer: PreTrainedTokenizer, opts: Record<string, unknown>) => any) | null = null;

let _pipeline: TextGenerationPipeline | null = null;
let _initPromise: Promise<TextGenerationPipeline> | null = null;
let _loadedModel = "";

async function getPipeline(): Promise<TextGenerationPipeline> {
  const model = getBrowserModel();

  // Return the cached pipeline if the model hasn't changed.
  if (_pipeline && _loadedModel === model) return _pipeline;

  // If a load is already in-flight, await it (deduplication).
  if (_initPromise) return _initPromise;

  _initPromise = (async (): Promise<TextGenerationPipeline> => {
    emitStatus({ phase: "loading", progress: 0, message: "Initialising…" });

    const { pipeline, env, TextStreamer } = await import("@huggingface/transformers");
    // Store TextStreamer for use in streamChat without re-importing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _TextStreamer = TextStreamer as any;

    // Use the browser's built-in Cache API for model files (persists across reloads).
    env.useBrowserCache = true;
    // Never try to resolve local filesystem paths.
    env.allowLocalModels = false;

    function onProgress(event: {
      status: string;
      progress?: number;
      file?: string;
    }) {
      if (event.status === "progress" && typeof event.progress === "number") {
        emitStatus({
          phase: "loading",
          progress: Math.round(event.progress),
          message: event.file
            ? `Downloading ${event.file.split("/").pop()}…`
            : "Downloading model…",
        });
      } else if (event.status === "initiate") {
        emitStatus({ phase: "loading", progress: 0, message: "Preparing…" });
      } else if (event.status === "done") {
        emitStatus({ phase: "loading", progress: 100, message: "Loading into memory…" });
      }
    }

    // Detect WebGPU; fall back to WASM/CPU.
    const device =
      typeof navigator !== "undefined" && "gpu" in navigator
        ? "webgpu"
        : "wasm";

    let pipe: TextGenerationPipeline;
    try {
      pipe = (await pipeline("text-generation", model, {
        device,
        // q4 forces Transformers.js to fetch model_q4.onnx (~100–140 MB for
        // SmolLM2-360M) instead of the larger fp16 default.
        dtype: "q4",
        progress_callback: onProgress,
      })) as TextGenerationPipeline;
    } catch (gpuErr) {
      if (device === "webgpu") {
        // WebGPU init failed (driver issue, unsupported GPU…) — retry on WASM.
        emitStatus({ phase: "loading", progress: 0, message: "Falling back to CPU…" });
        pipe = (await pipeline("text-generation", model, {
          device: "wasm",
          dtype: "q4",
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
  })().catch((err: unknown) => {
    _initPromise = null;
    const message = err instanceof Error ? err.message : "Unknown error loading model.";
    emitStatus({ phase: "error", message });
    throw err;
  });

  return _initPromise;
}

// ─── Inference helpers ────────────────────────────────────────────────────────

async function complete(req: AIRequest | BrowserAIChatRequest): Promise<AIResponse> {
  const started = performance.now();
  const pipe = await getPipeline();
  const rewritten = rewriteForBrowserModel(req) as BrowserAIChatRequest;

  const maxTokens = rewritten._maxNewTokens ?? (rewritten.isStrategy ? 1024 : 512);
  const temperature = rewritten._temperature ?? 0.1;

  const result = await pipe(rewritten.messages, {
    max_new_tokens: maxTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false,
    ...(req.signal ? { signal: req.signal } : {}),
  });

  // Extract text from the various generated_text shapes Transformers.js may return.
  const raw = Array.isArray(result) ? result[0] : result;
  let text = "";
  if (typeof raw?.generated_text === "string") {
    text = raw.generated_text;
  } else if (Array.isArray(raw?.generated_text)) {
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

// ─── Real token streaming ─────────────────────────────────────────────────────
//
// TextStreamer.put() fires synchronously inside each generation step of pipe().
// We bridge it to an AsyncGenerator via a callback queue:
//   • Tokens accumulate in `chunks[]`
//   • `notify()` resolves the generator's current suspension point
//   • The generator drains the queue, then suspends again until the next token
// JS is single-threaded so there are no race conditions; the queue handles burst
// arrivals (multiple tokens before the generator resumes).

async function* streamChat(req: AIChatRequest): AsyncGenerator<string> {
  const pipe = await getPipeline();
  const rewritten = rewriteForBrowserModel(req) as BrowserAIChatRequest;

  const maxNewTokens = rewritten._maxNewTokens ?? (rewritten.isStrategy ? 1024 : 512);
  const temperature  = rewritten._temperature  ?? 0.1;

  // Fallback to batch completion if TextStreamer wasn't stored yet (shouldn't
  // happen since getPipeline() above sets it, but guard defensively).
  if (!_TextStreamer) {
    yield (await complete(req)).text;
    return;
  }

  const chunks: string[] = [];
  let isDone = false;
  let notify: () => void = () => {};

  // The Transformers.js type omits .tokenizer but it exists on the runtime object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokenizer = (pipe as any).tokenizer as PreTrainedTokenizer;
  const streamer = new _TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      chunks.push(text);
      notify(); // wake the generator if it's waiting
    },
  });

  const inferencePromise = (pipe(rewritten.messages, {
    max_new_tokens: maxNewTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false,
    streamer,
    ...(req.signal ? { signal: req.signal } : {}),
  }) as Promise<unknown>)
    .then(() => { isDone = true; notify(); })
    .catch((err: unknown) => { isDone = true; notify(); throw err; });

  // Drain the queue; suspend between tokens.
  while (!isDone || chunks.length > 0) {
    if (chunks.length > 0) {
      yield chunks.shift()!;
    } else {
      await new Promise<void>((resolve) => { notify = resolve; });
    }
  }

  // Re-throw any inference error so aiActions.ts error handling still fires.
  await inferencePromise;
}

// ─── Test connection ──────────────────────────────────────────────────────────

async function testConnection(): Promise<ConnectionResult> {
  try {
    const result = await complete({
      messages: [{ role: "user", content: "Reply with: OK" }],
      systemPrompt:
        "You are a terse assistant. Reply only with the text requested.",
      maxTokens: 16,
      temperature: 0,
    } as AIRequest);
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
      message:
        error instanceof Error
          ? error.message
          : "Could not initialise in-browser model.",
    };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export const browserProvider: AIProvider = {
  id: "browser",
  label: "On-device (browser)",
  generate: complete,
  streamChat,
  testConnection,
};

/**
 * Imperatively pre-warm the pipeline. Call when the user explicitly opts into
 * browser AI (e.g. selects "Browser" in Settings) so the download starts before
 * their first action sheet request.
 */
export function prewarmBrowserAI(): void {
  getPipeline().catch(() => {
    // Errors are surfaced via the status event — no need to re-throw here.
  });
}
