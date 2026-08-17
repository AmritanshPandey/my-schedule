/**
 * Auto-miss rollover — mark past scheduled tracked tasks "missed" once the next
 * day's start time has passed.
 *
 * Pure and dependency-light (no React/IndexedDB) so it can run in the load
 * pipeline and be unit-tested directly. It writes only **dated** `"missed"`
 * events onto `completionHistory` for past dates — never the live
 * `missed`/`missedAt` flags, which describe today only and are cleared each load
 * by `resetStaleCompletions`.
 *
 * Rollout is forward-only: a `lastRolloverISO` watermark on preferences records
 * the last active day processed. The first ever run just adopts the watermark
 * (no retroactive backfill); subsequent runs miss only the days that have newly
 * rolled over since, bounded by `MAX_LOOKBACK_DAYS` and the analytics `startDate`.
 */

import type { Schedule, Task } from "../useScheduleDB";
import { DAYS } from "../scheduleConstants";
import { localISODate, addDaysToISO } from "../dateUtils";
import { getConfiguredDayStartMinutes, DEFAULT_TIMELINE_START_MINUTES } from "../timeline/displayWindow";
import { isTrackedTask, completionForDate, datedMissedEvent, datedMissedSlotEvent } from "../taskCompletion";
import { isTaskScheduledOn } from "../taskOccurrence";
import { getSlots } from "../taskMutations";

/** Never backfill more than a month, so a long-absent user isn't flooded. */
export const MAX_LOOKBACK_DAYS = 31;

/** The weekday bucket key ("monday"…"sunday") a calendar date falls in. */
function weekdayKeyOf(dateISO: string): (typeof DAYS)[number] {
  // JS getDay(): Sun=0…Sat=6; our DAYS start at Monday.
  return DAYS[(new Date(`${dateISO}T00:00:00`).getDay() + 6) % 7];
}

/**
 * Return a schedule with newly rolled-over, un-actioned tracked occurrences
 * marked missed. Returns the same reference when nothing changed so callers can
 * bail out of a re-render / persist.
 */
export function applyAutoMissed(schedule: Schedule, now: Date): Schedule {
  const prefs = schedule.preferences ?? {};
  const dayStartMinutes = getConfiguredDayStartMinutes(prefs.dayStartTime) ?? DEFAULT_TIMELINE_START_MINUTES;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Before the day-start (e.g. 2 AM with a 4 AM start) we're still on yesterday's
  // schedule day. Any date strictly before this has passed its rollover.
  const activeDayISO = nowMinutes < dayStartMinutes ? addDaysToISO(localISODate(now), -1) : localISODate(now);

  const watermark = prefs.lastRolloverISO;

  // First ever run: adopt forward-only — record the watermark, miss nothing.
  if (!watermark) {
    return { ...schedule, preferences: { ...prefs, lastRolloverISO: activeDayISO } };
  }
  // Same day, or the clock moved backwards — nothing new to roll over.
  if (activeDayISO <= watermark) return schedule;

  // Window of newly rolled-over days: [start, activeDay − 1] inclusive, floored
  // by the watermark, the lookback cap, and the analytics start date.
  const lowerBounds = [watermark, addDaysToISO(activeDayISO, -MAX_LOOKBACK_DAYS)];
  if (prefs.startDate) lowerBounds.push(prefs.startDate);
  const startISO = lowerBounds.reduce((a, b) => (a > b ? a : b));
  const endISO = addDaysToISO(activeDayISO, -1);

  const nextPrefs = { ...prefs, lastRolloverISO: activeDayISO };
  if (startISO > endISO) return { ...schedule, preferences: nextPrefs };

  const activities = { ...schedule.activities };
  let changed = false;

  for (let d = startISO; d <= endISO; d = addDaysToISO(d, 1)) {
    const weekday = weekdayKeyOf(d);
    const bucket = activities[weekday];
    if (!bucket?.length) continue;
    let bucketChanged = false;
    const next: Task[] = bucket.map((task) => {
      if (!isTrackedTask(task)) return task; // commitments/held time never miss
      if (!isTaskScheduledOn(task, d, true)) return task; // honors recurrence/skips/active window
      const state = completionForDate(task, d);
      if (state.completed || state.missed) return task; // already resolved for that date

      const totalSlots = getSlots(task).length;
      if (totalSlots > 1) {
        // A repeated-same-day task misses ONLY the phases still unresolved —
        // never the whole task — so a task with one done phase and one
        // skipped phase reads as half-missed, not entirely missed. See
        // taskCompletion.ts's markSlotMissed/resolveSlotState for the same
        // per-phase principle applied to today's live state.
        const unresolved = Array.from({ length: totalSlots }, (_, i) => i).filter(
          (i) => !state.completedSlotIndices.includes(i) && !state.missedSlotIndices.includes(i),
        );
        if (unresolved.length === 0) return task; // every phase already resolved
        bucketChanged = true;
        changed = true;
        return {
          ...task,
          completionHistory: [
            ...(task.completionHistory ?? []),
            ...unresolved.map((i) => datedMissedSlotEvent(task.id, d, i)),
          ],
        };
      }

      bucketChanged = true;
      changed = true;
      return { ...task, completionHistory: [...(task.completionHistory ?? []), datedMissedEvent(task.id, d)] };
    });
    if (bucketChanged) activities[weekday] = next;
  }

  return changed ? { ...schedule, activities, preferences: nextPrefs } : { ...schedule, preferences: nextPrefs };
}
