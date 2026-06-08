# Product

## Register

product

## Users

Driven, self-directed individuals — students, founders, and professionals — who run
their own "personal execution OS." They pursue concrete goals across fitness, learning,
and work, and they want to actually follow through, not just plan.

Two contexts, one system:
- **Mobile (daily execution):** quick check-ins — mark tasks done, log a tracker, keep a
  streak alive. Fast, thumb-driven, often on the go.
- **Desktop (strategy & setup):** building plans, structuring milestones and subtasks,
  reviewing trends and consistency over time.

## Product Purpose

PlanR helps people consistently do what they planned. It turns goals into structured
plans (with tasks, subtasks, schedules, and milestones), then makes day-to-day
follow-through the center of gravity — surfacing progress, streaks, and execution trends
so consistency feels visible and rewarding.

Success = the user actually executes their plan day after day, and can see the streak /
trend that proves it. The win condition is follow-through, not a beautiful but unused
plan.

## Brand Personality

Sharp, motivating, energetic. A coach in your pocket: momentum-forward, rewarding, with
lively micro-interactions that make progress feel earned. The energy is disciplined, not
loud — confident and precise, never cute. Voice is direct and verb-first ("Mark done",
"Set up tracking"), celebrates real progress without hype, and never nags.

## Anti-references

PlanR should explicitly NOT feel like:
- **Gamified / childish habit apps** — no cartoon mascots, confetti spam, badge-spam, or
  Duolingo-loud gamification. Reward comes from real, visible progress.
- **Cluttered enterprise PM tools** — no Jira-dense, gray corporate dashboards with panel
  overload. Show what matters now.
- **Generic AI-SaaS template** — no purple gradients, tracked uppercase eyebrows on every
  section, or the hero-metric cliché.
- **Sterile corporate calendar** — not an Outlook-bland, lifeless grid with zero warmth or
  personality.

## Design Principles

1. **Execution over planning theater.** Every screen should push toward doing the next
   thing. Bias the UI to the current action, not to admiring the plan.
2. **Make progress feel earned, not gamified.** Momentum, streaks, and trends are the
   reward. Motivation comes from honest, visible follow-through — never gimmicks or fake
   celebration.
3. **Two surfaces, one system.** Mobile is for fast daily execution; desktop is for
   strategy and setup. Each layout respects its context instead of cramming the other in.
4. **Energetic, but calm underneath.** Motivating and alive, yet low cognitive load comes
   first. Clarity, hierarchy, and breathing room carry the energy — restraint is what
   keeps it from tipping into noise.
5. **Local-first and instant.** Render from IndexedDB immediately, work offline, sync in
   the background. The app should feel like dependable, native-fast software you trust.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA** contrast in both light and dark themes (dark-mode-first).
- Honor **`prefers-reduced-motion`** — every Framer Motion animation needs a crossfade or
  instant fallback.
- **≥44px tap targets** on mobile; the primary daily actions (complete task, log tracker)
  must be comfortably thumb-reachable.
- Both color themes are first-class; never ship a state that only works in one.
