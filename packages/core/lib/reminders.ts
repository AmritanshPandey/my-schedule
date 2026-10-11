/**
 * Reminder selection — which of today's tasks, routines and the evening nudge
 * deserve a notification, and when. Pure: the caller supplies the settings
 * and the clock. Shared by the web (timer chain while the PWA is open,
 * lib/reminders.ts) and native (scheduled local notifications).
 */

import type { Schedule, Task, DayKey } from "./scheduleTypes";
import { isTaskScheduledOn, resolveOccurrence } from "./taskOccurrence";
import { getSlots } from "./taskMutations";
import { isTrackedTask } from "./taskCompletion";
import { parseTimeToMinutes, formatDisplayTime } from "./timeUtils";
import { localISODate } from "./dateUtils";
import { isRitualDayComplete } from "./consistency/ritualDayStatus";
import { ritualScheduledOnDate } from "./consistency/calculateRitualStreak";

export interface ReminderSettings {
  enabled: boolean;
  tasks: boolean;       // notify at each task's start time
  rituals: boolean;     // notify at each ritual's time
  streakNudge: boolean; // evening nudge when tasks are still open
  nudgeTime: string;    // "HH:MM" 24-hour
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  tasks: true,
  rituals: true,
  streakNudge: true,
  nudgeTime: "19:00",
};

export interface PendingReminder {
  atMs: number;   // epoch ms
  tag: string;    // stable per occurrence — dedupes across re-arms
  title: string;
  body: string;
}

const JS_TO_DAYKEY: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

function msAt(dateISO: string, minutes: number): number {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setMinutes(minutes);
  return d.getTime();
}

function taskIsDone(task: Task): boolean {
  return !!task.completed || !!task.missed;
}

/** Collect today's future reminders from the schedule, per the given settings. */
export function collectRemindersFor(schedule: Schedule, settings: ReminderSettings, now = new Date()): PendingReminder[] {
  if (!settings.enabled) return [];

  const todayISO = localISODate(now);
  const dayKey = JS_TO_DAYKEY[now.getDay()];
  const nowMs = now.getTime();
  const out: PendingReminder[] = [];

  if (settings.tasks) {
    for (const task of schedule.activities[dayKey] ?? []) {
      if (taskIsDone(task)) continue;
      if (!isTaskScheduledOn(task, todayISO, true, schedule.preferences?.startDate)) continue;
      const occ = resolveOccurrence(task, todayISO);
      // One reminder per phase — a multi-slot task fires at each start time.
      getSlots(occ).forEach((slot, index) => {
        const startMin = parseTimeToMinutes(slot.startTime);
        if (startMin == null) return;
        const atMs = msAt(todayISO, startMin);
        if (atMs <= nowMs) return;
        out.push({
          atMs,
          tag: `planr-task-${task.id}-${todayISO}-${index}`,
          title: occ.title,
          body: `Starts now · ${formatDisplayTime(slot.startTime)}`,
        });
      });
    }
  }

  if (settings.rituals) {
    const completionsToday = (schedule.ritualCompletions ?? []).filter((c) => c.date === todayISO);
    for (const ritual of schedule.rituals ?? []) {
      // "Any time" routines have no meaningful reminder moment — `time` is
      // just a leftover placeholder for readers that still need one.
      if (ritual.anyTime) continue;
      if (!ritualScheduledOnDate(ritual, todayISO, schedule.preferences?.startDate)) continue;
      // trackingType-aware: a quantity/checklist routine only cancels its
      // reminder once the day is actually complete, not on the first partial log.
      if (isRitualDayComplete(ritual, completionsToday.filter((c) => c.ritualId === ritual.id))) continue;
      const min = parseTimeToMinutes(ritual.time);
      if (min == null) continue;
      const atMs = msAt(todayISO, min);
      if (atMs <= nowMs) continue;
      out.push({
        atMs,
        tag: `planr-ritual-${ritual.id}-${todayISO}`,
        title: ritual.title,
        body: `Routine · ${formatDisplayTime(ritual.time)}`,
      });
    }
  }

  if (settings.streakNudge) {
    const nudgeMin = parseTimeToMinutes(settings.nudgeTime);
    if (nudgeMin != null) {
      const atMs = msAt(todayISO, nudgeMin);
      // Commitments are excluded: nagging "1 task still open" about a commute
      // you can't close is exactly the kind of noise this nudge must avoid.
      // Their start-time reminders above still fire — that part is useful.
      const openCount = (schedule.activities[dayKey] ?? []).filter(
        (t) => !taskIsDone(t) && isTaskScheduledOn(t, todayISO, true, schedule.preferences?.startDate) && isTrackedTask(t),
      ).length;
      if (atMs > nowMs && openCount > 0) {
        out.push({
          atMs,
          tag: `planr-nudge-${todayISO}`,
          title: openCount === 1 ? "1 task still open" : `${openCount} tasks still open`,
          body: "Close the loop before the day ends.",
        });
      }
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs);
}
