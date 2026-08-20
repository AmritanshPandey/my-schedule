# PlanR Reminders Worker

This Cloudflare Worker handles background Web Push reminders for the static PlanR app.

It runs a one-minute cron that reads reminder configuration and schedules from Firestore, sends due notifications, and prunes expired subscriptions. It also serves `POST /push/test` for the in-app test notification action.

## Setup

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npx wrangler deploy
```

Set the resulting Worker URL in the web app as `NEXT_PUBLIC_REMINDERS_WORKER_URL`. AI providers are configured separately by each user in PlanR AI Settings and do not use this Worker.
