"use client";

import { useEffect, useState } from "react";

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Returns the current minutes-from-midnight, refreshed on an interval.
 *
 * Confine usage to small, memo'd leaf layers (CurrentTimeLayer, PastShadeLayer,
 * CurrentTaskHighlightLayer) so the periodic tick never re-renders the whole
 * timeline or its task cards.
 */
export function useNowMinutes(intervalMs = 30_000): number {
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);

  useEffect(() => {
    const id = window.setInterval(() => setNowMinutes(getCurrentMinutes()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowMinutes;
}
