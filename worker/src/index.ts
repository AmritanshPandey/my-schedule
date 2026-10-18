/**
 * PlanR's Cloudflare Worker — two responsibilities on one free Worker (shared
 * secrets, shared Firestore client, one deploy):
 *
 * 1. `scheduled` (1-minute cron): sends Web Push notifications while the app
 *    is closed. Each run walks every user with reminders enabled, reads their
 *    synced schedule + settings + timezone from Firestore (REST), computes
 *    which reminders just came due in their local time, and sends a Web Push
 *    to each registered subscription. A per-user/per-day "sent" marker makes
 *    each reminder fire at most once; subscriptions that 404/410 are pruned.
 *    Notifications use the same `tag` as the in-app foreground reminders
 *    (lib/reminders.ts), so the two collapse into one instead of double-notifying.
 *
 * 2. `fetch` (`POST /push/test`): lets a signed-in device fire a single test
 *    push at itself on demand (Settings → Reminders → "Send test") instead of
 *    waiting up to a minute for the real cron. No auth beyond "you already
 *    possess a valid PushSubscription object" — see the handler's own comment
 *    for why that's an adequate trust boundary here.
 *
 * This Worker used to also proxy Gemini AI calls behind a shared API key
 * (`POST /ai/chat`, verifying a Firebase ID token and enforcing daily usage
 * caps). That's gone — AI now runs on a local MLX model the browser talks to
 * directly (lib/aiClient.ts), so there's nothing left for this Worker to
 * guard or proxy for AI. See git history if that proxy pattern is ever needed
 * again for a real remote provider.
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { Firestore, uidFromName, idFromName, type Env } from "./firestore.js";
import { isVapidFailure, vapidConfigProblem } from "./vapid.js";
import { computeDueReminders, type ReminderSettings, type Schedule } from "./reminders.js";

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

type Vapid = { subject: string; publicKey: string; privateKey: string };

// /push/test needs no auth at all — see its own comment below — so a
// wildcard origin is safe here: it doesn't grant access to anything, it just
// permits the browser to let JS read the response.
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

// ── POST /push/test ──────────────────────────────────────────────────────────

/**
 * A subscription's `endpoint` + `keys` are a bearer credential unique to one
 * browser's push registration — there's no public/guessable way to obtain
 * someone else's (Firestore's rules already scope `pushSubscriptions` reads to
 * `request.auth.uid == uid`, and the raw values never appear anywhere else).
 * So "the caller supplied a well-formed subscription object" is itself the
 * authorization: this endpoint doesn't need to verify a Firebase ID token or
 * know which uid is asking, it just relays a push to the literal subscription
 * handed to it — exactly the one the calling device already owns.
 */
function isValidSubscription(value: unknown): value is Subscription {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.endpoint !== "string" || !v.endpoint.startsWith("https://")) return false;
  const keys = v.keys as Record<string, unknown> | undefined;
  return !!keys && typeof keys.p256dh === "string" && typeof keys.auth === "string";
}

async function handleTestPush(request: Request, env: Env): Promise<Response> {
  let body: { subscription?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!isValidSubscription(body.subscription)) {
    return json(400, { error: "Missing or malformed subscription" });
  }

  const vapid: Vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const configProblem = vapidConfigProblem(vapid);
  if (configProblem) {
    return json(500, { ok: false, error: `Push isn't configured on the server yet — ${configProblem}.` });
  }

  const message = {
    title: "Test notification",
    body: "If you can see this, background push is working.",
    tag: "planr-test",
    url: "/",
  };

  try {
    // Short TTL — a test push that arrives late/stale after a retry isn't useful.
    const res = await sendPush(body.subscription, message, vapid, 60);
    if (res.ok) return json(200, { ok: true });
    // 404/410 = the push service no longer recognises this subscription — the
    // most actionable failure to surface, since the fix (re-toggle Reminders
    // off/on) is different from "something else is wrong."
    const stale = res.status === 404 || res.status === 410;
    return json(502, {
      ok: false,
      error: stale
        ? "This subscription has expired — turn Reminders off and on again."
        : `Push service returned ${res.status}.`,
    });
  } catch (err) {
    if (err instanceof VapidConfigError) {
      // Server-side. "Turn Reminders off and on again" would be a wild goose
      // chase — no amount of re-subscribing fixes a missing Worker secret.
      return json(500, { ok: false, error: "Push isn't configured on the server yet (VAPID keys). Nothing to fix on this device." });
    }
    if (err instanceof InvalidSubscriptionError) {
      return json(500, { ok: false, error: "This subscription's stored key data is invalid — turn Reminders off and on again." });
    }
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ── Entry points ─────────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const { pathname } = new URL(request.url);
    if (pathname === "/push/test" && request.method === "POST") {
      return handleTestPush(request, env);
    }
    return json(404, { error: "not found" });
  },
};

// ── Shared send-one-push helper ─────────────────────────────────────────────

/**
 * Thrown when `buildPushPayload` itself fails — i.e. the subscription's
 * *stored* `p256dh`/`auth` keys are malformed (e.g. "Invalid EC key in JSON
 * Web Key"). Unlike a `fetch` failure (which may be a transient network blip,
 * worth retrying next cron tick), this is permanent: the same bad bytes are
 * read from Firestore every time, so it will never succeed. Callers should
 * prune the subscription rather than log-and-retry it forever.
 */
