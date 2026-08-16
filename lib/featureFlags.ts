/**
 * Feature flags — central on/off switches for whole feature areas.
 *
 * AI is on: every AI surface (assistant, coach, plan creator, subtask
 * generation, weekly insight) runs on Gemini via the Cloudflare Worker proxy
 * (worker/src/index.ts, lib/aiClient.ts) and requires sign-in — a shared,
 * developer-owned key with per-user + global daily caps enforced server-side
 * (worker/src/usage.ts), since there's no per-user quota to protect otherwise.
 * Flip back to `false` to hide every AI entry point without touching them
 * individually — they all gate on this flag already.
 */
export const AI_ENABLED = true;
