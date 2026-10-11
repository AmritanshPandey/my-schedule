/**
 * Reminders — native port of lib/reminders.ts.
 *
 * The web fires reminders from a timer chain while the PWA is open (and a
 * Worker-sent Web Push when it's closed). Native can do better with no server
 * at all: each reminder is handed to the OS as a scheduled local notification
 * (react-native-notify-kit, the maintained Notifee fork), so it fires whether
 * or not PlanR is running. What fires, and when, is the exact same selection
 * the web uses — @planr/core/lib/reminders' collectRemindersFor — computed for
 * today and the next two days so a day the app isn't opened still gets its
 * reminders. Re-armed on every schedule change and on every return to the
 * foreground, so completing a task cancels its pending reminder.
 *
 * Settings are per-device (MMKV, same key as the web's localStorage entry),
 * like the notification permission itself.
 */
import { Platform, TurboModuleRegistry } from 'react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { collectRemindersFor, DEFAULT_REMINDER_SETTINGS, type PendingReminder, type ReminderSettings } from '@planr/core/lib/reminders';
import { resetStaleCompletions } from '@planr/core/lib/scheduleNormalize';
import { addDaysToISO, localISODate } from '@planr/core/lib/dateUtils';
import { storage } from '../storage/mmkv';
import { logError } from './errorLog';

export type { ReminderSettings } from '@planr/core/lib/reminders';

// ── Settings ──────────────────────────────────────────────────────────────────

