"use client";

/**
 * Per-tour "have they seen it" state — same guarded localStorage pattern as
 * lib/errorTelemetry.ts and components/ai/AIOnboarding.tsx (typeof window
 * checks, try/catch, a planr-prefixed key). One key per tour id, so tours
 * are independent: finishing "today" doesn't mark "plans" as seen too, and
 * a tour can be reset (replayed) individually.
 */

import { useEffect, useState } from "react";

function storageKey(id: string): string {
  return `planr-tour-${id}`;
}

export function hasSeenTour(id: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return true; // storage unavailable — behave as "already seen", never block the UI
  }
}

function markTourSeen(id: string): void {
  try {
    localStorage.setItem(storageKey(id), "1");
  } catch {
    // non-fatal — the tour just won't remember it was shown
  }
}

export function resetTour(id: string): void {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // non-fatal
  }
}

/**
 * Auto-starts a tour once per device, after a short delay so the page's real
 * content — and the DOM elements a CoachMarks step targets — has actually
 * mounted. Returns what a <CoachMarks> instance needs, plus `start` so a
 * "Replay tour" control elsewhere can trigger it manually regardless of
 * whether it's been seen.
 */
export function useCoachTour(
  id: string,
  opts: { enabled?: boolean; delayMs?: number } = {},
) {
  const { enabled = true, delayMs = 900 } = opts;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || hasSeenTour(id)) return;
    const t = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);

  function finish() {
    markTourSeen(id);
    setOpen(false);
  }

  function start() {
    setOpen(true);
  }

  return { open, finish, start };
}
