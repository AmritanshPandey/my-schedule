/**
 * Which block is happening right now.
 *
 * Pure so it can be unit-tested; the React plumbing lives in
 * `components/timeline/NowActiveProvider.tsx`.
 */

export interface ActiveCandidate {
  /** Stable identity for the block — `viewKey(task, slotIndex)`. */
  key: string;
  /** The owning task, for surfaces that render whole tasks rather than slots. */
  taskId: string;
  /** Timeline minutes. */
  start: number;
  end: number;
}

/**
 * The key of the block containing `nowMinutes`, or null.
 *
 * Deliberately returns a *key* rather than the minute: consumers then re-render
 * only when the active block actually changes — a handful of times a day —
 * instead of twice a minute with the ticker.
 *
 * When blocks overlap, the one that started most recently wins: that is the one
 * you most plausibly just moved into.
 */
export function findActiveBlockKey(
  candidates: readonly ActiveCandidate[],
  nowMinutes: number | null,
): string | null {
  if (nowMinutes === null) return null;
  let best: ActiveCandidate | null = null;
  for (const c of candidates) {
    if (nowMinutes < c.start || nowMinutes >= c.end) continue;
    if (!best || c.start > best.start) best = c;
  }
  return best?.key ?? null;
}
