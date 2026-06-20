"use client";

import { useEffect, useState } from "react";
import {
  getErrorLog,
  clearErrorLog,
  onErrorLogChange,
  installGlobalErrorHandlers,
  type LoggedError,
} from "@/lib/errorLog";

/**
 * On-screen error reporter. Renders nothing until something has been logged,
 * then shows a tappable pill (bottom-left) with the error count. Expanding it
 * lists the captured errors so they can be read — and copied — directly on the
 * device, which is how we diagnose the iOS Safari crash without Web Inspector.
 *
 * Reads the persisted log on mount, so errors from the previous (crashed)
 * session are still visible after the reload.
 */
export default function ErrorReporter() {
  const [errors, setErrors] = useState<LoggedError[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    installGlobalErrorHandlers();
    setErrors(getErrorLog());
    return onErrorLogChange(setErrors);
  }, []);

  if (errors.length === 0) return null;

  const copyAll = () => {
    const text = errors
      .map((e) => `[${new Date(e.time).toLocaleTimeString()}] (${e.source}) ${e.message}${e.stack ? `\n${e.stack}` : ""}`)
      .join("\n\n");
    try {
      navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="fixed left-2 z-[9999] max-w-[calc(100vw-1rem)]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
    >
      {open ? (
        <div className="w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-red-300 bg-white shadow-2xl dark:border-red-500/40 dark:bg-neutral-900">
          <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-500/10">
            <span className="text-[12px] font-bold text-red-700 dark:text-red-300">
              {errors.length} error{errors.length === 1 ? "" : "s"} captured
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={copyAll}
                className="rounded-lg border border-red-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 dark:border-red-500/40 dark:bg-neutral-800 dark:text-red-300"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => clearErrorLog()}
                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Collapse error log"
                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-600 dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="max-h-[40vh] overflow-y-auto px-3 py-2">
            {errors
              .slice()
              .reverse()
              .map((e, i) => (
                <div key={i} className="border-b border-neutral-100 py-2 last:border-0 dark:border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/20 dark:text-red-300">
                      {e.source}
                    </span>
                    <span className="text-[10px] text-neutral-400">{new Date(e.time).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-1 break-words font-mono text-[11px] leading-snug text-neutral-800 dark:text-neutral-200">
                    {e.message}
                  </p>
                  {e.stack && (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
                      {e.stack}
                    </pre>
                  )}
                </div>
              ))}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-[12px] font-bold text-red-700 shadow-lg dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
        >
          ⚠︎ {errors.length} error{errors.length === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
