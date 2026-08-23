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
 * • Quantized weights, chosen per backend at pipeline() call time — q4f16 on
 *   WebGPU, q4 on the WASM/CPU fallback (see dtypeFor). Both are far smaller
 *   than the fp32 default, though still larger than "4 bits × N params"
 *   suggests, since only the weights are quantised.
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

import { DEFAULT_BROWSER_CONFIG } from "../config";
import type { AIConnectionTestResult, AIGenerateOptions, AIMessage, AIProvider, AIProviderConfig } from "../types";
import { rewriteForBrowserModel } from "./browserPrompts";
import type { TextGenerationPipeline, PreTrainedTokenizer } from "@huggingface/transformers";

// ─── Status event ────────────────────────────────────────────────────────────

/** Fired when the in-browser model load progresses or completes — components
 *  observe it via lib/ai/useBrowserAI.ts rather than polling. */
export const BROWSER_AI_STATUS_EVENT = "planr:ai:browser-status";

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

/** The model this instance was constructed with, falling back to the default
 *  if the saved config is somehow blank (e.g. a cleared localStorage field). */
function resolveModel(config: AIProviderConfig): string {
  return config.model.trim() || DEFAULT_BROWSER_CONFIG.model;
}

/**
 * Which quantised weights to fetch, per backend.
 *
 * `q4f16` is 4-bit weights with fp16 everywhere else — for Qwen2.5-0.5B that
 * is ~460 MB versus ~750 MB for plain `q4`, a large saving on a download the
 * user waits through. It needs real fp16 support, which WebGPU has (via the
 * shader-f16 feature) and the WASM/CPU backend does not reliably, so the
 * cheaper weights are only used where they actually run.
 */
function dtypeFor(device: "webgpu" | "wasm"): "q4f16" | "q4" {
  return device === "webgpu" ? "q4f16" : "q4";
}

// ─── Pipeline singleton ───────────────────────────────────────────────────────

// TextStreamer is stored after the first dynamic import so streamChat can use it
// without a redundant await import(). Type is the class constructor, not an instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _TextStreamer: (new (tokenizer: PreTrainedTokenizer, opts: Record<string, unknown>) => any) | null = null;

let _pipeline: TextGenerationPipeline | null = null;
let _initPromise: Promise<TextGenerationPipeline> | null = null;
let _loadedModel = "";

async function getPipeline(model: string): Promise<TextGenerationPipeline> {
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
        dtype: dtypeFor(device),
        progress_callback: onProgress,
      })) as TextGenerationPipeline;
    } catch (gpuErr) {
      if (device === "webgpu") {
        // WebGPU init failed (driver issue, unsupported GPU…) — retry on WASM.
        // Note this also changes dtype, so the fp16 weights fetched so far are
        // not reused: a failed GPU init costs a second, larger download.
        emitStatus({ phase: "loading", progress: 0, message: "Falling back to CPU…" });
        pipe = (await pipeline("text-generation", model, {
          device: "wasm",
          dtype: dtypeFor("wasm"),
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

// ─── Real token streaming ─────────────────────────────────────────────────────
//
// TextStreamer.put() fires synchronously inside each generation step of pipe().
// We bridge it to an AsyncGenerator via a callback queue:
//   • Tokens accumulate in `chunks[]`
//   • `notify()` resolves the generator's current suspension point
//   • The generator drains the queue, then suspends again until the next token
// JS is single-threaded so there are no race conditions; the queue handles burst
// arrivals (multiple tokens before the generator resumes).

async function* streamGenerate(
  model: string,
  systemPrompt: string,
  messages: AIMessage[],
  opts: AIGenerateOptions,
): AsyncGenerator<string> {
  const pipe = await getPipeline(model);
  const rewritten = rewriteForBrowserModel({ messages, systemPrompt, signal: opts.signal });

  const maxNewTokens = opts.maxTokens ?? rewritten._maxNewTokens ?? 512;
  const temperature  = opts.temperature ?? rewritten._temperature ?? 0.1;
  // The system prompt is a real turn, not metadata — rewriteForBrowserModel
  // only rewrites systemPrompt/messages text, it doesn't fold one into the
  // other. AIMessage's role type is deliberately just "user"|"assistant"
  // (every other provider's wire format), so the "system" turn is added here,
  // on the looser shape Transformers.js's pipe() actually accepts.
  const chatInput = [{ role: "system", content: rewritten.systemPrompt }, ...rewritten.messages];

  // Fallback to batch completion if TextStreamer wasn't stored yet (shouldn't
  // happen since getPipeline() above sets it, but guard defensively).
  if (!_TextStreamer) {
    const result = await pipe(chatInput, {
      max_new_tokens: maxNewTokens,
      temperature,
      do_sample: temperature > 0,
      return_full_text: false,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    yield extractText(result);
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

  const inferencePromise = (pipe(chatInput, {
    max_new_tokens: maxNewTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false,
    streamer,
    ...(opts.signal ? { signal: opts.signal } : {}),
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

// Extracts text from the various generated_text shapes Transformers.js may return.
function extractText(result: unknown): string {
  const raw = (Array.isArray(result) ? result[0] : result) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof raw?.generated_text === "string") return raw.generated_text;
  if (Array.isArray(raw?.generated_text)) {
    const last = raw.generated_text[raw.generated_text.length - 1] as unknown;
    if (typeof last === "string") return last;
    if (last && typeof last === "object" && "content" in last) {
      const content = (last as { content: unknown }).content;
      return typeof content === "string" ? content : "";
    }
  }
  return "";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export class BrowserProvider implements AIProvider {
  readonly kind = "browser";
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  generate(systemPrompt: string, messages: AIMessage[], opts: AIGenerateOptions = {}): AsyncGenerator<string> {
    return streamGenerate(resolveModel(this.config), systemPrompt, messages, opts);
  }

  async testConnection(): Promise<AIConnectionTestResult> {
    const started = performance.now();
    try {
      let text = "";
      for await (const chunk of this.generate(
        "You are a terse assistant. Reply only with the text requested.",
        [{ role: "user", content: "Reply with: OK" }],
        { maxTokens: 16, temperature: 0 },
      )) {
        text += chunk;
      }
      const elapsedSeconds = (performance.now() - started) / 1000;
      const ok = text.trim().length > 0;
      return ok
        ? { ok: true, model: resolveModel(this.config), tokensPerSecond: elapsedSeconds > 0 ? Math.round(text.length / 4 / elapsedSeconds) : undefined }
        : { ok: false, error: "Model loaded but returned no output. Try a different model." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not initialise in-browser model." };
    }
  }
}
