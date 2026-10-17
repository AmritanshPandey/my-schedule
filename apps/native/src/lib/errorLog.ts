/**
 * On-device error log — native port of lib/errorLog.ts. Same small persistent
 * ring buffer, same dedupe window, same sink registry (so opt-in telemetry can
 * forward entries without this module importing Firebase), on MMKV instead of
 * localStorage.
 *
 * Global handlers: React Native has no `window "error"` / `"unhandledrejection"`
 * events. Their equivalents are ErrorUtils' global handler (uncaught JS errors,
 * including render crashes outside an error boundary) and Hermes' promise
 * rejection tracker. Both are chained, never replaced, so RN's own red-box /
 * crash behaviour is unchanged.
 */
import { storage } from '../storage/mmkv';

export interface LoggedError {
  time: number; // epoch ms
  source: string; // "global" | "promise" | "react:Today" | "cloudsync" | ...
  message: string;
  stack?: string;
}

const KEY = 'planr-error-log';
const MAX = 25;

type Listener = (errors: LoggedError[]) => void;
const listeners = new Set<Listener>();

type ErrorSink = (error: LoggedError) => void;
const sinks = new Set<ErrorSink>();

/** Register a sink that receives every newly logged error. Returns an unsubscribe. */
export function registerErrorSink(sink: ErrorSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

function safeRead(): LoggedError[] {
  try {
    const raw = storage.getString(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(errors: LoggedError[]): void {
  try {
    storage.set(KEY, JSON.stringify(errors));
  } catch {
    /* storage unavailable — best effort */
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
  if (value instanceof Error) return value.message || value.name || 'Unknown error';
  if (typeof value === 'string') return value;
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

  // console.warn rather than console.error: in a dev build console.error opens
  // RN's full-screen red box, which these handled, non-fatal reports aren't.
  console.warn(`[${source}]`, error);

  const current = safeRead();
  const last = current[current.length - 1];
  if (last && last.source === entry.source && last.message === entry.message && entry.time - last.time < 1000) {
    return;
  }
  const next = [...current, entry].slice(-MAX);
  safeWrite(next);
  listeners.forEach((fn) => fn(next));
  sinks.forEach((sink) => {
    try {
      sink(entry);
    } catch {
      /* sink failure is non-fatal */
    }
  });
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsShape {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}
interface HermesShape {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
}

let installed = false;

/** Install the global JS-error and unhandled-rejection handlers. Idempotent. */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  const g = globalThis as unknown as { ErrorUtils?: ErrorUtilsShape; HermesInternal?: HermesShape };
  const errorUtils = g.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      logError(isFatal ? 'global:fatal' : 'global', error);
      previous(error, isFatal);
    });
  }

  try {
    g.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => logError('promise', rejection ?? 'Unhandled promise rejection'),
    });
  } catch {
    /* tracker unavailable (non-Hermes runtime, e.g. Jest) */
  }
}
