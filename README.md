# PlanR

**A personal execution OS.** Turn goals into structured plans, then make
day-to-day follow-through the center of gravity — surfacing progress, streaks,
and execution trends so consistency feels visible and rewarding.

The win condition is follow-through, not a beautiful-but-unused plan.

- **Mobile** is for fast daily execution — mark tasks done, log a tracker, keep
  a streak alive.
- **Desktop** is for strategy and setup — building plans, structuring milestones
  and subtasks, reviewing trends over time.

Local-first: renders from IndexedDB immediately, works offline, syncs in the
background.

---

## Tech stack

- **Next.js 16** (App Router) + **React 19**, TypeScript
- **Tailwind CSS v4** — dark-mode-first design system (see `DESIGN.md`)
- **Framer Motion** for motion (honors `prefers-reduced-motion`)
- **IndexedDB** as the local source of truth; **Firebase** (Auth + Firestore)
  for optional cross-device sync
- **PWA** — custom service worker with per-deploy cache versioning
- **Transformers.js** on-device AI (currently gated off; see below)
- Tests: Node's built-in test runner (unit) + **Playwright** (e2e)

## Architecture

```
app/                     Next.js entry (renders ScheduleAppClient)
components/
  ScheduleAppClient.tsx  Picks the shell: iOS app vs. desktop app
  ScheduleApp.tsx        Main desktop/tablet app
  ios/IOSScheduleApp.tsx Lightweight iOS shell (safe-mode boot path)
  plan/ activity/ timeline/ notes/ strategy/ desktop/ ui/ …  feature areas
lib/
  useScheduleDB.ts       The data model + IndexedDB hook (source of truth)
  cloudSync.ts           Debounced whole-document Firestore sync + backups
  backup.ts              JSON export/import
  reminders.ts           Local timer-based notifications
  consistency/ strategy/ timeline/ ai/ …
workers/aiWorker.ts      Transformers.js inference (off the main thread)
```

**Data model.** One `Schedule` document holds Plans, Tasks (on weekday
templates with per-date `exceptions` and recurrence rules), Milestones,
Trackers + MetricEntries, Rituals, Notes, and Strategy assets. Task completion
lives on the weekday template and resets daily via `resetStaleCompletions`; the
append-only `completionHistory` event log is the source of truth for per-date
analytics.

**Sync.** No realtime listeners — sync is manual and debounced (30s), batching
the whole document into one Firestore doc per user. Guest data stays local. A
daily versioned snapshot (`users/{uid}/backups/{date}`, most recent 10 kept) is
written alongside the first successful push of each day as a safety net.

**Backups.** Settings → Data offers JSON **export**/**restore**, plus **version
history** (restore any recent daily cloud snapshot) for signed-in users.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

To enable cloud sync locally, provide Firebase config via environment (see
`lib/firebase.ts` for the expected keys). Without it, the app runs fully
local-first as a guest.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (stamps version/build-id, injects SW precache) |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (Node test runner) |
| `npm run test:e2e` | Playwright e2e (`:headed`, `:ui` variants available) |

## Testing

- **Unit** — `tests/*.test.mjs`, run with Node's built-in runner. Pure logic:
  completion model, sync-status mapping, date/time utilities, etc.
- **e2e** — `tests/e2e/*.spec.ts`, Playwright across a desktop and a mobile
  viewport. The config starts the dev server automatically.

CI (`.github/workflows/ci.yml`) runs typecheck → unit → build, and Playwright
in a separate job, on every push to `main` and every PR.

## Reminders

Opt-in local notifications (Settings → Reminders): task start times, routine
times, and an evening "tasks still open" nudge. These fire while PlanR is open
(there is no push backend yet), so on iPhone they require the app installed to
the Home Screen. Tapping a reminder focuses the app.

## AI (currently gated off)

The on-device AI stack (subtask/task generation, plan coach) is fully built but
disabled behind `AI_ENABLED` in `lib/featureFlags.ts`. While gated, the worker
never spawns, so Transformers.js and its models are never loaded at runtime.
Flip the flag to restore every AI surface.

## Design

This project has a deliberate design system. Before UI work, read `PRODUCT.md`
(strategic context and the five design principles) and `DESIGN.md` (colors,
typography, components). Accessibility target is **WCAG 2.1 AA** in both themes,
with `prefers-reduced-motion` honored and ≥44px tap targets on mobile.
