# Milestone links — design

**Ask:** "make the Milestone better, more dynamically linked with tasks, tracking
and routine" — plus "tracking needs to match the milestones' figures and create
predicted data based on the plan". Approved scope: A (routines) + B (blended
progress) + C (item side) + milestone figures / planned path.

## 1. Milestone figures and the planned path

**Data.** `Milestone.targetValue?: number` — the figure the milestone's primary
tracker (`linkedTrackers[0]`) should reach by `plannedEndDate`.

**Implied targets** (`packages/core/lib/milestoneTargets.ts`). For a tracker, take
its milestones (any plan, `linkedTrackers` includes it) sorted by
`plannedEndDate`. The path origin is `tracker.startingValue ?? earliest entry`
at the earliest milestone's `startDate`. A milestone with no `targetValue` gets
one by linear interpolation by date between the previous known checkpoint and
the next known one, where `tracker.goalValue` is the final checkpoint at the
last milestone's end. With no `goalValue` and no explicit targets, there is no
path (null).

- `milestoneTargetFor(milestone, tracker, milestones, entries)` →
  `{ from: number, to: number } | null`: the span this milestone measures —
  from the previous checkpoint (or origin) to its own target.
- `plannedTrackerPath(tracker, milestones, entries)` →
  `{ points: {date, value, milestoneId?}[] } | null`.
- `expectedValueOn(path, dateISO)`: linear between points, clamped to the ends.
- `planGap(tracker, path, entries, todayISO)` → `{ expected, actual, delta,
  ahead: boolean } | null` — "Plan: 24 km by today · you're at 21 km".

**Health.** `calculateMetricProgress`, `forecastMetricDate` and `trackerPace`
(via `calculateMilestoneState`) measure against the milestone's span
(`from` → `to`) instead of `startingValue` → `goalValue`. `calculateMilestoneState`
gains optional `milestones` (sibling milestones, for implied targets); without
it, behaviour falls back to the tracker's own goal, as today.
`metricTargetValue` reports the milestone target.

**UI.** Milestone sheet: a "Target" number input when a tracker is linked
(placeholder = implied value). Tracking card/chart (web + native): dashed planned
line with checkpoint markers, plus the plan-gap line.

## 2. Routines

`Milestone.linkedRituals?: string[]` (schema optional; migrate normalizes to `[]`).
Due days in the milestone window come from `ritualScheduledOnDate`; a completed
day counts `ritualDayProgress(...).fraction` (the `followed` share). Routine
occurrences add into `aggregateOccurrences`' expected/completed counts, so
consistency, expected progress, `milestonePace` and `hasLoggedActivity` see them.
`hasData` is true with only routines linked. Deleting a ritual strips it from
every milestone. Link/unlink from the milestone view (web + native).

## 3. Blended headline

`overallProgress` = equal-weight mean of the sources present:
- **metric**: mean over linked trackers that have a span (primary uses the
  milestone target; others use their own goal),
- **tasks**: existing `calculateMilestoneProgress` %,
- **routines**: completed due days ÷ due days across the whole window.

`MilestoneState` gains `routineProgress: number | null` and
`progressSources: { kind: "metric"|"tasks"|"routines"; pct: number }[]`. The
milestone view shows the breakdown. The health gate is unchanged.

## 4. Item side

Core `milestoneLinks.ts`: `milestonesForTask`, `milestonesForTracker`,
`milestonesForRitual`, plus pure `linkItem/unlinkItem(milestones, milestoneId,
kind, itemId)` used by both apps. Task detail, tracker card and routine detail
show "Advances: <title>" and a "Link to milestone" picker (open milestones; the
task's/tracker's plan only; all plans for routines).

## Sync

Only two optional fields on `Milestone`, which merges per entity
(`mergeKeyed` by id) and is stamped by `stampSchedule`. No new collections.

## Tests (`tests/milestoneLinks.test.mjs`)

Implied targets (explicit, interpolated, goal-only, none); path + expected value;
plan gap; metric progress against a milestone span; routine occurrences in
consistency/hasData; blended overall; reverse lookups; link/unlink; ritual
delete cleanup; migrate default.
