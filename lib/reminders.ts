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
import { localISODate } from "@/lib/dateUtils";
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

/** How often the ticker re-checks. Short enough that a fire lands close to
 *  its minute, long enough to be free even when a tab runs all day. */
export const TICK_MS = 30_000;

/**
 * How late a reminder may be and still fire.
 *
 * The window exists because a throttled or briefly-frozen tab wakes up past
 * the moment; without it those reminders vanish, which is the single most
 * confusing failure here. It is small because the copy says "Starts now", and
 * that stops being true quickly.
 */
export const CATCH_UP_GRACE_MS = 5 * 60_000;

// Tags already shown. Pruned to the current day on rollover — tags embed their
// date, so yesterday's can never match again and would just accumulate.
const _fired = new Set<string>();
let _firedDay: string | null = null;
let _timer: ReturnType<typeof setInterval> | null = null;

function rememberFired(tag: string, todayISO: string): void {
  if (_firedDay !== todayISO) {
    _fired.clear();
    _firedDay = todayISO;
  }
  _fired.add(tag);
}

/**
 * Today's reminders that are still worth firing, per current settings, minus
 * any already shown. Selection lives in @planr/core (shared with native);
 * `graceMs` is explained there.
 */
export function collectReminders(
  schedule: Schedule,
  now = new Date(),
  graceMs = 0,
): PendingReminder[] {
  return collectRemindersFor(schedule, getReminderSettings(), now, graceMs).filter((r) => !_fired.has(r.tag));
}

/**
 * Notification options that behave like an alert rather than a toast.
 *
 * `requireInteraction` is the important one: without it a desktop notification
 * auto-dismisses after a few seconds, so a reminder that fired while the user
 * was looking elsewhere is indistinguishable from one that never fired. A
 * reminder is worth interrupting for or it is not worth sending, and these are
 * opt-in per device.
 *
 * `renotify` makes a repeat on the same tag alert again instead of silently
 * replacing the existing one. `vibrate` and `data.url` mirror what the service
 * worker's push handler already sets, so a foreground reminder and a pushed one
 * behave identically — they already share tags, and behaving differently would
 * be a worse inconsistency than the one this file set out to fix.
 */
type AlertNotificationOptions = NotificationOptions & {
  renotify?: boolean;
  vibrate?: number[];
};

function alertOptions(reminder: PendingReminder): AlertNotificationOptions {
  return {
    body: reminder.body,
    tag: reminder.tag,
    icon: "/icons/icon.svg",
    badge: "/icons/icon.svg",
    requireInteraction: true,
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: "/" },
  };
}

async function show(reminder: PendingReminder): Promise<void> {
  if (notificationSupport() !== "granted") return;
  const options = alertOptions(reminder);
  try {
    // Prefer the service worker — it can notify from a backgrounded tab, and
    // it is the only path that works at all on Android Chrome and iOS PWAs.
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
 * Everything due right now, given the grace window — and the tags to burn.
 *
 * Split out from the ticker so the decision is testable without timers: the
 * hard part is which reminders count as due, not the interval that asks.
 */
export function dueNow(
  schedule: Schedule,
  now: Date,
  graceMs: number = CATCH_UP_GRACE_MS,
): PendingReminder[] {
  const nowMs = now.getTime();
  return collectReminders(schedule, now, graceMs).filter((r) => r.atMs <= nowMs);
}

/**
 * (Re)arm the reminder ticker for this schedule. Returns a cancel function.
 * Safe to call often — only one ticker exists at a time.
 *
 * Fires a catch-up pass immediately so a tab returning from the background
 * does not wait up to a full tick for something already due.
 */
export function armReminders(schedule: Schedule): () => void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  if (notificationSupport() !== "granted") return () => {};

  const tick = () => {
    const now = new Date();
    const todayISO = localISODate(now);
    for (const reminder of dueNow(schedule, now)) {
      rememberFired(reminder.tag, todayISO);
      void show(reminder);
    }
  };

  tick();
  _timer = setInterval(tick, TICK_MS);

  return () => {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
  };
}
