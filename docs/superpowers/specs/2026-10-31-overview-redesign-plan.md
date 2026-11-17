# Overview redesign — PWA + iOS

Status: plan, not implemented. Date: 2026-10-31.

## What the user asked for

- **What bothers them:** desktop Overview is too busy, mobile Overview is too thin.
- **First question Overview answers:** *"What do I do next?"*
- **Desktop role:** weekly strategy review.
- **Mobile role (PWA + iOS):** status at a glance, plus quick fixes.

## Where Overview lives today

| Surface | File | What it renders (top → bottom) |
|---|---|---|
| Desktop web (`DesktopScheduleAppEntry` → `ScheduleApp` tab 4) | `components/OverviewDashboard.tsx` (1126 lines) | Getting started · `ExecutionStreakBanner` · 6 stat tiles (tasks today, week %, missed, streak, plan count, tracker count) · 3 columns: Needs attention, `TodayTaskList`, Check-ins due, `DayBreakdownCard`, Routine consistency · Weekly read (`InsightsCard`), This week (bars + capacity check), `CompletionTrendCard`, Active tracking · Plan consistency |
| Mobile PWA (`ScheduleAppClient` → `components/ios/IOSScheduleApp.tsx`, `activeTab === 4`) | inline JSX, ~200 lines | Setup · Streak card · Needs attention · Check-ins due · Weekly read · Next up · "Today's execution" % |
| Native iOS | `apps/native/src/components/ios/IOSScheduleApp.tsx`, `activeTab === 4` | Same as PWA, **no weekly read** (`lib/intelligence/*` is web-only, not in `@planr/core`) |

### Problems found

**Desktop: too busy, and it repeats itself**
- About 16 blocks on one screen. That's the "panel overload" anti-reference.
- Numbers shown twice: the streak (banner + tile), this week's % (tile + This week card), missed (tile + Needs attention).
- Vanity tiles: "3 active plans" and "2 metrics tracked" tell you nothing about execution. The 6-tile row is the hero-metric cliché DESIGN.md bans.
- `TodayTaskList` and `DayBreakdownCard` repeat the Today tab's job. That breaks "two surfaces, one system": desktop should be strategy.
- Plan consistency (% of days with ≥1 task done) is the only plan reading. Milestone pace (`paceModel`, `milestoneHealth`) is computed elsewhere but never shown here, so "are my goals moving?" goes unanswered.
- The status ramp drifts: `progressFillClass` uses 70/35, while DESIGN.md says 70/40.

**Mobile: too thin, wrong order**
- No week view, nothing about routines, and nothing about plans or milestones.
- "Next up" sits near the bottom, even though it answers the user's first question.
- "Today's execution" shows **today's** % beside **this week's** missed count. Two time frames in one card. Its testid is `overview-week-summary`, but it isn't a week summary.
- The streak gets a whole card with one number.

**Both mobile builds: hand-copied**
- Setup steps, next-up text, `remainingPlannedMinutes`, `dashboardProgressPct` and `missedThisWeek` are computed inline in both `IOSScheduleApp` files. Only the cards are shared.

## The design

### One order everywhere: Next → Fix → Status → Goals → Patterns

Every surface asks the same questions in the same order. The surface only changes how deep each answer goes.

1. **Next:** the one thing to do now.
2. **Fix:** what slipped (Needs attention) and what's waiting on you (Check-ins due). Both render nothing when clear.
3. **Status:** this week, on track / at risk / behind, on the one status ramp. The streak lives here, not in its own card.
4. **Goals:** are plans and milestones on pace, worst first.
5. **Patterns:** the weekly read (`InsightsCard`) and longer trends.

### Mobile (PWA + iOS): status at a glance + quick fixes

A single column. Each block is short and taps through to the full screen.

