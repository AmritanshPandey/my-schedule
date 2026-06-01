"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  reloadAttempts: number;
}

function isChunkLoadError(message: string) {
  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to load chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("Unexpected token")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "", reloadAttempts: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message, reloadAttempts: 0 };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  componentDidUpdate(_: Props, prevState: State) {
    if (
      this.state.hasError &&
      this.state.reloadAttempts === 0 &&
      isChunkLoadError(this.state.message) &&
      (prevState.hasError === false || prevState.message !== this.state.message)
    ) {
      this.setState({ reloadAttempts: 1 }, () => {
        window.setTimeout(() => {
          window.location.reload();
        }, 800);
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
              onClick={() => window.location.reload()}
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
