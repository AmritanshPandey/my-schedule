# 5K slice: generated run sessions, planned vs actual, suggested adjustments

Status: draft for approval · 2026-11-14

## Intent and why

PlanR's direction (Goal → Plan → Routine → Session → Task → Execution → Progress → Adapt) is what separates it from a task manager: it turns "I want to run a 5K" into runs you can actually follow, records what really happened, and adjusts the plan from that.

Rather than rebuilding the whole data model first, we prove the loop end to end on one domain, running a 5K, and introduce the model pieces that loop needs. The one structural piece we build properly now is a real **Session** record, because every later domain (study blocks, workouts, reading sessions) needs dated, individually planned occurrences that a weekly-repeating task cannot express.

## What the user experiences

1. **Create from template.** Plans → Templates → "Run a 5K". The template asks:
   - current comfortable distance (km)
   - current easy pace (min/km)
   - target: distance (default 5 km) and target pace or "just finish"
   - weeks available (or a race date, which sets the weeks)
   - which weekdays they can run (3 to 5) and a usual time (optional)
   It previews week 1 and the shape of the plan ("8 weeks · 4 runs a week · long run grows 3 → 6 km"), then creates a Goal (if they want one), the Plan and every session.
2. **Plan view.** Plan detail shows the plan week by week: each session's date, type and headline ("Wed · Intervals · 4 × 400 m @ 5:40/km"), with done, missed and upcoming states. This is where the whole structure lives.
3. **Today.** Today shows only today's session, in the timeline at its time (or in an "Any time today" group when it has none), next to ordinary tasks:
   ```
   18:00  Intervals · 35 min
          1 km easy · 4 × 400 m @ 5:40/km · 1 km easy
          [ Log run ]  [ ✓ ]
   ```
4. **Logging a run, three ways:**
   - **Mark done:** one tap. Counts as completed; carries no numbers.
   - **Type it in:** distance and time (pace is computed), optional effort (easy / ok / hard) and a note.
   - **Apple Health (iOS, once connected):** a running workout recorded that day fills in the session automatically. The user can still edit or type over it.
   If a session was marked done and Health later finds a matching run, Health's numbers fill in the details; it is never counted twice.
5. **Progress.** Plan detail shows planned vs actual per week (distance, runs done of planned) and a pace trend from logged runs. Marked-done runs count toward completion but not toward pace or distance.
6. **Suggested adjustments.** At the end of each plan week, PlanR compares actual with planned and may propose one change, which the user accepts or holds. Nothing changes until they accept. Examples:
   - beat target pace on 3 of the last 4 timed runs → "Speed up next week's pace by 10 s/km?"
   - missed 2+ runs this week → "Repeat this week?" (shifts every later session one week; the end date moves)
   - slower than planned on most runs or effort logged as hard → "Ease next week back to this week's distances?"
   Accepting rebuilds only future, untouched sessions. Past, logged or hand-edited sessions are never changed.

## Goals

- A working Goal → Plan → Session → Task → Execution → Progress → Adapt loop for running a 5K, on the phone PWA and native iOS.
- A Session record and typed session tasks designed for every domain, even though only the 5K generator writes them now.
- Planned values are never overwritten by what happened.
- Same behaviour on PWA and iOS; Apple Health is the only iOS-only part.

## Non-goals (this slice)

- Merging Rituals (the Routine tab) into the new model.
- Templates for other domains, AI-generated plans, Strava or Garmin, GPS run tracking inside PlanR.
- Workload or capacity views; recurrence beyond what sessions need.
- Converting existing weekly tasks into sessions.
- Miles: store metres and seconds, display km. A unit setting comes later.

## Anti-goals (would be a failure even if it works)

- The plan changes without the user approving it.
- Running becomes a separate mini-app with its own screens and rules, rather than sessions on the same Today and Plan surfaces as everything else.
- A logged run overwrites or rewrites the planned session.
- Gamified rewards (badges, confetti) for runs. Progress should feel earned (PRODUCT.md).
- Medical or coaching claims. Copy stays factual ("planned", "you ran"), with a one-line note in the template that the plan is general guidance.

## Constraints

