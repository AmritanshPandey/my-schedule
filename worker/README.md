# PlanR's Cloudflare Worker (free)

One free Worker, two jobs — chosen because it's the only backend-capable piece
of this app (PlanR itself is a static export with no server), and because
sharing secrets/deploy/Firestore-client between them costs nothing extra.

## Job 1: background Web Push reminders

A scheduled Worker that sends Web Push reminders while the app is **closed** —
with no billing relationship. Cloudflare's free plan includes Cron Triggers at
1-minute precision, and the Web Push protocol itself (Apple/Google/Mozilla push
gateways) is free. This replaces the need for Firebase Cloud Functions / Blaze.

- Runs every minute (`crons = ["* * * * *"]` in `wrangler.toml`).
- Reads Firestore over REST using a Google **service account** (JWT signed with
  Web Crypto → OAuth token). For each user with `users/{uid}/push/config.settings.enabled`,
  it reads their synced schedule + settings + timezone, computes which reminders
  came due in their **local** time (`src/reminders.ts`), and sends a Web Push to
  every subscription in `users/{uid}/pushSubscriptions` (`@block65/webcrypto-web-push`).
- A per-user/per-day marker (`users/{uid}/push/sent`) fires each reminder once.
- Dead subscriptions (404/410) are pruned. Notifications share the app's `tag`,
  so a foreground and a background copy collapse into one.

The client half is already wired: `lib/push/webPush.ts` (subscribe with the
public VAPID key), `lib/push/pushConfig.ts` (writes config + subscription to
Firestore), and the `push` handler in `public/sw.js`.

## Job 2: Gemini AI proxy (`POST /ai/chat`)

PlanR's AI features run on a single, developer-owned Gemini API key (Google's
free tier) shared across every user — a key like that can't live in the app's
JS bundle (static export, no server, anything `NEXT_PUBLIC_*` is world-readable
via view-source), so the client never sees it. Instead it calls this Worker,
which:

1. Verifies the caller's **Firebase Auth ID token** (`src/auth.ts`) — no
   Firebase Admin SDK available in a Worker, so this hand-rolls RS256
   verification with Web Crypto against Google's public JWKS, the mirror of
   the service-account JWT this Worker already *signs* for Firestore access.
2. Checks + increments a **per-user daily cap** and a **global daily cap**
   (`src/usage.ts`, `users/{uid}/aiUsage/{date}` and `system/aiUsage/{date}` in
   Firestore) — the shared key can't be drained by one user or by aggregate
   traffic. 401 on a bad/expired token, 429 with `{reason: "per-user-cap" |
   "global-cap"}` on a capped request.
3. Streams the reply from `generativelanguage.googleapis.com` straight back to
   the client (`src/gemini.ts`) — no buffering.

Request body: `{ systemPrompt: string, messages: [{role: "user"|"assistant",
content: string}] }`, sent with `Authorization: Bearer <Firebase ID token>`.
Client half: `lib/aiClient.ts`.

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

# 4) Gemini API key (the AI identity — free tier):
#    Google AI Studio → aistudio.google.com/apikey → Create API key.
#    Confirm the current free-tier RPM/RPD for the model in wrangler.toml's
#    GEMINI_MODEL var (defaults change over time) and adjust
#    AI_PER_USER_DAILY_CAP / AI_GLOBAL_DAILY_CAP there if needed.

# 5) Configure + deploy the Worker
cd worker
npm install
npx wrangler login                      # free Cloudflare account
npx wrangler secret put FIREBASE_PROJECT_ID     # e.g. planr-75429
npx wrangler secret put FIREBASE_CLIENT_EMAIL   # from the service-account JSON
npx wrangler secret put FIREBASE_PRIVATE_KEY    # the PEM private_key (paste as-is)
npx wrangler secret put VAPID_PUBLIC_KEY        # Public Key from step 1
npx wrangler secret put VAPID_PRIVATE_KEY       # Private Key from step 1
npx wrangler secret put VAPID_SUBJECT           # e.g. mailto:you@example.com
npx wrangler secret put GEMINI_API_KEY          # the key from step 4
npx wrangler deploy

# 6) Expose this Worker's URL to the web app and redeploy hosting:
#    `npx wrangler deploy` prints it (https://planr-reminders.<your-subdomain>.workers.dev).
#    add to .env.local (and the hosting build env):
#      NEXT_PUBLIC_AI_WORKER_URL=<the workers.dev URL from step 5>
```

## Verify

### Push reminders
1. Rebuild/redeploy the web app with `NEXT_PUBLIC_VAPID_PUBLIC_KEY` set, open the
   installed PWA (iOS 16.4+ / Android / desktop), enable **Reminders** in Settings,
   and grant permission.
2. Confirm `users/{uid}/push/config` and `users/{uid}/pushSubscriptions/*` exist in
   Firestore.
3. Schedule a task a couple minutes out, fully close the app, and wait for the push.
4. Tail logs: `npx wrangler tail`.

### AI proxy
1. `cd worker && npx wrangler dev` for local testing, or test the deployed
   `*.workers.dev` URL directly.
2. Get a real Firebase ID token — sign in to the deployed app, then in the
   browser devtools console: `await firebase.auth().currentUser.getIdToken()`
   (or wire up a throwaway test script).
3. `curl -X POST <worker-url>/ai/chat -H "Authorization: Bearer $TOKEN" -H
   "content-type: application/json" -d
   '{"systemPrompt":"You are terse.","messages":[{"role":"user","content":"say hi"}]}'`
   → expect a streamed SSE body (`data: {...}` lines).
4. Same call with a garbage token → expect `401`.
5. Call repeatedly past `AI_PER_USER_DAILY_CAP` → expect `429
   {"reason":"per-user-cap"}`.
6. `npx wrangler tail` while curling to watch uid extraction, cap outcome, and
   Gemini latency in real time.

## Free-plan note

Cloudflare's free plan allows **50 subrequests per invocation**. Each run uses a
few subrequests per active user (token + reads + sends), so it comfortably covers
a personal / small user base. If you grow past ~a handful of active users per
minute, move to the Workers Paid plan ($5/mo, 1000 subrequests) or shard the run.
