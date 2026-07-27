"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useNowMinutes } from "@/lib/timeline/useNowMinutes";
import { findActiveBlockKey, type ActiveCandidate } from "@/lib/timeline/nowActive";

/** Null-object default so consumers rendered outside a provider are simply never active. */
const NONE: ActiveBlock = { key: null, taskId: null };
const ActiveBlockContext = createContext<ActiveBlock>(NONE);

export interface ActiveBlock {
  /** `viewKey(task, slotIndex)` of the block happening now — for the timeline. */
  key: string | null;
  /** The owning task's id — for the day list, which renders whole tasks. */
  taskId: string | null;
}

/**
 * Publishes *which block is happening now*.
 *
 * `useNowMinutes` documents that it must stay in small memo'd leaves, because a
 * 30-second tick at the top of the timeline would re-render every card. This
 * provider is that leaf: it ticks, but the value it exposes only changes when
 * the active block changes — a handful of times a day. Consumers therefore
 * re-render on transitions, not on ticks.
 *
 * Two things make that work and are easy to break:
 *  - `children` is created by the *parent*, so re-rendering this provider does
 *    not re-render the subtree; only `useContext` subscribers wake up.
 *  - context deliberately bypasses `memo`, which is why the memoized
 *    `TimelineTaskBlock` still sees the change.
 */
export function NowActiveProvider({
  candidates,
  enabled,
  children,
}: {
  candidates: readonly ActiveCandidate[];
  /** False when viewing another day — nothing is "now" then. */
  enabled: boolean;
  children: ReactNode;
}) {
  const nowMinutes = useNowMinutes();
  const value = useMemo<ActiveBlock>(() => {
    if (!enabled) return NONE;
    const key = findActiveBlockKey(candidates, nowMinutes);
    if (key === null) return NONE;
    return { key, taskId: candidates.find((c) => c.key === key)?.taskId ?? null };
  }, [candidates, nowMinutes, enabled]);

  return <ActiveBlockContext.Provider value={value}>{children}</ActiveBlockContext.Provider>;
}

/** The block happening right now. `{ key: null, taskId: null }` when nothing is. */
export function useActiveBlock(): ActiveBlock {
  return useContext(ActiveBlockContext);
}