- Local-first, instant: everything works offline; sync merges per entity using the existing stamp and merge machinery (`stampSchedule.ts`, `mergeSchedule.ts`).
- One model in `packages/core`, used by the PWA (`components/`) and native (`apps/native`).
- Design rules: One Signal Rule (green only for completion and progress), Ink-First buttons, 44 px targets, WCAG 2.1 AA in both themes, reduced motion honoured, no em dashes in UI copy.
- **Other sessions' uncommitted work** touches `scheduleTypes.ts`, `scheduleSchema.ts`, `scheduleMigrate.ts`, `mergeSchedule.ts` and `stampSchedule.ts` (set logs, progression steps, focus sessions). That work must be committed, or explicitly set aside, before this build starts, so the two don't collide in those files.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Each run is a one-off dated Task marked as a session, with typed subtasks and a separate run log | Fastest; reuses Today, reminders and sync as they are. But "session" stays a flavour of Task, and the next domain inherits that compromise. |
| **B (chosen)** | **A new Session record that plans own; Today, Overview, plan detail and reminders learn to show it** | Matches the target model, so later domains build on it directly. Costs more up front: every surface that lists a day's work and the sync layer must handle a new record type. |
| C | One weekly Task per run type with week-by-week targets in a side table | Fewest records, but most content lives in a side table every screen must consult, and runs change shape week to week. |

The user chose B so the slice establishes the real Session model rather than a stand-in.

## Design

### Data model (packages/core)

New top-level collections on `Schedule`, each synced as its own entity namespace:

```ts
// A dated, individually planned occurrence of a routine within a plan.
interface Session {
  id: string;
  planId: string;
  routineKey?: string;          // "easy" | "intervals" | "tempo" | "long" for running; free string per domain
  title: string;                // "Intervals"
  dateISO: string;              // "YYYY-MM-DD"
  startTime?: string;           // "HH:MM" 24h; absent = any time that day
  estimatedMinutes?: number;
  tasks: SessionTask[];         // the planned content, in order
  status: "planned" | "done" | "skipped";   // "missed" is derived: planned and the date has passed
  generated?: { weekIndex: number; slot: number; inputsVersion: number };
  editedAt?: string;            // set when the user edits it by hand; generator never touches it again
  createdAt: string;
  updatedAt: string;
}

// Base task plus a typed payload. New kinds are added to the union without touching the base.
type SessionTask =
  | { id: string; kind: "simple"; title: string; notes?: string }
  | { id: string; kind: "distance"; title: string; notes?: string;
      plan: { distanceM: number; paceSecPerKm?: number; repeats?: number; restSec?: number } };

// What actually happened. Never written into Session.
interface SessionLog {
  id: string;
  sessionId: string;
  source: "mark" | "manual" | "health";
  actual?: { distanceM: number; durationSec: number; effort?: "easy" | "ok" | "hard" };
  healthWorkoutId?: string;     // HealthKit UUID, for de-duplication
  note?: string;
  loggedAt: string;
}

// A proposed change to the plan, decided by the user.
interface PlanAdjustment {
  id: string;
  planId: string;
  weekIndex: number;            // the week it applies from
  kind: "pace" | "repeat-week" | "ease";
  detail: Record<string, number>;   // e.g. { paceDeltaSec: -10 }
  reason: string;               // plain-language why, shown to the user
  decision: "pending" | "accepted" | "held";
  decidedAt?: string;
  createdAt: string;
}
```

`Plan` gains `generator?: { templateId: string; inputs: Record<string, number | string | string[]>; inputsVersion: number }` so the remaining weeks can be rebuilt.

One log per session is the expected case. If several exist (a typed log then a Health import), the latest non-"mark" log is the actual; a "mark" log only says it was done.

Each new collection follows the existing pattern: type, zod schema, migration default (empty array), `NS` entry and `entityMap` line for stamping, merge by id. Deleting a plan deletes its future planned sessions and pending adjustments; logged sessions and their logs stay so history survives (matching how completion history outlives task edits today).

### Generator

A pure function in `packages/core`: `generateRunPlan(inputs, adjustments) → { sessions, summary }`. Deterministic, unit-tested, no AI. Principles:

