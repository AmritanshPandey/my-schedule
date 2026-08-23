"use client";

/**
 * Whether AI can answer *right now*, as opposed to being merely configured.
 *
 * `isAiConfigured()` only asks "is there enough settings-wise to try", which
 * is true for Browser AI the instant it is selected — before any model has
 * been downloaded. That made the sidebar claim "AI ready" while the first
 * real request would actually stall on a several-hundred-megabyte download.
 * This hook separates the two so the UI can offer the download instead of
 * pretending it already happened.
 *
 * Only the browser provider has a download step; the server-backed providers
 * are ready as soon as they are configured.
 */

import { useCallback, useEffect, useState } from "react";
import { getAIProviderState, AI_SETTINGS_CHANGED_EVENT } from "./config";
import { isAiConfigured } from "@/lib/aiClient";
import {
  BROWSER_AI_STATUS_EVENT,
  isBrowserModelCached,
  browserModelDownloadLabel,
  type BrowserAIStatus,
} from "./providers/browser";

export type AIReadyState =
  /** Still determining — the cache lookup is async. Render nothing decisive. */
  | "checking"
  /** Usable now. */
  | "ready"
  /** Browser provider selected but its weights are not downloaded yet. */
  | "needs-download"
  /** Downloading right now. */
  | "downloading"
  /** A remote provider is missing required settings. */
  | "not-configured";

export interface AIReady {
  state: AIReadyState;
  /** Download progress 0-100 while `state` is "downloading". */
  progress: number | null;
  /** e.g. "~460 MB" — what the pending download will cost. */
  downloadLabel: string;
  /** Re-run the cache check (after a download finishes elsewhere). */
  refresh: () => void;
}

export function useAIReady(): AIReady {
  const [state, setState] = useState<AIReadyState>("checking");
  const [progress, setProgress] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  // The size estimate depends on which model is selected, since only verified
  // models get the smaller fp16 weights.
  const [model, setModel] = useState<string>("");

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const { active, browser } = getAIProviderState();

      if (active !== "browser") {
        if (!cancelled) {
          setState(isAiConfigured() ? "ready" : "not-configured");
          setProgress(null);
        }
        return;
      }

      if (!cancelled) setModel(browser.model);
      const cached = await isBrowserModelCached(browser.model);
      if (!cancelled) setState(cached ? "ready" : "needs-download");
    }

    void evaluate();

    // Live status from the loader wins over the cached-file check: it is the
    // only thing that knows a download is in flight *now*.
    function onStatus(event: Event) {
      const detail = (event as CustomEvent<BrowserAIStatus>).detail;
      if (cancelled) return;
      if (detail.phase === "loading") {
        setState("downloading");
        setProgress(detail.progress ?? null);
      } else if (detail.phase === "ready") {
        setState("ready");
        setProgress(null);
      } else {
        setProgress(null);
        void evaluate();
      }
    }

    window.addEventListener(BROWSER_AI_STATUS_EVENT, onStatus);
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, evaluate);
    return () => {
      cancelled = true;
      window.removeEventListener(BROWSER_AI_STATUS_EVENT, onStatus);
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, evaluate);
    };
  }, [nonce]);

  return { state, progress, downloadLabel: browserModelDownloadLabel(model), refresh };
}
