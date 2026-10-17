"use client";

/**
 * NativeProvider — on-device inference supplied by a native host app.
 *
 * PlanR's iOS app hosts this web app in a WKWebView. Loading a ~1B model into
 * that web view would hit the same per-process memory ceiling that crashes
 * Safari (see lib/ai/deviceCapability.ts), so the app instead exposes the
 * system's own on-device model — Apple's Foundation Models framework on
 * iOS 26+, or an MLX model the app manages — through a script message handler.
 * The model lives in the native process, managed by the OS, and the web layer
 * just asks it for text.
 *
 * ── Bridge contract (v1)
 *
 * The host registers a `WKScriptMessageHandlerWithReply` named `planrAI`, so
 * `window.webkit.messageHandlers.planrAI.postMessage(request)` returns a
 * Promise. Request:
 *
 *   { v: 1, type: "generate", system: string,
 *     messages: { role: "user" | "assistant", content: string }[],
 *     maxTokens: number, temperature: number }
 *
 * Reply: the generated text as a string (or `{ text: string }`). Errors reject
 * the promise with a message, which is what `replyHandler(nil, "…")` does on
 * the Swift side. docs/intelligence.md has a Swift sketch of the host.
 *
 * Non-streaming on purpose: everything routed here is short (a summary, a
 * small JSON batch), and a single round-trip keeps the native side trivial.
 * Prompts go through the same compact rewrite as the browser model — Apple's
 * on-device model has a 4K-token context, and the verbose prompts written for
 * 7B+ server models would not fit alongside their output.
 *
 * Presents itself as kind "browser": to the user both are "On-device AI", and
 * which engine runs underneath is a property of the platform, not a setting.
 */

import type { AIConnectionTestResult, AIGenerateOptions, AIMessage, AIProvider } from "../types";
import { rewriteForBrowserModel } from "./browserPrompts";

interface NativeAIHandler {
  postMessage(message: unknown): Promise<unknown> | unknown;
}

function nativeHandler(): NativeAIHandler | null {
  if (typeof window === "undefined") return null;
  const handler = (window as unknown as {
    webkit?: { messageHandlers?: { planrAI?: NativeAIHandler } };
  }).webkit?.messageHandlers?.planrAI;
  return handler && typeof handler.postMessage === "function" ? handler : null;
}

/** True inside a native host that supplies on-device inference. */
export function hasNativeAI(): boolean {
  return nativeHandler() !== null;
}

function readReply(reply: unknown): string {
  if (typeof reply === "string") return reply;
  if (reply && typeof reply === "object" && typeof (reply as { text?: unknown }).text === "string") {
    return (reply as { text: string }).text;
  }
  return "";
}

function abortError(): Error {
  const err = new Error("Generation was stopped.");
  err.name = "AbortError";
  return err;
}

async function* generateNative(
  systemPrompt: string,
  messages: AIMessage[],
  opts: AIGenerateOptions,
): AsyncGenerator<string> {
  const handler = nativeHandler();
  if (!handler) throw new Error("On-device AI isn't available in this app.");

  const rewritten = rewriteForBrowserModel({
    messages,
    systemPrompt,
    signal: opts.signal,
    actionHint: opts.actionHint,
    recentRejections: opts.recentRejections,
  });
  if (opts.signal?.aborted) throw abortError();

  const pending = Promise.resolve(
    handler.postMessage({
      v: 1,
      type: "generate",
      system: rewritten.systemPrompt,
      messages: rewritten.messages,
      maxTokens: opts.maxTokens ?? rewritten._maxNewTokens ?? 512,
      temperature: opts.temperature ?? rewritten._temperature ?? 0.1,
    }),
  );

  // The native call can't be cancelled mid-flight; a Stop simply stops
  // waiting for it, and its eventual reply is dropped.
  const reply = await (opts.signal
    ? Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          opts.signal!.addEventListener("abort", () => reject(abortError()), { once: true });
        }),
      ])
    : pending);

  const text = readReply(reply);
  if (text) yield text;
}

export class NativeProvider implements AIProvider {
  readonly kind = "browser";

  generate(systemPrompt: string, messages: AIMessage[], opts: AIGenerateOptions = {}): AsyncGenerator<string> {
    return generateNative(systemPrompt, messages, opts);
  }

  async testConnection(): Promise<AIConnectionTestResult> {
    try {
      let text = "";
      for await (const chunk of this.generate(
        "You are a terse assistant. Reply only with the text requested.",
        [{ role: "user", content: "Reply with: OK" }],
        { maxTokens: 16, temperature: 0 },
      )) {
        text += chunk;
      }
      return text.trim()
        ? { ok: true, model: "On-device (native)" }
        : { ok: false, error: "The on-device model returned no output." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "On-device AI isn't available." };
    }
  }
}
