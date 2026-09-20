"use client";

/**
 * Web Push subscription (VAPID) — the client half of background reminders.
 *
 * We use the standard Push API + our own `public/sw.js` push handler rather than
 * the FCM SDK: it needs no extra service worker, gives us full control of how a
 * notification renders, and is the reliable path for installed iOS PWAs (the
 * app's primary surface). The server (functions/) sends via the `web-push`
 * library using the matching VAPID keypair.
 *
 * Everything degrades to a no-op when push isn't supported or the public VAPID
 * key isn't configured, so the app is safe to ship before the server exists.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
// worker/src/index.ts's deployed origin — serves POST /push/test. It used to
// also proxy Gemini AI calls (hence the old var name, NEXT_PUBLIC_AI_WORKER_URL);
// AI now runs on a local MLX model the browser talks to directly, so this
// Worker is push-only these days.
const WORKER_URL = process.env.NEXT_PUBLIC_REMINDERS_WORKER_URL;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    !!VAPID_PUBLIC_KEY
  );
}

/** VAPID keys are base64url; the subscribe API wants a Uint8Array over a plain
 *  ArrayBuffer (BufferSource). */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * The active service worker registration, or null — without ever hanging.
 *
 * `navigator.serviceWorker.ready` NEVER settles when nothing is registered. It
 * is not slow and it does not reject: the promise simply stays pending
 * forever, so an `await` on it stalls its caller permanently and the
 * surrounding try/catch never runs. That is the exact state this app puts iOS
 * into on purpose — see DISABLE_SW_ON_IOS in lib/iosSafeMode.ts, which
 * unregisters the worker on every iOS device — so the push toggle there would
 * spin with no error and no timeout.
 *
 * `getRegistration()` settles immediately either way, so it is the safe thing
 * to ask first. The `ready` await afterwards is still bounded, because a
 * registration that exists can still be stuck activating.
 */
const REGISTRATION_TIMEOUT_MS = 5_000;

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS)),
  ]);
}

/**
 * Ensure a push subscription for this device and return it as JSON (to store in
 * Firestore for the server). Reuses an existing subscription when present.
 *
 * Returns null — promptly — when push is unsupported, unconfigured, or there is
 * no service worker to subscribe through. Null is the honest answer for the
 * last case: callers should treat it as "this device cannot receive background
 * reminders" rather than as a transient failure to retry.
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (!isPushSupported()) return null;
  const reg = await activeRegistration();
  if (!reg) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    });
  }
  return sub.toJSON();
}

/** Tear down this device's subscription; returns the JSON that was removed. */
export async function unsubscribeFromPush(): Promise<PushSubscriptionJSON | null> {
  const reg = await activeRegistration();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const json = sub.toJSON();
  await sub.unsubscribe();
  return json;
}

export type TestPushResult = { ok: true } | { ok: false; error: string };

/**
 * Fire one test push at this device's own subscription, via the Worker's
 * POST /push/test — the "Send test notification" button in Settings. Requires
 * an existing subscription (pass the result of `subscribeToPush()`) and the
 * Worker's deployed URL to be configured; both failures come back as a
 * readable `error` string rather than throwing, since this is a diagnostic
 * action a user triggers directly and expects a plain answer, not a console
 * error.
 */
export async function sendTestPush(subscription: PushSubscriptionJSON): Promise<TestPushResult> {
  if (!WORKER_URL || WORKER_URL.includes("<your-subdomain>")) {
    return { ok: false, error: "The reminders worker isn't configured yet (NEXT_PUBLIC_REMINDERS_WORKER_URL)." };
  }
  try {
    const res = await fetch(`${WORKER_URL.replace(/\/$/, "")}/push/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscription }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error || `Request failed (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach the reminders worker — check your connection." };
  }
}
