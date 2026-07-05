/**
 * Reminders — local, timer-based notifications for today's tasks and rituals.
 *
 * Honest scope: these fire from an open PlanR (foreground tab, or a background
 * tab on desktop). There is no push backend yet, so a fully-closed app cannot
 * notify — on iOS that means reminders work while the PWA is open. The settings
 * are per-device (localStorage), like the notification permission itself.
 *
 * armReminders(schedule) is idempotent: it cancels the previous timer chain and
 * schedules the next upcoming reminder; after one fires, it re-arms for the
 * next. Callers re-arm on every schedule change, so completing a task drops its
 * pending reminder naturally.
 */

import type { Schedule, Task } from "@/lib/useScheduleDB";
import type { DayKey } from "@/lib/scheduleConstants";
import { isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { parseTimeToMinutes, formatDisplayTime } from "@/lib/timeUtils";
import { localISODate } from "@/lib/dateUtils";

// ── Settings ──────────────────────────────────────────────────────────────────

export interface ReminderSettings {
  enabled: boolean;
  tasks: boolean;       // notify at each task's start time
  rituals: boolean;     // notify at each ritual's time
  streakNudge: boolean; // evening nudge when tasks are still open
  nudgeTime: string;    // "HH:MM" 24-hour
}

const SETTINGS_KEY = "planr-reminders";
export const REMINDERS_CHANGED_EVENT = "planr-reminders-changed";

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  tasks: true,
  rituals: true,
  streakNudge: true,
  nudgeTime: "19:00",
};

export function getReminderSettings(): ReminderSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setReminderSettings(patch: Partial<ReminderSettings>): ReminderSettings {
  const next = { ...getReminderSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage full/unavailable — settings just won't persist
  }
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
  return next;
}

// ── Permission ────────────────────────────────────────────────────────────────

export type NotificationSupport = "granted" | "denied" | "default" | "unsupported";

export function notificationSupport(): NotificationSupport {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (notificationSupport() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

// ── Scheduling ────────────────────────────────────────────────────────────────

interface PendingReminder {
  atMs: number;   // epoch ms
  tag: string;    // stable per occurrence — dedupes across re-arms
  title: string;
  body: string;
}

const JS_TO_DAYKEY: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

// Tags already shown this session. Reminders are only scheduled for future
// times, so a reload can't re-fire past ones; this set covers same-session
// re-arms racing the timer.
const _fired = new Set<string>();
let _timer: ReturnType<typeof setTimeout> | null = null;

function msAt(dateISO: string, minutes: number): number {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setMinutes(minutes);
  return d.getTime();
}

function taskIsDone(task: Task): boolean {
  return !!task.completed || !!task.missed;
}

/** Collect today's future reminders from the schedule, per current settings. */
export function collectReminders(schedule: Schedule, now = new Date()): PendingReminder[] {
  const settings = getReminderSettings();
  if (!settings.enabled) return [];

  const todayISO = localISODate(now);
  const dayKey = JS_TO_DAYKEY[now.getDay()];
  const nowMs = now.getTime();
  const out: PendingReminder[] = [];

  if (settings.tasks) {
    for (const task of schedule.activities[dayKey] ?? []) {
      if (taskIsDone(task)) continue;
      if (!isTaskScheduledOn(task, todayISO, true)) continue;
      const occ = resolveOccurrence(task, todayISO);
      const startMin = parseTimeToMinutes(occ.startTime);
      if (startMin == null) continue;
      const atMs = msAt(todayISO, startMin);
      if (atMs <= nowMs) continue;
      out.push({
        atMs,
        tag: `planr-task-${task.id}-${todayISO}`,
        title: occ.title,
        body: `Starts now · ${formatDisplayTime(occ.startTime)}`,
      });
    }
  }

  if (settings.rituals) {
    const completedToday = new Set(
      (schedule.ritualCompletions ?? [])
        .filter((c) => c.date === todayISO)
        .map((c) => c.ritualId),
    );
    for (const ritual of schedule.rituals ?? []) {
      if (completedToday.has(ritual.id)) continue;
      if (ritual.repeatDays && ritual.repeatDays.length > 0 && !ritual.repeatDays.includes(dayKey)) continue;
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
      const openCount = (schedule.activities[dayKey] ?? []).filter(
        (t) => !taskIsDone(t) && isTaskScheduledOn(t, todayISO, true),
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

  return out
    .filter((r) => !_fired.has(r.tag))
    .sort((a, b) => a.atMs - b.atMs);
}

async function show(reminder: PendingReminder): Promise<void> {
  if (notificationSupport() !== "granted") return;
  const options: NotificationOptions = {
    body: reminder.body,
    tag: reminder.tag,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
  };
  try {
    // Prefer the service worker — it can notify from a backgrounded tab.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(reminder.title, options);
      return;
    }
  } catch {
    // fall through to the page-scoped constructor
  }
  try {
    new Notification(reminder.title, options);
  } catch {
    // constructor unsupported (e.g. Android Chrome requires the SW path)
  }
}

/**
 * (Re)arm the reminder chain for this schedule. Returns a cancel function.
 * Safe to call often — only one timer exists at a time.
 */
export function armReminders(schedule: Schedule): () => void {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  if (notificationSupport() !== "granted") return () => {};

  const armNext = () => {
    const [next] = collectReminders(schedule);
    if (!next) return;
    const delay = Math.max(0, next.atMs - Date.now());
    // Anything further out than a day gets re-armed by the next schedule
    // change, visibility flip, or app launch — don't hold huge timeouts.
    if (delay > 24 * 60 * 60 * 1000) return;
    _timer = setTimeout(() => {
      _timer = null;
      _fired.add(next.tag);
      void show(next);
      armNext();
    }, delay);
  };

  armNext();
  return () => {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
  };
}