- Weekly volume grows from current distance toward the target by no more than about 10% a week, with an easier week every fourth week.
- Each week has one long run (grows toward target distance plus a margin), one quality run (intervals early, tempo later) and easy runs for the remaining days.
- Paces derive from current easy pace and target pace; quality paces step toward target pace over the plan.
- The final week tapers and ends with the target run on the last chosen day.
- Accepted adjustments are applied as inputs (pace delta, inserted repeat week, eased week), so rebuilding is just re-running the generator for weeks after the current one and replacing only sessions with `status: "planned"`, no logs and no `editedAt`.

The exact week tables are the builder's call within those principles; they should be reviewed against a reputable beginner 5K programme before shipping.

### Surfaces

- **Today (PWA `IOSScheduleApp`, native `IOSScheduleApp`):** sessions for the date appear in the timeline sorted with tasks by time; untimed ones sit in "Any time today". A session row shows title, estimated minutes, and the task headline; actions are Log run and a done check. Missed and done states use the existing task row styling.
- **Session detail:** opens from the row; lists the planned tasks, the logged actual next to planned ("Planned 4 km @ 6:00 · You ran 4.3 km @ 5:52"), Log or Edit log, Skip, Move to another day.
- **Log sheet:** distance, time, effort, note; pace computed live. Pre-filled from a Health match when there is one.
- **Plan detail:** week list, planned vs actual per week, pace trend, and the pending suggestion card (Accept / Hold) when there is one.
- **Overview:** `selectNextUp`, week status and "Your day" count sessions alongside tasks.
- **Reminders:** a timed session gets the same reminder as a timed task.
- **Desktop:** shows sessions read-only in the day and plan views so the data is never invisible there; richer desktop editing is a later slice.

### Apple Health (native iOS only)

- Settings → "Connect Apple Health" asks for read access to workouts only.
- On app foreground and after connecting, read running workouts since the plan's start; match each to the planned or done session on the same local date that has no Health log yet, preferring the closest planned distance. One workout fills at most one session.
- Unmatched runs are ignored in this slice (no ad-hoc sessions).
- The library choice is the builder's; it must support reading `HKWorkout` running workouts with distance and duration and add the HealthKit entitlement and usage description.

### Adjustment rules

Evaluated once when a plan week ends (on first app open after the week's last day), producing at most one pending adjustment per week:

1. Missed 2 or more sessions that week → repeat-week.
2. Otherwise, effort logged hard on 2+ runs, or pace slower than planned by more than 15 s/km on most timed runs → ease.
3. Otherwise, faster than planned pace by 10+ s/km on 3 of the last 4 timed runs → pace (−10 s/km).

Held suggestions are not asked again for the same week. Thresholds live in one constants block so they can be tuned.

### Settled during review (calls made, open to correction)

- **Plan weeks** count from the plan's start date, not calendar weeks.
- **Streak and week status:** a session is due work like a task. Done counts toward the execution streak and week status; missed counts as missed.
- **Changing inputs mid-plan** (run days, usual time, target pace) from plan detail rebuilds future untouched sessions, the same way an accepted adjustment does.
- **Moving or editing a session** by hand sets `editedAt`, so rebuilds leave it alone.
- **The existing "Run Training" template** is replaced in the template list by "Run a 5K". Plans already made from it are untouched.
- **Goal:** the template offers to create a Goal ("Run 5 km at 5:30/km") and links the plan to it; the user can skip.

## Left to the builder

- Exact generator week tables (within the principles above).
- Component structure and file names, following existing patterns (`components/` web, `apps/native/src/components/` native).
- HealthKit library and the precise matching tiebreaks.
- Visual details within DESIGN.md.

## Testing

- Generator: unit tests for volume growth caps, easier fourth weeks, taper, day selection, and rebuilds that leave logged and edited sessions alone.
- Sync: two-device merge tests for sessions, logs and adjustments, as for set logs.
- Adjustment rules: table-driven tests per rule.
- Manual: PWA at phone size and the iOS simulator through create → Today → log three ways → week end suggestion → accept.
