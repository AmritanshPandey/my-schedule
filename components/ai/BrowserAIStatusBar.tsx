"use client";

/**
 * BrowserAIStatusBar — a compact status indicator for the in-browser AI model.
 *
 * Shows nothing when:
 *   • No browser AI load has been triggered yet (status === null)
 *   • The model is already ready (status.phase === "ready")
 *
 * Shows a progress bar + label during download, and an error chip on failure.
 * Designed to drop into AISettingsSheet or any AI action sheet that needs
 * to telegraph model-load state to the user.
 */

import { useBrowserAI } from "@/lib/ai/useBrowserAI";

interface Props {
  /** Compact inline layout vs. full-width bar. Defaults to "bar". */
  variant?: "bar" | "inline";
}

export function BrowserAIStatusBar({ variant = "bar" }: Props) {
  const { status } = useBrowserAI();

  if (!status || status.phase === "ready") return null;

  if (status.phase === "error") {
    return (
      <div
        className={
          variant === "bar"
            ? "rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-800/40 px-3 py-2"
            : "inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400"
        }
      >
        <span className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {status.message ?? "Model failed to load"}
        </span>
      </div>
    );
  }

  // Loading phase
  const progress = status.progress ?? 0;

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="inline-block w-20 h-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
          <span
            className="block h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </span>
        {status.message ?? "Loading model…"}
      </span>
    );
  }

  return (
    <div className="rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-700/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {status.message ?? "Loading model…"}
        </span>
        <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
          {progress}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
