/**
 * Reminders — local notifications for today's tasks and rituals, fired from an
 * open PlanR. A fully-closed app is covered by the server push path instead
 * (worker/src/reminders.ts), which shares these notification tags so the two
 * collapse rather than double up.
 *
 * ── Why a ticker and not one long timeout
 *
 * This used to arm a single `setTimeout` for the next reminder and re-arm
 * itself after each fire. Three things made that unreliable, and all three
 * presented to the user as "sometimes they just don't arrive":
 *
 *  1. `collectReminders` only ever returns TODAY's reminders. Once the last one
 *     fired, the chain ended with no timer pending, and nothing re-armed until
 *     the schedule changed or the tab went hidden→visible. An app left open
 *     past midnight fired nothing at all the next day.
 *  2. Anything whose moment had passed was silently dropped on the next re-arm,
 *     so a reminder a throttled tab was late for simply vanished.
 *  3. Browsers throttle background timers to about once a minute and can freeze
 *     them entirely after a few minutes, so a timeout hours out might fire very
 *     late, or not until the tab was focused again.
 *
 * A short repeating tick fixes all three at once: every tick recomputes from
 * the wall clock, so the day rolling over is not a special case, a throttled
 * tick still runs (just less often) and catches up, and nothing depends on a
 * single timer surviving hours in the background.
 *
 * Late reminders fire only inside `CATCH_UP_GRACE_MS`. A "Starts now" three
 * hours late is worse than silence, but one ninety seconds late — the common
 * case when a tick was throttled — is exactly what the user expected.
 *
 * Settings are per-device (localStorage), like the notification permission.
 */

import type { Schedule, Task } from "@/lib/useScheduleDB";
import type { DayKey } from "@/lib/scheduleConstants";
import { isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { getSlots } from "@/lib/taskMutations";
import { isTrackedTask } from "@/lib/taskCompletion";
import { parseTimeToMinutes, formatDisplayTime } from "@/lib/timeUtils";
import { localISODate } from "@/lib/dateUtils";
import { isRitualDayComplete } from "@/lib/consistency/ritualDayStatus";
import { ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";

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

function msAt(dateISO: string, minutes: number): number {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setMinutes(minutes);
  return d.getTime();
}

function taskIsDone(task: Task): boolean {
  return !!task.completed || !!task.missed;
}

/**
 * Today's reminders that are still worth firing, per current settings.
 *
 * `graceMs` widens the window backwards so a reminder whose moment passed
 * while the tab was throttled is still returned, rather than silently dropped
 * the way a strict `atMs > now` filter drops it.
 */
export function collectReminders(
  schedule: Schedule,
  now = new Date(),
  graceMs = 0,
): PendingReminder[] {
  const settings = getReminderSettings();
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
      // One reminder per phase — a multi-slot task fires at each start time.
      getSlots(occ).forEach((slot, index) => {
        const startMin = parseTimeToMinutes(slot.startTime);
        if (startMin == null) return;
        const atMs = msAt(todayISO, startMin);
        if (atMs <= earliestMs) return;
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

  return out
    .filter((r) => !_fired.has(r.tag))
    .sort((a, b) => a.atMs - b.atMs);
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
