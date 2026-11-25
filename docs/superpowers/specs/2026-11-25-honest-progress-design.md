# Tasks and subtasks: make progress honest, then make doing and adding fast

## Context

Subtasks gained a lot of detail (sets, weight, rest, cost, deadlines, progression), but all of them follow one rule: reset every occurrence, and the task counts only if every one is done. Two different jobs share that rule: repeating checklists (gym) and one-time steps (portfolio).

Checked by running the real core logic:
- 4 of 5 subtasks done becomes **missed** the next day: trend 0%, week "Behind". The streak counts the same day as active.
- Ticks vanish by the next occurrence, and on one-off tasks the day after. A rescheduled copy starts from zero (`missedRecovery.ts`).
- Subtask deadlines only sort and colour. Nothing in reminders, Needs attention, Today or Overview reads them.
- Saving a task needs title + plan + start time. Task detail can't add a subtask.

The user reports all four as pain: "did most, got a miss", "progress disappeared", "too slow to add", and, while doing, opening/ticking, logging sets and changing it midway. No usage data exists in the repo, so this is the only user evidence.

**Intended outcome:** a score you can believe, and work you never do twice.

## Decisions

Made by the user:
1. Resets vs stays done is set **per task**: **Checklist** (resets) or **Steps** (stay done, leftovers carry forward). Per-subtask switches rejected: too much on a crowded row.
2. A **repeating** Steps block is done when **any step is finished that day**, or it's marked done.
3. A partly done checklist scores its **real share** (4 of 5 = 80%, "Partly done"). Nothing ticked is still a miss.

My calls, please correct:
- **One-off Steps task:** done only when all steps are done, because no later block picks up the rest. Otherwise it's partly done, and "Continue on…" keeps finished steps.
- **Default:** new one-off = Steps, new repeating = Checklist. **Existing repeating tasks stay Checklist.** Existing one-offs become Steps; steps ticked before this release can't all be recovered.
- **All steps done on a repeating task:** offer "Finish this task" (sets `activeUntil`), never end it silently.
- **Marking a Steps block done never ticks its steps.** Checklist keeps today's behaviour.
- **Past weeks heal too:** a stored miss with ticks on the same date reads as partial, using today's list length as the denominator.
- Milestone and plan-consistency numbers keep counting whole completions in this release.

Not doing: nested subtasks, priorities, tags, dependencies, separate "project" objects.

## Releases

| | What you get | Size |
|---|---|---|
| **1. Honest progress** | Partial credit, Checklist/Steps, carry-forward | Project (this plan) |
| **2. Faster doing** | Tick steps on the Today row; one-tap "same as last time" for sets; add, reorder and skip steps in task detail | Medium |
| **3. Faster adding** | One-line add ("Run 7-8am"), tasks with no time yet, no plan required | Medium to large |
| **4. Deadlines that act** | Steps due soon or overdue on Today, Needs attention and reminders. Needs 1, or a done step goes overdue again | Small |

Approval covers release 1. Releases 2 to 4 each get their own short design. Reuse already spotted: `parseTaskLine` (`taskParser.ts`, no callers outside core), `startingSets` (`setLogs.ts`), `createSubtask` / `addSubtaskToTasks` (`taskMutations.ts`).

## Release 1 design

```
Portfolio   Tue 9:00            Gym   Tue 18:00
Steps · 4 of 10 overall         Checklist · 4 of 5 today
[x] Case study 1                [x] Bench press
[x] Case study 2  ← today       [x] Squat
[ ] About page                  [ ] Plank
Tuesday: done (1 step today)    Tuesday: Partly done, 80%
```

### Data (backward compatible)
- `Task.subtaskMode?: "checklist" | "steps"`. Read only through `subtaskModeOf(task)`: stored value, else one-off → steps, else checklist. Sessions are always checklist; commitments have none.
- `ScheduleEntry.mark?: { done: boolean; at: string }`, written to every weekday copy of the task. It lives on the step because **cloud sync trims history to 90 days**, so history can't hold lasting state. The task form already spreads the source entry back on save (`subtaskDraft.ts`), so edits keep it.
- `TaskCompletionEvent.credit?: { done: number; total: number }` on the `"missed"` event auto-miss writes. Not a new event type: the schema's enum would fail on older app versions, while an extra field passes through.
- `TaskCompletionEvent.auto?: true` on a task event created by a step tick, so unticking the day's last step removes it but never a hand-marked one.
- Add the new task field to `OPTIONAL_TASK_FIELDS` (`scheduleNormalize.ts`; a test enforces this list) and all four to `scheduleSchema.ts`.

