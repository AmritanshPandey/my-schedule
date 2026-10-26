/**
 * Opt-in error telemetry — native port of lib/errorTelemetry.ts. Forwards
 * captured errors to the signed-in user's own Firestore space
 * (`users/{uid}/errors`), the same collection and document shape the web app
 * writes, so both platforms' reports read the same in the console.
 *
 * Same privacy posture: off by default (per-device flag), only for signed-in
 * users into their own `users/{uid}/**` space, rate-limited, truncated, and
 * never carrying schedule content. `userAgent` becomes the platform + OS
 * version, the closest native equivalent.
 */
import { Platform } from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { registerErrorSink, type LoggedError } from './errorLog';
import { APP_VERSION, BUILD_ID } from './buildInfo';
import { storage } from '../storage/mmkv';

const ENABLED_KEY = 'planr-error-telemetry';

const MAX_PER_SESSION = 20;
const MIN_INTERVAL_MS = 2_000;
const MESSAGE_CAP = 500;
const STACK_CAP = 4_000;

let _uid: string | null = null;
let _unregister: (() => void) | null = null;
let _sentThisSession = 0;
let _lastSentAt = 0;
const _seen = new Set<string>();

export function isErrorTelemetryEnabled(): boolean {
  try {
    return storage.getString(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setErrorTelemetryEnabled(on: boolean): void {
  try {
    storage.set(ENABLED_KEY, on ? '1' : '0');
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
    await addDoc(collection(db, 'users', _uid, 'errors'), {
      source: error.source,
      message: truncate(error.message, MESSAGE_CAP) ?? '',
      stack: truncate(error.stack, STACK_CAP) ?? null,
      at: error.time,
      reportedAt: serverTimestamp(),
      appVersion: APP_VERSION,
      buildId: BUILD_ID,
      userAgent: truncate(`PlanR ${Platform.OS} ${String(Platform.Version)}`, 300) ?? '',
    });
  } catch {
    // Best-effort — a failed report must never surface to the user or re-throw.
  }
}

/** Point telemetry at the current user and ensure the sink is registered. */
export function initErrorTelemetry(uid: string | null): void {
  _uid = uid;
  if (uid && !_unregister) {
    _unregister = registerErrorSink((e) => void forward(e));
  } else if (!uid && _unregister) {
    _unregister();
    _unregister = null;
  }
}
