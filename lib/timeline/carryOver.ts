/**
 * Yesterday's overnight blocks, shown on today's timeline.
 *
 * Sleep 11 PM → 7 AM is authored on the day it starts, so the morning you
 * actually slept through used to show nothing at all — and the block itself was
 * hard-clamped at the window edge, silently losing hours. This synthesises a
 * read-only "carried over" occurrence for the part that spills past midnight.
 *
 * ## The rule that makes this safe
 *
 * Carried occurrences are synthesised at the **view boundary only** — never
 * written into `schedule.activities`, and never surfaced through
 * `isTaskScheduledOn`. Every denominator in the app (`executionAnalytics`,
 * `planInsights`, `calculateDailyStats`, `calculateWeeklyStats`, the dashboards,
 * `reminders`) reads the raw weekday buckets directly. As long as a carried
 * entry exists only inside `dayTasksView` / `WeekGrid.days`, it cannot
 * double-count anywhere. Folding it into `isTaskScheduledOn` would poison all of
 * them at once — that function's own doc comment warns about exactly this.
 *
 * ## Why `carriedFrom` is not a field on `Task`
 *
 * `Task` is persisted, and the allowlist guard test parses that interface. A
 * display-only field there is a persistence hazard. As an intersection type it
 * cannot reach storage, and if one ever did leak into the store `normalizeTasks`
 * would drop the unknown key on the next load.
 */

import type { DayKey, Task } from "../useScheduleDB";
import { getSlots } from "../taskMutations";
import { isTaskScheduledOn, resolveOccurrence } from "../taskOccurrence";
import { minutesToDisplayTime } from "./dragTimeUtils";
import { crossesMidnight, slotInterval } from "./overnight";

const DAY_MINUTES = 24 * 60;

/** Where a carried occurrence came from — always the previous day. */
export interface CarriedFrom {
  dateISO: string;
  day: DayKey;
  /** Index into the origin task's slots, so multi-phase tasks stay distinct. */
  slotIndex: number;
}

/** A task as a day view sees it: either a real occurrence or yesterday's tail. */
export type DayViewTask = Task & { carriedFrom?: CarriedFrom };

/**
 * A stable identity for one row/block in a day view.
 *
 * A daily Sleep block puts the *same* `task.id` in one day twice — its own 11 PM
 * occurrence and yesterday's tail. Keying React lists by `task.id` would make
 * one of them silently disappear, and any `.find(t => t.id === …)` would match
 * the wrong one. Use this everywhere a day view keys or looks up a task.
 */
export function viewKey(task: DayViewTask, slotIndex?: number): string {
  const base = task.carriedFrom ? `carry:${task.id}:${task.carriedFrom.slotIndex}` : task.id;
  return slotIndex === undefined ? base : `${base}-${slotIndex}`;
}

/** True when this row is yesterday's spill-over rather than a real occurrence. */
export function isCarriedOver(task: DayViewTask): boolean {
  return !!task.carriedFrom;
}

/**
 * The previous day's blocks that run past midnight, rewritten as single blocks
 * starting at 12:00 AM today.
 *
 * @param previousTasks the weekday bucket for `previousDateISO`
 */
export function carriedOccurrences(
  previousTasks: readonly Task[],
  previousDateISO: string,
  previousDay: DayKey,
): DayViewTask[] {
  const carried: DayViewTask[] = [];

  for (const task of previousTasks) {
    if (!isTaskScheduledOn(task, previousDateISO, true)) continue;
    const occurrence = resolveOccurrence(task, previousDateISO);
    getSlots(occurrence).forEach((slot, slotIndex) => {
      const interval = slotInterval(slot);
      if (!interval || !crossesMidnight(interval)) return;
      carried.push({
        ...occurrence,
        // Where the tail actually begins, which is midnight only for a block
        // that started before it. A 1 AM block authored yesterday resolves to
        // [1500, 1560) — its tail starts at 1 AM, and hardcoding midnight here
        // drew it an hour too long.
        startTime: minutesToDisplayTime(Math.max(interval.start, DAY_MINUTES)),
        endTime: minutesToDisplayTime(interval.end),
        // A carried entry is always one block: the tail of a single phase.
        slots: undefined,
        carriedFrom: { dateISO: previousDateISO, day: previousDay, slotIndex },
      });
    });
  }

  return carried;
}