class InvalidSubscriptionError extends Error {}

/**
 * Thrown when the failure is OUR configuration, not the user's subscription —
 * a missing or malformed VAPID subject/key pair.
 *
 * This distinction is not cosmetic. Every VAPID problem surfaces as a throw
 * from `buildPushPayload`, exactly like genuinely corrupt subscription keys do,
 * and the cron handler's response to `InvalidSubscriptionError` is to DELETE
 * the subscription from Firestore. Collapsing the two meant one bad secret on
 * the Worker silently destroyed every user's valid subscription, on the first
 * tick, once a minute, for a problem no user could fix — while the test
 * endpoint told them to "turn Reminders off and on again", which could never
 * help.
 */
class VapidConfigError extends Error {}

/**
 * Sends one Web Push message to one subscription. Returns the upstream push
 * service's Response so callers can branch on 404/410 (dead subscription) vs
 * other failures — used by both the cron run and the test-push endpoint so
 * they can't drift on how a send actually happens. Throws
 * `InvalidSubscriptionError` specifically when the stored keys themselves are
 * unusable, so callers can distinguish "prune this" from "try again later."
 */
async function sendPush(
  sub: Subscription,
  message: { title: string; body: string; tag: string; url: string },
  vapid: Vapid,
  ttlSeconds: number,
): Promise<Response> {
  let payload: RequestInit;
  try {
    payload = await buildPushPayload(
      { data: JSON.stringify(message), options: { ttl: ttlSeconds } },
      { endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime ?? null },
      vapid,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // "Vapid private key is empty", "Vapid subject is empty", and a malformed
    // key's "Invalid keyData" all come out of here looking identical to bad
    // subscription bytes. Only the latter is the user's to fix.
    throw isVapidFailure(message)
      ? new VapidConfigError(message)
      : new InvalidSubscriptionError(message);
  }
  return fetch(sub.endpoint, payload);
}

async function run(env: Env): Promise<void> {
  const fs = new Firestore(env);
  const vapid: Vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };

  // Nothing can be sent without VAPID, and attempting it anyway would walk
  // every user and prune subscriptions that are perfectly good.
  const configProblem = vapidConfigProblem(vapid);
  if (configProblem) {
    console.error(`reminder run skipped — ${configProblem}`);
    return;
  }

  const now = new Date();

  // Every user's config doc lives at users/{uid}/push/config.
  const configs = (await fs.collectionGroup("push")).filter((d) => d.name.endsWith("/push/config"));
  let sent = 0;

  for (const config of configs) {
    const uid = uidFromName(config.name);
    if (!uid) continue;
    const settings = config.fields.settings as ReminderSettings | undefined;
    if (!settings?.enabled) continue;
    const tz = (config.fields.timeZone as string) || "UTC";

    try {
      const snap = await fs.getDoc(`users/${uid}/data/snapshot`);
      const schedule = (snap?.fields.schedule ?? {}) as Schedule;
      const due = computeDueReminders(schedule, settings, tz, now);
      if (due.length === 0) continue;

      // Dedup marker — reset when the user's local day rolls over.
      const tagDate = (due[0].tag.match(/\d{4}-\d{2}-\d{2}/) ?? [""])[0];
      const sentDoc = await fs.getDoc(`users/${uid}/push/sent`);
      const sameDay = sentDoc?.fields.date === tagDate;
      const already = new Set<string>(sameDay ? ((sentDoc?.fields.keys as string[]) ?? []) : []);
      const fresh = due.filter((r) => !already.has(r.tag));
      if (fresh.length === 0) continue;

      const subs = (await fs.listDocs(`users/${uid}/pushSubscriptions`))
        .map((d) => ({ id: idFromName(d.name), sub: d.fields.subscription as Subscription | undefined }))
        .filter((s): s is { id: string; sub: Subscription } => !!s.sub?.endpoint);
      if (subs.length === 0) continue;

      for (const r of fresh) {
        await Promise.all(
          subs.map(async ({ id, sub }) => {
            try {
              const res = await sendPush(sub, r, vapid, 300);
              if (res.status === 404 || res.status === 410) {
                await fs.deleteDoc(`users/${uid}/pushSubscriptions/${id}`);
              } else if (res.ok) {
                sent++;
              }
            } catch (err) {
              if (err instanceof VapidConfigError) {
                // Our problem, not theirs. Pruning here would delete a working
                // subscription because the server was misconfigured.
                console.error("push send failed — VAPID config", String(err));
              } else if (err instanceof InvalidSubscriptionError) {
                // Permanently broken (bad stored keys, not a network blip) —
                // pruned so it stops erroring on every single cron tick
                // forever. The device gets a fresh, valid subscription next
                // time it re-enables Reminders.
                console.warn("pruning subscription with invalid keys", uid, err.message);
                await fs.deleteDoc(`users/${uid}/pushSubscriptions/${id}`).catch(() => {});
              } else {
                console.warn("push send failed", uid, String(err));
              }
            }
          }),
        );
      }

      await fs.setDoc(`users/${uid}/push/sent`, { date: tagDate, keys: [...already, ...fresh.map((r) => r.tag)] });
    } catch (err) {
      console.error("reminder run failed for user", uid, String(err));
    }
  }

  console.log("reminder run complete", { notificationsSent: sent });
}
