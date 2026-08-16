/**
 * Feature flags — central on/off switches for whole feature areas.
 *
 * AI is on: every AI surface (assistant, coach, plan creator, subtask
 * generation, weekly insight) runs on a local MLX model the browser talks to
 * directly (lib/aiClient.ts, lib/ai/providers/mlx.ts) — no sign-in, no API
 * key, no cloud usage. Flip back to `false` to hide every AI entry point
 * without touching them individually — they all gate on this flag already.
 */
export const AI_ENABLED = true;
