/**
 * Minimal stand-in for lib/errorLog.ts's persisted diagnostics ring buffer —
 * cloudSync.ts needs somewhere to report non-fatal sync failures, but the
 * full "viewable error log" feature (in-app viewer, dedup window, stack
 * capture) is diagnostics UI, not something sync correctness depends on.
 * Scoped out of this pass; upgrade to a real persisted log if/when native
 * gets its own diagnostics screen.
 */
export function logError(source: string, error: unknown): void {
  console.warn(`[${source}]`, error instanceof Error ? error.message : error);
}
