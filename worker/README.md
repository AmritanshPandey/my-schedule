# PlanR background reminders — Cloudflare Worker (free)

A scheduled Worker that sends Web Push reminders while the app is **closed** —
with no billing relationship. Cloudflare's free plan includes Cron Triggers at
1-minute precision, and the Web Push protocol itself (Apple/Google/Mozilla push
gateways) is free. This replaces the need for Firebase Cloud Functions / Blaze.

## How it works

- Runs every minute (`crons = ["* * * * *"]` in `wrangler.toml`).
- Reads Firestore over REST using a Google **service account** (JWT signed with
  Web Crypto → OAuth token). For each user with `users/{uid}/push/config.settings.enabled`,
  it reads their synced schedule + settings + timezone, computes which reminders
  came due in their **local** time (`src/reminders.ts`), and sends a Web Push to
  every subscription in `users/{uid}/pushSubscriptions` (`@block65/webcrypto-web-push`).
- A per-user/per-day marker (`users/{uid}/push/sent`) fires each reminder once.
- Dead subscriptions (404/410) are pruned. Notifications share the app's `tag`,
  so a foreground and a background copy collapse into one.
- Also serves `POST /push/test` (see `fetch` in `src/index.ts`) — sends one push
  at whatever subscription the caller supplies, no cron wait. Its only "auth" is
  that a subscription's endpoint+keys are a bearer credential the caller must
  already possess (there's no public way to obtain someone else's), so it
  doesn't need to verify a Firebase ID token.

The client half is already wired: `lib/push/webPush.ts` (subscribe with the
public VAPID key, plus `sendTestPush()` for the on-demand test), `lib/push/pushConfig.ts`
(writes config + subscription to Firestore), the `push` handler in `public/sw.js`,
and the "Send test" button in `components/settings/RemindersRows.tsx`.

## One-time setup (all free)

```bash
# 1) VAPID keypair (the push identity)
npx web-push generate-vapid-keys        # prints a Public Key and Private Key

# 2) Firebase service account for Firestore REST access:
#    Firebase console → Project settings → Service accounts → Generate new private key
#    From the downloaded JSON you need: project_id, client_email, private_key

# 3) Expose the PUBLIC vapid key to the web app and redeploy hosting:
#    add to .env.local (and the hosting build env):
#      NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key from step 1>

# 4) Configure + deploy the Worker
cd worker
npm install
npx wrangler login                      # free Cloudflare account
npx wrangler secret put FIREBASE_PROJECT_ID     # e.g. planr-75429
npx wrangler secret put FIREBASE_CLIENT_EMAIL   # from the service-account JSON
npx wrangler secret put FIREBASE_PRIVATE_KEY    # the PEM private_key (paste as-is)
npx wrangler secret put VAPID_PUBLIC_KEY        # Public Key from step 1
npx wrangler secret put VAPID_PRIVATE_KEY       # Private Key from step 1
npx wrangler secret put VAPID_SUBJECT           # e.g. mailto:you@example.com
npx wrangler deploy
```

## Verify

1. Rebuild/redeploy the web app with `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set, open the
   installed PWA (iOS 16.4+ / Android / desktop), enable **Reminders** in Settings,
   and grant permission.
2. Confirm `users/{uid}/push/config` and `users/{uid}/pushSubscriptions/*` exist in
   Firestore.
3. Tap **Settings → Reminders → Send test** to fire one push at this device on
   demand via `POST /push/test` — the fastest way to check the full chain
   (browser → Worker → push service → device) without waiting on the cron or
   scheduling a real task. Needs `NEXT_PUBLIC_AI_WORKER_URL` set to this
   Worker's deployed URL (shared with the AI chat proxy — same Worker, both
   routes).
4. For the real end-to-end path: schedule a task a couple minutes out, fully
   close the app, and wait for the push.
5. Tail logs: `npx wrangler tail`.

## Free-plan note

Cloudflare's free plan allows **50 subrequests per invocation**. Each run uses a
few subrequests per active user (token + reads + sends), so it comfortably covers
a personal / small user base. If you grow past ~a handful of active users per
minute, move to the Workers Paid plan ($5/mo, 1000 subrequests) or shard the run.
