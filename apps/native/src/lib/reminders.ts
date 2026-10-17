/**
 * Reminders — native port of lib/reminders.ts.
 *
 * The web fires reminders from a timer chain while the PWA is open (and a
 * Worker-sent Web Push when it's closed). Native can do better with no server
 * at all: each reminder is handed to the OS as a scheduled local notification
 * (react-native-notify-kit, the maintained Notifee fork), so it fires whether
 * or not PlanR is running. What fires, and when, is the exact same selection
 * the web uses — @planr/core/lib/reminders' collectRemindersFor — computed for
 * the week ahead so days the app isn't opened still get their reminders.
 * Re-armed on every schedule change and on every return to the foreground, so
 * completing a task cancels its pending reminder.
 *
 * Unlike a web push, a native reminder plays a sound, fires on the minute
 * (an exact alarm on Android) and can be snoozed from the notification; in
 * alarm mode it rings until it's dealt with.
 *
 * Settings are per-device (MMKV, same key as the web's localStorage entry),
 * like the notification permission itself.
 */
import { Platform, TurboModuleRegistry } from 'react-native';
import type { Event, Notification, TimestampTrigger } from 'react-native-notify-kit';
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

/**
 * How reminders alert on this device. Native only — the web's reminders are
 * Web Push, which can't ring or snooze — so it's kept apart from the shared
 * ReminderSettings, under its own key. Writes notify the same listeners, so a
 * change re-arms everything already scheduled.
 */
export interface ReminderDelivery {
  /**
   * Ring like an alarm. Android: the alarm tone loops until the reminder is
   * snoozed or dismissed, scheduled as an alarm clock (never deferred by
   * Doze). iOS: delivered time-sensitive, so it gets through a Focus.
   */
  alarmMode: boolean;
}

const DELIVERY_KEY = 'planr-reminder-delivery';
const DEFAULT_DELIVERY: ReminderDelivery = { alarmMode: false };

export function getReminderDelivery(): ReminderDelivery {
  try {
    const raw = storage.getString(DELIVERY_KEY);
    if (!raw) return DEFAULT_DELIVERY;
    return { ...DEFAULT_DELIVERY, ...(JSON.parse(raw) as Partial<ReminderDelivery>) };
  } catch {
    return DEFAULT_DELIVERY;
  }
}