const SETTINGS_KEY = 'planr-reminders';
const listeners = new Set<() => void>();

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = storage.getString(SETTINGS_KEY);
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    return { ...DEFAULT_REMINDER_SETTINGS, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function setReminderSettings(patch: Partial<ReminderSettings>): ReminderSettings {
  const next = { ...getReminderSettings(), ...patch };
  try {
    storage.set(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — settings just won't persist
  }
  listeners.forEach((fn) => fn());
  return next;
}

/** The web's REMINDERS_CHANGED_EVENT — fires after every settings write. */
export function onReminderSettingsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Native module ─────────────────────────────────────────────────────────────

type NotifyKit = typeof import('react-native-notify-kit');

let _kit: NotifyKit | null | undefined;

/**
 * The library resolves its TurboModule with `getEnforcing` at import time, so
 * importing it in a build that doesn't link the native side would crash the
 * app on launch. It's loaded lazily, and only once the module is known to be
 * there — a build without it degrades to "unsupported", like a browser
 * without the Notification API.
 */
function kit(): NotifyKit | null {
  if (_kit !== undefined) return _kit;
  try {
    _kit = TurboModuleRegistry.get('NotifeeApiModule') ? (require('react-native-notify-kit') as NotifyKit) : null;
  } catch (err) {
    logError('reminders:load', err);
    _kit = null;
  }
  return _kit;
}

export type NotificationSupport = 'granted' | 'denied' | 'default' | 'unsupported';

function toSupport(lib: NotifyKit, status: number): NotificationSupport {
  const { AuthorizationStatus } = lib;
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) return 'granted';
  if (status === AuthorizationStatus.DENIED) return 'denied';
  return 'default';
}

export async function notificationSupport(): Promise<NotificationSupport> {
  const lib = kit();
  if (!lib) return 'unsupported';
  try {
    const settings = await lib.default.getNotificationSettings();
    return toSupport(lib, settings.authorizationStatus);
  } catch {
    return 'unsupported';
  }
}

export async function requestNotificationPermission(): Promise<NotificationSupport> {
  const lib = kit();
  if (!lib) return 'unsupported';
  try {
    const settings = await lib.default.requestPermission();
    return toSupport(lib, settings.authorizationStatus);
  } catch {
    return 'denied';
  }
}

// ── Scheduling ────────────────────────────────────────────────────────────────

const CHANNEL_ID = 'planr-reminders';
const ID_PREFIX = 'planr-';
/** How many days ahead to hand the OS. iOS keeps at most 64 pending local
 *  notifications per app, so the total is capped below that. */
const DAYS_AHEAD = 3;
const MAX_PENDING = 60;

async function ensureChannel(lib: NotifyKit): Promise<void> {
  if (Platform.OS !== 'android') return;
  await lib.default.createChannel({ id: CHANNEL_ID, name: 'Reminders', importance: lib.AndroidImportance.HIGH });
}

/**
 * Every reminder from now through the next DAYS_AHEAD days. Each future day is
 * computed against the schedule as it will look that morning — completions
 * reset by the same resetStaleCompletions the app runs at day rollover — so a
 * task finished today still reminds you tomorrow.
 */
export function upcomingReminders(schedule: Schedule, settings: ReminderSettings, now = new Date()): PendingReminder[] {
  if (!settings.enabled) return [];
  const today = localISODate(now);
  const out: PendingReminder[] = [...collectRemindersFor(schedule, settings, now)];
  for (let i = 1; i < DAYS_AHEAD; i++) {
    const dateISO = addDaysToISO(today, i);
    const dayStart = new Date(`${dateISO}T00:00:00`);
    out.push(...collectRemindersFor(resetStaleCompletions(schedule, dateISO), settings, dayStart));
  }
  return out.sort((a, b) => a.atMs - b.atMs).slice(0, MAX_PENDING);
}

let _chain: Promise<void> = Promise.resolve();

/**
 * (Re)arm every scheduled reminder for this schedule: cancel the ones PlanR
 * handed the OS last time, then schedule the current set. Serialized, so a
 * burst of schedule edits can't interleave two arm passes.
 */
export function armReminders(schedule: Schedule): Promise<void> {
  _chain = _chain.then(() => armNow(schedule)).catch((err) => logError('reminders:arm', err));
  return _chain;
}

async function armNow(schedule: Schedule): Promise<void> {
  const lib = kit();
  if (!lib) return;
  const notifee = lib.default;
  const existing = (await notifee.getTriggerNotificationIds()).filter((id) => id.startsWith(ID_PREFIX));
  if (existing.length > 0) await notifee.cancelTriggerNotifications(existing);

  const settings = getReminderSettings();
  if (!settings.enabled) return;
  if ((await notificationSupport()) !== 'granted') return;

  await ensureChannel(lib);
  const nowMs = Date.now();
  for (const reminder of upcomingReminders(schedule, settings)) {
    if (reminder.atMs <= nowMs) continue;
    await notifee.createTriggerNotification(
      {
        id: reminder.tag,
        title: reminder.title,
        body: reminder.body,
        android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
      },
      { type: lib.TriggerType.TIMESTAMP, timestamp: reminder.atMs },
    );
  }
}

/** Cancel everything PlanR scheduled (reminders turned off, or signed out). */
export async function cancelAllReminders(): Promise<void> {
  const lib = kit();
  if (!lib) return;
  try {
    const ids = (await lib.default.getTriggerNotificationIds()).filter((id) => id.startsWith(ID_PREFIX));
    if (ids.length > 0) await lib.default.cancelTriggerNotifications(ids);
  } catch (err) {
    logError('reminders:cancel', err);
  }
}

export type TestNotificationResult = { ok: true } | { ok: false; error: string };

/**
 * The native counterpart of the web's "Send test" (a real push via the
 * Worker): shows one notification on this device right now, through the same
 * channel the reminders use, to confirm the whole chain works.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  const lib = kit();
  if (!lib) return { ok: false, error: "Notifications aren't available in this build." };
  if ((await notificationSupport()) !== 'granted') return { ok: false, error: 'Notifications are turned off for PlanR.' };
  try {
    await ensureChannel(lib);
    await lib.default.displayNotification({
      id: `${ID_PREFIX}test`,
      title: 'PlanR reminders are on',
      body: "This is how a reminder will look when it's time.",
      android: { channelId: CHANNEL_ID, pressAction: { id: 'default' } },
    });
    return { ok: true };
  } catch (err) {
    logError('reminders:test', err);
    return { ok: false, error: 'Something went wrong sending the test.' };
  }
}
