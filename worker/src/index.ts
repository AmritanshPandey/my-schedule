/**
 * PlanR's Cloudflare Worker — two independent responsibilities on one free
 * Worker (shared secrets, shared Firestore client, one deploy):
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
 * 2. `fetch` (`POST /ai/chat`): proxies Gemini AI calls behind a shared,
 *    developer-owned API key that must never reach the client (this app is a
 *    static export — anything in the JS bundle is public). Verifies the
 *    caller's Firebase Auth ID token (auth.ts), enforces a per-user + global
 *    daily cap on the shared key (usage.ts), then streams Gemini's response
 *    straight back (gemini.ts).
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { Firestore, uidFromName, idFromName, type Env } from "./firestore.js";
import { computeDueReminders, type ReminderSettings, type Schedule } from "./reminders.js";
import { verifyFirebaseIdToken } from "./auth.js";
import { streamGemini, type GeminiMessage } from "./gemini.js";
import { checkAndIncrement, type UsageCaps } from "./usage.js";

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

// No cookies/credentials are used (auth is a Bearer token whose CONTENT is
// verified server-side, not the request's origin), so a wildcard origin is
// safe here — it doesn't grant access to anything, it just permits the
// browser to let JS read the response. A custom `authorization` header still
// triggers a CORS preflight, hence the OPTIONS handling below.
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

async function handleAiChat(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("authorization") ?? "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return json(401, { error: "missing bearer token" });

  const verified = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!verified) return json(401, { error: "invalid or expired token" });

  let payload: { systemPrompt?: string; messages?: GeminiMessage[]; maxOutputTokens?: number };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }
  const { systemPrompt, messages, maxOutputTokens } = payload;
  if (!systemPrompt || !Array.isArray(messages) || messages.length === 0) {
    return json(400, { error: "systemPrompt and a non-empty messages array are required" });
  }
  // Clamped, not trusted as-is — a client-supplied token budget still needs a
  // ceiling so it can't be used to run up the shared key's quota per call.
  const tokenBudget = Math.min(Math.max(Number(maxOutputTokens) || 1024, 256), 4096);

  const fs = new Firestore(env);
  const caps: UsageCaps = {
    perUser: Number(env.AI_PER_USER_DAILY_CAP) || 20,
    global: Number(env.AI_GLOBAL_DAILY_CAP) || 300,
  };
  const usage = await checkAndIncrement(fs, verified.uid, caps);
  if (!usage.ok) {
    return json(429, {
      error: "daily AI limit reached",
      reason: usage.reason,
    });
  }

  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  let upstream: Response;
  try {
    upstream = await streamGemini(env.GEMINI_API_KEY, model, systemPrompt, messages, tokenBudget);
  } catch (err) {
    return json(502, { error: "gemini request failed", detail: String(err) });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error("gemini upstream error", upstream.status, detail);
    return json(upstream.status || 502, { error: "gemini error" });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: { "content-type": "text/event-stream", ...CORS_HEADERS },
  });
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const { pathname } = new URL(request.url);
    if (pathname === "/ai/chat" && request.method === "POST") {
      return handleAiChat(request, env);
    }
    return json(404, { error: "not found" });
  },
};

async function run(env: Env): Promise<void> {
  const fs = new Firestore(env);
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
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
        const message = {
          data: JSON.stringify({ title: r.title, body: r.body, tag: r.tag, url: r.url }),
          options: { ttl: 300 },
        };
        await Promise.all(
          subs.map(async ({ id, sub }) => {
            try {
              const payload = await buildPushPayload(
                message,
                { endpoint: sub.endpoint, keys: sub.keys, expirationTime: sub.expirationTime ?? null },
                vapid,
              );
              const res = await fetch(sub.endpoint, payload);
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