export function setReminderDelivery(patch: Partial<ReminderDelivery>): ReminderDelivery {
  const next = { ...getReminderDelivery(), ...patch };
  try {
    storage.set(DELIVERY_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — the choice just won't persist
  }
  listeners.forEach((fn) => fn());
  return next;
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

const ID_PREFIX = 'planr-';
/** Snoozed copies come from a notification action, not from the schedule, so
 *  a re-arm leaves them alone (turning reminders off still clears them). */
const SNOOZE_PREFIX = 'planr-snooze-';
export const SNOOZE_MINUTES = 10;
const ACTION_SNOOZE = 'snooze';
const ACTION_DISMISS = 'dismiss';
const IOS_CATEGORY = 'planr-reminder';

/** An Android channel's sound is fixed once it's created, so the original,
 *  silent 'planr-reminders' channel is replaced rather than updated. */
const CHANNEL_REMINDERS = 'planr-reminders-sound';
const CHANNEL_ALARMS = 'planr-alarms';
const LEGACY_CHANNELS = ['planr-reminders'];
/** Settings.System.DEFAULT_ALARM_ALERT_URI — the user's own alarm tone. */
const ALARM_TONE = 'content://settings/system/alarm_alert';

/** How many days ahead to hand the OS, so a week of reminders still fires if
 *  PlanR isn't opened. iOS keeps at most 64 pending local notifications per
 *  app, snoozes included, so the total is capped below that there. */
const DAYS_AHEAD = 7;
const MAX_PENDING = Platform.OS === 'ios' ? 60 : 200;

type Enums = Pick<NotifyKit, 'AlarmType' | 'AndroidCategory' | 'TriggerType'>;

export interface ReminderContent {
  id: string;
  title: string;
  body: string;
}

/** The notification handed to the OS for one reminder. */
export function buildReminderNotification(lib: Enums, content: ReminderContent, alarmMode: boolean): Notification {
  const snooze = { title: `Snooze ${SNOOZE_MINUTES} min`, pressAction: { id: ACTION_SNOOZE } };
  return {
    id: content.id,
    title: content.title,
    body: content.body,
    android: {
      channelId: alarmMode ? CHANNEL_ALARMS : CHANNEL_REMINDERS,
      category: alarmMode ? lib.AndroidCategory.ALARM : lib.AndroidCategory.REMINDER,
      pressAction: { id: 'default' },
      // Android 8+ takes the sound from the channel; this covers older versions.
      sound: alarmMode ? ALARM_TONE : 'default',
      // FLAG_INSISTENT: the tone repeats until the reminder is snoozed,
      // dismissed, or the notification shade is opened.
      loopSound: alarmMode,
      actions: alarmMode ? [snooze, { title: 'Dismiss', pressAction: { id: ACTION_DISMISS } }] : [snooze],
    },
    ios: {
      sound: 'default',
      categoryId: IOS_CATEGORY,
      // Needs the Time Sensitive Notifications capability; without it iOS
      // delivers the reminder as an ordinary one.
      interruptionLevel: alarmMode ? 'timeSensitive' : 'active',
    },
  };
}

/**
 * When a reminder fires. On Android it's an exact AlarmManager alarm that also
 * fires in Doze; in alarm mode it's an alarm clock, which Doze never defers
 * and the lock screen shows as the next alarm. Without the "Alarms &
 * reminders" access (exactAlarmAccess) Android quietly makes either one
 * inexact.
 */
export function buildReminderTrigger(lib: Enums, atMs: number, alarmMode: boolean): TimestampTrigger {
  return {
    type: lib.TriggerType.TIMESTAMP,
    timestamp: atMs,
    alarmManager: { type: alarmMode ? lib.AlarmType.SET_ALARM_CLOCK : lib.AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
  };
}

/** The ID a snoozed copy of a reminder gets; snoozing it again reuses the ID. */
export function snoozeIdFor(id: string): string {
  const prefix = id.startsWith(SNOOZE_PREFIX) ? SNOOZE_PREFIX : ID_PREFIX;
  return SNOOZE_PREFIX + id.slice(prefix.length);
}

let _setup: Promise<void> | null = null;

/** The channels (Android) and the Snooze action's category (iOS), once per launch. */
function ensureSetup(lib: NotifyKit): Promise<void> {
  if (!_setup) {
    _setup = setUp(lib).catch((err) => {
      _setup = null;
      throw err;
    });
  }
  return _setup;
}

async function setUp(lib: NotifyKit): Promise<void> {
  const notifee = lib.default;
  if (Platform.OS === 'android') {
    for (const id of LEGACY_CHANNELS) await notifee.deleteChannel(id);
    await notifee.createChannel({
      id: CHANNEL_REMINDERS,
      name: 'Reminders',
      description: 'Task and routine start times, and the evening nudge',
      importance: lib.AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    await notifee.createChannel({
      id: CHANNEL_ALARMS,
      name: 'Alarms',
      description: 'Alarm mode: rings with your alarm tone until you snooze or dismiss it',
      importance: lib.AndroidImportance.HIGH,
      sound: ALARM_TONE,
      vibration: true,
    });
  } else if (Platform.OS === 'ios') {
    await notifee.setNotificationCategories([
      { id: IOS_CATEGORY, actions: [{ id: ACTION_SNOOZE, title: `Snooze ${SNOOZE_MINUTES} min` }] },
    ]);
  }
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
 * What the last successful pass scheduled, so re-arming an unchanged set (on
 * every return to the foreground) costs nothing. Kept in memory on purpose: a
 * new process — say after a force stop, which clears Android's alarms —
 * always re-arms in full.
 */
let _armed: string | null = null;

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
  const settings = getReminderSettings();
  const os = await notifee.getNotificationSettings();
  const active = settings.enabled && toSupport(lib, os.authorizationStatus) === 'granted';
  const { alarmMode } = getReminderDelivery();
  const nowMs = Date.now();
  const due = active ? upcomingReminders(schedule, settings).filter((r) => r.atMs > nowMs) : [];
  // Exact-alarm access is part of it: granting it should turn the inexact
  // alarms already set into exact ones.
  const signature = JSON.stringify([alarmMode, os.android.alarm, due.map((r) => [r.tag, r.atMs, r.title, r.body])]);
  if (signature === _armed) return;

  _armed = null;
  const ours = (await notifee.getTriggerNotificationIds()).filter((id) => id.startsWith(ID_PREFIX));
  const stale = active ? ours.filter((id) => !id.startsWith(SNOOZE_PREFIX)) : ours;
  if (stale.length > 0) await notifee.cancelTriggerNotifications(stale);
  if (active) {
    await ensureSetup(lib);
    for (const r of due) {
      await notifee.createTriggerNotification(
        buildReminderNotification(lib, { id: r.tag, title: r.title, body: r.body }, alarmMode),
        buildReminderTrigger(lib, r.atMs, alarmMode),
      );
    }
  }
  _armed = signature;
}

/** Cancel everything PlanR scheduled (reminders turned off, or signed out). */
export async function cancelAllReminders(): Promise<void> {
  const lib = kit();
  if (!lib) return;
  _armed = null;
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
 * Worker): shows one notification on this device right now, exactly as a
 * reminder will look and sound — ringing, in alarm mode — to confirm the
 * whole chain works.
 */
export async function sendTestNotification(): Promise<TestNotificationResult> {
  const lib = kit();
  if (!lib) return { ok: false, error: "Notifications aren't available in this build." };
  if ((await notificationSupport()) !== 'granted') return { ok: false, error: 'Notifications are turned off for PlanR.' };
  try {
    await ensureSetup(lib);
    await lib.default.displayNotification(
      buildReminderNotification(
        lib,
        { id: `${ID_PREFIX}test`, title: 'PlanR reminders are on', body: "This is how a reminder will look when it's time." },
        getReminderDelivery().alarmMode,
      ),
    );
    return { ok: true };
  } catch (err) {
    logError('reminders:test', err);
    return { ok: false, error: 'Something went wrong sending the test.' };
  }
}

// ── Notification actions ──────────────────────────────────────────────────────

/** Snooze and Dismiss, pressed on a reminder itself. */
async function handleEvent(lib: NotifyKit, { type, detail }: Event): Promise<void> {
  if (type !== lib.EventType.ACTION_PRESS) return;
  const { notification, pressAction } = detail;
  const id = notification?.id;
  if (!notification || !id?.startsWith(ID_PREFIX)) return;
  if (pressAction?.id !== ACTION_SNOOZE && pressAction?.id !== ACTION_DISMISS) return;
  // Clears it from the shade, which also stops a looping alarm tone.
  await lib.default.cancelDisplayedNotification(id);
  if (pressAction.id !== ACTION_SNOOZE || !getReminderSettings().enabled) return;
  const { alarmMode } = getReminderDelivery();
  await ensureSetup(lib);
  await lib.default.createTriggerNotification(
    buildReminderNotification(lib, { id: snoozeIdFor(id), title: notification.title ?? '', body: notification.body ?? '' }, alarmMode),
    buildReminderTrigger(lib, Date.now() + SNOOZE_MINUTES * 60_000, alarmMode),
  );
}

let _backgroundHandler = false;

/**
 * Handles actions pressed while PlanR is in the background or closed (on
 * Android, in a headless task). Registered from index.js, before the app
 * component, as the library requires.
 */
export function registerReminderBackgroundHandler(): void {
  const lib = kit();
  if (!lib || _backgroundHandler) return;
  _backgroundHandler = true;
  lib.default.onBackgroundEvent((event) => handleEvent(lib, event).catch((err) => logError('reminders:action', err)));
}

/** The same, while PlanR is open. Returns the unsubscribe. */
export function onReminderForegroundEvents(): () => void {
  const lib = kit();
  if (!lib) return () => {};
  return lib.default.onForegroundEvent((event) => {
    handleEvent(lib, event).catch((err) => logError('reminders:action', err));
  });
}

// ── Android delivery checks ───────────────────────────────────────────────────

export type ExactAlarmAccess = 'granted' | 'denied' | 'not-needed';

/**
 * Android 12+ puts exact alarms behind a special access ("Alarms &
 * reminders") that Android 14 no longer grants up front; without it every
 * reminder is scheduled inexact and can land minutes late. iOS and older
 * Android always fire on time.
 */
export async function exactAlarmAccess(): Promise<ExactAlarmAccess> {
  const lib = kit();
  if (!lib || Platform.OS !== 'android') return 'not-needed';
  try {
    const { alarm } = (await lib.default.getNotificationSettings()).android;
    if (alarm === lib.AndroidNotificationSetting.DISABLED) return 'denied';
    return alarm === lib.AndroidNotificationSetting.ENABLED ? 'granted' : 'not-needed';
  } catch {
    return 'not-needed';
  }
}

export async function openExactAlarmSettings(): Promise<void> {
  try {
    await kit()?.default.openAlarmPermissionSettings();
  } catch (err) {
    logError('reminders:alarm-settings', err);
  }
}

/** Under battery optimization some Android builds hold back or drop alarms. */
export async function batteryOptimizationOn(): Promise<boolean> {
  const lib = kit();
  if (!lib || Platform.OS !== 'android') return false;
  try {
    return await lib.default.isBatteryOptimizationEnabled();
  } catch {
    return false;
  }
}

export async function openBatteryOptimizationSettings(): Promise<void> {
  try {
    await kit()?.default.openBatteryOptimizationSettings();
  } catch (err) {
    logError('reminders:battery-settings', err);
  }
}