| # | Block | Content | Tap target |
|---|---|---|---|
| 0 | Setup | First run only. Unchanged. | — |
| 1 | **Next up** (moves to the top) | Next open task: title, time · plan. A ≥44px **Mark done** check button sits inline (the screen's one green affirmative). When everything's done it reads "Day complete · 5/5" plus the streak. With no tasks it reads "Plan your day". | Row → Today. Check → complete. |
| 2 | Needs attention | Existing card, unchanged. | Existing sheets |
| 3 | Check-ins due | Existing card, unchanged. | Log sheet |
| 4 | **This week** (new on mobile, replaces the streak card and "Today's execution") | Verdict line ("On track", "At risk", "Behind"), 7 week bars with today ringed, then one meta line: `18/24 done · 2 missed · 6-day streak`. A streak at risk shows in amber in that line. | → Today (week) |
| 5 | **Goals on pace** (new on mobile) | Up to 3 rows: plan dot, next milestone title, pace chip (Ahead / On pace / Behind, from `milestonePace`), sorted worst first. "See all" when there are more than 3. Hidden when no milestones exist. | Row → plan detail |
| 6 | Weekly read | `InsightsCard`. **Native gains it** once intelligence moves into core. | Existing |

Removed on mobile: the standalone streak card and the "Today's execution" card. Their numbers move into block 4, in one time frame.

### Desktop: weekly strategy review

Two columns at `lg` (2/3 main, 1/3 rail) instead of three. No stat-tile row.

**Header row:** date + "Overview" heading, with a slim **Next up** strip on the right (task · time · plan, plus "Open Today →"). That answers "what next?" first without rebuilding the task list.

**Main column (strategy):**
1. **This week** (hero, the one Display number): verdict + week % + week bars + tasks % / routines % + streak (this absorbs `ExecutionStreakBanner` and the 6 tiles) + the existing capacity reality check and heaviest-day line.
2. **Goals & milestones** (replaces Plan consistency): one row per active plan. Each shows the next milestone, a pace chip, forecast vs target date (`calculateForecastDate` / `paceNarrative`) and milestones done ("2 of 5"). The day-consistency % becomes secondary text. Worst first. Plans with no milestones show consistency only.
3. **Trends:** `CompletionTrendCard` (8-week execution trend) with **Active tracking** (sparklines + log button) beside or below it.

**Right rail (act on the review):**
1. Needs attention
2. Check-ins due
3. Weekly read (`InsightsCard`)
4. Routine consistency (sorted at-risk first, as today)

**Moves off desktop Overview:**
- `TodayTaskList` (already the Today tab's job; the Next up strip links there).
- `DayBreakdownCard` ("Where the day goes", fill a free slot): this is planning-the-day work. It moves to the desktop planner (tab 0), next to `WeekGrid`. Until that's built it stays on Overview, collapsed, at the bottom of the rail.
- `StatGrid` and the plan/tracker count tiles are deleted.

### Visual rules (from DESIGN.md)

- One Display number per card. Green only on progress and the single affirmative action (Next up's check).
- All instruments use **one status ramp** (green ≥70, amber 40–69, rose <40) through a shared helper. Fix the 35 → 40 drift.
- No nested bordered cards, no uppercase eyebrows on every section (drop the "NEXT UP" eyebrow style), hairline borders.
- Reduced motion: `AnimatedNumber`, `ProgressBar animateOnMount` and `stagger-rise` already need instant fallbacks. Check each one.
- Tap targets ≥44px. Both themes checked for AA.

## Shared core logic (`packages/core`)

New `packages/core/lib/overview.ts`, pure functions over `Schedule` and the dates passed in. Re-export it from `lib/overview.ts` for the web.

| Function | Returns | Built on |
|---|---|---|
| `selectNextUp(schedule, todayISO, todayKey)` | `{ kind: "task", task, timeLabel, planTitle } \| { kind: "day-done", done, total } \| { kind: "empty" }` | `selectTodayTasks`, `taskCompletion` |
| `selectWeekStatus(schedule, todayISO)` | `{ days[7] {label, done, total, pct, isToday}, tasksPct, routinesPct, missed, verdict, streak }` | Lifts `weeklyActivity` out of `OverviewDashboard`; `computeExecutionTrend().currentMissed`; `calculateExecutionStreak`; `completedRitualIdsOn` |
| `selectGoalPace(schedule, todayISO, { limit? })` | rows `{ plan, nextMilestone, pace: PaceLevel, narrative, forecastISO?, done, total, consistency }`, worst first | `milestonePace`, `paceNarrative`, `calculateMilestoneState`, `getPlanCardStats` |
| `statusTone(pct)` | `"good" \| "warn" \| "bad" \| "none"` | the DESIGN.md ramp; replaces `progressFillClass` and its copies |
| `selectSetupSteps(schedule)` | the 3 setup steps + done count | removes 3 copies |

Also:
- **Move `lib/intelligence/{patterns,suggestions,types,progressFacts,taskStats}.ts` into `packages/core/lib/intelligence/`** and leave re-exports behind, so native can render the weekly read. Check them for web-only imports first.
- `capacityModel` already lives in core. `selectWeekStatus` stays separate from it; desktop calls both.

Tests: one `tests/overview.test.mjs` (node test runner, same pattern as `capacityModel.test.mjs`). Cover next-up states (task / day done / empty, commitments excluded), week verdict at ramp boundaries (39/40/69/70), mixed-time-frame regression (missed is always this week), and goal pace sort order with milestone-less plans.

## Implementation steps

### Step 1 — Core (blocks everything else)
1. Add `packages/core/lib/overview.ts` with the five selectors + `statusTone`, and the web re-export.
2. Move `lib/intelligence/*` into core and leave re-exports behind.
3. `tests/overview.test.mjs`. Existing `intelligencePatterns.test.mjs` must still pass after the move.

### Step 2 — Desktop web (`components/OverviewDashboard.tsx`)
1. Swap inline `weeklyActivity`, `progressFillClass` and setup logic for the core selectors.
2. New header with the Next up strip.
3. Merge `ExecutionStreakBanner` + `StatGrid` + `ThisWeekCard` into one **This week** hero. Delete `StatGrid`.
4. Replace `PlanConsistencyCard` with **Goals & milestones** (`selectGoalPace`).
5. Re-grid to main + rail. Drop `TodayTaskList`. Collapse `DayBreakdownCard` to the rail bottom (moving it to the planner is a follow-up).
6. Split the 1126-line file: `components/overview/{WeekStatusCard,GoalPaceCard,NextUpStrip}.tsx`.
7. e2e: update `overview-week-card`, `overview-plan-card` and `overview-today-card` selectors in `tests/e2e`. Screenshot at lg/xl, light/dark.

### Step 3 — Mobile PWA (`components/ios/IOSScheduleApp.tsx`, tab 4)
1. Move the tab-4 JSX out to `components/ios/IOSOverview.tsx`, fed by the core selectors.
2. Order: Setup → Next up (with inline Mark done) → Needs attention → Check-ins → This week → Goals on pace → Weekly read.
3. Delete the streak card and "Today's execution". Rename testid `overview-week-summary` → `overview-week-status`, and update the e2e specs.
4. Verify at 375px in both themes, with reduced motion and 44px targets.

### Step 4 — Native iOS (`apps/native/src/components/ios/IOSScheduleApp.tsx`, tab 4)
1. Same extraction: `apps/native/src/components/ios/IOSOverview.tsx`, with the same selectors and the same order as the PWA.
2. Port `WeekStatusCard` and `GoalPaceCard` to RN (reuse the native `ProgressBar`, `Pill` and milestone pace components from the recent port).
3. Port `InsightsCard` to native, now possible with intelligence in core. Pattern engine only, no on-device model.
4. Jest snapshot/unit for the new components. Check in the simulator in both appearances.

Steps 2, 3 and 4 can run in parallel once Step 1 lands. 3 and 4 should share a reviewer so the two mobile builds stay identical.

## Out of scope / follow-ups
- Moving `DayBreakdownCard` into the desktop planner beside `WeekGrid`.
- Any new analytics beyond what core already computes.
