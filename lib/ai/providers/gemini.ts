/**
 * Gemini as an AIProvider — a thin adapter, not a reimplementation. Every
 * actual request still goes through lib/aiClient.ts's streamGeminiChat,
 * which is untouched by this whole provider layer: it still resolves the
 * Firebase ID token, still talks to the Cloudflare Worker that holds the
 * one shared Gemini key server-side, still enforces the Worker's per-user/
 * global daily caps. Nothing here duplicates any of that.
 */

import type { IdTokenSource } from "@/lib/aiClient";
import { streamGeminiChat } from "@/lib/aiClient";
import type { AIChatRequest, AIProvider, AIRequest, AIResponse, ConnectionResult } from "./types";

export function createGeminiProvider(user: IdTokenSource | null): AIProvider {
  return {
    id: "gemini",
    label: "Gemini",
    generate: async (req: AIRequest): Promise<AIResponse> => {
      const started = performance.now();
      let text = "";
      for await (const chunk of streamGeminiChat(user, req.messages, req.systemPrompt, req.isStrategy ?? false, req.signal)) {
        text += chunk;
      }
      return {
        text,
        provider: "gemini",
        latencyMs: Math.round(performance.now() - started),
      };
    },
    streamChat: (req: AIChatRequest) =>
      streamGeminiChat(user, req.messages, req.systemPrompt, req.isStrategy ?? false, req.signal),
    // Gemini's "connection" is really "signed in, with the Worker URL
    // configured" — both already surfaced elsewhere (the sign-in gate, the
    // status card). There's nothing new to probe here; this only exists so
    // the AIProvider interface stays uniform if the Settings UI ever wants
    // to show a Gemini row next to MLX's.
    testConnection: async (): Promise<ConnectionResult> => ({
      ok: true,
      message: "Gemini runs through PlanR's server — no local connection to test.",
    }),
  };
}
