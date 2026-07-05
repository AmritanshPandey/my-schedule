"use client";

/**
 * Opt-in error telemetry — forwards captured errors to the signed-in user's own
 * Firestore space (users/{uid}/errors) so real crashes can be diagnosed without
 * the user copying the on-device log by hand.
 *
 * Privacy & safety:
 * - Off by default; enabled per-device via Settings (localStorage flag).
 * - Only writes for authenticated users, into their own collection — the same
 *   `users/{uid}/**` rule that already guards all their data.
 * - Best-effort, heavily rate-limited, and message-truncated. Stacks are kept
 *   (they're the point) but capped in length. No schedule content is included.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { registerErrorSink, type LoggedError } from "@/lib/errorLog";
import { BUILD_ID, APP_VERSION } from "@/lib/buildInfo";

const ENABLED_KEY = "planr-error-telemetry";

const MAX_PER_SESSION = 20;   // don't let a crash loop hammer Firestore
const MIN_INTERVAL_MS = 2_000; // at most one report per 2s
const MESSAGE_CAP = 500;
const STACK_CAP = 4_000;

let _uid: string | null = null;
let _unregister: (() => void) | null = null;
let _sentThisSession = 0;
let _lastSentAt = 0;
const _seen = new Set<string>(); // dedupe identical reports within a session

export function isErrorTelemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setErrorTelemetryEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

function truncate(value: string | undefined, cap: number): string | undefined {
  if (!value) return value;
  return value.length > cap ? `${value.slice(0, cap)}…` : value;
}

async function forward(error: LoggedError): Promise<void> {
  if (!isErrorTelemetryEnabled() || !_uid || !db) return;
  if (_sentThisSession >= MAX_PER_SESSION) return;
  const now = Date.now();
  if (now - _lastSentAt < MIN_INTERVAL_MS) return;

  const fingerprint = `${error.source}|${error.message}`;
  if (_seen.has(fingerprint)) return;
  _seen.add(fingerprint);
  _lastSentAt = now;
  _sentThisSession++;

  try {
    await addDoc(collection(db, "users", _uid, "errors"), {
      source: error.source,
      message: truncate(error.message, MESSAGE_CAP) ?? "",
      stack: truncate(error.stack, STACK_CAP) ?? null,
      at: error.time,
      reportedAt: serverTimestamp(),
      appVersion: APP_VERSION,
      buildId: BUILD_ID,
      userAgent: truncate(navigator.userAgent, 300) ?? "",
    });
  } catch {
    // Best-effort — a failed report must never surface to the user or re-throw.
  }
}

/**
 * Point telemetry at the current user and ensure the sink is registered. Call
 * with null on sign-out. Idempotent; safe to call on every auth change.
 */
export function initErrorTelemetry(uid: string | null): void {
  _uid = uid;
  if (uid && !_unregister) {
    _unregister = registerErrorSink((e) => void forward(e));
  } else if (!uid && _unregister) {
    _unregister();
    _unregister = null;
  }
}
