# Business profile — PlanR

Draft, 2026-10-28. Built from the repo only (sources in `source-ledger.csv`). Everything about customers, money and market is `[UNKNOWN]` until the owner answers the open questions at the bottom.

## The business
- **What we sell:** PlanR, a "personal execution OS": goals become plans (tasks, subtasks, schedules, milestones), and daily follow-through is the centre of the product, with streaks, routines, trackers and execution trends `[FACT S1]` `[FACT S2]`. Ships as a web PWA (desktop and phone layouts) and a React Native iOS app in the same repo `[FACT S4]`.
- **To whom (segments):** described as driven, self-directed students, founders and professionals running their own execution system across fitness, learning and work `[FACT S1]`. This is the owner's intended audience, not measured users `[UNKNOWN]` who actually uses it.
- **How we make money:** nothing in the product charges money today. No payments, subscriptions, pricing or paywall code exists `[FACT S4]`. Intended model `[UNKNOWN]`.
- **Size (revenue, team, customers):** version 0.1.0 `[FACT S4]`. Team size, user count and revenue `[UNKNOWN]`.
- **Where we are strong today:**
  - Local-first: renders from IndexedDB instantly, works offline, syncs a whole-schedule snapshot plus daily backups to Firestore after Google sign-in `[FACT S2]` `[FACT S3]`.
  - Depth of the execution loop: plans → milestones → tasks/subtasks → routines with follow-through ratings → trackers with check-in cadence → milestone health and pace gaps `[FACT S4]`.
  - Execution intelligence: a deterministic pattern engine (per-task outcomes, slot reliability, capacity, trend) that proposes changes the user must accept; an optional on-device or user-configured language model `[FACT S5]` `[FACT S3]`.
  - A deliberate, coherent design system and two-surface split (mobile = execution, desktop = strategy) `[FACT S1]`.

## Customers
- **Main segments and what they use us for:** `[UNKNOWN]` (see questions).
- **Evidence available:** none in the repo. No product analytics, no feedback, reviews, interviews or support data `[FACT S4]`.
- **Known problems and complaints:** bugs found in this session's work, e.g. a new-device sign-in that wiped synced data (fixed 2026-10-28), text clipping at large iOS text sizes (fixed) `[FACT S4]`. Customer-reported problems `[UNKNOWN]`.

## Capabilities and assets
- **Expertise:** product and design craft evident in the codebase and design docs `[INFERENCE, medium confidence; alternative: the docs describe intent the product doesn't yet meet]`.
- **Data (and our rights to use it):** each user's schedule, completion history, routine follow-through and tracker entries, stored per user in IndexedDB and their own Firestore document `[FACT S3]`. No aggregate or cross-user data is collected `[FACT S4]`. Terms/consent for any secondary use `[UNKNOWN]`.
- **Technology:** shared domain core (`packages/core`) used by web and native; pattern engine; push reminders via a Cloudflare Worker; PWA service worker `[FACT S3]` `[FACT S4]`.
- **Relationships, brand, distribution, partners:** `[UNKNOWN]`. Not on the App Store yet `[INFERENCE, high: native Google Sign-In is still unconfigured and the build runs from Xcode]`.

## Market
- **Market and geography:** personal productivity / planning / habit tracking `[INFERENCE, high]`. Geography `[UNKNOWN]`.
- **Main competitors and substitutes:** `[UNKNOWN]`. The owner's anti-references (gamified habit apps, enterprise PM tools, generic AI-SaaS, sterile calendars) name categories, not products `[FACT S1]`.
- **Recent changes (technology, regulation, behavior):** `[UNKNOWN]` from evidence. Candidate shifts to test later in Why Now: on-device AI becoming practical in browsers and phones `[HYPOTHESIS, held by Claude; test: why-now-shift with dated sources]`.

## Goals and constraints
- **What the owner wants from this:** `[UNKNOWN]`.
- **Budget, people and time available:** `[UNKNOWN]`.
- **Off-limits:** `[UNKNOWN]`. Product principles rule out gamification-as-reward and cluttered PM tooling `[FACT S1]`.
- **Decision owner and timing:** `[UNKNOWN]`.

## Starting point
`[UNKNOWN]`: Customers have a problem · We have a capability or asset · The market is shifting · We have an idea to test · Full scan.

## Open questions for the owner (round 1)
1. Who uses PlanR today, and how many? Just you, friends, or public users? Any usage numbers?
2. What do you want PlanR to become: a personal tool, a side income, or a startup? Any pricing idea yet?
3. What customer evidence do you have, even informal? Feedback, messages, notes from people you've shown it to.
4. Which products do you see as the real alternatives (the ones people would otherwise use)?
5. What are your constraints, and which starting point fits: a customer problem, a capability you want to use, a market shift, an idea to test, or a full scan?
