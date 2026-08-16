/**
 * PlanR background reminders — a Cloudflare Worker (free plan, 1-minute cron)
 * that sends Web Push notifications while the app is closed.
 *
 * Each run walks every user with reminders enabled, reads their synced schedule
 * + settings + timezone from Firestore (REST), computes which reminders just
 * came due in their local time, and sends a Web Push to each registered
 * subscription. A per-user/per-day "sent" marker makes each reminder fire at
 * most once; subscriptions that 404/410 are pruned.
 *
 * Notifications use the same `tag` as the in-app foreground reminders
 * (lib/reminders.ts), so the two collapse into one instead of double-notifying.
 *
 * Also serves a small HTTP surface (`fetch`) alongside the cron: currently just
 * `POST /push/test`, which lets a signed-in device fire a single test push at
 * itself on demand (Settings → Reminders → "Send test notification") instead of
 * waiting up to a minute for the real cron. No auth beyond "you already possess
 * a valid PushSubscription object" — see the handler's own comment for why
 * that's an adequate trust boundary here.
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { Firestore, uidFromName, idFromName, type Env } from "./firestore.js";
import { computeDueReminders, type ReminderSettings, type Schedule } from "./reminders.js";

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

type Vapid = { subject: string; publicKey: string; privateKey: string };

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/push/test" && request.method === "POST") {
      return handleTestPush(request, env, cors);
    }
    return json(404, { error: "not found" }, cors);
  },
};

// ── Shared send-one-push helper ─────────────────────────────────────────────

/**
 * Sends one Web Push message to one subscription. Returns the upstream push
 * service's Response so callers can branch on 404/410 (dead subscription) vs
 * other failures — used by both the cron run and the test-push endpoint so
 * they can't drift on how a send actually happens.
 */
async function sendPush(
  sub: Subscription,
  message: { title: string; body: string; tag: string; url: string },
  vapid: Vapid,
  ttlSeconds: number,
): Promise<Response> {
  const payload = await buildPushPayload(
    { data: JSON.stringify(message), options: { ttl: ttlSeconds } },
    { endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime ?? null },
    vapid,
  );
  return fetch(sub.endpoint, payload);
}

async function run(env: Env): Promise<void> {
  const fs = new Firestore(env);
  const vapid: Vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
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
              console.warn("push send failed", uid, String(err));
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

async function handleTestPush(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: { subscription?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" }, cors);
  }

  if (!isValidSubscription(body.subscription)) {
    return json(400, { error: "Missing or malformed subscription" }, cors);
  }

  const vapid: Vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const message = {
    title: "Test notification",
    body: "If you can see this, background push is working.",
    tag: "planr-test",
    url: "/",
  };

  try {
    // Short TTL — a test push that arrives late/stale after a retry isn't useful.
    const res = await sendPush(body.subscription, message, vapid, 60);
    if (res.ok) return json(200, { ok: true }, cors);
    // 404/410 = the push service no longer recognises this subscription — the
    // most actionable failure to surface, since the fix (re-toggle Reminders
    // off/on) is different from "something else is wrong."
    const stale = res.status === 404 || res.status === 410;
    return json(502, {
      ok: false,
      error: stale
        ? "This subscription has expired — turn Reminders off and on again."
        : `Push service returned ${res.status}.`,
    }, cors);
  } catch (err) {
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Unknown error" }, cors);
  }
}

// ── Small HTTP helpers ────────────────────────────────────────────────────────

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": request.headers.get("origin") ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(status: number, data: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}
