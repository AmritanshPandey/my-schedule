"use client";

/**
 * On-device error log — a small persistent ring buffer plus global handlers.
 *
 * Why this exists: on iOS Safari/PWA you usually can't attach Web Inspector, and
 * the WebKit "A problem repeatedly occurred" screen swallows whatever threw.
 * This captures errors from THREE sources React error boundaries miss on their
 * own — uncaught `window` errors, unhandled promise rejections, and (via
 * `logError`) React render crashes — and persists them so they survive the
 * reload/crash, letting you read the real message on the phone itself.
 */

import { isChunkLoadError, recoverFromChunkError } from "@/lib/chunkRecovery";

export interface LoggedError {
  time: number;       // epoch ms
  source: string;     // "window" | "promise" | "react:Timeline" | ...
  message: string;
  stack?: string;
}

const KEY = "planr-error-log";
const MAX = 25;

type Listener = (errors: LoggedError[]) => void;
const listeners = new Set<Listener>();

function safeRead(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(errors: LoggedError[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(errors));
  } catch {
    /* storage full / unavailable — best effort */
  }
}

export function getErrorLog(): LoggedError[] {
  return safeRead();
}

export function clearErrorLog(): void {
  safeWrite([]);
  listeners.forEach((fn) => fn([]));
}

export function onErrorLogChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function normalizeMessage(value: unknown): string {
  if (value instanceof Error) return value.message || value.name || "Unknown error";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Record an error from any source. Deduplicates identical back-to-back entries. */
export function logError(source: string, error: unknown, extraStack?: string): void {
  const entry: LoggedError = {
    time: Date.now(),
    source,
    message: normalizeMessage(error),
    stack: error instanceof Error ? error.stack : extraStack,
  };

  // Always mirror to the console for desktop debugging.
  console.error(`[${source}]`, error);

  const current = safeRead();
  const last = current[current.length - 1];
  // Collapse a rapid repeat of the same message (crash loops spam identical errors).
  if (last && last.source === entry.source && last.message === entry.message && entry.time - last.time < 1000) {
    return;
  }
  const next = [...current, entry].slice(-MAX);
  safeWrite(next);
  listeners.forEach((fn) => fn(next));
}

let installed = false;

/** Install global window error + unhandled-rejection handlers. Idempotent. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    // Ignore benign ResizeObserver loop notices that some browsers emit.
    if (event.message && event.message.includes("ResizeObserver loop")) return;
    // Drop opaque cross-origin "Script error." reports. iOS Safari masks the
    // message, filename, line, and Error object for any throw from a script on
    // another origin (e.g. Firebase Analytics' gtag.js from googletagmanager.com,
    // which ITP interferes with in a standalone PWA). They carry no actionable
    // detail and would otherwise bury the real crash this reporter exists to surface.
    const opaque = !event.error && !event.filename && /^script error\.?$/i.test(event.message ?? "");
    if (opaque) return;
    const where = event.filename
      ? ` (${event.filename.split("/").pop()}:${event.lineno}:${event.colno})`
      : "";
    logError("window", event.error ?? `${event.message}${where}`);
    maybeRecoverFromChunkError(event.message, event.error);
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    logError("promise", event.reason ?? "Unhandled promise rejection");
    // A failed dynamic import()/prefetch rejects here and never reaches the React
    // ErrorBoundary, so recover from a stale-build chunk error on this path too.
    maybeRecoverFromChunkError(undefined, event.reason);
  });
}

function maybeRecoverFromChunkError(message: unknown, error: unknown): void {
  const text =
    (typeof message === "string" ? message : "") ||
    (error instanceof Error ? `${error.name} ${error.message}` : typeof error === "string" ? error : "");
  if (isChunkLoadError(text)) recoverFromChunkError();
}
