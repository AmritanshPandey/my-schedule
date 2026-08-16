/**
 * Thin proxy to Google's Gemini API. Streams a chat/action completion given a
 * system prompt + message history and returns the raw upstream Response so
 * the caller (index.ts's fetch handler) can pipe its body straight through to
 * the client without buffering the whole reply first.
 */

export interface GeminiMessage {
  role: "user" | "assistant";
  content: string;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** {role, content} (this app's shape, same as the old Ollama messages) →
 *  Gemini's {role: "user"|"model", parts: [{text}]}. */
function toGeminiContents(messages: GeminiMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

// Lower temperature = more deterministic/accurate structured output (mirrors
// the old Ollama options this app used — same rationale, different backend).
const GENERATION_DEFAULTS = { temperature: 0.35, topP: 0.9, topK: 40 };

/**
 * Calls Gemini's streamGenerateContent (SSE). `model` and the API key are
 * both caller-supplied (from env) rather than hardcoded, so they stay
 * tunable via wrangler.toml vars / secrets without a code change.
 * `maxOutputTokens` lets the client ask for a longer budget for long-form
 * output (e.g. the strategy-document writer) without a separate endpoint.
 */
export async function streamGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: GeminiMessage[],
  maxOutputTokens = 1024,
): Promise<Response> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiContents(messages),
    generationConfig: { ...GENERATION_DEFAULTS, maxOutputTokens },
  };
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
