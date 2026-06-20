"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/errorLog";

interface Props {
  children: ReactNode;
  /** Label used in console logs, e.g. "Timeline", "Notes". */
  name?: string;
  /**
   * Section mode: render a compact, retry-in-place fallback and NEVER reload the
   * whole page. Use to isolate a feature area so its crash can't white-screen
   * (or reload-loop) the entire app. Leave off for the single root boundary,
   * which keeps the chunk-error recovery reload.
   */
  section?: boolean;
}

interface State {
  hasError: boolean;
  message: string;
}

// Persisted across reloads so a chunk that *keeps* failing can't trigger an
// endless reload loop (which Safari surfaces as "A problem repeatedly occurred").
const RELOAD_KEY = "planr-chunk-reloads";
const MAX_RELOADS = 1;

function getReloadCount(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

function isChunkLoadError(message: string) {
  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("Unexpected token")
  );
}

// Drop the stale service-worker caches that usually cause a chunk to 404, so the
// follow-up reload actually fetches the current build instead of looping.
async function clearStaleCaches() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("planr-")).map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  private resetTimer: number | undefined;

  componentDidMount() {
    // If the app stays healthy for a few seconds, the previous recovery worked —
    // reset the counter so a *future* chunk error still gets its one reload.
    // Done on a delay (not immediately) because chunk errors fire when a lazy
    // import loads, which happens after mount; clearing too early would let the
    // loop resume.
    this.resetTimer = window.setTimeout(() => {
      if (!this.state.hasError) {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          /* ignore */
        }
      }
    }, 5000);
  }

  componentWillUnmount() {
    window.clearTimeout(this.resetTimer);
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Feed React render crashes into the on-device error log so they show up
    // alongside window/promise errors (and survive a reload).
    logError(`react:${this.props.name ?? (this.props.section ? "section" : "root")}`, error, info.componentStack ?? undefined);
  }

  componentDidUpdate(_: Props, prevState: State) {
    // Section boundaries isolate a feature area — they must never trigger a
    // full-page reload (that's the root boundary's job).
    if (this.props.section) return;

    const isNewError =
      this.state.hasError &&
      (prevState.hasError === false || prevState.message !== this.state.message);

    if (isNewError && isChunkLoadError(this.state.message) && getReloadCount() < MAX_RELOADS) {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(getReloadCount() + 1));
      } catch {
        /* ignore */
      }
      clearStaleCaches().finally(() => {
        window.setTimeout(() => window.location.reload(), 800);
      });
    }
  }

  render() {
    if (this.state.hasError) {
      // Section mode: contained, retry-in-place fallback. Resetting state
      // re-mounts the children so a transient failure can recover without a
      // full reload (and without taking the rest of the app down).
      if (this.props.section) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:border-white/[0.08] dark:bg-neutral-900">
            <p className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">
              {this.props.name ? `${this.props.name} hit a problem` : "This section hit a problem"}
            </p>
            {this.state.message && (
              <p className="max-w-full break-words font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => this.setState({ hasError: false, message: "" })}
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-[12px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
            >
              Try again
            </button>
          </div>
        );
      }

      const chunkError = isChunkLoadError(this.state.message);
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 dark:border-white/[0.08] dark:bg-neutral-900 max-w-sm w-full">
            <p className="text-[15px] font-semibold text-neutral-900 dark:text-white mb-1">
              Something went wrong
            </p>
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500 mb-5 font-mono break-all">
              {chunkError
                ? "A cached app version is stale or failed to load. Reloading the app should restore the latest build."
                : this.state.message}
            </p>
            <button
              onClick={() => {
                try {
                  sessionStorage.removeItem(RELOAD_KEY);
                } catch {
                  /* ignore */
                }
                clearStaleCaches().finally(() => window.location.reload());
              }}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
