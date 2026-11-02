"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/errorLog";
import {
  isChunkLoadError,
  clearStaleCaches,
  hardRefreshApp,
  resetReloadCount,
  recoverFromChunkError,
} from "@/lib/chunkRecovery";
import Button from "@/components/ui/Button";

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

// Loop-guarded chunk-error recovery (clear caches + reload) lives in
// lib/chunkRecovery so the React boundary, window errors, and unhandled promise
// rejections all share one reload counter.

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
      if (!this.state.hasError) resetReloadCount();
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

    if (isNewError && isChunkLoadError(this.state.message)) {
      recoverFromChunkError(800);
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
              <p className="max-w-full break-words font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                {this.state.message}
              </p>
            )}
            <Button variant="secondary" size="sm" onClick={() => this.setState({ hasError: false, message: "" })}>
              Try again
            </Button>
          </div>
        );
      }

      const chunkError = isChunkLoadError(this.state.message);
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 dark:border-white/[0.08] dark:bg-neutral-900 max-w-sm w-full">
            <p className="text-[16px] font-semibold text-neutral-900 dark:text-white mb-1">
              Something went wrong
            </p>
            <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mb-5 font-mono break-all">
              {chunkError
                ? "A cached app version is stale or failed to load. Reloading the app should restore the latest build."
                : this.state.message}
            </p>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => {
                if (chunkError) {
                  void hardRefreshApp();
                } else {
                  resetReloadCount();
                  clearStaleCaches().finally(() => this.setState({ hasError: false, message: "" }));
                }
              }}
            >
              {chunkError ? "Reload app" : "Try again"}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
