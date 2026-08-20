/**
 * Feature flags — central on/off switches for whole feature areas.
 *
 * AI is on: every AI surface uses the provider selected in AI Settings.
 * Flip back to `false` to hide every AI entry point without touching them
 * individually — they all gate on this flag already.
 */
export const AI_ENABLED = true;
