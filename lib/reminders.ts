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

import type { Schedule } from "@/lib/useScheduleDB";
import {
  collectRemindersFor,
  DEFAULT_REMINDER_SETTINGS,
  type PendingReminder,
  type ReminderSettings,
} from "@planr/core/lib/reminders";

export type { PendingReminder, ReminderSettings } from "@planr/core/lib/reminders";

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "planr-reminders";
export const REMINDERS_CHANGED_EVENT = "planr-reminders-changed";

const DEFAULT_SETTINGS: ReminderSettings = DEFAULT_REMINDER_SETTINGS;

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

// Tags already shown this session. Reminders are only scheduled for future
// times, so a reload can't re-fire past ones; this set covers same-session
// re-arms racing the timer.
const _fired = new Set<string>();
let _timer: ReturnType<typeof setTimeout> | null = null;

/** Collect today's future reminders from the schedule, per current settings. */
export function collectReminders(schedule: Schedule, now = new Date()): PendingReminder[] {
  return collectRemindersFor(schedule, getReminderSettings(), now).filter((r) => !_fired.has(r.tag));
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
