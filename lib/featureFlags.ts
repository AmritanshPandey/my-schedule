/**
 * Feature flags — central on/off switches for whole feature areas.
 *
 * AI is on. This is the *build-time* switch: setting it to `false` removes
 * every AI entry point for everyone and takes the Settings toggle with it.
 *
 * The user's own switch is separate and lives in lib/ai/config.ts
 * (`getAIFeaturesEnabled`). Components should not read this flag directly —
 * use `useAIEnabled()` from lib/ai/useAIEnabled.ts, which combines both and
 * re-renders when the user's preference changes.
 */
export const AI_ENABLED = true;
