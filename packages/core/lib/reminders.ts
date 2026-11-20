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
import { headline, sessionsForDate } from "./sessions";

export interface ReminderSettings {
  enabled: boolean;
  tasks: boolean;       // notify at each task's start time
  rituals: boolean;     // notify at each ritual's time
  streakNudge: boolean; // evening nudge when tasks are still open
  nudgeTime: string;    // "HH:MM" 24-hour
  /** Minutes before a task starts to remind (0 = at the start). A task's own
   *  `reminderLeadMinutes` overrides it. Absent in older saved settings = 0. */
  leadMinutes?: number;
  /** A heads-up ENDING_SOON_MINUTES before a task's block ends. */
  endingSoon?: boolean;
}

/** The lead times offered in Settings and on a task. */
export const REMINDER_LEAD_OPTIONS = [0, 5, 10, 15, 30] as const;

/** How long before a block ends the "ending soon" heads-up comes. */
export const ENDING_SOON_MINUTES = 5;

/** The words for a lead time: "At start" / "10 min before". */
export function leadLabel(minutes: number): string {
  return minutes === 0 ? "At start" : `${minutes} min before`;
}

/** The lead time this task's reminder uses: its own, else the default. */
export function taskLeadMinutes(task: Pick<Task, "reminderLeadMinutes">, settings: Pick<ReminderSettings, "leadMinutes">): number {
  return Math.max(0, task.reminderLeadMinutes ?? settings.leadMinutes ?? 0);
}

/** "Starts now · 7:00 AM" at the start; "In 10 min · 7:00 AM" ahead of it. */
function startBody(lead: number, startTime: string): string {
  return `${lead > 0 ? `In ${lead} min` : "Starts now"} · ${formatDisplayTime(startTime)}`;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  tasks: true,
  rituals: true,
  streakNudge: true,
  nudgeTime: "19:00",
  leadMinutes: 0,
  endingSoon: false,
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

/**
 * Today's reminders that are still worth firing, per the given settings.
 *
 * `graceMs` widens the window backwards so a reminder whose moment passed
 * while the tab was throttled is still returned, rather than silently dropped
 * the way a strict `atMs > now` filter drops it.
 */
export function collectRemindersFor(
  schedule: Schedule,
  settings: ReminderSettings,
  now = new Date(),
  graceMs = 0,
): PendingReminder[] {
  if (!settings.enabled) return [];

  const todayISO = localISODate(now);
  const dayKey = JS_TO_DAYKEY[now.getDay()];
  const nowMs = now.getTime();
  const earliestMs = nowMs - graceMs;
  const out: PendingReminder[] = [];

  if (settings.tasks) {
    for (const task of schedule.activities[dayKey] ?? []) {
      if (taskIsDone(task)) continue;
      if (!isTaskScheduledOn(task, todayISO, true, schedule.preferences?.startDate)) continue;
      const occ = resolveOccurrence(task, todayISO);
      const lead = taskLeadMinutes(occ, settings);
      // One reminder per phase — a multi-slot task fires at each start time.
      getSlots(occ).forEach((slot, index) => {
        const startMin = parseTimeToMinutes(slot.startTime);
        if (startMin == null) return;
        const atMs = msAt(todayISO, Math.max(0, startMin - lead));
        if (atMs > earliestMs) {
          out.push({
            atMs,
            tag: `planr-task-${task.id}-${todayISO}-${index}`,
            title: occ.title,
            body: startBody(lead, slot.startTime),
          });
        }
        // "Ending soon" — for work you can still close, and only when the
        // block is long enough that the heads-up isn't on top of the start.
        const endMin = parseTimeToMinutes(slot.endTime);
        if (!settings.endingSoon || endMin == null || !isTrackedTask(occ)) return;
        const end = endMin > startMin ? endMin : endMin + 24 * 60;
        if (end - startMin <= ENDING_SOON_MINUTES * 2) return;
        const endAtMs = msAt(todayISO, end - ENDING_SOON_MINUTES);
        if (endAtMs <= earliestMs) return;
        out.push({
          atMs: endAtMs,
          tag: `planr-task-end-${task.id}-${todayISO}-${index}`,
          title: occ.title,
          body: `Ends in ${ENDING_SOON_MINUTES} min · ${formatDisplayTime(slot.endTime)}`,
        });
      });
    }
  }

  if (settings.tasks) {
    for (const session of sessionsForDate(schedule, todayISO)) {
      if (session.status !== "planned" || !session.startTime) continue;
      const startMin = parseTimeToMinutes(session.startTime);
      if (startMin == null) continue;
      const lead = Math.max(0, settings.leadMinutes ?? 0);
      const atMs = msAt(todayISO, Math.max(0, startMin - lead));
      if (atMs <= earliestMs) continue;
      out.push({
        atMs,
        tag: `planr-session-${session.id}-${todayISO}`,
        title: session.title,
        body: `${startBody(lead, session.startTime)} · ${headline(session)}`,
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
      if (atMs <= earliestMs) continue;
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
      if (atMs > earliestMs && openCount > 0) {
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
