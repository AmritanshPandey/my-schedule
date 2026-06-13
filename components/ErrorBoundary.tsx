"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
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

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  componentDidUpdate(_: Props, prevState: State) {
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
