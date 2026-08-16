/**
 * Client for PlanR's AI features — a thin, authenticated, streaming fetch to
 * the Cloudflare Worker that proxies Gemini (worker/src/index.ts's
 * `POST /ai/chat`). The Worker holds the one shared, developer-owned Gemini
 * API key server-side and enforces per-user + global daily caps on it; this
 * module never sees the key and has no local rate-limiting of its own — the
 * cap that matters is server-side.
 *
 * `streamGeminiChat`/`streamGeminiAction` are drop-in replacements for the
 * old `streamOllamaChat`/`streamOllamaAction`: both are AsyncGenerator<string>
 * yielding INCREMENTAL text deltas (never accumulated-so-far text — callers
 * do their own `accumulated += chunk`), and both respect a trailing
 * AbortSignal. This is the first authenticated fetch to an external endpoint
 * in this codebase — everything else talks to Firebase via its SDK (implicit
 * auth) or, historically, to an unauthenticated local Ollama server.
 */

const WORKER_URL = process.env.NEXT_PUBLIC_AI_WORKER_URL;

export interface AiClientMessage {
  role: "user" | "assistant";
  content: string;
}

/** Anything with Firebase's `User.getIdToken` shape — accepted as a parameter
 *  rather than imported from AuthProvider, so this module doesn't need to
 *  know about React/context. */
export interface IdTokenSource {
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** Not signed in, or the Worker rejected the token as missing/invalid/expired
 *  even after one forced-refresh retry. Call sites should prompt sign-in. */
export class AiAuthError extends Error {
  constructor(message = "Sign in to use AI features.") {
    super(message);
    this.name = "AiAuthError";
  }
}

/** The daily usage cap (this user's own, or the shared app-wide budget) is
 *  reached. `reason` lets the UI show the right one of two distinct messages. */
export class AiCapError extends Error {
  reason: "per-user-cap" | "global-cap";
  constructor(reason: "per-user-cap" | "global-cap") {
    super(
      reason === "per-user-cap"
        ? "You've used today's free AI limit — it resets tomorrow."
        : "PlanR's daily AI limit is reached — try again tomorrow.",
    );
    this.name = "AiCapError";
    this.reason = reason;
  }
}

export function isAiConfigured(): boolean {
  return !!WORKER_URL;
}

async function* streamFromWorker(
  idToken: string,
  systemPrompt: string,
  messages: AiClientMessage[],
  maxOutputTokens?: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await fetch(`${WORKER_URL}/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ systemPrompt, messages, maxOutputTokens }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error("AI service not reachable — check your connection and try again.");
  }

  if (response.status === 401) throw new AiAuthError();
  if (response.status === 429) {
    const body = (await response.json().catch(() => ({}))) as { reason?: string };
    throw new AiCapError(body.reason === "global-cap" ? "global-cap" : "per-user-cap");
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`AI error ${response.status}: ${errText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body from AI service");

  // Same NDJSON-style reader loop as the old streamOllamaChat, just parsing
  // Gemini's SSE `data: {...}` lines instead of Ollama's bare-JSON lines.
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
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const data = JSON.parse(jsonStr);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string" && text.length > 0) yield text;
      } catch {
        // skip malformed/partial lines — the next chunk usually completes them
      }
    }
  }
}

/**
 * Resolves an ID token and streams from the Worker, retrying once with a
 * forced-fresh token if the first attempt comes back unauthenticated (the
 * token may simply have expired mid-session).
 */
async function* streamAuthenticated(
  user: IdTokenSource | null,
  systemPrompt: string,
  messages: AiClientMessage[],
  maxOutputTokens?: number,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (!user) throw new AiAuthError();
  if (!isAiConfigured()) throw new Error("AI isn't configured (missing NEXT_PUBLIC_AI_WORKER_URL).");

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new AiAuthError();
  }

  try {
    yield* streamFromWorker(idToken, systemPrompt, messages, maxOutputTokens, signal);
  } catch (err) {
    if (!(err instanceof AiAuthError)) throw err;
    const fresh = await user.getIdToken(true).catch(() => null);
    if (!fresh) throw err;
    yield* streamFromWorker(fresh, systemPrompt, messages, maxOutputTokens, signal);
  }
}

/**
 * Drop-in replacement for lib/ai.ts's old streamOllamaChat — same signature
 * shape minus baseUrl/model (Gemini's model choice lives server-side in the
 * Worker's config, not picked per-call by the client).
 */
export function streamGeminiChat(
  user: IdTokenSource | null,
  messages: AiClientMessage[],
  systemPrompt: string,
  isStrategy = false,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAuthenticated(user, systemPrompt, messages, isStrategy ? 4096 : 1024, signal);
}

/**
 * Drop-in replacement for lib/aiActions.ts's old streamOllamaAction — backs
 * all five one-shot generate* functions (tasks/subtasks/milestones/
 * milestone-tasks/weekly-insight) via a single user message.
 */
export function streamGeminiAction(
  user: IdTokenSource | null,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return streamAuthenticated(user, systemPrompt, [{ role: "user", content: userMessage }], 1024, signal);
}
