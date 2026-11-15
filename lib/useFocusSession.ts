"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FOCUS_STORAGE_KEY,
  focusReducer,
  isFocusResumable,
  startFocus,
  type FocusAction,
  type FocusState,
} from "@/lib/focusSession";
import { safeGetItem, safeRemoveItem, safeSetItem } from "@/lib/safeStorage";
import { todayISO } from "@/lib/dateUtils";

/**
 * The PWA's focus session: the state, its device-local persistence, and
 * whether the full-screen view is showing.
 *
 * The record lives in localStorage (never the Schedule), written on every
 * transition and nowhere else — the clock is derived from timestamps, so there
 * is nothing to save per tick. A session from today is restored on load, so a
 * reload or an iOS PWA being evicted from memory resumes where it was.
 */
export function useFocusSession() {
  const [state, setState] = useState<FocusState | null>(null);
  const [open, setOpen] = useState(false);

  // Restored after mount (storage isn't readable during the server render). A
  // restored session opens straight away: the user left mid-workout.
  useEffect(() => {
    try {
      const raw = safeGetItem(FOCUS_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as FocusState) : null;
      if (isFocusResumable(parsed, todayISO())) {
        setState(parsed);
        setOpen(true);
      } else if (raw) {
        safeRemoveItem(FOCUS_STORAGE_KEY);
      }
    } catch {
      safeRemoveItem(FOCUS_STORAGE_KEY);
    }
  }, []);

  const persist = useCallback((next: FocusState | null) => {
    setState(next);
    if (next) safeSetItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
    else safeRemoveItem(FOCUS_STORAGE_KEY);
  }, []);

  const start = useCallback(
    (input: Omit<Parameters<typeof startFocus>[0], "now">) => {
      // Re-opening the same task today continues its session.
      if (state && state.taskId === input.taskId && state.dateISO === input.dateISO) {
        setOpen(true);
        return;
      }
      persist(startFocus({ ...input, now: Date.now() }));
      setOpen(true);
    },
    [persist, state],
  );

  const dispatch = useCallback(
    (action: FocusAction) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = focusReducer(prev, action);
        if (next !== prev) safeSetItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  /** Leave the view; the session keeps running and can be resumed. */
  const hide = useCallback(() => setOpen(false), []);
  /** Finish or abandon: forget the session. */
  const end = useCallback(() => {
    persist(null);
    setOpen(false);
  }, [persist]);

  return { state, open, start, dispatch, hide, end };
}

/** Re-render every second while `active`, and at once when the tab returns. */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const refresh = () => setNow(Date.now());
    const id = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active]);
  return now;
}

/**
 * Keep the screen on while focus is showing (Screen Wake Lock API). The lock
 * drops whenever the page is hidden, so it is re-requested on return. Where
 * the API is missing the screen simply follows its normal timeout.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const next = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (cancelled) void next.release();
        else lock = next;
      } catch {
        // Denied (low battery, not visible): nothing to do.
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
