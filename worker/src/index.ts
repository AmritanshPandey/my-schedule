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
 */

import { buildPushPayload } from "@block65/webcrypto-web-push";
import { Firestore, uidFromName, idFromName, type Env } from "./firestore.js";
import { computeDueReminders, type ReminderSettings, type Schedule } from "./reminders.js";

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
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