### Sync (`mergeSchedule.ts` `combineTasks`)
Merge `mark` per step: the later `at` wins, so two devices ticking different steps offline keep both. Keep `subtaskMode` from the other side when the winner lacks it, since older versions drop unknown task fields. Results must not depend on argument order.

### Core logic (`packages/core/lib`)
- New `taskProgress.ts`: `subtaskModeOf`, `doneSubtaskIds(task, plan)`, `occurrenceCredit(task, plan, dateISO)` (0 to 1, or null when nothing is recorded). Done = 1; Checklist = share ticked; multi-block = share of blocks; repeating Steps = 1 if any step finished that day; one-off Steps = share done.
- `taskCompletion.ts`: Steps branches in `toggleSubtaskComplete`, `toggleTaskComplete`, `getTaskSubtaskSummary`, `completionForDate` and their `…ForDate` variants; add a "partly done" label.
- `scheduleNormalize.resetStaleCompletions`: unchanged for Checklist; Steps marks survive because they aren't live day state.
- `autoMiss.ts`: attach `credit` when some items were ticked; `missedRecovery.ts`: copies keep step marks, and finishing a step in the copy also marks the original.
- `taskMutations.ts` `reconcileEditedTask` and duplication: edits keep marks, duplicates start clear.
- Plan template items (`plan.items`, inherited when a task has no subtasks of its own): always Checklist. Choosing Steps copies them onto the task first.

### Scores
- `executionAnalytics.ts`: `pct` sums credit; add `partial` to each week; done + partial + missed never exceeds scheduled, keeping the tracking-start floor and the task+date key.
- `overview.ts` `selectWeekStatus`: day bars and verdict use credit. One source, so the trend and the week card agree.
- `needsAttention.ts`: a partly done checklist is not a miss; an unfinished one-off Steps task is listed as "2 steps left".
- `taskStats.ts`, `slotReliability.ts`: partial counts as showing up for that time slot, so suggestions don't move a slot that works.
- `capacityModel.ts`, `calculateDailyStats.ts`, `subtaskProgression.ts`, `widgetSnapshot.ts`, `worker/src/reminders.ts`: check each; change only where a partial or a Steps block reads wrongly. Progression needs per-subtask history, so it stays as is.

### Screens (PWA and iOS, same change on both)
- **Task sheet** (`components/task/TaskSheet.tsx` and the native one): a two-way control above subtasks, shown once a subtask exists. "Checklist: starts fresh each time" / "Steps: stay done".
- **Task detail** (`TaskDetailView`): header progress by mode; finished steps collapse under "Done (4)"; "Finish this task" when none remain; "Continue on…" for one-offs.
- **Today rows, list cards, week grid:** "Partly done 4/5" in amber with a shape as well as colour, never rose. Steps rows show "4 of 10".
- **Trend and week cards:** add a partial segment and label ("3 done · 2 partly · 1 missed").
- **Direct reads:** replace `task.completedSubtaskIds` in `ListTaskCard`, `TaskDetailView`, both `FocusHost`s, `ScheduleApp` and both `IOSScheduleApp`s with `doneSubtaskIds`. Check that native `useScheduleDB.ts` change detection sees marks.
- AA contrast in both themes, 44px targets, reduced motion.

### Build order
1. Save this as `docs/superpowers/specs/2026-11-25-honest-progress-design.md`; build in a **new worktree and branch** (`feat/honest-progress`). The shared checkout has several sessions in it and its own uncommitted `.claude/launch.json`.
2. Core with tests first: data and sync, then completion, then auto-miss and recovery, then scores.
3. PWA screens, then native.

Ship as one release: new scores without the labels would make numbers move with no explanation. Mention the one-time jump in past weeks in the release note.

## Verification
- **Unit** (`npm test`; failing tests first): 4 of 5 → 80%, not missed, week not "Behind"; 0 of 5 → missed; a pre-release miss with ticks reads partial; marks survive a week, an edit, and the 90-day trim; any-step rule on a repeating block; one-off needs all; untick removes only an auto completion; two offline devices keep both ticks, in either argument order; an old-version copy without the new fields can't clear the mode; all weekday copies agree; every existing test still passes.
- **Types and native tests:** `npx tsc --noEmit` at the root and in `apps/native`, plus native `npx jest`.
- **Browser:** Playwright smoke, plus a new flow: make a Steps task, tick one, move the clock to the next occurrence, see it still ticked and yesterday counted. Desktop and phone, light and dark.
- **iOS Simulator:** the same flow, with the widget and focus mode.

## How we'll know it worked
With no analytics, after two weeks of your own use: you stop re-ticking finished work, no day with ticks shows as a plain miss, and the streak, trend and week card tell the same story. If Steps goes unused, or you keep wanting both modes in one task, revisit the per-task choice before release 2.
