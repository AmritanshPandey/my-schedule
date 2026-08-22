"use client";

/**
 * useBrowserAI — React hook for components that need to surface the
 * in-browser model loading state (download progress, ready, error).
 *
 * Usage:
 *   const { status } = useBrowserAI();
 *   // status.phase === "loading" → show a progress bar
 *   // status.phase === "ready"   → model is warm, inference is fast
 *   // status.phase === "error"   → something went wrong, show status.message
 *
 * This hook is decoupled from inference: it only observes the status events
 * the BrowserLocalProvider dispatches. Components that trigger inference
 * continue to call useAIActions() as usual.
 */

import { useEffect, useState } from "react";
import type { BrowserAIStatus } from "./providers/browser";
import { BROWSER_AI_STATUS_EVENT } from "./providers/settings";

export interface BrowserAIState {
  /** The latest status from the in-browser model loader. Starts as null
   *  (no load has been triggered yet). */
  status: BrowserAIStatus | null;
}

export function useBrowserAI(): BrowserAIState {
  const [status, setStatus] = useState<BrowserAIStatus | null>(null);

  useEffect(() => {
    function onStatus(event: Event) {
      const detail = (event as CustomEvent<BrowserAIStatus>).detail;
      setStatus(detail);
    }

    window.addEventListener(BROWSER_AI_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(BROWSER_AI_STATUS_EVENT, onStatus);
  }, []);

  return { status };
}
